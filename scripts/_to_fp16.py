# -*- coding: utf-8 -*-
# 把 cloth_b2.onnx 从 fp32 转 fp16，体积减半（~110MB→~55MB），使浏览器 wasm 堆可加载
from onnxconverter_common import float16
import onnx

src = r'I:\FC-AI生图工作台\public\human-parsing\cloth_b2.onnx'
dst = r'I:\FC-AI生图工作台\public\human-parsing\cloth_b2_fp16.onnx'
m = onnx.load(src)
m16 = float16.convert_float_to_float16(m, keep_io_types=True)
onnx.save_model(m16, dst)
import os
print('FP16_SIZE_MB=', round(os.path.getsize(dst)/1e6, 1))
print('opset=', [(x.domain or 'ai.onnx', x.version) for x in m16.opset_import])
