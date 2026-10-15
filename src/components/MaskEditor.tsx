import { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// ---- 自动识别衣服：用 RMBG-1.4 分割模型（onnxruntime 在 Web Worker 后台线程跑，主线程不卡顿） ----
// 模型源 huggingface 官方（CORS 全开放）；模型缓存于 Cache API，只下载一次；会话在 Worker 内常驻
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
        pendingReject?.(new Error(d.message || '自动识别失败'));
        pendingResolve = null; pendingReject = null;
      }
    };
    rmbgWorker.onerror = (e) => {
      workerBusy = false;
      pendingReject?.(new Error(e.message || '自动识别 Worker 错误'));
      pendingResolve = null; pendingReject = null;
    };
  }
  return rmbgWorker;
}

/** 在 Worker 后台线程跑分割，返回前景蒙版 ImageData（白色=要重绘） */
function runInWorker(type: 'run' | 'run-cloth' | 'run-recolor', image: ImageData, targetHex?: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    if (workerBusy) { reject(new Error('已有识别任务进行中')); return; }
    const w = ensureWorker();
    workerBusy = true;
    pendingResolve = resolve;
    pendingReject = reject;
    w.postMessage(type === 'run-recolor' ? { type, image, targetHex } : { type, image });
  });
}
const runRmbgInWorker = (image: ImageData) => runInWorker('run', image);
const runClothInWorker = (image: ImageData) => runInWorker('run-cloth', image);
export const runRecolorInWorker = (image: ImageData, targetHex: string) => runInWorker('run-recolor', image, targetHex);

interface MaskEditorProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName?: string;
  /** 保存蒙版（白色=重绘区域，透明=保留区域）。maskDataUrl 为 null 表示取消/无蒙版 */
  onSave: (maskDataUrl: string | null) => void;
}

/**
 * 蒙版编辑器：在参考图上用画笔涂抹"要重绘的区域"（白色）
 * - 原图作为半透明背景参考显示
 * - 蒙版 canvas 独立图层：白色=要重绘，透明=保留
 * - 导出时只导出蒙版图层（不含原图）
 */
