# -*- coding: utf-8 -*-
"""本机验证 human-parsing onnx 模型"""
import os
import numpy as np
import onnxruntime as ort
from PIL import Image

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'human-parsing')
MODEL = os.path.join(BASE, 'model_combined.onnx')
IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'model-test.jpg')

sess = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider'])
print('inputs:', [(i.name, i.shape, i.type) for i in sess.get_inputs()])
print('outputs:', [(o.name, o.shape, o.type) for o in sess.get_outputs()])

img = Image.open(IMG).convert('RGB').resize((224, 224))
arr = np.array(img, dtype=np.float32) / 255.0
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
arr = (arr - mean) / std
arr = arr.transpose(2, 0, 1)[None]  # 1,3,512,512

out = sess.run(None, {'pixel_values': arr})[0]
print('output shape:', out.shape)
pred = out.argmax(axis=1)[0]  # H,W
from collections import Counter
cnt = Counter(pred.flatten().tolist())
print('argmax hist:', dict(sorted(cnt.items())))
