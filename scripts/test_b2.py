# -*- coding: utf-8 -*-
import onnxruntime as ort
import numpy as np
from PIL import Image

MODEL = r'I:\FC-AI生图工作台\scripts\_b2_clothes.onnx'
IMG = r'I:\FC-AI生图工作台\public\model-test.jpg'
SIZE = 512
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
CLOTH = {4, 5, 6, 7, 8, 17}  # ATR: 上衣/裙/裤/连衣裙/腰带/围巾

sess = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider'])
iname = sess.get_inputs()[0].name
im = Image.open(IMG).convert('RGB')
ow, oh = im.size
im512 = im.resize((SIZE, SIZE), Image.BILINEAR)
a = np.asarray(im512).astype(np.float32) / 255.0
a = (a - MEAN) / STD
x = a.transpose(2, 0, 1)[None].astype(np.float32)
out = sess.run(None, {iname: x})[0]
logits = out[0] if out.shape[1] > 4 else out[0].transpose(2, 0, 1)
C, H, W = logits.shape
cls = logits.argmax(0)
cloth = np.isin(cls, list(CLOTH))
print('b2_clothes 输出网格:', H, W, '衣服占比 %.2f%%' % (100*cloth.mean()))
for c2 in range(C):
    n = (cls == c2).sum()
    if n: print('  class %d: %d' % (c2, n))
print('衣服蒙版按 y 分带占比:')
for band in range(5):
    y0 = band*H//5; y1 = (band+1)*H//5
    print('  y%d (%.0f%%-%.0f%%): %.2f%%' % (band, 100*band/5, 100*(band+1)/5, 100*cloth[y0:y1].mean()))
# 保存叠加图
mimg = Image.fromarray((cloth*255).astype(np.uint8)).resize((ow, oh), Image.BILINEAR).convert('L')
red = Image.new('RGBA', (ow, oh), (255, 0, 0, 0)); red.putalpha(Image.eval(mimg, lambda v: int(v*0.6)))
Image.alpha_composite(im.convert('RGBA'), red).convert('RGB').save(r'I:\FC-AI生图工作台\scripts\_b2_overlay.jpg', quality=85)
print('saved _b2_overlay.jpg')
