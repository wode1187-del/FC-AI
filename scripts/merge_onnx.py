# -*- coding: utf-8 -*-
"""合并外部权重为单文件 onnx"""
import os
import onnx

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'human-parsing')
p = os.path.join(BASE, 'model.onnx')
out = os.path.join(BASE, 'model_combined.onnx')

model = onnx.load(p, load_external_data=True)
onnx.save_model(model, out, save_as_external_data=False)
print('merged size: %.2f MB' % (os.path.getsize(out) / 1024 / 1024))