export default function MaskEditor({ open, onClose, imageUrl, imageName, onSave }: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [drawing, setDrawing] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingText, setLoadingText] = useState('正在加载图片…');
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const baseImage = useRef<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [detecting, setDetecting] = useState(false);

  // 加载原图并初始化蒙版画布（透明底）
  useEffect(() => {
    if (!open || !imageUrl) return;
    setLoaded(false);
    setErasing(false);
    setLoadingText('正在加载图片…');
    lastPoint.current = null;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      baseImage.current = img;
      const maxW = 640;
      const maxH = 800;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const scale = Math.min(1, maxW / w, maxH / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      setCanvasSize({ w, h });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          // 清空为透明（蒙版初始 = 无重绘区域）
          ctx.clearRect(0, 0, w, h);
          setLoaded(true);
        });
      });
    };
    img.onerror = () => {
      setLoadingText('图片加载失败');
      toast.error('图片加载失败，请重试');
    };
    img.src = imageUrl;
  }, [open, imageUrl]);

  const getPos = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }, []);

  const paint = useCallback((e: React.PointerEvent<HTMLCanvasElement>, erasing: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    if (!pos) return;

    if (erasing) {
      // 橡皮擦：清除白色涂抹（恢复透明 = 保留）
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      // 涂抹：画白色（= 要重绘）
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
    }

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();

    // 连线（平滑）
    if (lastPoint.current) {
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPoint.current = pos;
  }, [brushSize, getPos]);

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    e.preventDefault();
    setDrawing(true);
    lastPoint.current = null;
    paint(e, erasing);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !loaded) return;
    paint(e, erasing);
  };

  const handleUp = () => {
    setDrawing(false);
    lastPoint.current = null;
  };

  // 清空所有涂抹（全部透明 = 什么都不改）
  const clearAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // 全填充白色（全部区域重绘）
  const fillAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  // 自动识别主体/衣服：用 RMBG 分割出前景，作为初始蒙版（白色=要重绘），用户再用橡皮擦细化
  const autoDetect = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!baseImage.current) {
      toast.warning('图片尚未加载完成，请稍候再点「自动识别衣服」');
      return;
    }
    if (detecting) return;
    setDetecting(true);
    const toastId = toast.loading('正在加载 AI 识别模型…首次约下载110MB（之后缓存秒开），识别在后台进行，请稍候');
    try {
      // 取原图全尺寸像素，交给 Worker 后台跑分割（主线程不卡）
      const src = document.createElement('canvas');
      src.width = baseImage.current.naturalWidth;
      src.height = baseImage.current.naturalHeight;
      const sctx = src.getContext('2d')!;
      sctx.drawImage(baseImage.current, 0, 0);
      const imageData = sctx.getImageData(0, 0, src.width, src.height);
      // 优先用衣服分割（只圈衣服，脸/手/脚自动排除）
      let mask: ImageData;
      let mode = 'cloth';
      try {
        mask = await runClothInWorker(imageData);
      } catch (e) {
        // 衣服分割失败则回退 RMBG 主体识别
        mask = await runRmbgInWorker(imageData);
        mode = 'rmbg';
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const tmpC = document.createElement('canvas');
        tmpC.width = mask.width;
        tmpC.height = mask.height;
        tmpC.getContext('2d')!.putImageData(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(tmpC, 0, 0, canvas.width, canvas.height);
      }
      setDetecting(false);
      toast.dismiss(toastId);
      if (mode === 'cloth') {
        toast.success('已自动识别衣服（脸/手/脚已自动排除），可微调边缘');
      } else {
        toast.success('已自动识别主体/衣服，可用橡皮擦擦除非衣服区域');
      }
    } catch (e: any) {
      setDetecting(false);
      toast.dismiss(toastId);
      const msg = e?.message || '';
      if (msg.includes('Unexpected token') || msg.includes('<!doctype') || msg.includes('<!DOCTYPE') || msg.includes('404') || msg.includes('Failed to fetch')) {
        toast.error('自动识别模型下载失败（网络/镜像受限）。可先用画笔在衣服上手动涂抹，或稍后重试');
      } else {
        toast.error(`自动识别失败：${msg || '模型加载失败，请检查网络'}`);
      }
    }
  };

  // 导出蒙版：白色=要重绘，透明=保留（不含原图）
  const exportMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  };

  // 校验蒙版是否有效（有没有白色/不透明区域）
  const hasWhite = (): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true; // 有不透明像素（涂抹过）
    }
    return false;
  };

  const handleSave = () => {
    if (!hasWhite()) {
      toast.warning('请先在衣服区域涂抹（白色=要重绘的区域）');
      return;
    }
    const mask = exportMask();
    onSave(mask);
    toast.success('蒙版已生成');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">蒙版编辑 · 涂抹要重绘的区域</DialogTitle>
        </DialogHeader>
        <div className="text-[11px] text-muted-foreground -mt-2 mb-2">
          用画笔在衣服区域涂抹（<span className="text-primary">白色=AI 重绘</span>），未涂抹区域保持原样不动。可点「<span className="text-primary">自动识别衣服</span>」一键圈选主体/衣服，再用橡皮擦微调。适合只改衣服、其他像素不变。
        </div>

        <div
          className="relative rounded-lg overflow-hidden border border-border/60 bg-white flex items-center justify-center"
          style={{ minHeight: 200 }}
        >
          {/* 原图半透明背景参考 */}
          {imageUrl && (
            <img
              src={imageUrl}
              alt="原图参考"
              className="absolute inset-0 w-full h-full object-contain opacity-60 pointer-events-none"
              style={{ filter: 'grayscale(0.3)' }}
            />
          )}
          {!loaded && <div className="relative p-8 text-sm text-muted-foreground">{loadingText}</div>}
          {/* 蒙版图层：白色=重绘 */}
          <canvas
            ref={canvasRef}
            style={{ width: canvasSize.w || '100%', height: canvasSize.h || 'auto', maxHeight: '60vh', cursor: 'crosshair', touchAction: 'none', position: 'relative' }}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="default" size="sm" className="h-8 text-xs" onClick={autoDetect} disabled={detecting}>
            {detecting ? '⏳ 识别中…' : '✨ 自动识别衣服'}
          </Button>
          <span className="text-[11px] text-muted-foreground">画笔大小</span>
          <input
            type="range" min="5" max="120" value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="w-28"
          />
          <span className="text-[11px] text-muted-foreground w-10">{brushSize}px</span>
          <div className="flex-1" />
          <Button variant={erasing ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setErasing(v => !v)} title="切换橡皮擦，涂抹可清除已选区域">
            🧽 橡皮擦 {erasing ? '（开启）' : ''}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearAll}>清空</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={fillAll}>全部</Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => { onSave(null); onClose(); }}>取消</Button>
          <Button size="sm" onClick={handleSave}>生成蒙版</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
