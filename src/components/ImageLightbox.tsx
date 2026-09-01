import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Download, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Image } from '@/components/ui/image';

interface ImageLightboxProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName?: string;
  model?: string;
  width?: number;
  height?: number;
  createdAt?: number;
  showDownload?: boolean;
  downloadName?: string;
  onDownloadJpg?: () => void;
  onDownloadPng?: () => void;
  downloadedJpg?: boolean;
  downloadedPng?: boolean;
  showUseAsReference?: boolean;
  onUseAsReference?: () => void;
}

export default function ImageLightbox({
  open,
  onClose,
  imageUrl,
  imageName,
  model,
  width,
  height,
  createdAt,
  showDownload,
  downloadName,
  onDownloadJpg,
  onDownloadPng,
  downloadedJpg,
  downloadedPng,
  showUseAsReference,
  onUseAsReference,
}: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '0' || e.key === ' ') {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, resetView]);

  // 打开时重置视图 & 禁止 body 滚动
  useEffect(() => {
    if (!open) return;
    resetView();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, imageUrl, resetView]);

  // 滚轮缩放
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 100;
      const mouseY = ((e.clientY - rect.top) / rect.height) * 100;

      setScale((prev) => {
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        const next = Math.min(5, Math.max(0.5, prev + prev * delta));
        return Math.round(next * 100) / 100;
      });
      setOrigin({ x: mouseX, y: mouseY });
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [open]);

  // 拖拽
  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPosition({
      x: dragStart.current.posX + dx,
      y: dragStart.current.posY + dy,
    });
  };

  const onMouseUp = () => {
    setIsDragging(false);
  };

  const onDoubleClick = () => {
    resetView();
  };

  const onBackdropClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // 点击图片本身不关闭（用于拖拽缩放）
    if (target.tagName === 'IMG') return;
    // 点击按钮或控件不关闭
    if (target.closest('button') || target.closest('[data-control]')) return;
    onClose();
  };

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] w-screen h-screen bg-transparent overflow-hidden select-none m-0 p-0"
      onClick={onBackdropClick}
      style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onDoubleClick={onDoubleClick}
    >
      {/* 图片容器 —— 占满全屏，图片居中缩放 */}
      <div
        data-image-wrapper
        className="absolute inset-0 flex items-center justify-center m-0 p-0 pointer-events-none"
      >
        <div
          className="flex items-center justify-center pointer-events-auto"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: `${origin.x}% ${origin.y}%`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          <Image
            src={imageUrl}
            alt={imageName || '图片预览'}
            className="max-w-[90vw] max-h-[90vh] object-contain m-0 p-0 block rounded-md shadow-2xl"
            draggable={false}
            style={{ background: 'transparent' }}
          />
        </div>
      </div>

      {/* 缩放比例 */}
      <div data-control className="absolute top-4 left-4 z-30 px-3 py-1.5 bg-black/60 backdrop-blur text-white text-xs rounded-full font-mono tabular-nums pointer-events-none shadow-lg">
        {Math.round(scale * 100)}%
      </div>

      {/* 关闭按钮 */}
      <button
        data-control
        onClick={onClose}
        className="absolute top-4 right-4 z-30 flex items-center justify-center h-9 w-9 rounded-full bg-black/60 backdrop-blur text-white hover:bg-black/80 transition-colors shadow-lg"
        aria-label="关闭"
      >
        <X className="size-5" />
      </button>

      {/* 底部信息栏 */}
      {(imageName || model || (width && height) || createdAt || showDownload) && (
        <div data-control className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-3 bg-black/70 backdrop-blur text-white/90 text-xs px-4 py-3 border-t border-white/10 shadow-lg">
          {imageName && (
            <span className="truncate max-w-[200px]">{imageName}</span>
          )}
          {model && (
            <>
              {imageName && <span className="opacity-50">·</span>}
              <span>{model}</span>
            </>
          )}
          {width && height && (
            <>
              {(imageName || model) && <span className="opacity-50">·</span>}
              <span className="font-mono tabular-nums">{width}×{height}</span>
            </>
          )}
          {createdAt && (
            <>
              {(imageName || model || (width && height)) && <span className="opacity-50">·</span>}
              <span>{format(createdAt, 'MM-dd HH:mm')}</span>
            </>
          )}
          {showDownload && (onDownloadJpg || onDownloadPng) && (
            <div className="ml-2 flex items-center gap-1">
              {onDownloadJpg && (
                <Button
                  variant="default"
                  size="sm"
                  className={`h-7 text-xs border-0 ${downloadedJpg ? 'bg-success hover:bg-success text-white' : 'bg-white/15 hover:bg-white/25 text-white'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadJpg();
                  }}
                >
                  <Download className="size-3.5 mr-1" />
                  下载 JPG
                </Button>
              )}
              {onDownloadPng && (
                <Button
                  variant="default"
                  size="sm"
                  className={`h-7 text-xs border-0 ${downloadedPng ? 'bg-success hover:bg-success text-white' : 'bg-white/15 hover:bg-white/25 text-white'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadPng();
                  }}
                >
                  <Download className="size-3.5 mr-1" />
                  下载 PNG
                </Button>
              )}
            </div>
          )}
          {showUseAsReference && onUseAsReference && (
            <Button
              variant="default"
              size="sm"
              className="ml-1 h-7 text-xs border-0 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onUseAsReference();
              }}
            >
              <ImagePlus className="size-3.5 mr-1" />
              设为参考图
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
