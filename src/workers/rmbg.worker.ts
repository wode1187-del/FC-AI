import * as ortNS from 'onnxruntime-web';
// Vite 预构建的 onnxruntime-web 只导出 default，这里兼容取到真实对象
const ort: any = (ortNS as any).default ?? ortNS;

// WASM 运行时：dev 下 Vite 会拦截 public 目录 .mjs 的动态 import（Failed to fetch），改用 jsdelivr CDN；
// 生产构建产物是静态文件、无 Vite 拦截，用本地 wasm/（不依赖外网 CDN）。
// 注意：worker 里的相对 URL 基于 worker 脚本目录（assets/）解析，不能用相对 './'；必须反推站点根
function siteRoot(): string {
  const u = self.location.href;
  // 生产：…/FC-AI/assets/rmbg.worker-xxx.js → …/FC-AI/
  const m = u.match(/^(.*)\/assets\/[^/?#]+\.js/);
  if (m) return m[1] + '/';
  // dev（Vite worker 由 /src/workers/ 提供）
  const i = u.indexOf('/src/');
  if (i >= 0) return u.slice(0, i) + '/';
  return './';
}
const WASM_BASE = import.meta.env.DEV
  ? 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'
  : siteRoot() + 'wasm/';

// 模型源：国内镜像优先（免翻墙直连 hf-mirror），官方源回退；首次下载后 Cache 缓存（只下载一次）
const RMBG_MODEL_SOURCES = [
  'https://hf-mirror.com/briaai/RMBG-1.4/resolve/main/onnx/model.onnx',
  'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx',
];
const RMBG_CACHE = 'rmbg-model-v1';
// 统一缓存 key（旧版本缓存 key 是官方 URL，读取时兼容）
const RMBG_CACHE_KEY = 'rmbg-model';
// 单源下载超时（176MB，慢网下给足时间），超时自动切换下一源
const MODEL_FETCH_TIMEOUT = 180000;

let sessionPromise: Promise<any> | null = null;

/** 依次尝试模型源（国内镜像→官方），单源超时/失败自动切换，全部失败抛错 */
async function fetchModelWithFallback(): Promise<Response> {
  let lastErr: any = null;
  for (const url of RMBG_MODEL_SOURCES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), MODEL_FETCH_TIMEOUT);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // eslint-disable-next-line no-console
      console.log('[rmbg.worker] 模型源可用: ' + url);
      return r;
    } catch (e) {
      lastErr = e;
      // eslint-disable-next-line no-console
      console.warn('[rmbg.worker] 模型源失败，切换下一源: ' + url, String(e));
    }
  }
  throw new Error('模型下载失败：国内镜像与官方源均不可达（' + String(lastErr) + '）');
}

/** 获取模型字节：优先 Cache API（只下载一次），首次网络下载后自动缓存 */
async function fetchModelBytes(): Promise<Uint8Array> {
  const cachesObj = (self as any).caches as CacheStorage | undefined;
  if (cachesObj) {
    try {
      const cache = await cachesObj.open(RMBG_CACHE);
      // 先查统一 key；兼容旧缓存（旧 key 为官方 URL）
      let resp = await cache.match(RMBG_CACHE_KEY);
      if (!resp) {
        for (const url of RMBG_MODEL_SOURCES) {
          resp = await cache.match(url);
          if (resp) break;
        }
      }
      if (!resp) {
        const net = await fetchModelWithFallback();
        await cache.put(RMBG_CACHE_KEY, net.clone());
        resp = net;
      }
      return new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
      const r = await fetchModelWithFallback();
      return new Uint8Array(await r.arrayBuffer());
    }
  }
  const r = await fetchModelWithFallback();
  return new Uint8Array(await r.arrayBuffer());
}

