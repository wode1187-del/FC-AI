# -*- coding: utf-8 -*-
"""把 LayerNormalization 拆成基础算子（ort-web wasm 不支持 LayerNorm）"""
import os
import onnx
from onnx import helper, TensorProto

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'human-parsing')
SRC = os.path.join(BASE, 'model_combined.onnx')
DST = os.path.join(BASE, 'model_web.onnx')

m = onnx.load(SRC)

# 已有名称集合（避免命名冲突）
used = set()
for n in m.graph.node:
    for o in n.output:
        used.add(o)
    for i in n.input:
        used.add(i)
for init in m.graph.initializer:
    used.add(init.name)
counter = [0]
def fresh(prefix):
    while True:
        counter[0] += 1
        name = '%s_lnw_%d' % (prefix, counter[0])
        if name not in used:
            used.add(name)
            return name

eps_node_count = [0]
def make_eps(epsilon):
    eps_node_count[0] += 1
    name = 'lnw_eps_%d' % eps_node_count[0]
    init = helper.make_tensor(name, TensorProto.FLOAT, [1], [epsilon])
    m.graph.initializer.append(init)
    return name

new_nodes = []
for n in m.graph.node:
    if n.op_type != 'LayerNormalization':
        new_nodes.append(n)
        continue
    X, W, B = n.input[0], n.input[1], n.input[2]
    Y = n.output[0]
    attrs = {a.name: a for a in n.attribute}
    axis = attrs['axis'].i if 'axis' in attrs else -1
    eps = attrs['epsilon'].f if 'epsilon' in attrs else 1e-5

    mean = fresh('mean'); diff = fresh('diff'); sq = fresh('sq')
    var = fresh('var'); var_e = fresh('var_e'); std = fresh('std')
    norm = fresh('norm'); scaled = fresh('scaled')
    eps_name = make_eps(eps)

    nodes = [
        helper.make_node('ReduceMean', [X], [mean], axes=[axis], keepdims=1),
        helper.make_node('Sub', [X, mean], [diff]),
        helper.make_node('Mul', [diff, diff], [sq]),
        helper.make_node('ReduceMean', [sq], [var], axes=[axis], keepdims=1),
        helper.make_node('Add', [var, eps_name], [var_e]),
        helper.make_node('Sqrt', [var_e], [std]),
        helper.make_node('Div', [diff, std], [norm]),
        helper.make_node('Mul', [norm, W], [scaled]),
        helper.make_node('Add', [scaled, B], [Y]),
    ]
    new_nodes.extend(nodes)

del m.graph.node[:]
m.graph.node.extend(new_nodes)
onnx.checker.check_model(m)
onnx.save_model(m, DST, save_as_external_data=False)
print('OK saved:', DST, '%.2f MB' % (os.path.getsize(DST) / 1024 / 1024))
