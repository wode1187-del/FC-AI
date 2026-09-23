import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { toast } from 'sonner';
import {
  Trash2,
  Play,
  RefreshCw,
  Plus,
  FolderPlus,
  Sparkles,
  Settings,
  GripVertical,
  GripHorizontal,
  Search,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Download,
  CheckCircle2,
  ImagePlus,
  Eye,
  EyeOff,
   X,
   AlertCircle,
   Copy,
 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Image } from '@/components/ui/image';
import { logger, scopedStorage } from '@lark-apaas/client-toolkit-lite';
import ImageLightbox from '@/components/ImageLightbox';
import ImageEditor from '@/components/ImageEditor';
import { useApp } from '@/context/AppContext';
import { isVideoModel } from '@/data/featureTemplates';
import { getResolutionGroups, type ITask } from '@/data/models';
import type { ITextOptimizeConfig } from '@/data/models';
import { useNavigate } from 'react-router-dom';

// ===== 提示词列单元格（memo 优化，避免全表重渲染） =====
interface TaskPromptCellProps {
  task: ITask;
  textOptimizeConfig: ITextOptimizeConfig;
  allTextModels: string[];
  updateTask: (taskId: string, updates: Partial<ITask>) => void;
  updateTextOptimizeConfig: (updates: Partial<ITextOptimizeConfig>) => void;
  navigate: (path: string) => void;
}