function getSession(): Promise<any> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      if (ort?.env?.wasm) {
        (ort.env as any).wasm.wasmPaths = WASM_BASE;
        // 176MB 大模型：proxy 独立 worker 加载以分配更大堆，避免 protobuf parsing failed（内存不足）
        (ort.env as any).wasm.proxy = true;
        (ort.env as any).wasm.numThreads = 1;
      }
      const bytes = await fetchModelBytes();
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
      });
      return session;
    })().catch((e) => {
      sessionPromise = null; // 失败后允许重试
      throw e;
    });
  }
  return sessionPromise;
}

/** 用 ImageData 跑 RMBG 推理，返回前景蒙版 ImageData（白色=前景） */
async function runRmbg(image: ImageData): Promise<ImageData> {  const session = await getSession();
  const SIZE = 1024;

  // 把任意尺寸的输入缩放（drawImage 等比拉伸）到 1024×1024
  const src = new OffscreenCanvas(image.width, image.height);
  const sctx = src.getContext('2d')!;
  sctx.putImageData(image, 0, 0);

  const c = new OffscreenCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, SIZE, SIZE);
  const id = ctx.getImageData(0, 0, SIZE, SIZE).data;

  // 预处理：像素 /255 - 0.5，CHW float32
  const N = SIZE * SIZE;
  const px = new Float32Array(3 * N);
  for (let i = 0, p = 0; i < id.length; i += 4, p++) {
    px[p] = id[i] / 255 - 0.5; // R
    px[p + N] = id[i + 1] / 255 - 0.5; // G
    px[p + 2 * N] = id[i + 2] / 255 - 0.5; // B
  }
  const input = new ort.Tensor('float32', px, [1, 3, SIZE, SIZE]);
  const feeds: Record<string, any> = {};
  feeds[session.inputNames[0]] = input;
  const outs = await session.run(feeds);
  const out = outs[session.outputNames[0]];
  const data = out.data as Float32Array;

  // 输出已是 sigmoid 概率(0~1)，官方原生用法：概率直接作为 alpha（连续软边，不硬二值化）
  // 这样主体高概率≈不透明、背景≈透明、边缘自然渐变，贴合 RMBG-1.4 原始输出
  const mask = new ImageData(SIZE, SIZE);
  const md = mask.data;
  for (let i = 0; i < N; i++) {
    const v = data[i] ?? 0;
    const a = Math.round(Math.max(0, Math.min(1, v)) * 255); // 概率→alpha
    const idx = i * 4;
    md[idx] = 255;
    md[idx + 1] = 255;
    md[idx + 2] = 255;
    md[idx + 3] = a;
  }
  return mask;
}

/**
 * 本地移除背景（不重绘、不偏色）：用 RMBG 前景蒙版，在原图分辨率下合成透明 PNG。
 * 输出 ImageData：RGB 完全取原图，alpha 取 RMBG 前景概率（放大到原图尺寸，软边缘防白边）。
 */
async function runRemoveBg(image: ImageData): Promise<ImageData> {
  const mask = await runRmbg(image); // 1024×1024，白色前景，alpha=前景概率

  // 把 1024 蒙版缩放到原图尺寸
  const mc = new OffscreenCanvas(mask.width, mask.height);
  mc.getContext('2d')!.putImageData(mask, 0, 0);
  const oc = new OffscreenCanvas(image.width, image.height);
  const octx = oc.getContext('2d', { willReadFrequently: true })!;
  octx.drawImage(mc, 0, 0, image.width, image.height);
  const maskScaled = octx.getImageData(0, 0, image.width, image.height).data; // 取 alpha 通道

  // 合成：RGB=原图原样，alpha=RMBG 前景
  const out = new ImageData(image.width, image.height);
  const od = out.data;
  const id = image.data;
  for (let i = 0; i < id.length; i += 4) {
    od[i] = id[i];
    od[i + 1] = id[i + 1];
    od[i + 2] = id[i + 2];
    od[i + 3] = maskScaled[i + 3];
  }
  return out;
}

