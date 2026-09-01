import { useState, useMemo } from 'react';
import { X, Download, Image as ImageIcon, ChevronRight, ChevronLeft, ZoomIn, Info } from 'lucide-react';
import { format } from 'date-fns';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { Image } from '@/components/ui/image';
import ImageLightbox from '@/components/ImageLightbox';

export default function RightSidebar() {
  const { tasks, selectedTaskId } = useApp();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) || null,
    [tasks, selectedTaskId],
  );

  const results = selectedTask?.results || [];
  const hasResults = results.length > 0;

  const handleDownload = async (url: string, name: string, format: 'jpg' | 'png' = 'png') => {
    const baseName = name.replace(/\.[^.]+$/, '');
    const fileName = `FC-ai_${baseName}.${format}`;
    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不可用');
      if (format === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mime, 0.95);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`已下载 ${format.toUpperCase()}`);
    } catch {
      // 兜底：直接下载原始文件
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`已下载 ${format.toUpperCase()}`);
    }
  };

  // 移动端默认隐藏
  if (isMobile && collapsed) return null;

  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 h-full bg-card border-l border-border/40 flex flex-col items-center pt-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(false)}
          aria-label="展开预览栏"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="mt-2 text-[10px] text-muted-foreground writing-vertical">
          预览
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[320px] shrink-0 h-full bg-card border-l border-border/40 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <ImageIcon className="size-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">
            {selectedTask ? `任务 #${selectedTask.index}` : '预览'}
          </span>
          {hasResults && (
            <Badge variant="outline" className="text-[10px] shrink-0">
              {results.length} 张
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setCollapsed(true)}
          aria-label="收起预览栏"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!selectedTask && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground text-xs py-12">
            <ImageIcon className="size-8 mb-2 opacity-30" />
            <p>点击左侧任务行</p>
            <p>查看生成结果预览</p>
          </div>
        )}

        {selectedTask && !hasResults && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground text-xs py-12 border border-dashed border-border/50 rounded-md">
            <ImageIcon className="size-8 mb-2 opacity-30" />
            <p className="font-medium">暂无生成图片</p>
            <p className="mt-1">点击生成按钮开始</p>
          </div>
        )}

        {selectedTask && hasResults && (
          <>
            {/* Info */}
            <div className="p-2.5 rounded-md bg-muted/40 border border-border/40 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0" />
                <span className="font-medium text-foreground">模型：</span>
                <span className="truncate">{selectedTask.modelLabel || selectedTask.model}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">尺寸：</span>
                <span>{selectedTask.ratio}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">质量：</span>
                <span>{selectedTask.quality}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">数量：</span>
                <span>{results.length} 张</span>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 gap-2">
              {results.map((img, idx) => (
                <div
                  key={img.id}
                  className="relative group aspect-square rounded-md overflow-hidden border border-border/40 bg-muted/30 cursor-zoom-in"
                  onClick={() => setLightboxIndex(idx)}
                >
                  <Image
                    src={img.url}
                    alt={`result-${idx + 1}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center">
                    <ZoomIn className="size-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                  </div>
                  <div className="absolute top-1 left-1 bg-background/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums text-foreground">
                    {idx + 1}
                  </div>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="!absolute top-1 right-1 z-20 h-6 w-6 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(img.url, `result_${selectedTask.index}_${idx + 1}.png`);
                    }}
                    aria-label="下载"
                  >
                    <Download className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && results[lightboxIndex] && (
        <ImageLightbox
          open={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
          imageUrl={results[lightboxIndex].url}
          imageName={`result_${selectedTask?.index ?? ''}_${lightboxIndex + 1}.png`}
          model={results[lightboxIndex].model}
          width={results[lightboxIndex].width}
          height={results[lightboxIndex].height}
          createdAt={results[lightboxIndex].createdAt}
          showDownload
          onDownloadJpg={() =>
            handleDownload(
              results[lightboxIndex!].url,
              `result_${selectedTask?.index ?? ''}_${lightboxIndex! + 1}`,
              'jpg',
            )
          }
          onDownloadPng={() =>
            handleDownload(
              results[lightboxIndex!].url,
              `result_${selectedTask?.index ?? ''}_${lightboxIndex! + 1}`,
              'png',
            )
          }
        />
      )}
    </aside>
  );
}
