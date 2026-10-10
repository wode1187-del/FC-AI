// 移除背景 · 本地 RMBG 抠图（不调 API、不扣费、不重绘、不偏色）
// 复用 src/workers/rmbg.worker.ts 的 run-removebg 分支：RMBG 前景蒙版 + 原图 RGB 合成透明 PNG。
// 模型源 huggingface 官方 RMBG-1.4（CORS 全开放），走浏览器 Cache API，首次下载后秒开。
// 独立于 MaskEditor 的 worker 实例，避免互相干扰（模型 Cache 共享、会话各自建立）。

let rmbgWorker: Worker | null = null;
let workerBusy = false;
let pendingResolve: ((m: ImageData) => void) | null = null;
let pendingReject: ((e: Error) => void) | null = null;

function ensureWorker(): Worker {
  if (!rmbgWorker) {
    rmbgWorker = new Worker(new URL('../workers/rmbg.worker', import.meta.url), { type: 'module' });
    rmbgWorker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'result') {
        workerBusy = false;
        pendingResolve?.(d.mask as ImageData);
        pendingResolve = null; pendingReject = null;
      } else if (d.type === 'error') {
        workerBusy = false;
        pendingReject?.(new Error(d.message || '本地抠图失败'));
        pendingResolve = null; pendingReject = null;
      }
    };
    rmbgWorker.onerror = (e) => {
      workerBusy = false;
      pendingReject?.(new Error(e.message || '抠图 Worker 错误'));
      pendingResolve = null; pendingReject = null;
    };
  }
  return rmbgWorker;
}

function runRemoveBgInWorker(image: ImageData): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    if (workerBusy) { reject(new Error('已有抠图任务进行中')); return; }
    const w = ensureWorker();
    workerBusy = true;
    pendingResolve = resolve;
    pendingReject = reject;
    w.postMessage({ type: 'run-removebg', image });
  });
}

/** 从 URL 读取成 ImageData（支持 objectURL/blob/dataURL/网络图） */
async function urlToImageData(url: string): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('读取图片失败 HTTP ' + res.status);
  const blob = await res.blob();
  // 禁用色彩管理转换：保留原图原始像素（防止带 ICC/广色域 profile 的图被浏览器
  // 做 P3→sRGB gamut 转换后皮肤变鲜艳/变色）。这是"抠图后人物颜色变鲜艳"的根因。
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', imageOrientation: 'from-image' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { colorSpace: 'srgb' })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

export interface RemoveBgResult {
  url: string;       // 透明 PNG 的 objectURL
  width: number;
  height: number;
}

/**
 * 本地移除背景：上传图 URL → RMBG 抠图 → 透明 PNG objectURL。
 * 完全本地处理，不产生 API 费用；RGB 原样保留（不重绘、不偏色），仅背景变透明。
 */
export async function removeBackgroundLocal(url: string): Promise<RemoveBgResult> {
  const image = await urlToImageData(url);
  const out = await runRemoveBgInWorker(image);
  const canvas = document.createElement('canvas');
  canvas.width = out.width;
  canvas.height = out.height;
  canvas.getContext('2d')!.putImageData(out, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出透明 PNG 失败'))), 'image/png');
  });
  return { url: URL.createObjectURL(blob), width: out.width, height: out.height };
}