// ================= 衣服分割（专用服装分割模型，只圈衣服：上衣/裙子/裤子/连衣裙/腰带/围巾，脸/手/脚自动排除） =================
// 模型：mattmdjaga/segformer_b2_clothes 转 onnx（ATR 18类，本地 public/human-parsing/cloth_b2.onnx，110MB，精度 mIoU46.5 显著优于通用 b0）
// ATR 类别：0背景 1帽子 2头发 3墨镜 4上衣 5裙子 6裤子 7连衣裙 8腰带 9左鞋 10右鞋 11脸 12左腿 13右腿 14左臂 15右臂 16包 17围巾
// 生产部署在子路径（GitHub Pages /FC-AI/），worker 相对 URL 基于 assets/，必须用 siteRoot() 反推站点根
const CLOTH_URL = import.meta.env.DEV
  ? '/human-parsing/cloth_b2.onnx'
  : siteRoot() + 'human-parsing/cloth_b2.onnx';
const CLOTH_CACHE = 'human-parsing-b2-v1';
const CLOTH_CLASSES = [4, 5, 6, 7, 8, 17]; // 上衣/裙子/裤子/连衣裙/腰带/围巾（不含包16，易误判）
const CLOTH_SIZE = 512;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let clothSessionPromise: Promise<any> | null = null;

async function fetchClothBytes(): Promise<Uint8Array> {
  const cachesObj = (self as any).caches as CacheStorage | undefined;
  if (cachesObj) {
    try {
      const cache = await cachesObj.open(CLOTH_CACHE);
      let resp = await cache.match(CLOTH_URL);
      if (!resp) {
        const net = await fetch(CLOTH_URL);
        if (!net.ok) throw new Error('衣服模型下载失败 HTTP ' + net.status);
        await cache.put(CLOTH_URL, net.clone());
        resp = net;
      }
      return new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
      const r = await fetch(CLOTH_URL);
      if (!r.ok) throw new Error('衣服模型下载失败 HTTP ' + r.status);
      return new Uint8Array(await r.arrayBuffer());
    }
  }
  const r = await fetch(CLOTH_URL);
  if (!r.ok) throw new Error('衣服模型下载失败 HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

function getClothSession(): Promise<any> {
  if (!clothSessionPromise) {
    clothSessionPromise = (async () => {
      if (ort?.env?.wasm) {
        (ort.env as any).wasm.wasmPaths = WASM_BASE;
        // 105MB 衣服分割模型：proxy 独立 worker 加载分配更大堆，避免 protobuf parsing failed
        (ort.env as any).wasm.proxy = true;
        (ort.env as any).wasm.numThreads = 1;
      }
      const bytes = await fetchClothBytes();
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
      });
      return session;
    })().catch((e) => {
      clothSessionPromise = null;
      throw e;
    });
  }
  return clothSessionPromise;
}

/** 衣服分割：只把 apparel 服装类像素标白，其余（person/背景）透明 */
async function runClothSeg(image: ImageData): Promise<ImageData> {
  const session = await getClothSession();
  const SIZE = CLOTH_SIZE;

  const src = new OffscreenCanvas(image.width, image.height);
  const sctx = src.getContext('2d')!;
  sctx.putImageData(image, 0, 0);

  const c = new OffscreenCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, SIZE, SIZE);
  const id = ctx.getImageData(0, 0, SIZE, SIZE).data;

  // 预处理：resize 512 + /255 + ImageNet 归一化，CHW float32
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

  // 兼容 [1,18,H,W] 与 [1,H,W,18] 两种输出布局（人体解析输出 1/4 分辨率，H=W=56）
  const nchw = dims.length === 4 && dims[1] > 4;
  const H = nchw ? dims[2] : dims[1];
  const W = nchw ? dims[3] : dims[2];
  const C = nchw ? dims[1] : dims[3];
  const total = H * W;

  // 先按输出分辨率生成蒙版，再放大到 SIZE×SIZE
  const maskSmall = new ImageData(W, H);
  const md = maskSmall.data;
  for (let i = 0; i < total; i++) {
    let best = 0;
    let bv = -Infinity;
    for (let c2 = 0; c2 < C; c2++) {
      const v = nchw ? data[c2 * total + i] : data[i * C + c2];
      if (v > bv) { bv = v; best = c2; }
    }
    if (CLOTH_CLASSES.includes(best)) {
      const idx = i * 4;
      md[idx] = 255;
      md[idx + 1] = 255;
      md[idx + 2] = 255;
      md[idx + 3] = 255;
    }
  }
  // 放大到 512×512（双线性）
  const smallC = new OffscreenCanvas(W, H);
  smallC.getContext('2d')!.putImageData(maskSmall, 0, 0);
  const up = new OffscreenCanvas(SIZE, SIZE);
  const uctx = up.getContext('2d')!;
  uctx.drawImage(smallC, 0, 0, SIZE, SIZE);
  return uctx.getImageData(0, 0, SIZE, SIZE);
}

