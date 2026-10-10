# -*- coding: utf-8 -*-
# 离线验证 SegFormer human-parsing 的衣服蒙版质量
import onnxruntime as ort
import numpy as np
from PIL import Image

MODEL = r'I:\FC-AI生图工作台\public\human-parsing\model_web.onnx'
IMG = r'I:\FC-AI生图工作台\public\model-test.jpg'
SIZE = 224
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
CLOTH = {4, 5, 6, 7, 8, 17}  # 上衣/裙/裤/连衣裙/腰带/围巾

sess = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider'])
iname = sess.get_inputs()[0].name
im = Image.open(IMG).convert('RGB')
ow, oh = im.size
# 与 worker 一致：等比拉伸到 224
im224 = im.resize((SIZE, SIZE), Image.BILINEAR)
a = np.asarray(im224).astype(np.float32) / 255.0
a = (a - MEAN) / STD
x = a.transpose(2, 0, 1)[None].astype(np.float32)
out = sess.run(None, {iname: x})[0]
print('输出shape:', out.shape)
# 兼容 NCHW / NHWC
if out.shape[1] > 4:
    logits = out[0]  # [C,H,W]
else:
    logits = out[0].transpose(2, 0, 1)
C, H, W = logits.shape
cls = logits.argmax(0)  # [H,W]
print('输出网格:', H, W)

# 衣服蒙版
cloth = np.isin(cls, list(CLOTH))
print('衣服类像素占比(56网格): %.2f%%' % (100 * cloth.mean()))

# 每类像素数
for c2 in range(C):
    n = (cls == c2).sum()
    if n:
        print('  class %d: %d' % (c2, n))

# "露脚/整人"检查：衣服蒙版在纵向下半部分的分布
# 映射到原图坐标：mask(56) 放大到原图尺寸
cloth_full = np.kron(cloth.astype(np.float32), np.ones((oh//H, ow//W))) if (oh % H == 0 and ow % W == 0) else None
# 简化：按 56 网格看 y 分带
print('\n衣服蒙版按 y 分带占比（上半=头, 中部=躯干, 底部=腿脚）:')
for band in range(5):
    y0 = band * H // 5; y1 = (band+1) * H // 5
    seg = cloth[y0:y1]
    print('  y分带%d (%.0f%%-%.0f%%高度): %.2f%%' % (band, 100*band/5, 100*(band+1)/5, 100*seg.mean()))

# 可视化：把衣服蒙版叠加到原图，保存
overlay = im.copy()
mask_small = (cloth * 255).astype(np.uint8)
mimg = Image.fromarray(mask_small).resize((ow, oh), Image.BILINEAR)
mimg = mimg.convert('L')
red = Image.new('RGBA', (ow, oh), (255, 0, 0, 0))
red.putalpha(Image.eval(mimg, lambda v: int(v * 0.6)))
overlay = Image.alpha_composite(overlay.convert('RGBA'), red)
overlay.convert('RGB').save(r'I:\FC-AI生图工作台\scripts\_cloth_overlay.jpg', quality=85)
print('\n叠加图已保存: _cloth_overlay.jpg')
