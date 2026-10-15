// 本地精确换色（主线程 onnxruntime proxy 版）
// 关键：onnxruntime-web 的 proxy 模式必须在【主线程】才生效（在主线程创建内部 worker、分配更大 wasm 堆），
// 能加载 55MB fp16 衣服分割模型；在 Web Worker 内 proxy 无效（worker 已是 wasm 环境，堆同样受限）。
// 复用与 rmbg.worker 相同的分割 + 保明度色相旋转算法，但会话在主线程创建（内部推理仍在 onnxruntime worker，不卡主线程）。
import * as ortNS from 'onnxruntime-web';
const ort: any = (ortNS as any).default ?? ortNS;

function siteRoot(): string {
  const u = self.location.href;
  const m = u.match(/^(.*)\/assets\/[^/?#]+\.js/);
  if (m) return m[1] + '/';
  const i = u.indexOf('/src/');
  if (i >= 0) return u.slice(0, i) + '/';
  return './';
}
const CLOTH_URL = import.meta.env.DEV ? '/human-parsing/cloth_b2.onnx' : siteRoot() + 'human-parsing/cloth_b2.onnx';
const WASM_BASE = import.meta.env.DEV
  ? 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'
  : siteRoot() + 'wasm/';

let clothSessionPromise: Promise<any> | null = null;
async function getClothSession(): Promise<any> {
  if (!clothSessionPromise) {
    clothSessionPromise = (async () => {
      if (ort?.env?.wasm) {
        ort.env.wasm.wasmPaths = WASM_BASE;
        ort.env.wasm.proxy = true; // 主线程 proxy：onnxruntime 内部 worker 大堆，可加载大模型
        ort.env.wasm.numThreads = 1;
      }
      const r = await fetch(CLOTH_URL);
      if (!r.ok) throw new Error('衣服模型下载失败 HTTP ' + r.status);
      const bytes = new Uint8Array(await r.arrayBuffer());
      return await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    })().catch((e) => {
      clothSessionPromise = null;
      throw e;
    });
  }
  return clothSessionPromise;
}

// ATR 18类：4上衣 5裙子 6裤子 7连衣裙 8腰带 17围巾（不含包16）
const CLOTH_CLASSES = [4, 5, 6, 7, 8, 17];
const SIZE = 512;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** 衣服分割蒙版（主线程 proxy 会话） */
async function runClothSeg(image: ImageData): Promise<ImageData> {
  const session = await getClothSession();
  const src = document.createElement('canvas');
  src.width = image.width; src.height = image.height;
  const sctx = src.getContext('2d')!;
  sctx.putImageData(image, 0, 0);
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, SIZE, SIZE);
  const id = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const N = SIZE * SIZE;
  const px = new Float32Array(3 * N);
  for (let i = 0, p = 0; i < id.length; i += 4, p++) {
    px[p] = (id[i] / 255 - MEAN[0]) / STD[0];
    px[p + N] = (id[i + 1] / 255 - MEAN[1]) / STD[1];
    px[p + 2 * N] = (id[i + 2] / 255 - MEAN[2]) / STD[2];
  }
  const input = new ort.Tensor('float32', px, [1, 3, SIZE, SIZE]);
  const feeds: Record<string, any> = {};
  feeds[session.inputNames[0]] = input;
  const outs = await session.run(feeds);
  const out = outs[session.outputNames[0]];
  const dims: number[] = out.dims as number[];
  const data = out.data as Float32Array;
  const nchw = dims.length === 4 && dims[1] > 4;
  const H = nchw ? dims[2] : dims[1];
  const W = nchw ? dims[3] : dims[2];
  const C = nchw ? dims[1] : dims[3];
  const total = H * W;
  const maskSmall = new ImageData(W, H);
  const md = maskSmall.data;
  for (let i = 0; i < total; i++) {
    let best = 0; let bv = -Infinity;
    for (let cc = 0; cc < C; cc++) {
      const v = nchw ? data[cc * total + i] : data[i * C + cc];
      if (v > bv) { bv = v; best = cc; }
    }
    if (CLOTH_CLASSES.includes(best)) {
      const idx = i * 4;
      md[idx] = 255; md[idx + 1] = 255; md[idx + 2] = 255; md[idx + 3] = 255;
    }
  }
  const smallC = document.createElement('canvas');
  smallC.width = W; smallC.height = H;
  smallC.getContext('2d')!.putImageData(maskSmall, 0, 0);
  const up = document.createElement('canvas');
  up.width = SIZE; up.height = SIZE;
  const uctx = up.getContext('2d')!;
  uctx.drawImage(smallC, 0, 0, SIZE, SIZE);
  return uctx.getImageData(0, 0, SIZE, SIZE);
}

/** 本地精确换色：衣服蒙版 + 保留明度色相旋转 + 边缘羽化 */
export async function runRecolorLocal(image: ImageData, targetHex: string): Promise<ImageData> {
  const maskSmall = await runClothSeg(image);
  const W = image.width, H = image.height;
  const smallC = document.createElement('canvas');
  smallC.width = maskSmall.width; smallC.height = maskSmall.height;
  smallC.getContext('2d')!.putImageData(maskSmall, 0, 0);
  const mC = document.createElement('canvas');
  mC.width = W; mC.height = H;
  const mCtx = mC.getContext('2d', { willReadFrequently: true })!;
  mCtx.drawImage(smallC, 0, 0, W, H);
  const md = mCtx.getImageData(0, 0, W, H).data;
  const [tr, tg, tb] = hexToRgb(targetHex);
  const targetHue = rgbToHsl(tr, tg, tb)[0];
  const src = image.data;
  const out = new ImageData(W, H);
  const od = out.data;
  for (let i = 0; i < src.length; i += 4) {
    const alpha = md[i + 3] / 255;
    const r = src[i], g = src[i + 1], b = src[i + 2];
    od[i + 3] = src[i + 3];
    if (alpha <= 0) { od[i] = r; od[i + 1] = g; od[i + 2] = b; continue; }
    const [, s, l] = rgbToHsl(r, g, b);
    const sEff = Math.max(s, 0.42);
    const [nr, ng, nb] = hslToRgb(targetHue, sEff, l);
    od[i] = Math.round(nr * alpha + r * (1 - alpha));
    od[i + 1] = Math.round(ng * alpha + g * (1 - alpha));
    od[i + 2] = Math.round(nb * alpha + b * (1 - alpha));
  }
  return out;
}