// ================= 本地精确换色：衣服蒙版 + 保留明度色相旋转（不重绘，布料像素是原始像素） =================
// Qwen 正确路线：不用 AI inpaint（蒙版内仍重绘、纹理必损）；分割模型出精确衣服蒙版 + 蒙版内色彩空间变换，
// 保留明度通道（L=亮度=纹理），只把色相转到目标色，饱和度按需抬升，边缘按蒙版 alpha 羽化。
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

/** 本地精确换色：仅衣服蒙版内像素改色，纹理（明度）原样保留，边缘羽化 */
async function runRecolor(image: ImageData, targetHex: string): Promise<ImageData> {
  const maskSmall = await runClothSeg(image); // 512×512 衣服蒙版（白=衣服，alpha=概率）
  const W = image.width, H = image.height;
  const mC = new OffscreenCanvas(W, H);
  const mCtx = mC.getContext('2d', { willReadFrequently: true })!;
  mCtx.drawImage(maskSmall as unknown as CanvasImageSource, 0, 0, W, H);
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
    // 保留原明度 L（纹理），色相转目标，饱和兜底抬升保证纯色/灰衣也能上色
    const [, s, l] = rgbToHsl(r, g, b);
    const sEff = Math.max(s, 0.42);
    const [nr, ng, nb] = hslToRgb(targetHue, sEff, l);
    od[i] = Math.round(nr * alpha + r * (1 - alpha));
    od[i + 1] = Math.round(ng * alpha + g * (1 - alpha));
    od[i + 2] = Math.round(nb * alpha + b * (1 - alpha));
  }
  return out;
}

self.addEventListener('error', (e: any) => {
  (self as any).postMessage({ type: 'error', message: 'WORKER_ERROR ' + (e?.message || '') + ' @' + (e?.filename || '') + ':' + (e?.lineno || '') });
});
self.addEventListener('unhandledrejection', (e: any) => {
  (self as any).postMessage({ type: 'error', message: 'UNHANDLED ' + String(e?.reason?.message || e?.reason || '') });
});

self.onmessage = async (e: MessageEvent) => {
  const data = e.data || {};
  if (data.type === 'run') {
    try {
      const mask = await runRmbg(data.image as ImageData);
      (self as any).postMessage({ type: 'result', mask });
    } catch (err: any) {
      (self as any).postMessage({ type: 'error', message: String(err?.message || err) });
    }
  } else if (data.type === 'run-cloth') {
    try {
      const mask = await runClothSeg(data.image as ImageData);
      (self as any).postMessage({ type: 'result', mask });
    } catch (err: any) {
      (self as any).postMessage({ type: 'error', message: String(err?.message || err) });
    }
  } else if (data.type === 'run-removebg') {
    try {
      const out = await runRemoveBg(data.image as ImageData);
      (self as any).postMessage({ type: 'result', mask: out });
    } catch (err: any) {
      (self as any).postMessage({ type: 'error', message: String(err?.message || err) });
    }
  } else if (data.type === 'run-recolor') {
    try {
      const out = await runRecolor(data.image as ImageData, data.targetHex as string);
      (self as any).postMessage({ type: 'result', mask: out });
    } catch (err: any) {
      (self as any).postMessage({ type: 'error', message: String(err?.message || err) });
    }
  }
};

export {};
