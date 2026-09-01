import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, X, FlipHorizontal, FlipVertical, Undo2, Redo2, Crop, Paintbrush, Grid3X3, Layers, ChevronDown, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Image } from '@/components/ui/image';

interface ImageEditorProps {
  open: boolean;
  imageUrl: string;
  imageName?: string;
  onClose: () => void;
  onSave: (blob: Blob, dataUrl: string) => void;
}

type ToolType = 'crop' | 'brush' | 'mosaic' | 'collage' | 'pan';

interface Point {
  x: number;
  y: number;
}

interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const RATIO_OPTIONS = [
  { value: 'free', label: '自由' },
  { value: '1:1', label: '1:1 正方形' },
  { value: '4:3', label: '4:3 横版' },
  { value: '3:4', label: '3:4 竖版' },
  { value: '16:9', label: '16:9 宽屏' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '3:2', label: '3:2 横版' },
  { value: '2:3', label: '2:3 竖版' },
];

const BRUSH_COLORS = [
  '#000000',
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FFFFFF',
];

const HISTORY_MAX = 20;

export default function ImageEditor({
  open,
  imageUrl,
  imageName = '参考图',
  onClose,
  onSave,
}: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const originalImageRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<ToolType>('pan');
  const [ratio, setRatio] = useState('free');
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(20);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState<'create' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; box: CropBox }>({ x: 0, y: 0, box: { x: 0, y: 0, w: 0, h: 0 } });

  const [isDrawing, setIsDrawing] = useState(false);
  const lastPointRef = useRef<Point | null>(null);

  // 平移状态
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number }>({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const scaleRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });

  const [collageImage, setCollageImage] = useState<HTMLImageElement | null>(null);
  const [collageMode, setCollageMode] = useState<'horizontal' | 'vertical'>('horizontal');

  /** 加载原图 */
  useEffect(() => {
    if (!open || !imageUrl) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalImageRef.current = img;
      initCanvasWithImage(img);
    };
    img.src = imageUrl;
  }, [open, imageUrl]);

  /** 初始化画布 */
  const initCanvasWithImage = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // 画布尺寸 = 容器尺寸
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    canvas.width = cw;
    canvas.height = ch;

    // 计算图片显示比例（等比缩放到画布内）
    const imgRatio = img.width / img.height;
    const canvasRatio = cw / ch;
    let displayW: number, displayH: number;
    if (imgRatio > canvasRatio) {
      displayW = cw * 0.8;
      displayH = displayW / imgRatio;
    } else {
      displayH = ch * 0.8;
      displayW = displayH * imgRatio;
    }
    const newScale = displayW / img.width;
    const newOffset = {
      x: (cw - displayW) / 2,
      y: (ch - displayH) / 2,
    };
    scaleRef.current = newScale;
    offsetRef.current = newOffset;
    setCropBox(null);

    // 绘制初始状态到历史
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    redrawCanvas(ctx, img, newOffset, newScale);
    saveToHistory();
  }, []);

  /** 重绘画布（图片 + 当前工具叠加） */
  const redrawCanvas = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    off: Point,
    sc: number
  ) => {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 背景
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 图片
    ctx.drawImage(img, off.x, off.y, img.width * sc, img.height * sc);
  };

  /** 保存当前画布到历史栈 */
  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(imageData);
      if (next.length > HISTORY_MAX) next.shift();
      return next;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, HISTORY_MAX - 1));
  }, [historyIndex]);

  /** 撤销 */
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const newIndex = historyIndex - 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
  }, [history, historyIndex]);

  /** 重做 */
  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const newIndex = historyIndex + 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
  }, [history, historyIndex]);

  /** 水平镜像 */
  const handleFlipHorizontal = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = originalImageRef.current;
    if (!img) return;

    // 创建临时 canvas，对原图进行水平翻转
    const tmp = document.createElement('canvas');
    tmp.width = img.width;
    tmp.height = img.height;
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    tctx.save();
    tctx.translate(tmp.width, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(img, 0, 0);
    tctx.restore();

    // 更新原始图引用为翻转后的结果
    originalImageRef.current = tmp;

    // 重新绘制画布
    const sc = scaleRef.current;
    const off = offsetRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, off.x, off.y, img.width * sc, img.height * sc);

    // 同步翻转裁剪框
    if (cropBox) {
      setCropBox((prev) => ({
        ...prev,
        x: canvas.width - prev.x - prev.w,
      }));
    }

    saveToHistory();
    toast.success('已水平镜像');
  }, [cropBox, saveToHistory]);

  /** 竖向镜像 */
  const handleFlipVertical = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = originalImageRef.current;
    if (!img) return;

    // 创建临时 canvas，对原图进行竖向翻转
    const tmp = document.createElement('canvas');
    tmp.width = img.width;
    tmp.height = img.height;
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    tctx.save();
    tctx.translate(0, tmp.height);
    tctx.scale(1, -1);
    tctx.drawImage(img, 0, 0);
    tctx.restore();

    // 更新原始图引用为翻转后的结果
    originalImageRef.current = tmp;

    // 重新绘制画布
    const sc = scaleRef.current;
    const off = offsetRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, off.x, off.y, img.width * sc, img.height * sc);

    // 同步翻转裁剪框
    if (cropBox) {
      setCropBox((prev) => ({
        ...prev,
        y: canvas.height - prev.y - prev.h,
      }));
    }

    saveToHistory();
    toast.success('已竖向镜像');
  }, [cropBox, saveToHistory]);

  /** 鼠标滚轮缩放 */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = originalImageRef.current;
    if (!img) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldScale = scaleRef.current;
    const oldOffset = offsetRef.current;

    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newScale = Math.max(0.1, Math.min(10, oldScale * delta));

    const newOffset = {
      x: mx - (mx - oldOffset.x) * (newScale / oldScale),
      y: my - (my - oldOffset.y) * (newScale / oldScale),
    };

    scaleRef.current = newScale;
    offsetRef.current = newOffset;

    // 从原图重新绘制（无损缩放）
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, newOffset.x, newOffset.y, img.width * newScale, img.height * newScale);
  }, []);

  /** 平移：鼠标按下 */
  const onPanMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool !== 'pan') return;
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y,
    };
  }, [tool]);

  /** 平移：鼠标移动 */
  const onPanMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current || tool !== 'pan') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = originalImageRef.current;
    if (!img) return;

    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    const newOffset = {
      x: panStartRef.current.offsetX + dx,
      y: panStartRef.current.offsetY + dy,
    };
    offsetRef.current = newOffset;

    // 重新绘制
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, newOffset.x, newOffset.y, img.width * scaleRef.current, img.height * scaleRef.current);
  }, [tool]);

  /** 平移：鼠标抬起 */
  const onPanMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // ========== 裁剪工具 ==========

  const getRatioNumber = (r: string): number | null => {
    if (r === 'free') return null;
    const [w, h] = r.split(':').map(Number);
    return w / h;
  };

  const constrainCropRatio = (box: CropBox): CropBox => {
    const r = getRatioNumber(ratio);
    if (!r) return box;
    let { x, y, w, h } = box;
    if (w / h > r) {
      w = h * r;
    } else {
      h = w / r;
    }
    return { x, y, w, h };
  };

  const onCropMouseDown = (e: React.MouseEvent) => {
    if (tool !== 'crop') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const handleSize = 10;

    if (!cropBox) {
      // 没有裁剪框时，按下鼠标开始创建
      setIsDraggingCrop('create');
      dragStartRef.current = { x: mx, y: my, box: { x: mx, y: my, w: 0, h: 0 } };
      return;
    }

    const { x, y, w, h } = cropBox;

    // 检查四个角
    if (Math.abs(mx - x) < handleSize && Math.abs(my - y) < handleSize) {
      setIsDraggingCrop('nw');
    } else if (Math.abs(mx - (x + w)) < handleSize && Math.abs(my - y) < handleSize) {
      setIsDraggingCrop('ne');
    } else if (Math.abs(mx - x) < handleSize && Math.abs(my - (y + h)) < handleSize) {
      setIsDraggingCrop('sw');
    } else if (Math.abs(mx - (x + w)) < handleSize && Math.abs(my - (y + h)) < handleSize) {
      setIsDraggingCrop('se');
    } else if (Math.abs(mx - (x + w / 2)) < handleSize && Math.abs(my - y) < handleSize) {
      setIsDraggingCrop('n');
    } else if (Math.abs(mx - (x + w / 2)) < handleSize && Math.abs(my - (y + h)) < handleSize) {
      setIsDraggingCrop('s');
    } else if (Math.abs(mx - x) < handleSize && Math.abs(my - (y + h / 2)) < handleSize) {
      setIsDraggingCrop('w');
    } else if (Math.abs(mx - (x + w)) < handleSize && Math.abs(my - (y + h / 2)) < handleSize) {
      setIsDraggingCrop('e');
    } else if (mx > x && mx < x + w && my > y && my < y + h) {
      setIsDraggingCrop('move');
    } else {
      // 在裁剪框外按下 → 重新创建
      setIsDraggingCrop('create');
      dragStartRef.current = { x: mx, y: my, box: { x: mx, y: my, w: 0, h: 0 } };
      return;
    }
    dragStartRef.current = { x: mx, y: my, box: { ...cropBox } };
  };

  const onCropMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingCrop) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - dragStartRef.current.x;
    const dy = my - dragStartRef.current.y;
    const start = dragStartRef.current.box;
    const canvas = canvasRef.current!;
    let newBox: CropBox = { ...start };

    if (isDraggingCrop === 'create') {
      // 创建模式：从起点到当前点
      newBox.x = Math.min(dragStartRef.current.x, mx);
      newBox.y = Math.min(dragStartRef.current.y, my);
      newBox.w = Math.abs(mx - dragStartRef.current.x);
      newBox.h = Math.abs(my - dragStartRef.current.y);
      // 限制在画布内
      if (newBox.x < 0) { newBox.x = 0; newBox.w = mx; }
      if (newBox.y < 0) { newBox.y = 0; newBox.h = my; }
      if (newBox.x + newBox.w > canvas.width) newBox.w = canvas.width - newBox.x;
      if (newBox.y + newBox.h > canvas.height) newBox.h = canvas.height - newBox.y;
      // 比例锁定
      if (newBox.w > 5 && newBox.h > 5) {
        const r = getRatioNumber(ratio);
        if (r) {
          // 以起点为锚点，按比例扩展
          if (mx >= start.x && my >= start.y) {
            newBox = { x: start.x, y: start.y, w: newBox.w, h: newBox.h };
          } else if (mx < start.x && my >= start.y) {
            newBox = { x: newBox.x, y: start.y, w: start.x - newBox.x, h: newBox.h };
          } else if (mx >= start.x && my < start.y) {
            newBox = { x: start.x, y: newBox.y, w: newBox.w, h: start.y - newBox.y };
          } else {
            newBox = { x: newBox.x, y: newBox.y, w: start.x - newBox.x, h: start.y - newBox.y };
          }
          // 约束比例
          if (newBox.w / newBox.h > r) {
            newBox.w = newBox.h * r;
          } else {
            newBox.h = newBox.w / r;
          }
          // 根据拖动方向重新定位
          if (mx < start.x) newBox.x = start.x - newBox.w;
          if (my < start.y) newBox.y = start.y - newBox.h;
        }
      }
    } else if (isDraggingCrop === 'move') {
      newBox.x = Math.max(0, Math.min(canvas.width - start.w, start.x + dx));
      newBox.y = Math.max(0, Math.min(canvas.height - start.h, start.y + dy));
    } else {
      // 角/边拖拽
      newBox = { ...start };
      const r = getRatioNumber(ratio);

      if (isDraggingCrop === 'nw') {
        newBox.x = start.x + dx;
        newBox.y = start.y + dy;
        newBox.w = start.w - dx;
        newBox.h = start.h - dy;
      } else if (isDraggingCrop === 'ne') {
        newBox.y = start.y + dy;
        newBox.w = start.w + dx;
        newBox.h = start.h - dy;
      } else if (isDraggingCrop === 'sw') {
        newBox.x = start.x + dx;
        newBox.w = start.w - dx;
        newBox.h = start.h + dy;
      } else if (isDraggingCrop === 'se') {
        newBox.w = start.w + dx;
        newBox.h = start.h + dy;
      } else if (isDraggingCrop === 'n') {
        newBox.y = start.y + dy;
        newBox.h = start.h - dy;
        if (r) newBox.w = newBox.h * r;
      } else if (isDraggingCrop === 's') {
        newBox.h = start.h + dy;
        if (r) newBox.w = newBox.h * r;
      } else if (isDraggingCrop === 'w') {
        newBox.x = start.x + dx;
        newBox.w = start.w - dx;
        if (r) newBox.h = newBox.w / r;
      } else if (isDraggingCrop === 'e') {
        newBox.w = start.w + dx;
        if (r) newBox.h = newBox.w / r;
      }

      // 最小尺寸
      if (newBox.w < 20) newBox.w = 20;
      if (newBox.h < 20) newBox.h = 20;
      // 限制在画布内
      if (newBox.x < 0) { newBox.w += newBox.x; newBox.x = 0; }
      if (newBox.y < 0) { newBox.h += newBox.y; newBox.y = 0; }
      if (newBox.x + newBox.w > canvas.width) newBox.w = canvas.width - newBox.x;
      if (newBox.y + newBox.h > canvas.height) newBox.h = canvas.height - newBox.y;

      // 角拖拽时按比例约束
      if (r && ['nw', 'ne', 'sw', 'se'].includes(isDraggingCrop)) {
        newBox = constrainCropRatio(newBox);
        // 重新对齐
        if (isDraggingCrop === 'nw' || isDraggingCrop === 'sw') {
          newBox.x = start.x + start.w - newBox.w;
        }
        if (isDraggingCrop === 'nw' || isDraggingCrop === 'ne') {
          newBox.y = start.y + start.h - newBox.h;
        }
      }
    }
    setCropBox(newBox);
  };

  const onCropMouseUp = () => {
    // 尺寸太小的裁剪框忽略
    if (isDraggingCrop === 'create' && cropBox && (cropBox.w < 10 || cropBox.h < 10)) {
      setCropBox(null);
    }
    setIsDraggingCrop(null);
  };

  const onCropDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'crop') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !cropBox) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { x, y, w, h } = cropBox;
    if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
      setCropBox(null);
    }
  };

  /** 切换比例时重设裁剪框 */
  useEffect(() => {
    if (tool !== 'crop') return;
    if (!cropBox) return;
    const r = getRatioNumber(ratio);
    if (!r) return;
    let { x, y, w, h } = cropBox;
    if (w / h > r) {
      w = h * r;
    } else {
      h = w / r;
    }
    // 居中
    x = cropBox.x + (cropBox.w - w) / 2;
    y = cropBox.y + (cropBox.h - h) / 2;
    setCropBox({ x, y, w, h });
  }, [ratio, tool, cropBox]);

  // ========== 画笔 / 马赛克工具 ==========

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const onDrawStart = (e: React.MouseEvent) => {
    if (tool !== 'brush' && tool !== 'mosaic') return;
    setIsDrawing(true);
    const p = getCanvasPoint(e);
    lastPointRef.current = p;

    // 画笔：画一个起点圆点
    if (tool === 'brush') {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = brushColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const onDrawMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = getCanvasPoint(e);
    const last = lastPointRef.current;
    if (!last) return;

    if (tool === 'brush') {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (tool === 'mosaic') {
      applyMosaic(ctx, last, p, brushSize);
    }

    lastPointRef.current = p;
  };

  const onDrawEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;
    saveToHistory();
  };

  /** 马赛克涂抹：沿路径打格子 */
  const applyMosaic = (ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) => {
    const canvas = ctx.canvas;
    const cellSize = Math.max(8, Math.round(size / 3));
    // 计算采样区域（沿 from→to 路径覆盖 size 宽的线）
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / (cellSize / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = from.x + (to.x - from.x) * t;
      const cy = from.y + (to.y - from.y) * t;
      const left = Math.floor((cx - size / 2) / cellSize) * cellSize;
      const top = Math.floor((cy - size / 2) / cellSize) * cellSize;
      const right = left + size + cellSize;
      const bottom = top + size + cellSize;

      for (let gx = left; gx < right; gx += cellSize) {
        for (let gy = top; gy < bottom; gy += cellSize) {
          if (gx < 0 || gy < 0 || gx >= canvas.width || gy >= canvas.height) continue;
          try {
            const pixel = ctx.getImageData(gx, gy, 1, 1).data;
            ctx.fillStyle = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
            ctx.fillRect(gx, gy, cellSize, cellSize);
          } catch {
            // ignore
          }
        }
      }
    }
  };

  // ========== 拼图工具 ==========

  const handleCollageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      setCollageImage(img);
      renderCollage(img, collageMode);
    };
    img.src = url;
  };

  const renderCollage = (img2: HTMLImageElement, mode: 'horizontal' | 'vertical') => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img1 = originalImageRef.current;
    if (!canvas || !ctx || !img1) return;

    let newCanvasW: number, newCanvasH: number;
    if (mode === 'horizontal') {
      // 左右拼接：高度取较小的统一，宽度相加
      const targetH = Math.min(img1.height, img2.height);
      const w1 = (img1.width / img1.height) * targetH;
      const w2 = (img2.width / img2.height) * targetH;
      newCanvasW = w1 + w2;
      newCanvasH = targetH;
    } else {
      // 上下拼接：宽度取较小的统一，高度相加
      const targetW = Math.min(img1.width, img2.width);
      const h1 = (img1.height / img1.width) * targetW;
      const h2 = (img2.height / img2.width) * targetW;
      newCanvasW = targetW;
      newCanvasH = h1 + h2;
    }

    // 画到临时 canvas
    const tmp = document.createElement('canvas');
    tmp.width = newCanvasW;
    tmp.height = newCanvasH;
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    if (mode === 'horizontal') {
      const targetH = newCanvasH;
      const w1 = (img1.width / img1.height) * targetH;
      const w2 = (img2.width / img2.height) * targetH;
      tctx.drawImage(img1, 0, 0, w1, targetH);
      tctx.drawImage(img2, w1, 0, w2, targetH);
    } else {
      const targetW = newCanvasW;
      const h1 = (img1.height / img1.width) * targetW;
      const h2 = (img2.height / img2.width) * targetW;
      tctx.drawImage(img1, 0, 0, targetW, h1);
      tctx.drawImage(img2, 0, h1, targetW, h2);
    }

    // 缩放到当前显示画布
    const cw = canvas.width;
    const ch = canvas.height;
    const imgRatio = newCanvasW / newCanvasH;
    const canvasRatio = cw / ch;
    let displayW: number, displayH: number;
    if (imgRatio > canvasRatio) {
      displayW = cw * 0.8;
      displayH = displayW / imgRatio;
    } else {
      displayH = ch * 0.8;
      displayW = displayH * imgRatio;
    }
    const newScale = displayW / newCanvasW;
    const newOffset = {
      x: (cw - displayW) / 2,
      y: (ch - displayH) / 2,
    };
    scaleRef.current = newScale;
    offsetRef.current = newOffset;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(tmp, newOffset.x, newOffset.y, displayW, displayH);

    // 更新原始图引用为拼接结果（保存时用）
    originalImageRef.current = tmp;
    setCropBox({
      x: newOffset.x,
      y: newOffset.y,
      w: displayW,
      h: displayH,
    });
    saveToHistory();
    toast.success('拼图已应用');
  };

  // ========== 保存 ==========

  const handleSave = () => {
    const canvas = canvasRef.current;
    const origImg = originalImageRef.current;
    if (!canvas || !origImg) return;

    // 如果当前是裁剪工具且有裁剪框，按裁剪框导出；否则导出整个图片
    if (tool === 'crop' && cropBox) {
      // 裁剪框对应的原图区域
      const sc = scaleRef.current;
      const off = offsetRef.current;
      const srcX = (cropBox.x - off.x) / sc;
      const srcY = (cropBox.y - off.y) / sc;
      const srcW = cropBox.w / sc;
      const srcH = cropBox.h / sc;

      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(srcW));
      out.height = Math.max(1, Math.round(srcH));
      const octx = out.getContext('2d');
      if (!octx) return;
      octx.drawImage(
        origImg,
        Math.max(0, srcX),
        Math.max(0, srcY),
        Math.min(origImg.width, srcW),
        Math.min(origImg.height, srcH),
        0, 0, out.width, out.height
      );
      out.toBlob((blob) => {
        if (!blob) {
          toast.error('保存失败');
          return;
        }
        onSave(blob, out.toDataURL('image/png'));
        toast.success('图片已保存');
      }, 'image/png');
    } else {
      // 画笔/马赛克/拼图：导出当前画布内容，按原始尺寸等比放大
      const out = document.createElement('canvas');
      out.width = origImg.width;
      out.height = origImg.height;
      const octx = out.getContext('2d');
      if (!octx) return;
      // 先画原始图
      octx.drawImage(origImg, 0, 0);
      // 再把画布上的绘制（画笔/马赛克）叠加上去，按 scale 映射
      // 我们需要从显示画布中提取偏移区域，等比放大
      const sc = scaleRef.current;
      const off = offsetRef.current;
      const sx = off.x;
      const sy = off.y;
      const sw = origImg.width * sc;
      const sh = origImg.height * sc;
      octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);

      out.toBlob((blob) => {
        if (!blob) {
          toast.error('保存失败');
          return;
        }
        onSave(blob, out.toDataURL('image/png'));
        toast.success('图片已保存');
      }, 'image/png');
    }
  };

  // ========== 绘制叠加层（裁剪框） ==========

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 用历史栈顶重绘 + 叠加裁剪框
    if (history.length > 0 && historyIndex >= 0) {
      ctx.putImageData(history[historyIndex], 0, 0);
    }

    if (tool === 'crop') {
      drawCropOverlay(ctx);
    }
  }, [cropBox, tool, historyIndex, history]);

  const drawCropOverlay = (ctx: CanvasRenderingContext2D) => {
    if (!cropBox) return;
    const canvas = ctx.canvas;
    const { x, y, w, h } = cropBox;

    // 用路径裁剪方式画半透明遮罩（不清除图片本身）
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(x, y, w, h);
    // evenodd 填充规则：中间矩形区域不填充
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill('evenodd');
    ctx.restore();

    // 边框
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // 四角 + 四边中点 共8个把手
    const handleSize = 8;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    const handles: Point[] = [
      { x: x, y: y },                 // nw
      { x: x + w / 2, y: y },         // n
      { x: x + w, y: y },             // ne
      { x: x, y: y + h / 2 },         // w
      { x: x + w, y: y + h / 2 },     // e
      { x: x, y: y + h },             // sw
      { x: x + w / 2, y: y + h },     // s
      { x: x + w, y: y + h },         // se
    ];
    handles.forEach((p) => {
      ctx.fillRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize);
    });

    // 九宫格辅助线
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (w * i) / 3, y);
      ctx.lineTo(x + (w * i) / 3, y + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + (h * i) / 3);
      ctx.lineTo(x + w, y + (h * i) / 3);
      ctx.stroke();
    }
  };

  /** 关闭时重置状态 */
  const handleClose = () => {
    setHistory([]);
    setHistoryIndex(-1);
    setCollageImage(null);
    setTool('pan');
    setRatio('free');
    setBrushColor('#000000');
    setBrushSize(20);
    onClose();
  };

  const toolTips: Record<ToolType, string> = {
    pan: '拖动查看图片不同位置，滚轮缩放',
    crop: '在画布拖动框选裁剪区域',
    brush: '在画布上拖动绘制',
    mosaic: '在画布拖动涂抹马赛克',
    collage: '选择第二张图片进行拼接',
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col">
      {/* 顶部工具栏 */}
      <div className="h-14 bg-white border-b border-border flex items-center px-4 gap-3 shrink-0">
        <Button variant="ghost" size="sm" onClick={handleClose} className="gap-1.5">
          <ArrowLeft className="size-4" />
          返回
        </Button>

        <div className="flex items-center gap-1 border-r border-border pr-3">
          {[
            { v: 'pan', label: '移动', icon: Hand },
            { v: 'crop', label: '裁剪', icon: Crop },
            { v: 'brush', label: '画笔', icon: Paintbrush },
            { v: 'mosaic', label: '马赛克', icon: Grid3X3 },
            { v: 'collage', label: '拼图', icon: Layers },
          ].map((t) => (
            <Button
              key={t.v}
              variant={tool === t.v ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTool(t.v as ToolType)}
              className="gap-1.5"
            >
              <t.icon className="size-4" />
              {t.label}
            </Button>
          ))}
        </div>

        {tool === 'crop' && (
          <div className="relative">
            <select
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
              className="h-8 w-[140px] appearance-none rounded-md border border-border bg-background px-3 pr-8 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              {RATIO_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  比例·{r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={handleFlipHorizontal}
          className="gap-1.5"
          title="水平镜像"
        >
          <FlipHorizontal className="size-4" />
          水平镜像
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFlipVertical}
          className="gap-1.5"
          title="竖向镜像"
        >
          <FlipVertical className="size-4" />
          竖向镜像
        </Button>

        {(tool === 'brush' || tool === 'mosaic') && (
          <div className="flex items-center gap-3">
            {tool === 'brush' && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowColorPicker((v) => !v)}
                >
                  <div
                    className="size-4 rounded-full border border-border"
                    style={{ backgroundColor: brushColor }}
                  />
                  颜色
                </Button>
                {showColorPicker && (
                  <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-border rounded-md shadow-md z-10 grid grid-cols-3 gap-1.5">
                    {BRUSH_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`size-6 rounded-md border transition-transform hover:scale-110 ${
                          brushColor === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border'
                        }`}
                        style={{ backgroundColor: c }}
                        onClick={() => {
                          setBrushColor(c);
                          setShowColorPicker(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 w-40">
              <span className="text-xs text-muted-foreground whitespace-nowrap">大小</span>
              <Slider
                value={[brushSize]}
                min={1}
                max={100}
                step={1}
                onValueChange={(v) => setBrushSize(v[0])}
              />
              <span className="text-xs text-muted-foreground w-6 text-right tabular-nums">
                {brushSize}
              </span>
            </div>
          </div>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={historyIndex <= 0}
          className="gap-1.5"
        >
          <Undo2 className="size-4" />
          撤销
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRedo}
          disabled={historyIndex >= history.length - 1}
          className="gap-1.5"
        >
          <Redo2 className="size-4" />
          还原
        </Button>

        <Button variant="ghost" size="icon" onClick={handleClose} className="ml-2">
          <X className="size-5" />
        </Button>
      </div>

      {/* 主编辑区 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧原图预览 */}
        <div className="w-44 bg-card border-r border-border p-3 flex flex-col gap-2 shrink-0">
          <div className="text-xs font-medium text-foreground">原图预览</div>
          <div className="relative w-full aspect-[3/4] rounded-md border border-border overflow-hidden bg-muted/30">
          {imageUrl && (
            <Image
              src={imageUrl}
              alt={imageName}
              className="w-full h-full object-contain"
              draggable={false}
            />
          )}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {toolTips[tool]}
          </div>

          {tool === 'collage' && (
            <div className="mt-2 space-y-2">
              <div className="text-xs font-medium">拼图设置</div>
              <div className="flex gap-1">
                <Button
                  variant={collageMode === 'horizontal' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs h-7"
                  onClick={() => setCollageMode('horizontal')}
                >
                  左右拼接
                </Button>
                <Button
                  variant={collageMode === 'vertical' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs h-7"
                  onClick={() => setCollageMode('vertical')}
                >
                  上下拼接
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => document.getElementById('collage-upload')?.click()}
              >
                选择第二张图片
              </Button>
              <input
                id="collage-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCollageUpload}
              />
              {collageImage && (
                <Button
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => renderCollage(collageImage, collageMode)}
                >
                  应用拼图
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 中间画布区 */}
        <div
          ref={containerRef}
          className="flex-1 bg-[#1e293b] relative min-w-0"
          onMouseUp={(e) => {
            onCropMouseUp();
            onPanMouseUp();
          }}
          onMouseMove={(e) => {
            if (tool === 'crop') onCropMouseMove(e);
            if (tool === 'brush' || tool === 'mosaic') onDrawMove(e);
            if (tool === 'pan') onPanMouseMove(e);
          }}
          onMouseLeave={() => {
            onCropMouseUp();
            onDrawEnd();
            onPanMouseUp();
          }}
          onWheel={handleWheel}
        >
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full ${
              tool === 'pan'
                ? 'cursor-grab active:cursor-grabbing'
                : tool === 'crop'
                  ? 'cursor-crosshair'
                  : tool === 'brush' || tool === 'mosaic'
                    ? 'cursor-crosshair'
                    : 'cursor-default'
            }`}
            onMouseDown={(e) => {
              if (tool === 'crop') onCropMouseDown(e);
              if (tool === 'brush' || tool === 'mosaic') onDrawStart(e);
              if (tool === 'pan') onPanMouseDown(e);
            }}
            onMouseUp={() => {
              onDrawEnd();
            }}
            onDoubleClick={onCropDoubleClick}
          />
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="h-16 bg-white border-t border-border flex items-center px-6 shrink-0">
        <div className="text-sm text-muted-foreground">
          编辑在浏览器本地完成，保存后回写当前参考图
        </div>
        <div className="flex-1" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleSave}>保存到当前位置</Button>
        </div>
      </div>
    </div>
  );
}