const TaskPromptCell = memo(function TaskPromptCell({
  task,
  textOptimizeConfig,
  allTextModels,
  updateTask,
  updateTextOptimizeConfig,
  navigate,
}: TaskPromptCellProps) {
  // 本地状态：输入时只更新本地，防抖或失焦时同步到全局，避免每次按键全表重渲染
  const [localPrompt, setLocalPrompt] = useState(task.prompt);
  const [optimizeInput, setOptimizeInput] = useState('');
  const [showOptimize, setShowOptimize] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const debounceTimer = useRef<number | null>(null);

  // 外部 prompt 变化时同步到本地（如 AI 写入、应用预设等）
  useEffect(() => {
    if (task.prompt !== localPrompt) {
      setLocalPrompt(task.prompt);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.prompt]);

  const syncToGlobal = useCallback((value: string) => {
    if (value !== task.prompt) {
      updateTask(task.id, { prompt: value });
    }
  }, [task.id, task.prompt, updateTask]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalPrompt(value);
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      syncToGlobal(value);
    }, 300);
  }, [syncToGlobal]);

  const handleBlur = useCallback(() => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    syncToGlobal(localPrompt);
  }, [localPrompt, syncToGlobal]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, []);

  const goToPromptApiSettings = useCallback(() => {
    navigate('/api?tab=prompt');
  }, [navigate]);

  const handleOptimizePrompt = useCallback(async () => {
    if (!optimizeInput.trim()) {
      toast.warning('请输入优化提示词');
      return;
    }
    if (!textOptimizeConfig.apiKey.trim()) {
      toast.warning('请先在 API 管理页配置提示词优化 API');
      navigate('/api?tab=prompt');
      return;
    }

    setIsOptimizing(true);
    let full = '';
    try {
      const baseUrl = textOptimizeConfig.baseUrl.replace(/\/$/, '');
      const hasV1 = /\/v1$/.test(baseUrl);
      const endpoint = hasV1 ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${textOptimizeConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: textOptimizeConfig.model,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的AI绘画提示词优化专家。将用户简短的描述扩写为详细、专业的中文AI绘画提示词，适合商业电商摄影风格，包含光影、构图、色调、材质、场景氛围等细节。必须用中文输出。直接输出优化后的提示词，不要解释，不要加前后缀，不要用英文。',
            },
            { role: 'user', content: optimizeInput },
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 100)}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((l) => l.trim().startsWith('data: '));
          for (const line of lines) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices?.[0]?.delta?.content;
              if (delta) {
                full += delta;
              }
            } catch {
              // 忽略解析失败的片段
            }
          }
        }
      }
    } catch (error) {
      toast.error(`提示词优化失败：${error instanceof Error ? error.message.slice(0, 80) : '未知错误'}`);
    } finally {
      setIsOptimizing(false);
      if (full.trim()) {
        const optimized = full.trim();
        setLocalPrompt(optimized);
        updateTask(task.id, { prompt: optimized });
        setOptimizeInput('');
        toast.success('优化后的提示词已自动写入');
      }
    }
  }, [optimizeInput, textOptimizeConfig, navigate, task.id, updateTask]);

  return (
    <div className="space-y-2">
      <Textarea
        value={localPrompt}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="输入完整提示词..."
        className="min-h-[80px] text-xs resize-none"
      />
      <div className="border border-border/50 rounded-md p-2 bg-muted/30 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Sparkles className="size-3 text-primary" />
            AI 自动优化提示词
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={goToPromptApiSettings}
            title="去 API 管理页配置提示词优化（独立文本模型）"
          >
            <Settings className="size-3 text-muted-foreground" />
          </Button>
        </div>
        {showOptimize ? (
          <div className="space-y-2">
            <Input
              value={optimizeInput}
              onChange={(e) => setOptimizeInput(e.target.value)}
              placeholder="输入一句话让AI自动扩写"
              className="h-7 text-xs"
            />
            <div className="flex gap-2">
              {allTextModels.length > 0 ? (
                <Select
                  value={textOptimizeConfig.model}
                  onValueChange={(v) => updateTextOptimizeConfig({ model: v })}
                >
                  <SelectTrigger className="h-6 text-[10px] flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {textOptimizeConfig.loadedModels.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[9px] text-muted-foreground">已加载模型</SelectLabel>
                        {textOptimizeConfig.loadedModels.map((m) => (
                          <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {textOptimizeConfig.customModels.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[9px] text-muted-foreground">自定义模型</SelectLabel>
                        {textOptimizeConfig.customModels.map((m) => (
                          <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] flex-1"
                  onClick={goToPromptApiSettings}
                >
                  配置API后加载模型
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="h-6 text-[10px] px-3"
                onClick={handleOptimizePrompt}
                disabled={isOptimizing || !optimizeInput.trim()}
              >
                {isOptimizing ? (
                  <RefreshCw className="size-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="size-3 mr-1" />
                )}
                AI 优化并写入
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowOptimize(true)}
            className="w-full text-[11px] text-muted-foreground hover:text-primary text-left py-1"
          >
            + 输入一句话让AI自动扩写
          </button>
        )}
      </div>
    </div>
  );
});

export default function TaskTable() {
  const {
    currentProject,
    tasks,
    activeModels,
    getResolutionsForModel,
    getQualitiesForModel,
    getBackgroundsForModel,
    updateTask,

    addTask,
    removeTask,
    generateTask,
    generateVideoTask,
    markResultDownloaded,
    textOptimizeConfig,
    updateTextOptimizeConfig,
    addTextOptimizeModel,
    removeTextOptimizeModel,
  } = useApp();

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchKeyword, setSearchKeyword] = useState('');
  // 结果图加载错误状态（key = img.id, value = true 表示失败）
  const [imgLoadErrors, setImgLoadErrors] = useState<Record<string, boolean>>({});
  // 结果图重试 key（key = img.id, value = 时间戳，用于强制刷新 src）
  const [imgReloadKeys, setImgReloadKeys] = useState<Record<string, number>>({});
  // 结果图加载完成状态（key = img.id, value = true 表示已加载完成）
  const [imgLoaded, setImgLoaded] = useState<Record<string, boolean>>({});

  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [isFolderDrag, setIsFolderDrag] = useState(false);
  // 图片预览弹窗
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    name: string;
    taskId?: string;
    resultId?: string;
    taskIndex?: number;
    resultIndex?: number;
    isResult?: boolean;
    downloadedJpg?: boolean;
    downloadedPng?: boolean;
  } | null>(null);

  // 失败详情弹窗
  const [errorDetailTask, setErrorDetailTask] = useState<ITask | null>(null);
  // 图片编辑器
  const [editorImage, setEditorImage] = useState<{ taskId: string; imgIndex: number; url: string; name: string } | null>(null);

  // ===== 列宽配置 =====
  interface ColumnWidth { key: string; label: string; defaultWidth: number; minWidth: number; width: number; flex?: boolean; }

  const DEFAULT_COLUMNS: ColumnWidth[] = [
    { key: 'index', label: '序号/状态', defaultWidth: 64, minWidth: 56, width: 64 },
    { key: 'reference', label: '参考图（最多20张）', defaultWidth: 320, minWidth: 220, width: 320 },
    { key: 'prompt', label: '提示词', defaultWidth: 300, minWidth: 180, width: 300 },
    { key: 'params', label: '生成参数', defaultWidth: 220, minWidth: 160, width: 220 },
    { key: 'action', label: '生成操作', defaultWidth: 150, minWidth: 130, width: 150 },
    { key: 'results', label: '生成结果（最多20张）', defaultWidth: 520, minWidth: 300, width: 520, flex: true },
    { key: 'delete', label: '', defaultWidth: 48, minWidth: 40, width: 48 },
  ];

  const COL_WIDTH_STORAGE_KEY = 'task_table_column_widths';

  const [columns, setColumns] = useState<ColumnWidth[]>(() => {
    try {
      const saved = scopedStorage.getItem(COL_WIDTH_STORAGE_KEY);
      if (saved) {
        const savedMap = JSON.parse(saved) as Record<string, number>;
        return DEFAULT_COLUMNS.map(col => ({
          ...col,
          width: savedMap[col.key] ? Math.max(col.minWidth, savedMap[col.key]) : col.defaultWidth,
        }));
      }
    } catch { /* 忽略 */ }
    return DEFAULT_COLUMNS;
  });

  const resizeRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  const onResizeStart = useCallback((e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const col = columns.find(c => c.key === colKey);
    if (!col) return;
    resizeRef.current = { colKey, startX: e.clientX, startWidth: col.width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newWidth = Math.max(col.minWidth, resizeRef.current.startWidth + delta);
      setColumns(prev => prev.map(c => c.key === colKey ? { ...c, width: newWidth } : c));
    };

    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // 保存到 localStorage
      setColumns(prev => {
        const map: Record<string, number> = {};
        prev.forEach(c => { map[c.key] = c.width; });
        try { scopedStorage.setItem(COL_WIDTH_STORAGE_KEY, JSON.stringify(map)); } catch { /* 忽略 */ }
        return prev;
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [columns]);

  const resetColumnWidths = useCallback(() => {
    setColumns(DEFAULT_COLUMNS.map(c => ({ ...c, width: c.defaultWidth })));
    try { scopedStorage.removeItem(COL_WIDTH_STORAGE_KEY); } catch { /* 忽略 */ }
    toast.success('已恢复默认列宽');
  }, []);

  const colWidth = (key: string) => {
    const c = columns.find(x => x.key === key);
    return c ? c.width : undefined;
  };

  // 弹性列（结果列）占满剩余空间
  const resultsFlexCol = columns.find(c => (c as ColumnWidth & { flex?: boolean }).flex);

  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 提示词优化 - 跳转到 API 管理页配置
  const goToPromptApiSettings = useCallback(() => {
    navigate('/api?tab=prompt');
  }, [navigate]);

  const allTextModels = useMemo(
    () => {
      const merged = [...textOptimizeConfig.loadedModels, ...textOptimizeConfig.customModels];
      return [...new Set(merged)];
    },
    [textOptimizeConfig.loadedModels, textOptimizeConfig.customModels]
  );

  // Search filter
  const filteredTasks = useMemo(() => {
    if (!searchKeyword.trim()) return tasks;
    const kw = searchKeyword.toLowerCase().trim();
    return tasks.filter(
      (t) =>
        t.prompt.toLowerCase().includes(kw) ||
        String(t.index).includes(kw) ||
        t.model.toLowerCase().includes(kw)
    );
  }, [tasks, searchKeyword]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const currentTasks = filteredTasks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleRowSelection = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const MAX_REFERENCE_IMAGES = 20;

  // 递归遍历文件夹，收集所有图片文件
  const collectFilesFromEntry = useCallback(async (entry: any): Promise<File[]> => {
    const isImageFile = (name: string) =>
      /\.(jpg|jpeg|png|gif|webp|bmp|tiff|svg)$/i.test(name);
    return new Promise<File[]>((resolve) => {
      if (entry.isFile) {
        entry.file((file: File) => {
          if (isImageFile(file.name)) resolve([file]);
          else resolve([]);
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const allFiles: File[] = [];
        const readBatch = () => {
          reader.readEntries(async (entries: any[]) => {
            if (entries.length === 0) {
              resolve(allFiles);
              return;
            }
            const subFiles = await Promise.all(entries.map(collectFilesFromEntry));
            allFiles.push(...subFiles.flat());
            readBatch(); // 继续读取下一批（浏览器每次最多返回 100 条）
          });
        };
        readBatch();
      } else {
        resolve([]);
      }
    });
  }, []);

  const handleAddReferenceImage = useCallback((taskId: string, files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const currentCount = task.referenceImages.length;
    if (currentCount >= MAX_REFERENCE_IMAGES) {
      toast.warning(`最多支持 ${MAX_REFERENCE_IMAGES} 张参考图`);
      return;
    }
    const fileArr = Array.from(files);
    const remaining = MAX_REFERENCE_IMAGES - currentCount;
    const toAdd = fileArr.slice(0, remaining);
    const newImages = toAdd.map((file, i) => ({
      id: `ref_${Date.now()}_${i}`,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    }));
    updateTask(taskId, { referenceImages: [...task.referenceImages, ...newImages] });
    if (fileArr.length > remaining) {
      toast.info(`已添加 ${toAdd.length} 张，超出 ${fileArr.length - remaining} 张已忽略（最多${MAX_REFERENCE_IMAGES}张）`);
    } else {
      toast.success(`已添加 ${toAdd.length} 张参考图`);
    }
  }, [tasks, updateTask]);

  const handleDrop = useCallback(async (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    setDragOverTaskId(null);
    setIsFolderDrag(false);
    const items = e.dataTransfer.items;
    // 检测是否有文件夹
    let hasFolder = false;
    for (let i = 0; i < items.length; i++) {
      const entry = items[i]?.webkitGetAsEntry?.();
      if (entry?.isDirectory) { hasFolder = true; break; }
    }
    if (hasFolder) {
      const collected: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry = item?.webkitGetAsEntry?.();
        if (entry) {
          const files = await collectFilesFromEntry(entry);
          collected.push(...files);
        }
      }
      if (collected.length === 0) {
        toast.info('文件夹内没有找到图片文件');
      } else {
        handleAddReferenceImage(taskId, collected);
      }
    } else {
      handleAddReferenceImage(taskId, e.dataTransfer.files);
    }
  }, [collectFilesFromEntry, handleAddReferenceImage]);

  const handleDragOver = useCallback((e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    setDragOverTaskId(taskId);
    const items = e.dataTransfer.items;
    let folder = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i]?.webkitGetAsEntry?.()?.isDirectory) { folder = true; break; }
    }
    setIsFolderDrag(folder);
  }, []);

  const handleRemoveReferenceImage = useCallback((taskId: string, imgIndex: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      const newImages = task.referenceImages.filter((_, i) => i !== imgIndex);
      updateTask(taskId, { referenceImages: newImages });
    }
  }, [tasks, updateTask]);

  // 参考图拖拽排序
  const [refDragInfo, setRefDragInfo] = useState<{ taskId: string; fromIndex: number } | null>(null);

  // 计时：生成中实时刷新的任务ID集合
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasGenerating = currentTasks.some(t => t.status === 'generating');
    if (!hasGenerating) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [currentTasks]);

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${(ms / 1000).toFixed(1)}秒`;
  };

  const getTaskDurationText = (task: ITask): string | null => {
    if (task.status === 'generating' && task.startedAt) {
      return formatDuration(Date.now() - task.startedAt);
    }
    if ((task.status === 'completed' || task.status === 'failed') && task.durationMs) {
      return formatDuration(task.durationMs);
    }
    return null;
  };

  const handleRefDragStart = useCallback((taskId: string, fromIndex: number) => {
    setRefDragInfo({ taskId, fromIndex });
  }, []);

  const handleRefDragOver = useCallback((e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    if (refDragInfo?.taskId === taskId) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, [refDragInfo]);

  const handleRefDrop = useCallback((taskId: string, toIndex: number) => {
    if (!refDragInfo || refDragInfo.taskId !== taskId) return;
    const { fromIndex } = refDragInfo;
    if (fromIndex === toIndex) {
      setRefDragInfo(null);
      return;
    }
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const arr = [...task.referenceImages];
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    updateTask(taskId, { referenceImages: arr });
    setRefDragInfo(null);
  }, [refDragInfo, tasks, updateTask]);

  // 结果图转参考图
  const handleUseResultAsReference = useCallback((taskId: string, resultUrl: string, resultId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.referenceImages.length >= MAX_REFERENCE_IMAGES) {
      toast.warning(`最多支持 ${MAX_REFERENCE_IMAGES} 张参考图`);
      return;
    }
    const newImage = {
      id: `ref_from_result_${Date.now()}`,
      url: resultUrl,
      name: `结果图_${resultId.slice(0, 8)}.png`,
      size: 0,
    };
    updateTask(taskId, { referenceImages: [...task.referenceImages, newImage] });
    toast.success('已添加为参考图');
  }, [tasks, updateTask]);

  const handleRemoveResultImage = useCallback((taskId: string, imgIndex: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      const newResults = task.results.filter((_, i) => i !== imgIndex);
      updateTask(taskId, { results: newResults });
    }
  }, [tasks, updateTask]);

  // 下载结果图为指定格式
  const handleDownloadResult = useCallback(async (
    taskId: string,
    resultId: string,
    imageUrl: string,
    format: 'jpg' | 'png',
    taskIndex: number,
    resultIndex: number,
  ) => {
    const fileName = `FC-ai_#${taskIndex}_${resultIndex + 1}.${format}`;
    try {
      // 尝试通过 canvas 转格式
      const img = new window.Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败，可能是跨域限制'));
        img.src = imageUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不可用');

      // JPG 白底填充（避免透明区域变黑）
      if (format === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);

      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mime, 0.95);

      // 触发下载
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      markResultDownloaded(taskId, resultId, format);
      toast.success(`已下载 ${format.toUpperCase()}`);
    } catch (err) {
      // 兜底：尝试直接 fetch 下载原始图片
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        markResultDownloaded(taskId, resultId, format);
        toast.success(`已下载 ${format.toUpperCase()}`);
      } catch {
        toast.error('下载失败，请右键图片另存为');
      }
    }
  }, [markResultDownloaded]);

  const handleSaveEditedImage = useCallback((taskId: string, imgIndex: number, blob: Blob, dataUrl: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newImages = [...task.referenceImages];
    const original = newImages[imgIndex];
    if (!original) return;
    newImages[imgIndex] = {
      ...original,
      url: dataUrl,
      name: original.name.replace(/\.[^.]+$/, '') + '_edited.png',
      size: blob.size,
    };
    updateTask(taskId, { referenceImages: newImages });
    setEditorImage(null);
  }, [tasks, updateTask]);

  // 处理粘贴图片到当前任务
  const handlePasteToTask = useCallback((taskId: string, e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleAddReferenceImage(taskId, files);
    }
  }, [handleAddReferenceImage]);

  const handleGenerate = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (!task.prompt.trim()) {
      toast.warning('请先输入提示词');
      return;
    }

    toast.info(`任务 #${task.index} 开始生成...`);
    try {
      if (isVideoModel(task.model)) {
        await generateVideoTask(taskId);
      } else {
        await generateTask(taskId);
      }
      // generateTask 内部会更新状态，这里再检查一下结果
      const updated = tasks.find(t => t.id === taskId);
      if (updated?.status === 'completed') {
        toast.success(`任务 #${task.index} 生成成功`);
      } else if (updated?.status === 'failed') {
        toast.error(`任务 #${task.index} 生成失败${updated.errorMsg ? '：' + updated.errorMsg.slice(0, 50) : ''}`);
      }
    } catch (error) {
      logger.error('Generate failed:', String(error));
      toast.error(`任务 #${task.index} 生成失败`);
    }
  };

  const handleRegenerateAppend = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (!task.prompt.trim()) {
      toast.warning('请先输入提示词');
      return;
    }

    toast.info(`任务 #${task.index} 追加生成中...`);
    try {
      if (isVideoModel(task.model)) {
        await generateVideoTask(taskId);
      } else {
        await generateTask(taskId, true);
      }
      const updated = tasks.find(t => t.id === taskId);
      if (updated?.status === 'completed') {
        toast.success(`任务 #${task.index} 追加生成成功`);
      } else if (updated?.status === 'failed') {
        toast.error(`任务 #${task.index} 追加生成失败`);
      }
    } catch (error) {
      logger.error('Regenerate failed:', String(error));
      toast.error(`任务 #${task.index} 追加生成失败`);
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'pending': return 'secondary';
      case 'generating': return 'outline';
      case 'failed': return 'destructive';
      default: return 'outline';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed': return '已完成';
      case 'pending': return '待执行';
      case 'generating': return '生成中';
      case 'failed': return '失败';
      default: return status;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Table Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/50">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">批量生成</h2>
          <Badge variant="outline" className="text-xs">{currentProject?.name}</Badge>
          <span className="text-xs text-muted-foreground">
            共 {filteredTasks.length} 个任务，已选 {selectedRows.size} 个
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索任务..."
              className="h-8 pl-8 text-sm"
              value={searchKeyword}
              onChange={(e) => {
                setSearchKeyword(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetColumnWidths}>
            <GripHorizontal className="size-3.5 mr-1" />
            恢复默认宽度
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => addTask()}>
            <Plus className="size-3.5 mr-1" />
            新增行
          </Button>
        </div>
      </div>

      {/* Table */}
      <div ref={tableWrapperRef} className="flex-1 overflow-auto">
        <table className="border-collapse w-full" style={{ tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="relative px-3 py-2 text-left text-xs font-medium text-muted-foreground border-b border-border/40 whitespace-nowrap"
                  style={(col as ColumnWidth & { flex?: boolean }).flex ? { minWidth: col.minWidth, width: 'auto' } : { width: col.width }}
                >
                  {col.key === 'index' ? (
                    <GripVertical className="size-3.5 text-muted-foreground/60" />
                  ) : (
                    <>{col.label}</>
                  )}
                  {/* 列宽拖拽手柄（最后一列不加）*/}
                  {col.key !== 'delete' && (
                    <div
                      onMouseDown={(e) => onResizeStart(e, col.key)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 active:bg-primary/70 transition-colors z-20"
                      title="拖拽调整列宽"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
              {currentTasks.map((task, taskIndex) => (
               <tr
                key={task.id}
                className={`border-b border-border/30 hover:bg-accent/20 transition-colors ${
                  selectedRows.has(task.id) ? 'bg-primary/5' : ''
                }`}
              >
                <td className="px-3 py-3 align-top" style={{ width: colWidth('index') }}>
                  <div className="flex items-start gap-1">
                    <GripVertical className="size-3.5 text-muted-foreground/40 cursor-grab shrink-0 mt-1" />
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <button
                        onClick={() => toggleRowSelection(task.id)}
                        className={`text-xs font-mono tabular-nums w-7 h-7 rounded flex items-center justify-center transition-colors ${
                          selectedRows.has(task.id)
                            ? 'bg-primary/15 text-primary font-semibold'
                            : 'text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {taskIndex + 1}
                      </button>
                      <Badge
                         variant={statusVariant(task.status) as any}
                         className={`text-[10px] w-fit ${task.status === 'failed' ? 'cursor-pointer hover:opacity-80' : ''}`}
                         onClick={task.status === 'failed' ? () => setErrorDetailTask(task) : undefined}
                         title={task.status === 'failed' ? '点击查看错误详情' : undefined}
                       >
                         {statusLabel(task.status)}
                       </Badge>
                      {getTaskDurationText(task) && (
                        <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                          耗时 {getTaskDurationText(task)}
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* Reference Images */}
                <td className="px-3 py-3 align-top" style={{ width: colWidth('reference') }}>
                  <div
                    className={`rounded-lg border-2 transition-colors ${
                      dragOverTaskId === task.id
                        ? isFolderDrag
                          ? 'border-primary bg-primary/10'
                          : 'border-primary/70 bg-accent/40'
                        : 'border-primary/20 bg-accent/20'
                    }`}
                    onDragOver={(e) => handleDragOver(e, task.id)}
                    onDragLeave={() => { setDragOverTaskId((prev) => (prev === task.id ? null : prev)); setIsFolderDrag(false); }}
                    onDrop={(e) => handleDrop(e, task.id)}
                    onPaste={(e) => handlePasteToTask(task.id, e.nativeEvent)}
                    tabIndex={0}
                  >
                    <div className="p-2.5 space-y-2.5">
                      {/* 顶部：计数 + 按钮 */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-foreground">
                          <span className="text-primary font-bold text-lg">
                            {task.referenceImages.length}
                          </span>
                          <span className="text-muted-foreground">
                            /{MAX_REFERENCE_IMAGES} 张参考图
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs bg-background hover:bg-accent"
                            onClick={() => document.getElementById(`ref-upload-${task.id}`)?.click()}
                          >
                            <Plus className="size-3.5 mr-1" />
                            添加图片
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs bg-background hover:bg-accent"
                            onClick={() => document.getElementById(`ref-folder-${task.id}`)?.click()}
                          >
                            <FolderPlus className="size-3.5 mr-1" />
                            添加文件夹
                          </Button>
                        </div>
                      </div>

                      {/* 图片网格 */}
                      {task.referenceImages.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {task.referenceImages.map((img, imgIdx) => {
                            const isDragging = refDragInfo?.taskId === task.id && refDragInfo.fromIndex === imgIdx;
                            return (
                              <div
                                key={img.id}
                                draggable
                                onDragStart={() => handleRefDragStart(task.id, imgIdx)}
                                onDragOver={(e) => handleRefDragOver(e, task.id)}
                                onDrop={(e) => { e.preventDefault(); handleRefDrop(task.id, imgIdx); }}
                                className={`group relative flex flex-col items-center transition-all ${isDragging ? 'opacity-40 scale-95' : ''}`}
                                title="拖拽可调整顺序"
                              >
                                <div className="relative w-[90px] h-[120px] rounded-lg overflow-hidden border border-border/60 bg-muted/30 cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing" onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: img.url, name: img.name || `参考图${imgIdx + 1}` }); }} title="点击预览，拖拽排序">
                                  <Image
                                    src={img.url}
                                    alt={img.name || `参考图${imgIdx + 1}`}
                                    className="w-full h-full object-cover pointer-events-none"
                                    draggable={false}
                                    onError={() => handleRemoveReferenceImage(task.id, imgIdx)}
                                  />
                                  {/* 序号徽章 */}
                                  <div className={`absolute top-1.5 left-1.5 size-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${imgIdx === 0 ? 'bg-primary' : 'bg-secondary/90'}`}>
                                    {imgIdx + 1}
                                  </div>
                                  {/* 主图标识 */}
                                  {imgIdx === 0 && (
                                    <div className="absolute top-1.5 right-1.5 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                                      主图
                                    </div>
                                  )}
                                </div>
                                {/* 底部操作按钮 */}
                                <div className="flex gap-1 mt-1.5 w-[90px]">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 flex-1 text-[11px] bg-background hover:bg-accent text-primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditorImage({ taskId: task.id, imgIndex: imgIdx, url: img.url, name: img.name || `参考图${imgIdx + 1}` });
                                    }}
                                  >
                                    编辑
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 flex-1 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 bg-background"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveReferenceImage(task.id, imgIdx);
                                    }}
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 拖放区域 */}
                      <div
                        className="border-2 border-dashed border-border/50 rounded-xl bg-muted/30 py-6 px-4 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
                        onClick={() => document.getElementById(`ref-upload-${task.id}`)?.click()}
                      >
                        <div className="text-base font-semibold text-foreground mb-1.5">
                          拖入图片或 Ctrl+V 粘贴
                        </div>
                        <div className="text-xs text-muted-foreground">
                          支持单张、批量图片，也可添加整个文件夹
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 隐藏的上传控件 */}
                  <input
                    id={`ref-upload-${task.id}`}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleAddReferenceImage(task.id, e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
                  <input
                    id={`ref-folder-${task.id}`}
                    type="file"
                    accept="image/*"
                    multiple
                    // @ts-expect-error webkitdirectory 是非标准属性
                    webkitdirectory=""
                    className="hidden"
                    onChange={(e) => {
                      handleAddReferenceImage(task.id, e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
                </td>

                {/* Prompt */}
                <td className="px-3 py-3 align-top" style={{ width: colWidth('prompt') }}>
                  <TaskPromptCell
                    task={task}
                    textOptimizeConfig={textOptimizeConfig}
                    allTextModels={allTextModels}
                    updateTask={updateTask}
                    updateTextOptimizeConfig={updateTextOptimizeConfig}
                    navigate={navigate}
                  />
                </td>

                {/* Generation Params */}
                <td className="px-3 py-3 align-top" style={{ width: colWidth('params') }}>
                  {activeModels.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-center">
                      <Settings className="size-4 mx-auto mb-1.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground mb-2">暂无可用模型</p>
                      <p className="text-[10px] text-muted-foreground mb-2">请先前往API接口配置并验证模型</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] w-full"
                        onClick={() => navigate('/api')}
                      >
                        去配置API
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">模型</label>
                        <Select
                          value={activeModels.length > 0 ? task.model : ''}
                          onValueChange={(v) => updateTask(task.id, { model: v, modelLabel: activeModels.find(m => m.id === v)?.name || v })}
                          disabled={activeModels.length === 0}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder={activeModels.length === 0 ? '请先在API管理添加模型' : '选择模型'} />
                          </SelectTrigger>
                          <SelectContent>
                            {activeModels.filter(m => !m.isCustom).length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[9px] text-muted-foreground">内置模型</SelectLabel>
                                {activeModels.filter(m => !m.isCustom).map((m) => (
                                  <SelectItem key={m.id} value={m.id} className="text-xs">
                                    {m.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                            {activeModels.filter(m => m.isCustom && m.apiConfigId !== 'api-custom-2').length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[9px] text-muted-foreground">API 1 模型</SelectLabel>
                                {activeModels.filter(m => m.isCustom && m.apiConfigId !== 'api-custom-2').map((m) => (
                                  <SelectItem key={m.id} value={m.id} className="text-xs">
                                    {m.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                            {activeModels.filter(m => m.isCustom && m.apiConfigId === 'api-custom-2').length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[9px] text-muted-foreground">API 2 模型</SelectLabel>
                                {activeModels.filter(m => m.isCustom && m.apiConfigId === 'api-custom-2').map((m) => (
                                  <SelectItem key={m.id} value={m.id} className="text-xs">
                                    {m.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">比例与分辨率</label>
                        <Select
                          value={task.ratio}
                          onValueChange={(v) => updateTask(task.id, { ratio: v })}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                           <SelectContent className="max-h-[420px]">
                             {getResolutionGroups(getResolutionsForModel(task.model)).map((group) => (
                               <div key={group.label}>
                                 <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground bg-muted/40 border-b border-border/30">
                                   {group.label}
                                 </div>
                                 {group.items.map((r) => (
                                   <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                                 ))}
                               </div>
                             ))}
                           </SelectContent>
                        </Select>
                      </div>
                      {(task.model.includes('gpt-image-2.5') || task.model.includes('gpt_image_2.5')) ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">图片质量</label>
                            <Select
                              value={task.quality}
                              onValueChange={(v) => updateTask(task.id, { quality: v })}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {getQualitiesForModel(task.model).map((q) => (
                                  <SelectItem key={q} value={q} className="text-xs">{q}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">背景</label>
                            <Select
                              value={task.background || 'Auto（自动）'}
                              onValueChange={(v) => updateTask(task.id, { background: v })}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {getBackgroundsForModel(task.model).map((bg) => (
                                  <SelectItem key={bg} value={bg} className="text-xs">{bg}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">图片质量</label>
                          <Select
                            value={task.quality}
                            onValueChange={(v) => updateTask(task.id, { quality: v })}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {getQualitiesForModel(task.model).map((q) => (
                                <SelectItem key={q} value={q} className="text-xs">{q}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">张数</label>
                        <div className="flex gap-1 flex-wrap">
                          {[1, 2, 4, 6].map((n) => (
                            <Button
                              key={n}
                              variant={task.imageCount === n ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 flex-1 text-xs min-w-[28px]"
                              onClick={() => updateTask(task.id, { imageCount: n })}
                            >
                              {n}
                            </Button>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => {
                              const el = document.getElementById(`custom-count-${task.id}`);
                              el?.focus();
                            }}
                          >
                            自定义
                          </Button>
                        </div>
                        <input
                          id={`custom-count-${task.id}`}
                          type="text"
                          inputMode="numeric"
                          value={String(task.imageCount || '')}
                          onChange={(e) => {
                            // 只允许输入数字
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            // 直接更新，不做限制
                            updateTask(task.id, { imageCount: val === '' ? 0 : parseInt(val) });
                          }}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value);
                            if (isNaN(v) || v < 1) {
                              updateTask(task.id, { imageCount: 1 });
                            }
                          }}
                          placeholder="1-20"
                          className="h-7 w-full text-xs px-2 rounded-md border border-input bg-transparent focus:border-ring focus:ring-1 focus:ring-ring/20 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </td>

                {/* Actions */}
                <td className="px-3 py-3 align-top" style={{ width: colWidth('action') }}>
                  <div className="flex flex-col gap-1.5">
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleGenerate(task.id)}
                      disabled={task.status === 'generating'}
                    >
                      {task.status === 'generating' ? (
                        <RefreshCw className="size-3.5 mr-1 animate-spin" />
                      ) : (
                        <Play className="size-3.5 mr-1 fill-current" />
                      )}
                      立即生成
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleRegenerateAppend(task.id)}
                      disabled={task.status === 'generating'}
                    >
                      <RefreshCw className="size-3.5 mr-1" />
                      重新生成并追加
                    </Button>
                  </div>
                </td>

                {/* Results - 弹性列，占满剩余空间 */}
                <td className="px-3 py-3 align-top" style={resultsFlexCol ? { minWidth: Math.max(300, colWidth('results') || 300), width: 'auto' } : { width: colWidth('results') }}>
                  {task.results.length === 0 && task.status !== 'generating' ? (
                    <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground bg-muted/20 rounded-md border border-dashed border-border/60">
                      暂无生成结果
                    </div>
                  ) : (
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                      {/* 已生成的图片 */}
                      {task.results.map((img, imgIdx) => {
                        const hasDownloadedJpg = !!img.downloadedJpg;
                        const hasDownloadedPng = !!img.downloadedPng;
                        const anyDownloaded = hasDownloadedJpg || hasDownloadedPng;
                        const allDownloaded = hasDownloadedJpg && hasDownloadedPng;

                        // 视频结果（视频生成功能产出）
                        if (img.type === 'video') {
                          return (
                            <div key={img.id} className="flex flex-col rounded-md border-2 border-border bg-card overflow-hidden">
                              <div className="relative aspect-[3/4] bg-black">
                                <video src={img.url} controls preload="metadata" className="w-full h-full object-contain" />
                              </div>
                              <div className="px-1.5 py-1 text-[10px] text-muted-foreground flex justify-between items-center">
                                <span className="font-medium text-foreground/80">视频 {imgIdx + 1}</span>
                                {img.duration ? <span>{img.duration}s</span> : null}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={img.id}
                            className={`flex flex-col rounded-md border-2 transition-all group cursor-zoom-in ${allDownloaded ? 'border-success bg-success/5' : 'border-border bg-card hover:border-primary/40'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewImage({
                                url: img.url,
                                name: `生成图 #${task.index}-${imgIdx + 1}`,
                                taskId: task.id,
                                resultId: img.id,
                                taskIndex: task.index,
                                resultIndex: imgIdx,
                                isResult: true,
                                downloadedJpg: img.downloadedJpg,
                                downloadedPng: img.downloadedPng,
                              });
                            }}
                          >
                            {/* 图片区 */}
                            <div className="relative aspect-[3/4] overflow-hidden rounded-t-sm bg-muted/30 pointer-events-none">
                              {/* 直接显示图片 - pointer-events-none 跟参考图一样 */}
                              <Image
                                src={imgReloadKeys[img.id] ? `${img.url}${img.url.includes('?') ? '&' : '?'}_t=${imgReloadKeys[img.id]}` : img.url}
                                alt={`结果${imgIdx + 1}`}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300 bg-card pointer-events-none"
                                onLoad={() => {
                                  setImgLoaded((prev) => ({ ...prev, [img.id]: true }));
                                }}
                                onError={() => {
                                  setImgLoadErrors((prev) => ({ ...prev, [img.id]: true }));
                                }}
                              />
                              {/* 加载中占位 */}
                              {!imgLoaded[img.id] && !imgLoadErrors[img.id] && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <div className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                </div>
                              )}
                              {/* 加载失败 */}
                              {imgLoadErrors[img.id] && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted/50 z-30">
                                  <p className="text-[10px] text-muted-foreground">加载失败</p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setImgLoadErrors((prev) => {
                                        const next = { ...prev };
                                        delete next[img.id];
                                        return next;
                                      });
                                      setImgLoaded((prev) => {
                                        const next = { ...prev };
                                        delete next[img.id];
                                        return next;
                                      });
                                      setImgReloadKeys((prev) => ({ ...prev, [img.id]: Date.now() }));
                                    }}
                                    className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                  >
                                    重试
                                  </button>
                                </div>
                              )}
                              {/* 左上角已下载标签 */}
                              {anyDownloaded && (
                                <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-success text-white text-[9px] px-1.5 py-0.5 rounded-full z-10 shadow-sm font-medium pointer-events-none">
                                  <CheckCircle2 className="size-2.5" />
                                  <span className="hidden sm:inline">已下载</span>
                                </div>
                              )}
                              {/* 右上角序号徽章 */}
                              <div className="absolute top-1 right-1 size-5 rounded-full bg-white/95 text-foreground text-[10px] font-bold flex items-center justify-center z-10 shadow-sm pointer-events-none">
                                {imgIdx + 1}
                              </div>
                              {/* hover 时显示下载按钮 */}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-center opacity-0 group-hover:opacity-100 z-20 pointer-events-none">
                                <div className="flex gap-1 pb-1.5 w-full px-1 pointer-events-auto">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadResult(task.id, img.id, img.url, 'jpg', task.index, imgIdx);
                                    }}
                                    className={`flex-1 h-6 text-[10px] flex items-center justify-center gap-0.5 rounded-md border transition-colors ${
                                      hasDownloadedJpg
                                        ? 'bg-success border-success text-white'
                                        : 'bg-white/90 border-white/50 text-foreground hover:bg-white'
                                    }`}
                                  >
                                    <Download className="size-3" />
                                    <span className="hidden md:inline">JPG</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadResult(task.id, img.id, img.url, 'png', task.index, imgIdx);
                                    }}
                                    className={`flex-1 h-6 text-[10px] flex items-center justify-center gap-0.5 rounded-md border transition-colors ${
                                      hasDownloadedPng
                                        ? 'bg-success border-success text-white'
                                        : 'bg-white/90 border-white/50 text-foreground hover:bg-white'
                                    }`}
                                  >
                                    <Download className="size-3" />
                                    <span className="hidden md:inline">PNG</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                            {/* 操作按钮区 */}
                            <div className="p-1.5 space-y-1 pointer-events-auto">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUseResultAsReference(task.id, img.url, img.id);
                                }}
                                className="w-full h-6 text-[10px] flex items-center justify-center gap-1 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors font-medium"
                                title="选为参考图"
                              >
                                <ImagePlus className="size-3" />
                                <span className="hidden md:inline">选为参考</span>
                                <span className="md:hidden">参考</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {/* 生成中：未生成的张数显示彩色渐变占位框 */}
                      {task.status === 'generating' && (() => {
                        const total = task.imageCount || 1;
                        const remaining = Math.max(0, total - task.results.length);
                        if (remaining <= 0) return null;
                        return Array.from({ length: remaining }, (_, i) => (
                          <div
                            key={`placeholder-${i}`}
                            className="flex flex-col rounded-md overflow-hidden relative"
                            style={{
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%)',
                              backgroundSize: '400% 400%',
                              animation: 'gradientShift 3s ease infinite',
                            }}
                          >
                            <div className="relative aspect-[3/4] flex flex-col items-center justify-center gap-2 bg-black/20 backdrop-blur-sm">
                              <div className="size-8 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                              <span className="text-white text-xs font-medium drop-shadow">
                                生成中 {task.results.length + i + 1}/{total}
                              </span>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </td>

                {/* Delete */}
                <td className="px-3 py-3 align-top" style={{ width: colWidth('delete') }}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeTask(task.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Plus className="size-8 mb-2 opacity-40" />
            <p className="text-sm">暂无任务</p>
            <p className="text-xs">点击左侧「新建任务」或「新增单行」开始</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 bg-card/50">
        <div className="text-xs text-muted-foreground">
          第 {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, tasks.length)} / 共 {tasks.length} 条
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 条/页</SelectItem>
              <SelectItem value="20">20 条/页</SelectItem>
              <SelectItem value="50">50 条/页</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="text-xs tabular-nums">{currentPage} / {totalPages}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
      {/* 图片预览弹窗 */}
      <ImageLightbox
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        imageUrl={previewImage?.url || ''}
        imageName={previewImage?.name}
        showDownload={previewImage?.isResult}
        onDownloadJpg={
          previewImage?.isResult && previewImage.taskId && previewImage.resultId
            ? () => handleDownloadResult(
                previewImage.taskId!,
                previewImage.resultId!,
                previewImage.url,
                'jpg',
                previewImage.taskIndex || 0,
                previewImage.resultIndex || 0,
              )
            : undefined
        }
        onDownloadPng={
          previewImage?.isResult && previewImage.taskId && previewImage.resultId
            ? () => handleDownloadResult(
                previewImage.taskId!,
                previewImage.resultId!,
                previewImage.url,
                'png',
                previewImage.taskIndex || 0,
                previewImage.resultIndex || 0,
              )
            : undefined
        }
        downloadedJpg={previewImage?.downloadedJpg}
        downloadedPng={previewImage?.downloadedPng}
        showUseAsReference={previewImage?.isResult}
        onUseAsReference={
          previewImage?.isResult && previewImage.taskId && previewImage.resultId
            ? () => {
                handleUseResultAsReference(
                  previewImage.taskId!,
                  previewImage.url,
                  previewImage.resultId!,
                );
              }
            : undefined
        }
         />

       {/* 失败详情弹窗 */}
       <Dialog open={!!errorDetailTask} onOpenChange={(open) => !open && setErrorDetailTask(null)}>
         <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <AlertCircle className="size-5 text-destructive" />
               任务 #{errorDetailTask?.index} 生成失败
             </DialogTitle>
           </DialogHeader>
           <div className="flex-1 overflow-y-auto space-y-4 pr-2">
             <div>
               <div className="text-xs text-muted-foreground mb-1">错误信息</div>
               <div className="text-sm text-destructive whitespace-pre-wrap bg-destructive/5 border border-destructive/20 rounded-md p-3">
                 {errorDetailTask?.errorMsg || '未知错误'}
               </div>
             </div>
             {errorDetailTask?.errorMsg && errorDetailTask.errorMsg.includes('完整响应') && (
               <div>
                 <div className="text-xs text-muted-foreground mb-1">API 原始响应</div>
                 <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                   {errorDetailTask.errorMsg.split('完整响应：')[1] || errorDetailTask.errorMsg}
                 </pre>
               </div>
             )}
             <div className="grid grid-cols-2 gap-3 text-xs">
               <div className="bg-muted/50 rounded-md p-2">
                 <div className="text-muted-foreground">模型</div>
                 <div className="font-medium mt-0.5 truncate" title={errorDetailTask?.model}>{errorDetailTask?.model || '-'}</div>
               </div>
               <div className="bg-muted/50 rounded-md p-2">
                 <div className="text-muted-foreground">分辨率</div>
                 <div className="font-medium mt-0.5">{errorDetailTask?.ratio || '-'}</div>
               </div>
               <div className="bg-muted/50 rounded-md p-2">
                 <div className="text-muted-foreground">图片质量</div>
                 <div className="font-medium mt-0.5">{errorDetailTask?.quality || '-'}</div>
               </div>
               <div className="bg-muted/50 rounded-md p-2">
                 <div className="text-muted-foreground">出图数量</div>
                 <div className="font-medium mt-0.5">{errorDetailTask?.imageCount || 1} 张</div>
               </div>
             </div>
             <div className="text-xs text-muted-foreground">
               提示：如果已扣费但显示失败，可能是响应格式解析问题。请将上方"完整响应"内容复制反馈给开发者排查。
             </div>
           </div>
           <DialogFooter className="flex gap-2 justify-end">
             <Button
               variant="outline"
               size="sm"
               onClick={() => {
                 if (errorDetailTask?.errorMsg) {
                   import('@lark-apaas/client-toolkit-lite').then(({ copyToClipboard }) => {
                     copyToClipboard(errorDetailTask.errorMsg || '');
                     toast.success('已复制错误信息');
                   });
                 }
               }}
             >
               <Copy className="size-3.5 mr-1" />
               复制错误信息
             </Button>
             <Button
               size="sm"
               onClick={() => {
                 const id = errorDetailTask?.id;
                 setErrorDetailTask(null);
                 if (id) handleGenerate(id);
               }}
             >
               <RefreshCw className="size-3.5 mr-1" />
               重新生成
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

        {/* 图片编辑器 */}
       <ImageEditor
         open={!!editorImage}
         imageUrl={editorImage?.url || ''}
         imageName={editorImage?.name}
         onClose={() => setEditorImage(null)}
         onSave={(blob, dataUrl) => {
           if (editorImage) {
             handleSaveEditedImage(editorImage.taskId, editorImage.imgIndex, blob, dataUrl);
           }
         }}
        />
      </div>
    );
  }
