# -*- coding: utf-8 -*-
"""把 matei-dorian/segformer-b0-finetuned-human-parsing 转成 onnx（浏览器可跑）"""
import os, sys, time
import torch
from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'human-parsing')
os.makedirs(OUT_DIR, exist_ok=True)

print('下载模型权重...', flush=True)
model = SegformerForSemanticSegmentation.from_pretrained('matei-dorian/segformer-b0-finetuned-human-parsing')
model.eval()

# 打印类别映射确认
id2label = model.config.id2label
print('类别数:', len(id2label), flush=True)
print('id2label:', {k: id2label[k] for k in list(id2label.keys())[:22]}, flush=True)

# 保存类别映射供前端使用
import json
with open(os.path.join(OUT_DIR, 'labels.json'), 'w', encoding='utf-8') as f:
    json.dump({int(k): v for k, v in id2label.items()}, f, ensure_ascii=False, indent=1)
print('labels.json 已保存', flush=True)

# 确认模型输入尺寸
size = getattr(model.config, 'image_size', 512)
if isinstance(size, (list, tuple)):
    size = size[0]
print('模型 image_size =', size, flush=True)

dummy = torch.randn(1, 3, size, size)
t0 = time.time()
print('开始导出 onnx ...', flush=True)
torch.onnx.export(
    model,
    dummy,
    os.path.join(OUT_DIR, 'model.onnx'),
    input_names=['pixel_values'],
    output_names=['logits'],
    opset_version=17,
    dynamic_axes={'pixel_values': {0: 'batch'}, 'logits': {0: 'batch'}},
)
print('导出完成，耗时 %.1fs' % (time.time() - t0), flush=True)

sz = os.path.getsize(os.path.join(OUT_DIR, 'model.onnx'))
print('model.onnx 大小: %.1f MB' % (sz / 1024 / 1024), flush=True)
print('输出目录:', OUT_DIR, flush=True)
