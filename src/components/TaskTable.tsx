import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { toast } from 'sonner';

// HSL 转 HEX
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
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
   Palette,
   Film,
   Upload,
   ChevronsLeftRight,
   Save,
   Layers,
   History,
   Loader2,
   Clapperboard,
   RotateCcw,
   Wand2,
   CloudLightning,
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
import MaskEditor from '@/components/MaskEditor';
import { runRecolorLocal } from '@/lib/recolor';
import { runCloudRecolor, getCloudRecolorConfig } from '@/lib/cloudRecolor';
import { useApp } from '@/context/AppContext';
import { isVideoModel, getFeatureTemplate, getVideoDurationLimit } from '@/data/featureTemplates';
import { VIDEO_PROMPT_PRESETS, IMAGE_PROMPT_PRESETS } from '@/data/promptPresets';
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
  // 换装部位选择（款式上身功能专属）
  const featureTpl = task.featureId ? getFeatureTemplate(task.featureId) : undefined;
  const tryonTypes = featureTpl?.tryonTypes;
  const currentTryonType = task.tryonType || (task.featureId === 'shoot-iron' ? 'full' : 'clothes');
  const modifyOptions = featureTpl?.modifyOptions;
  const layoutOptions = featureTpl?.layoutOptions;
  // 自由改款快捷选项（多选组合）：记录每个维度已选改法（数组以支持同维度多选）
  const [modifySel, setModifySel] = useState<Record<string, string[]>>({});  // 自由改款设计稿排版选项：布局单选、模块可多选
  const [layoutSel, setLayoutSel] = useState<Record<string, string[]>>({});
  // 选项选择面板开关：点击后弹出一页平铺全部选项的面板
  const [openOptionPanel, setOpenOptionPanel] = useState(false);
  // 自由改款专属：用户自定义补充提示词（独立于改款/排版自动提示词）
  const [localCustom, setLocalCustom] = useState(task.customPrompt || '');

  // 本地精确换色：分割衣服蒙版 + 保留明度色相旋转（不调用 API，布料像素是原始像素、只改色度）——Qwen 正确路线
  function localRecolorHere() {
    const hex = (task.prompt.match(/【选色】服装颜色改为(?:[^（】]*（)?(#[0-9A-Fa-f]{6})/))?.[1] || '#9B5DE5';
    const ref = task.referenceImages?.[0];
    if (!ref?.url) { toast.warning('请先上传参考图（本功能需原图作为素材）'); return; }
    toast.info('正在本地精确换色（分割衣服蒙版 + 保留明度，不调用 API）…');
    const img = new window.Image();
    img.onload = async () => {
      try {
        const max = 1536;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const out = await runRecolorLocal(id, hex);
        canvas.width = out.width; canvas.height = out.height;
        ctx.putImageData(out, 0, 0);
        const url = canvas.toDataURL('image/jpeg', 0.92);
        const now = Date.now();
        updateTask(task.id, { results: [...(task.results || []), {
          id: `local-recolor-${now}`, url, model: task.model || 'local', prompt: `本地精确换色 → ${hex}`,
          createdAt: now, width: out.width, height: out.height, type: 'image',
        }] });
        toast.success('本地精确换色完成（纹理保留，未调用 API）');
      } catch (e) { toast.error('本地精确换色失败：' + String(e)); }
    };
    img.onerror = () => toast.error('参考图加载失败');
    img.src = ref.url;
  }
  // 云端精准换色：云端大模型出衣服蒙版 + 保留明度色相旋转（独立功能，与本地换色完全分离）
  function cloudRecolorHere() {
    const hex = (task.prompt.match(/【选色】服装颜色改为(?:[^（】]*（)?(#[0-9A-Fa-f]{6})/))?.[1] || '#9B5DE5';
    const ref = task.referenceImages?.[0];
    if (!ref?.url) { toast.warning('请先上传参考图（本功能需原图作为素材）'); return; }
    const cfg = getCloudRecolorConfig();
    if (!cfg || !cfg.baseUrl || !cfg.apiKey || !cfg.model) {
      toast.error('未配置云端换色 API，请到「接口配置 → 云端换色」填写 Base URL / API Key / Model 后重试');
      return;
    }
    toast.info('正在云端精准换色（云端分割衣服蒙版 + 保留明度）…');
    const img = new window.Image();
    img.onload = async () => {
      try {
        const max = 2048;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const out = await runCloudRecolor(id, hex, cfg, task.cloudPrompt);
        canvas.width = out.width; canvas.height = out.height;
        ctx.putImageData(out, 0, 0);
        const url = canvas.toDataURL('image/jpeg', 0.92);
        const now = Date.now();
        updateTask(task.id, { results: [...(task.results || []), {
          id: `cloud-recolor-${now}`, url, model: cfg.model || 'cloud', prompt: `云端精准换色 → ${hex}`,
          createdAt: now, width: out.width, height: out.height, type: 'image',
        }] });
        toast.success('云端精准换色完成（云端蒙版 · 保留纹理）');
      } catch (e) { toast.error('云端精准换色失败：' + String(e)); }
    };
    img.onerror = () => toast.error('参考图加载失败');
    img.src = ref.url;
  }
  // 合成完整提示词 = 基础 + 【改款意图】 + 【排版】 + 【自定义】
  const buildPrompt = useCallback((
    mod: Record<string, string[]>,
    lay: Record<string, string[]>,
    custom: string,
  ) => {
    const base = (localPrompt || '').split('\n【改款意图】')[0].split('\n【排版】')[0].split('\n【自定义】')[0];
    const modEntries = Object.entries(mod).filter(([, v]) => v && v.length > 0);
    const modIntent = modEntries.length
      ? '\n【改款意图】' + modEntries.map(([gr, vals]) => {
          const gm = modifyOptions?.find(x => x.group === gr);
          return gm && gm.multiple ? `${gr}增加${vals.join('、')}` : `${gr}改为${vals[0]}`;
        }).join('；')
      : '';
    const layEntries = Object.entries(lay).filter(([, v]) => v && v.length > 0);
    const layIntent = layEntries.length
      ? '\n【排版】' + layEntries.map(([gr, vals]) => `${gr}：${vals.join('、')}`).join('；')
      : '';
    const customSeg = custom ? '\n【自定义】' + custom : '';
    return base + modIntent + layIntent + customSeg;
  }, [localPrompt, modifyOptions]);
  const [optimizeInput, setOptimizeInput] = useState('');
  const [showOptimize, setShowOptimize] = useState(false);
  const [videoPresetCat, setVideoPresetCat] = useState('person');
  const [imagePresetCat, setImagePresetCat] = useState('angle');
  const [presetSearch, setPresetSearch] = useState('');
  const [favoritePresets, setFavoritePresets] = useState<{ name: string; prompt: string; kind: 'video' | 'image' }[]>(() => {
    try { const raw = scopedStorage.getItem('fc_ai_preset_favorites_v1'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const toggleFav = useCallback((name: string, prompt: string, kind: 'video' | 'image') => {
    setFavoritePresets(prev => {
      const exists = prev.find(f => f.prompt === prompt && f.kind === kind);
      const next = exists ? prev.filter(f => !(f.prompt === prompt && f.kind === kind)) : [...prev, { name, prompt, kind }];
      try { scopedStorage.setItem('fc_ai_preset_favorites_v1', JSON.stringify(next)); } catch { /* 忽略 */ }
      toast.info(exists ? '已取消收藏' : `已收藏「${name}」`);
      return next;
    });
  }, []);

  const [customPresets, setCustomPresets] = useState<{ id: string; name: string; prompt: string; kind: 'video' | 'image' }[]>(() => {
    try { const raw = scopedStorage.getItem('fc_ai_custom_presets_v1'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [customName, setCustomName] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const addCustomPreset = useCallback((kind: 'video' | 'image') => {
    const name = customName.trim(); const prompt = customPrompt.trim();
    if (!name || !prompt) { toast.warning('请填写预设名称和提示词'); return; }
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, prompt, kind };
    setCustomPresets(prev => {
      const next = [...prev, item];
      try { scopedStorage.setItem('fc_ai_custom_presets_v1', JSON.stringify(next)); } catch { /* 忽略 */ }
      return next;
    });
    setCustomName(''); setCustomPrompt('');
    toast.success(`已添加自定义预设「${name}」`);
  }, [customName, customPrompt]);
  const removeCustomPreset = useCallback((id: string) => {
    setCustomPresets(prev => {
      const next = prev.filter(p => p.id !== id);
      try { scopedStorage.setItem('fc_ai_custom_presets_v1', JSON.stringify(next)); } catch { /* 忽略 */ }
      return next;
    });
  }, []);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const debounceTimer = useRef<number | null>(null);

  // 外部 prompt 变化时同步到本地（如 AI 写入、应用预设等）
  useEffect(() => {
    if (task.prompt !== localPrompt) {
      setLocalPrompt(task.prompt);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.prompt]);
  // 切换任务时重置自定义提示词与选项，避免跨任务残留污染合成提示词
  useEffect(() => {
    setLocalCustom(task.customPrompt || '');
    setModifySel({});
    setLayoutSel({});
  }, [task.id, task.customPrompt]);

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
      {tryonTypes && tryonTypes.length > 0 && (
        <div className={task.featureId === 'shoot-3d' ? 'flex flex-wrap gap-1.5 justify-center' : 'flex flex-wrap gap-1'}>
          {tryonTypes.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                // 款式上身提示词按模型族完全独立：Gemini/NanoBanana 用 geminiPrompt，gpt-image 用 gptPrompt，其余用通用 prompt
                const modelId = task.model || '';
                const pick = /nano-banana|gemini/i.test(modelId)
                  ? (t.geminiPrompt || t.prompt)
                  : /gpt-image/i.test(modelId)
                    ? (t.gptPrompt || t.prompt)
                    : t.prompt;
                updateTask(task.id, { tryonType: t.id as ITask['tryonType'], prompt: pick });
                setLocalPrompt(pick);
              }}
              className={`rounded border transition-colors ${
                task.featureId === 'shoot-3d' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
              } ${
                currentTryonType === t.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
          {/* 拼图展示开关（仅平铺生成功能显示） */}
          {task.featureId === 'shoot-flat' && (
            <button
              onClick={() => {
                const noGrid = '禁止拼图、禁止多格拼版、禁止九宫格，只输出一张独立的';
                const useGrid = '用多格拼版方式展示多个角度/部位的特写，拼成一张展示图，';
                const isGrid = localPrompt.includes('多格拼版方式展示');
                const newPrompt = isGrid
                  ? localPrompt.replace(useGrid, noGrid)
                  : localPrompt.replace(noGrid, useGrid);
                updateTask(task.id, { prompt: newPrompt });
                setLocalPrompt(newPrompt);
              }}
              className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                localPrompt.includes('多格拼版方式展示')
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              🧩 拼图展示
            </button>
          )}
        </div>
      )}
      {/* 自由改款/模特变身/模特换姿 快捷选项：点击打开选择面板，面板内分组平铺全部选项 */}
      {task.featureId && ['design-modify','shoot-model-swap','shoot-pose'].includes(task.featureId) && modifyOptions && modifyOptions.length > 0 && (
        <div className="border border-border/50 rounded-md p-2 bg-muted/30">
          <button
            onClick={() => setOpenOptionPanel(true)}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border bg-background hover:bg-accent transition-colors text-left"
          >
            <span className="text-[11px] font-medium text-foreground">
              {task.featureId === 'design-modify' ? '✂️ 改款选项' : task.featureId === 'shoot-model-swap' ? '💃 模特形象选项' : '🧍 姿势与镜头选项'}
            </span>
            <span className="text-[10px] text-primary">
              {(() => {
                const total = modifyOptions.reduce((s, g) => s + (modifySel[g.group] || []).length, 0)
                  + (layoutOptions ? layoutOptions.reduce((s, g) => s + (layoutSel[g.group] || []).length, 0) : 0);
                return total > 0 ? `已选 ${total} 项 · 点击调整` : '点击打开选项面板';
              })()}
            </span>
          </button>
          {(() => {
            const parts: string[] = [];
            modifyOptions.forEach(g => { const a = modifySel[g.group] || []; if (a.length) parts.push(`${g.group}(${a.length})`); });
            (layoutOptions || []).forEach(g => { const a = layoutSel[g.group] || []; if (a.length) parts.push(`${g.group}(${a.length})`); });
            return parts.length ? (
              <div className="text-[10px] text-muted-foreground mt-1 px-1 truncate" title={parts.join(' · ')}>{parts.join(' · ')}</div>
            ) : null;
          })()}
        </div>
      )}
      {/* 改款/形象/姿势 选项选择面板：点击「打开选项面板」弹出，分组平铺全部选项，一页选择 */}
      <Dialog open={openOptionPanel} onOpenChange={setOpenOptionPanel}>
        <DialogContent className="max-w-xl max-h-[82vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              {task.featureId === 'design-modify' ? '✂️ 改款选项（点击选择，自动写入提示词）'
                : task.featureId === 'shoot-model-swap' ? '💃 模特形象选项（单选）'
                : '🧍 姿势与镜头选项'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {modifyOptions && modifyOptions.map(g => {
              const selArr = modifySel[g.group] || [];
              return (
                <div key={g.group}>
                  <div className="text-xs font-medium text-foreground mb-1 flex items-center justify-between">
                    <span>{g.group}</span>
                    {g.multiple && <span className="text-[10px] text-muted-foreground">可多选叠加</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {g.options.map(o => {
                      const active = selArr.includes(o.value);
                      return (
                        <button key={o.value} onClick={() => {
                          const multiple = !!g.multiple;
                          let nextArr: string[];
                          if (multiple) nextArr = active ? selArr.filter(x => x !== o.value) : [...selArr, o.value];
                          else nextArr = active ? [] : [o.value];
                          const next = { ...modifySel, [g.group]: nextArr };
                          setModifySel(next);
                          const np = buildPrompt(next, layoutSel, localCustom);
                          updateTask(task.id, { prompt: np });
                          setLocalPrompt(np);
                        }} className={`px-2 py-1 rounded text-[11px] border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'}`}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {task.featureId === 'design-modify' && layoutOptions && layoutOptions.map(g => {
              const selArr = layoutSel[g.group] || [];
              return (
                <div key={g.group}>
                  <div className="text-xs font-medium text-foreground mb-1 flex items-center justify-between">
                    <span>📐 {g.group}</span>
                    {g.multiple && <span className="text-[10px] text-muted-foreground">可多选叠加</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {g.options.map(o => {
                      const active = selArr.includes(o.value);
                      return (
                        <button key={o.value} onClick={() => {
                          const multiple = !!g.multiple;
                          let nextArr: string[];
                          if (multiple) nextArr = active ? selArr.filter(x => x !== o.value) : [...selArr, o.value];
                          else nextArr = active ? [] : [o.value];
                          const next = { ...layoutSel, [g.group]: nextArr };
                          setLayoutSel(next);
                          const np = buildPrompt(modifySel, next, localCustom);
                          updateTask(task.id, { prompt: np });
                          setLocalPrompt(np);
                        }} className={`px-2 py-1 rounded text-[11px] border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'}`}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {(!modifyOptions || modifyOptions.length === 0) && <div className="text-xs text-muted-foreground">暂无可用选项</div>}
          </div>
          <DialogFooter>
            <button onClick={() => setOpenOptionPanel(false)} className="px-3 py-1.5 rounded text-xs border border-border bg-background hover:bg-accent transition-colors">完成</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 自定义补充提示词（独立输入，提交时合成到完整提示词，与选项分开存储）：自由改款/面料上身/款式上身/AI换背景/平铺生成 */}
      {(task.featureId && ['design-modify','design-fabric','shoot-tryon','shoot-bg','shoot-flat','shoot-model-swap','shoot-pose'].includes(task.featureId)) && (
        <div className="border border-border/50 rounded-md p-2 bg-muted/30 space-y-1">
          <span className="text-[10px] text-muted-foreground block">✍️ 自定义提示词（可选，补充你的额外要求，独立存放不混入预设）</span>
          <Textarea
            value={localCustom}
            onChange={(e) => {
              const v = e.target.value;
              setLocalCustom(v);
              const np = buildPrompt(modifySel, layoutSel, v);
              updateTask(task.id, { customPrompt: v, prompt: np });
              setLocalPrompt(np);
            }}
            placeholder={
              task.featureId === 'design-modify'
                ? '例如：改成方领+泡泡袖，真丝垂坠感，加长及膝…'
                : task.featureId === 'design-fabric'
                ? '例如：面料只替换上装区域，保持廓形与垂坠不变…'
                : task.featureId === 'shoot-tryon'
                ? '例如：只换裤子，保留原有鞋子和腰带…'
                : task.featureId === 'shoot-bg'
                ? '例如：人物保持站姿，暖色光，景深与图2背景一致…'
                : task.featureId === 'shoot-model-swap'
                ? '例如：欧美超模气质，三视角展示，家居实景…'
                : task.featureId === 'shoot-pose'
                ? '例如：半身+七分身，动态抓拍，回眸侧脸…'
                : '例如：保持白底平铺、只出一张完整图不要拼图…'
            }
            className="min-h-[60px] text-xs resize-none"
          />
        </div>
      )}
      {/* 融合滤镜开关（仅AI换背景功能显示，不依赖tryonTypes） */}
      {task.featureId === 'shoot-bg' && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => {
              const fuseMark = '【融合滤镜开启】人物的光影色调与图2背景氛围完全融合，整体色调统一自然';
              const isFuse = localPrompt.includes('【融合滤镜开启】');
              const newPrompt = isFuse
                ? localPrompt.replace(/【融合滤镜开启】.*?整体色调统一自然[。.]?\s*/, '')
                : localPrompt + ' ' + fuseMark;
              updateTask(task.id, { prompt: newPrompt });
              setLocalPrompt(newPrompt);
            }}
            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
              localPrompt.includes('【融合滤镜开启】')
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >
            🎨 融合滤镜
          </button>
          <button
            onClick={() => {
              const lightMark = '【融合光影开启】人物的光影方向、阴影位置、亮度、色温与图2背景环境完全匹配，人物脚下投下与图2光源方向一致的自然阴影';
              const isLight = localPrompt.includes('【融合光影开启】');
              const newPrompt = isLight
                ? localPrompt.replace(/【融合光影开启】.*?自然阴影[。.]?\s*/, '')
                : localPrompt + ' ' + lightMark;
              updateTask(task.id, { prompt: newPrompt });
              setLocalPrompt(newPrompt);
            }}
            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
              localPrompt.includes('【融合光影开启】')
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >
            💡 融合光影
          </button>
          <button
            onClick={() => {
              const sitMark = '【坐姿】让图1人物改成坐姿，坐在图2背景中的合适位置，姿势自然放松';
              const isSit = localPrompt.includes('【坐姿】');
              const newPrompt = isSit
                ? localPrompt.replace(/【坐姿】.*?自然放松[。.]?\s*/, '')
                : localPrompt + ' ' + sitMark;
              updateTask(task.id, { prompt: newPrompt });
              setLocalPrompt(newPrompt);
            }}
            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
              localPrompt.includes('【坐姿】')
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >
            🪑 坐姿
          </button>
          <button
            onClick={() => {
              const leanMark = '【靠墙】让图1人物自然靠在图2背景的墙面/柱子上，姿势自然';
              const isLean = localPrompt.includes('【靠墙】');
              const newPrompt = isLean
                ? localPrompt.replace(/【靠墙】.*?姿势自然[。.]?\s*/, '')
                : localPrompt + ' ' + leanMark;
              updateTask(task.id, { prompt: newPrompt });
              setLocalPrompt(newPrompt);
            }}
            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
              localPrompt.includes('【靠墙】')
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >
            🧱 靠墙
          </button>
          <button
            onClick={() => {
              const poseMark = '【跟随图2姿势】让图1人物的姿势/动作/身体形状参考图2人物的姿态，但保持图1人物的脸和服装不变';
              const isPose = localPrompt.includes('【跟随图2姿势】');
              const newPrompt = isPose
                ? localPrompt.replace(/【跟随图2姿势】.*?脸和服装不变[。.]?\s*/, '')
                : localPrompt + ' ' + poseMark;
              updateTask(task.id, { prompt: newPrompt });
              setLocalPrompt(newPrompt);
            }}
            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
              localPrompt.includes('【跟随图2姿势】')
                ? 'bg-purple-500 text-white border-purple-500'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >
            🕺 跟随图2姿势
          </button>
        </div>
      )}
      {/* 提示词文本框：服装转3D/衣服去皱/高清放大/服装改色/自由改款 由默认提示词+选项面板驱动，隐藏文本框 */}
      {task.featureId !== 'shoot-3d' && task.featureId !== 'shoot-iron' && task.featureId !== 'design-upscale' && task.featureId !== 'design-recolor' && task.featureId !== 'design-modify' && task.featureId !== 'design-fabric' && task.featureId !== 'shoot-tryon' && task.featureId !== 'shoot-bg' && task.featureId !== 'shoot-flat' && task.featureId !== 'shoot-model-swap' && task.featureId !== 'shoot-pose' && (
        <Textarea
          value={localPrompt}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="输入完整提示词..."
          className="min-h-[80px] text-xs resize-none"
        />
      )}
      {/* 视频提示词预设（人物/产品/品类/运镜），点击即填入 */}
      {isVideoModel(task.model) && (
        <div className="border border-border/50 rounded-md p-2 bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Film className="size-3 text-primary" />视频提示词预设
            </span>
            <span className="text-[9px] text-muted-foreground">点击填入，可再 AI 扩写或微调</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setVideoPresetCat('fav')}
              className={`h-6 px-2 rounded text-[10px] border transition-colors ${videoPresetCat === 'fav' ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
              ★ 收藏
            </button>
            <button onClick={() => setVideoPresetCat('custom')}
              className={`h-6 px-2 rounded text-[10px] border transition-colors ${videoPresetCat === 'custom' ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
              ＋ 自定义
            </button>
            {VIDEO_PROMPT_PRESETS.map(g => (
              <button key={g.id} onClick={() => setVideoPresetCat(g.id)}
                className={`h-6 px-2 rounded text-[10px] border transition-colors ${videoPresetCat === g.id ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
            <Input
              value={presetSearch}
              onChange={(e) => setPresetSearch(e.target.value)}
              placeholder="搜索预设（如：环绕、特写、服装、氛围）"
              className="h-6 text-[11px]"
            />
            {(videoPresetCat === 'fav'
              ? favoritePresets.filter(f => f.kind === 'video').map(f => ({ id: f.prompt, name: f.name, prompt: f.prompt }))
              : videoPresetCat === 'custom'
                ? customPresets.filter(f => f.kind === 'video')
                : VIDEO_PROMPT_PRESETS.find(g => g.id === videoPresetCat)?.items || []
            )
              .filter(it => !presetSearch.trim() || it.name.includes(presetSearch.trim()) || it.prompt.includes(presetSearch.trim()))
              .map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setLocalPrompt(item.prompt);
                  updateTask(task.id, { prompt: item.prompt });
                  setOptimizeInput(item.prompt);
                  setShowOptimize(true);
                  toast.info(`已填入「${item.name}」提示词`, { description: '可直接生成，或点 AI 优化扩写' });
                }}
                title={item.prompt}
                className="h-6 px-2.5 rounded-full border border-border/60 bg-card/50 text-[10px] text-foreground/90 hover:border-primary/40 hover:bg-primary/5 transition-colors whitespace-nowrap"
              >
                {item.name}
                <span
                  className={`ml-1.5 ${favoritePresets.some(f => f.prompt === item.prompt && f.kind === 'video') ? 'text-amber-500' : 'text-muted-foreground/60 hover:text-amber-400'}`}
                  onClick={(e) => { e.stopPropagation(); toggleFav(item.name, item.prompt, 'video'); }}
                  title="收藏/取消收藏"
                >
                  {favoritePresets.some(f => f.prompt === item.prompt && f.kind === 'video') ? '★' : '☆'}
                </span>
                {videoPresetCat === 'custom' && (
                  <span className="ml-1.5 text-muted-foreground/60 hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeCustomPreset(item.id); }} title="删除自定义预设">×</span>
                )}
              </button>
            ))}
          </div>
          {videoPresetCat === 'custom' && (
            <div className="space-y-1.5 border-t border-border/40 pt-1.5">
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="预设名称（如：新品揭幕）" className="h-6 text-[11px]" />
              <Input value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="专业提示词描述…" className="h-6 text-[11px]" />
              <Button size="sm" variant="outline" className="h-6 text-[10px] w-full bg-background hover:bg-accent" onClick={() => addCustomPreset('video')}>
                <Plus className="size-3 mr-1" />添加自定义预设
              </Button>
            </div>
          )}
        </div>
      )}
      {/* 图片提示词预设（角度/场景/姿势/风格），点击追加——服装商拍(shoot-*)与服装设计(design-*)全部功能均不显示无关预设 */}
      {!isVideoModel(task.model) && !task.featureId?.startsWith('shoot-') && !task.featureId?.startsWith('design-') && (
        <div className="border border-border/50 rounded-md p-2 bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Layers className="size-3 text-primary" />图片提示词预设
            </span>
            <span className="text-[9px] text-muted-foreground">点击追加到提示词</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setImagePresetCat('fav')}
              className={`h-6 px-2 rounded text-[10px] border transition-colors ${imagePresetCat === 'fav' ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
              ★ 收藏
            </button>
            <button onClick={() => setImagePresetCat('custom')}
              className={`h-6 px-2 rounded text-[10px] border transition-colors ${imagePresetCat === 'custom' ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
              ＋ 自定义
            </button>
            {IMAGE_PROMPT_PRESETS.map(g => (
              <button key={g.id} onClick={() => setImagePresetCat(g.id)}
                className={`h-6 px-2 rounded text-[10px] border transition-colors ${imagePresetCat === g.id ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
            <Input
              value={presetSearch}
              onChange={(e) => setPresetSearch(e.target.value)}
              placeholder="搜索预设（如：棚拍、走秀、高级质感）"
              className="h-6 text-[11px]"
            />
            {(imagePresetCat === 'fav'
              ? favoritePresets.filter(f => f.kind === 'image').map(f => ({ id: f.prompt, name: f.name, prompt: f.prompt }))
              : imagePresetCat === 'custom'
                ? customPresets.filter(f => f.kind === 'image')
                : IMAGE_PROMPT_PRESETS.find(g => g.id === imagePresetCat)?.items || []
            )
              .filter(it => !presetSearch.trim() || it.name.includes(presetSearch.trim()) || it.prompt.includes(presetSearch.trim()))
              .map(item => (
              <button
                key={item.id}
                onClick={() => {
                  const next = localPrompt.trim() ? `${localPrompt}，${item.prompt}` : item.prompt;
                  setLocalPrompt(next);
                  updateTask(task.id, { prompt: next });
                  toast.info(`已追加「${item.name}」`);
                }}
                title={item.prompt}
                className="h-6 px-2.5 rounded-full border border-border/60 bg-card/50 text-[10px] text-foreground/90 hover:border-primary/40 hover:bg-primary/5 transition-colors whitespace-nowrap"
              >
                {item.name}
                <span
                  className={`ml-1.5 ${favoritePresets.some(f => f.prompt === item.prompt && f.kind === 'image') ? 'text-amber-500' : 'text-muted-foreground/60 hover:text-amber-400'}`}
                  onClick={(e) => { e.stopPropagation(); toggleFav(item.name, item.prompt, 'image'); }}
                  title="收藏/取消收藏"
                >
                  {favoritePresets.some(f => f.prompt === item.prompt && f.kind === 'image') ? '★' : '☆'}
                </span>
                {imagePresetCat === 'custom' && (
                  <span className="ml-1.5 text-muted-foreground/60 hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeCustomPreset(item.id); }} title="删除自定义预设">×</span>
                )}
              </button>
            ))}
          </div>
          {imagePresetCat === 'custom' && (
            <div className="space-y-1.5 border-t border-border/40 pt-1.5">
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="预设名称（如：柔光商业精修）" className="h-6 text-[11px]" />
              <Input value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="专业提示词描述…" className="h-6 text-[11px]" />
              <Button size="sm" variant="outline" className="h-6 text-[10px] w-full bg-background hover:bg-accent" onClick={() => addCustomPreset('image')}>
                <Plus className="size-3 mr-1" />添加自定义预设
              </Button>
            </div>
          )}
        </div>
      )}
      {task.featureId !== 'shoot-3d' && task.featureId !== 'shoot-iron' && task.featureId !== 'shoot-flat' && task.featureId !== 'design-recolor' && task.featureId !== 'design-upscale' && task.featureId !== 'design-fabric' && task.featureId !== 'shoot-tryon' && task.featureId !== 'shoot-bg' && task.featureId !== 'shoot-model-swap' && task.featureId !== 'shoot-pose' && (
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
      )}
      {/* 服装改色选色器 */}
      {task.featureId === 'design-recolor' && (
        <div className="border border-border/50 rounded-md p-2 bg-muted/30 space-y-2">
          <div className="flex gap-1.5 items-center">
            <input
              type="color"
              value={(localPrompt.match(/#[0-9A-Fa-f]{6}/))?.[0] ?? '#000000'}
              onChange={(e) => {
                const hex = e.target.value;
                const colorMark = `【选色】服装颜色改为${hex}`;
                const newPrompt = localPrompt.includes('【选色】')
                  ? localPrompt.replace(/【选色】服装颜色改为[^，。\n]*/, colorMark)
                  : localPrompt + ' ' + colorMark;
                updateTask(task.id, { prompt: newPrompt });
                setLocalPrompt(newPrompt);
              }}
              title="自定义拾取颜色"
              className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
            />
            <input
              type="text"
              placeholder="输入颜色代码如 #FF0000"
              onBlur={(e) => {
                const hex = e.target.value.trim();
                if (!hex) return;
                const colorMark = `【选色】服装颜色改为${hex}`;
                const newPrompt = localPrompt.includes('【选色】')
                  ? localPrompt.replace(/【选色】服装颜色改为[^，。\n]*/, colorMark)
                  : localPrompt + ' ' + colorMark;
                updateTask(task.id, { prompt: newPrompt });
                setLocalPrompt(newPrompt);
              }}
              className="flex-1 h-7 text-xs border border-border rounded px-2"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="h-6 text-[10px] bg-background hover:bg-accent" onClick={localRecolorHere} title="本地分割衣服蒙版+保留明度只改色相，不调用API、不重绘纹理">
              <Wand2 className="size-3 mr-1" />本地精确换色<span className="text-[8px] text-muted-foreground ml-0.5">（保留纹理·不调API）</span>
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px] bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20" onClick={cloudRecolorHere} title="云端大模型出衣服蒙版+保留明度只改色相，需先在接口配置-云端换色填好 API">
              <CloudLightning className="size-3 mr-1" />云端精准换色<span className="text-[8px] opacity-70 ml-0.5">（云端蒙版）</span>
            </Button>
            {[
              { group: '基础色', colors: [
                { name: '黑色', color: '#000000' },
                { name: '白色', color: '#FFFFFF' },
                { name: '灰色', color: '#8D99AE' },
                { name: '卡其色', color: '#C9B896' },
              ] },
              { group: '彩色', colors: [
                { name: '大红色', color: '#E63946' },
                { name: '粉色', color: '#F4A7C0' },
                { name: '橙色', color: '#F4A261' },
                { name: '鹅黄色', color: '#F1E15B' },
                { name: '军绿色', color: '#556B2F' },
                { name: '湖蓝色', color: '#457B9D' },
                { name: '深蓝色', color: '#1D3557' },
                { name: '紫色', color: '#9B5DE5' },
              ] },
            ].map((g) => (
              <div key={g.group} className="flex flex-wrap items-center gap-1.5 w-full">
                <span className="text-[10px] text-muted-foreground w-9 shrink-0">{g.group}</span>
                {g.colors.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => {
                      const colorMark = `【选色】服装颜色改为${c.name}（${c.color}）`;
                      const newPrompt = localPrompt.includes('【选色】')
                        ? localPrompt.replace(/【选色】服装颜色改为[^，。\n]*/, colorMark)
                        : localPrompt + ' ' + colorMark;
                      updateTask(task.id, { prompt: newPrompt });
                      setLocalPrompt(newPrompt);
                    }}
                    title={`${c.name} ${c.color}`}
                    className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: c.color }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="space-y-1 pt-1.5 border-t border-border/40">
            <span className="text-[10px] text-muted-foreground">
              云端识别指令（可选，可含 <code className="font-mono">{"{point}"}</code> = 点选坐标；留空用默认：分割衣物 / 排除脸手皮肤头发背景）
            </span>
            <input
              type="text"
              value={task.cloudPrompt ?? ''}
              onChange={(e) => updateTask(task.id, { cloudPrompt: e.target.value })}
              placeholder="例：只分割人物上衣/连衣裙，排除腰带、配饰与手臂"
              className="w-full h-7 text-[11px] border border-border rounded px-2"
            />
          </div>
        </div>
      )}
      {/* 色彩保真控制（防偏色） */}
      <div className={`border border-primary/20 rounded-md p-2 bg-primary/5 space-y-1.5 ${task.featureId === 'shoot-3d' ? 'flex flex-col items-center' : ''}`}>
        <div className="flex items-center justify-between">
          <span className={`text-primary font-medium flex items-center gap-1 ${task.featureId === 'shoot-3d' ? 'text-sm' : 'text-[11px]'}`}>
            <Palette className={task.featureId === 'shoot-3d' ? 'size-4' : 'size-3'} /> 色彩保真（防偏色）
          </span>
          {task.colorLevel && (
            <button
              onClick={() => updateTask(task.id, { colorLevel: undefined, colorScope: undefined, colorIntensity: undefined })}
              className={`text-muted-foreground hover:text-destructive ${task.featureId === 'shoot-3d' ? 'text-xs' : 'text-[10px]'}`}
            >
              清除
            </button>
          )}
        </div>
        <div className={task.featureId === 'shoot-3d' ? 'flex gap-1.5 justify-center' : 'flex gap-1'}>
          {([
            { id: 'standard', label: '标准' },
            { id: 'high', label: '高保真' },
            { id: 'ultra', label: '极致还原' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => updateTask(task.id, { colorLevel: task.colorLevel === opt.id ? undefined : opt.id })}
              className={`rounded border transition-colors ${
                task.featureId === 'shoot-3d' ? 'text-xs px-3 py-1' : 'text-[10px] px-1.5 py-0.5'
              } ${
                task.colorLevel === opt.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {task.colorLevel && (
          <>
            <div className={task.featureId === 'shoot-3d' ? 'flex flex-wrap gap-1.5 justify-center' : 'flex flex-wrap gap-1'}>
              {([
                { id: 'clothes', label: '👕 服装原色' },
                { id: 'skin', label: '🧑 肤色' },
                { id: 'bg', label: '🏠 背景色' },
                { id: 'light', label: '💡 色温' },
                { id: 'wb', label: '⚪ 白平衡' },
                { id: 'nored', label: '🚫 防泛红' },
              ] as const).map(opt => {
                const active = (task.colorScope || []).includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      const cur = task.colorScope || [];
                      const next = active ? cur.filter(x => x !== opt.id) : [...cur, opt.id];
                      updateTask(task.id, { colorScope: next.length ? next : undefined });
                    }}
                    className={`rounded border transition-colors ${
                      task.featureId === 'shoot-3d' ? 'text-xs px-2.5 py-1' : 'text-[10px] px-1.5 py-0.5'
                    } ${
                      active
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-muted-foreground whitespace-nowrap ${task.featureId === 'shoot-3d' ? 'text-xs' : 'text-[10px]'}`}>强度</span>
              <input
                type="range"
                min={0}
                max={100}
                value={task.colorIntensity ?? 75}
                onChange={(e) => updateTask(task.id, { colorIntensity: parseInt(e.target.value) })}
                className="flex-1 h-1 accent-primary"
              />
              <span className={`text-primary w-7 text-right ${task.featureId === 'shoot-3d' ? 'text-xs' : 'text-[10px]'}`}>{task.colorIntensity ?? 75}%</span>
            </div>
            {/* 高级选项 */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border/40">
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                <input
                  type="checkbox"
                  checked={!!task.autoCorrectColor}
                  onChange={(e) => updateTask(task.id, { autoCorrectColor: e.target.checked || undefined })}
                  className="accent-primary"
                />
                生成后自动校色
              </label>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                <input
                  type="checkbox"
                  checked={!!task.lockClothesHue}
                  onChange={(e) => updateTask(task.id, { lockClothesHue: e.target.checked || undefined })}
                  className="accent-primary"
                />
                锁定服装色相对比原图
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

// 我的模板：常用参数（模型+比例+质量+提示词）一键套用
interface MyTemplate {
  id: string;
  name: string;
  model: string;
  ratio: string;
  quality: string;
  prompt: string;
  negativePrompt?: string;
  imageCount: number;
  duration?: number;
  createdAt: number;
}
const MY_TEMPLATE_KEY = 'fc_ai_my_templates_v1';

// 生成历史：跨任务汇总条目
interface HistoryItem {
  taskId: string;
  projectId: string;
  taskIndex: number;
  resultId: string;
  resultIndex: number;
  url: string;
  modelName: string;
  featureName: string;
  type: 'image' | 'video';
  createdAt: number;
}

export default function TaskTable() {
  const {
    currentProject,
    projects,
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
  // 蒙版编辑器
  const [maskEditor, setMaskEditor] = useState<{ taskId: string; url: string; name: string } | null>(null);


  // 原图 vs 效果图对比弹窗
  const [compare, setCompare] = useState<{ before: string; after: string; taskIndex: number; resultIdx: number } | null>(null);
  const [comparePos, setComparePos] = useState(50);
  const compareRef = useRef<HTMLDivElement>(null);
  const updateComparePos = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = compareRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setComparePos(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
  };

  // ===== 我的模板（localStorage 持久化）=====
  const [myTemplates, setMyTemplates] = useState<MyTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem(MY_TEMPLATE_KEY) || '[]'); } catch { return []; }
  });
  const persistTemplates = useCallback((list: MyTemplate[]) => {
    setMyTemplates(list);
    localStorage.setItem(MY_TEMPLATE_KEY, JSON.stringify(list));
  }, []);
  const saveCurrentAsTemplate = useCallback((task: ITask) => {
    const name = window.prompt('模板名称：', `${task.modelLabel || task.model} 模板`);
    if (!name) return;
    persistTemplates([...myTemplates, {
      id: `tpl_${Date.now()}`,
      name: name.trim(),
      model: task.model,
      ratio: task.ratio,
      quality: task.quality,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt,
      imageCount: task.imageCount,
      duration: task.duration,
      createdAt: Date.now(),
    }]);
    toast.success(`已保存模板「${name.trim()}」`);
  }, [myTemplates, persistTemplates]);
  const applyTemplate = useCallback((task: ITask, t: MyTemplate) => {
    const modelLabel = activeModels.find(m => m.id === t.model)?.name || t.model;
    updateTask(task.id, {
      model: t.model, modelLabel,
      ratio: t.ratio, quality: t.quality,
      prompt: t.prompt,
      negativePrompt: t.negativePrompt || undefined,
      imageCount: t.imageCount,
      ...(t.duration ? { duration: t.duration } : {}),
    });
    toast.success(`已应用模板「${t.name}」`);
  }, [activeModels, updateTask]);
  const removeTemplate = useCallback((id: string) => {
    persistTemplates(myTemplates.filter(t => t.id !== id));
  }, [myTemplates, persistTemplates]);

  // ===== 多模型横向对比生成 =====
  const [comparePick, setComparePick] = useState<string[]>([]);
  const [compareQueue, setCompareQueue] = useState<string[]>([]);
  const [compareCancel, setCompareCancel] = useState(false);
  const [batchCancel, setBatchCancel] = useState(false);
  const startCompareGenerate = useCallback((task: ITask, modelIds: string[]) => {
    if (modelIds.length === 0) { toast.warning('请先勾选要对比的模型'); return; }
    const base = {
      prompt: task.prompt, negativePrompt: task.negativePrompt, ratio: task.ratio, quality: task.quality,
      imageCount: task.imageCount, featureId: task.featureId, background: task.background, referenceImages: task.referenceImages,
    };
    const ids = modelIds.map(mid => {
      const mi = activeModels.find(m => m.id === mid);
      return addTask({ ...base, model: mid, modelLabel: mi?.name || mid });
    });
    setCompareQueue(ids);
    toast.success(`已创建 ${ids.length} 个对比任务，按模型依次生成中`);
  }, [activeModels, addTask]);
  useEffect(() => {
    if (compareCancel) { setCompareQueue([]); setCompareCancel(false); return; }
    if (compareQueue.length === 0) return;
    const head = tasks.find(t => t.id === compareQueue[0]);
    if (!head) { setCompareQueue(prev => prev.slice(1)); return; }
    if (head.status === 'generating') return; // 等当前模型完成
    if (head.status === 'completed' || head.status === 'failed') { setCompareQueue(prev => prev.slice(1)); return; }
    (async () => {
      if (isVideoModel(head.model)) await generateVideoTask(head.id);
      else await generateTask(head.id);
    })();
  }, [compareQueue, compareCancel, tasks, generateTask, generateVideoTask]);

  // ===== 批量队列生成（背景/提示词变体 × 自动排队）=====
  const [batchBg, setBatchBg] = useState('');
  const [batchSuffix, setBatchSuffix] = useState('');
  const [batchQueue, setBatchQueue] = useState<string[]>([]);
  const startBatchGenerate = useCallback((task: ITask) => {
    const bgs = batchBg.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const suffixes = batchSuffix.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (bgs.length === 0 && suffixes.length === 0) { toast.warning('请至少填写背景或提示词变体'); return; }
    const combos: { bg?: string; suffix: string }[] = [];
    if (bgs.length && suffixes.length) { for (const bg of bgs) for (const sfx of suffixes) combos.push({ bg, suffix: sfx }); }
    else if (bgs.length) { for (const bg of bgs) combos.push({ bg, suffix: '' }); }
    else { for (const sfx of suffixes) combos.push({ bg: undefined, suffix: sfx }); }
    const ids = combos.map(c => addTask({
      prompt: `${task.prompt}${c.suffix ? `，${c.suffix}` : ''}`,
      negativePrompt: task.negativePrompt,
      ratio: task.ratio, quality: task.quality, imageCount: 1,
      featureId: task.featureId, referenceImages: task.referenceImages,
      model: task.model, modelLabel: task.modelLabel,
      background: c.bg || task.background,
    }));
    setBatchQueue(ids);
    toast.success(`已创建 ${ids.length} 个批量任务，自动排队生成`);
  }, [batchBg, batchSuffix, addTask]);
  useEffect(() => {
    if (batchCancel) { setBatchQueue([]); setBatchCancel(false); return; }
    if (batchQueue.length === 0) return;
    const head = tasks.find(t => t.id === batchQueue[0]);
    if (!head) { setBatchQueue(prev => prev.slice(1)); return; }
    if (head.status === 'generating') return;
    if (head.status === 'completed' || head.status === 'failed') { setBatchQueue(prev => prev.slice(1)); return; }
    (async () => {
      if (isVideoModel(head.model)) await generateVideoTask(head.id);
      else await generateTask(head.id);
    })();
  }, [batchQueue, batchCancel, tasks, generateTask, generateVideoTask]);

  // ⑤ 队列可取消开关（声明已前移）+ ④ 本轮完成统计
  const runStats = useMemo(() => {
    let done = 0, img = 0, vid = 0;
    for (const t of tasks) {
      if (t.status === 'completed') done++;
      for (const r of t.results) {
        if (r.type === 'video') vid++;
        else img++;
      }
    }
    return { done, img, vid };
  }, [tasks]);

  // ===== 生成历史（跨任务汇总 + 分类/搜索）=====
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyCat, setHistoryCat] = useState('all');
  const [historyProject, setHistoryProject] = useState('all');
  const historyItems = useMemo(() => {
    const items: HistoryItem[] = [];
    for (const t of tasks) {
      t.results.forEach((r, idx) => {
        const f = t.featureId ? getFeatureTemplate(t.featureId) : undefined;
        const modelId = r.model || t.model;
        items.push({
          taskId: t.id, projectId: t.projectId, taskIndex: t.index, resultId: r.id, resultIndex: idx, url: r.url,
          modelName: activeModels.find(m => m.id === modelId)?.name || modelId,
          featureName: f?.name || '自定义',
          type: r.type || 'image',
          createdAt: r.createdAt || t.createdAt,
        });
      });
    }
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks, activeModels]);
  const historyCats = useMemo(() => ['all', 'video', ...Array.from(new Set(historyItems.map(i => i.featureName)))], [historyItems]);
  const filteredHistory = useMemo(() => {
    let list = historyItems;
    if (historyProject !== 'all') list = list.filter(i => i.projectId === historyProject);
    if (historyCat === 'video') list = list.filter(i => i.type === 'video');
    else if (historyCat !== 'all') list = list.filter(i => i.featureName === historyCat);
    if (historySearch.trim()) {
      const q = historySearch.trim().toLowerCase();
      list = list.filter(i => i.modelName.toLowerCase().includes(q) || i.featureName.toLowerCase().includes(q) || `#${i.taskIndex}`.includes(q));
    }
    return list;
  }, [historyItems, historyCat, historyProject, historySearch]);

  // ⑨ 生成历史：清空全部结果 / 导出 CSV
  const clearAllResults = () => {
    if (historyItems.length === 0) { toast.info('当前没有可清空的结果'); return; }
    if (!window.confirm(`确认清空全部 ${historyItems.length} 条生成结果？（任务与参数保留）`)) return;
    tasks.forEach(t => updateTask(t.id, { results: [] }));
    toast.success(`已清空 ${historyItems.length} 条生成结果`);
  };
  const exportHistoryCsv = () => {
    if (filteredHistory.length === 0) { toast.warning('没有可导出的结果'); return; }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['任务号', '功能', '模型', '类型', '创建时间', 'URL'];
    const rows = filteredHistory.map(i => [i.taskIndex, i.featureName, i.modelName, i.type === 'video' ? '视频' : '图片', new Date(i.createdAt).toLocaleString(), i.url]);
    const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `生成历史_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`已导出 ${filteredHistory.length} 条结果清单`);
  };

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

  const handleAddReferenceImage = useCallback((taskId: string, files: FileList | File[] | null, slot?: string) => {
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
      ...(slot ? { slot } : {}),
    }));
    updateTask(taskId, { referenceImages: [...task.referenceImages, ...newImages] });
    if (fileArr.length > remaining) {
      toast.info(`已添加 ${toAdd.length} 张，超出 ${fileArr.length - remaining} 张已忽略（最多${MAX_REFERENCE_IMAGES}张）`);
    } else {
      toast.success(`已添加 ${toAdd.length} 张参考图`);
    }
  }, [tasks, updateTask]);

  const handleAddReferenceVideo = useCallback((taskId: string, files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const file = Array.from(files)[0];
    if (file.size > 100 * 1024 * 1024) {
      toast.warning('参考视频过大，请上传 100MB 以内的视频');
      return;
    }
    updateTask(taskId, { videoRefUrl: URL.createObjectURL(file), videoRefName: file.name });
    toast.success(`已添加参考视频：${file.name}`);
  }, [updateTask]);

  const handleAddEndImage = useCallback((taskId: string, files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const file = Array.from(files)[0];
    updateTask(taskId, { endImageUrl: URL.createObjectURL(file), endImageName: file.name });
    toast.success(`已设置尾帧：${file.name}`);
  }, [updateTask]);

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

  // 下载/转存视频结果（防 30 天过期丢失）
  const handleDownloadVideo = useCallback(async (taskIndex: number, url: string, resultIndex: number) => {
    const fileName = `FC-ai_video_#${taskIndex}_${resultIndex + 1}.mp4`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('bad status');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
      toast.success('视频已下载（建议立即转存，30 天后可能过期）');
    } catch {
      window.open(url, '_blank');
      toast.info('已在浏览器打开，请右键「另存为视频」转存');
    }
  }, []);

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
    // 视频模板素材前置校验（避免缺素材时走错生成分支）
    if (task.featureId === 'video-motion' || task.featureId === 'video-replace') {
      if (!task.videoRefUrl) { toast.warning('请先上传动作参考视频（动作跟随/全能替换必需）'); return; }
      if (task.referenceImages.length === 0) { toast.warning('请先上传主体形象图 / 新元素图'); return; }
    }
    if (task.featureId === 'video-img2video' || task.featureId === 'video-live') {
      if (task.referenceImages.length === 0) { toast.warning('请先上传参考图（本功能需图片作为素材）'); return; }
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
            <span className="ml-2">· 已完成 {runStats.done} · 图片 {runStats.img} · 视频 {runStats.vid}</span>
          </span>
          {(compareQueue.length > 0 || batchQueue.length > 0) && (
            <span className="flex items-center gap-1.5">
              {compareQueue.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal text-primary border-primary/40">
                  <Loader2 className="size-3 animate-spin mr-1" />对比生成中 · 剩余 {compareQueue.length}
                  <button onClick={() => setCompareCancel(true)} className="ml-1.5 text-destructive hover:underline">停止</button>
                </Badge>
              )}
              {batchQueue.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal text-primary border-primary/40">
                  <Loader2 className="size-3 animate-spin mr-1" />批量生成中 · 剩余 {batchQueue.length}
                  <button onClick={() => setBatchCancel(true)} className="ml-1.5 text-destructive hover:underline">停止</button>
                </Badge>
              )}
            </span>
          )}
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
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setHistoryOpen(true)}>
            <History className="size-3.5 mr-1" />
            生成历史
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
                      {(() => {
                        const tpl = task.featureId ? getFeatureTemplate(task.featureId) : undefined;
                        const featName = tpl?.name;
                        return (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium rounded-md px-1.5 py-0.5 w-fit ${
                              featName
                                ? 'bg-primary/10 text-primary border border-primary/25'
                                : 'bg-muted/60 text-foreground/80 border border-border/70'
                            }`}
                            title={featName ? `调用功能：${featName}` : '调用功能：批量生成'}
                          >
                            <span className="text-[11px] leading-none">{tpl?.icon || '📋'}</span>
                            {featName || '批量生成'}
                          </span>
                        );
                      })()}
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
                      {/* 视频模板专属工作区：每个视频功能独立步骤引导 */}
                      {isVideoModel(task.model) && task.featureId && (() => {
                        const ft = getFeatureTemplate(task.featureId);
                        const steps = ft?.steps || [];
                        const vid = task.featureId;
                        const noImg = vid === 'video-free' || vid === 'video-storyboard' || vid === 'video-library';
                        const meta: Record<string, [string, string, string]> = {
                          'video-free': ['🎬', '自由创作', '文生视频 · 无需参考图'],
                          'video-img2video': ['🖼️', '图生视频', '上传商品图 → 动态化'],
                          'video-storyboard': ['📋', '故事板视频', '文案驱动 · 多段分镜'],
                          'video-motion': ['🏃', '动作跟随', '主体图 + 动作参考视频'],
                          'video-replace': ['🔁', '全能替换', '原视频 + 新元素图'],
                          'video-live': ['📱', '实况图', '单图转轻微动态'],
                          'video-library': ['🗂️', '我的视频', '视频资产管理'],
                        };
                        const m = meta[vid];
                        return (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
                            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <span className="text-sm">{m?.[0]}</span>{m?.[1]}
                              <span className="text-[9px] font-normal text-muted-foreground ml-auto">{m?.[2]}</span>
                            </div>
                            <ol className="text-[10px] text-muted-foreground list-decimal list-inside space-y-0.5">
                              {steps.map((s, i) => <li key={i}>{s}</li>)}
                            </ol>
                            {noImg && (
                              <div className="text-[10px] text-foreground/80 bg-background/60 rounded px-1.5 py-1">
                                {vid === 'video-library'
                                  ? '本功能用于管理历史视频，在下方结果区预览 / 下载 / 管理视频资产。'
                                  : vid === 'video-storyboard'
                                    ? '本功能为文生视频，无需参考图，请在下方分镜脚本逐段填写广告分镜。'
                                    : '本功能为文生视频，无需参考图，直接在【提示词】列输入内容描述后点生成。'}
                              </div>
                            )}
                            {vid === 'video-storyboard' && (() => {
                              const sb = (task.storyboard && task.storyboard.length ? task.storyboard : [{ scene: '' }, { scene: '' }, { scene: '' }]);
                              const setScene = (i: number, val: string) => {
                                const next = [...sb]; next[i] = { scene: val };
                                const filled = next.filter(x => x.scene.trim());
                                const prompt = filled.length
                                  ? '商品广告成片分镜：' + filled.map((x, k) => `${k + 1}.${x.scene.trim()}`).join('；') + '。运镜流畅，情绪递进，专业广告片质感，电商品牌广告级成片。'
                                  : task.prompt;
                                updateTask(task.id, { storyboard: next, prompt });
                              };
                              return (
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-muted-foreground flex items-center gap-1"><Clapperboard className="size-3" />分镜脚本（多段驱动长成片）</label>
                                  {sb.map((seg, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                      <span className="text-[10px] text-muted-foreground w-10 shrink-0">{i + 1}.</span>
                                      <Input
                                        value={seg.scene}
                                        onChange={(e) => setScene(i, e.target.value)}
                                        placeholder={`第 ${i + 1} 镜：如「开篇特写商品细节」`}
                                        className="h-7 text-[11px]"
                                      />
                                    </div>
                                  ))}
                                  <div className="flex gap-1.5">
                                    <Button size="sm" variant="outline" className="h-6 text-[10px] bg-background hover:bg-accent"
                                      onClick={() => updateTask(task.id, { storyboard: [...sb, { scene: '' }] })}>
                                      <Plus className="size-3 mr-1" />加镜头
                                    </Button>
                                    {sb.length > 1 && (
                                      <Button size="sm" variant="outline" className="h-6 text-[10px] text-destructive hover:text-destructive bg-background"
                                        onClick={() => updateTask(task.id, { storyboard: sb.slice(0, -1) })}>
                                        <Trash2 className="size-3 mr-1" />删末镜
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            {vid === 'video-img2video' && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Film className="size-3" />首尾帧（可选结束画面）</span>
                                  {!task.endImageUrl && (
                                    <Button variant="outline" size="sm" className="h-6 text-[10px] bg-background hover:bg-accent"
                                      onClick={() => document.getElementById(`endimage-${task.id}`)?.click()}>
                                      <Upload className="size-3 mr-1" />上传尾帧
                                    </Button>
                                  )}
                                </div>
                                {task.endImageUrl ? (
                                  <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
                                    <Film className="size-3.5 text-primary shrink-0" />
                                    <span className="text-[10px] text-foreground truncate flex-1">{task.endImageName || '尾帧.png'}</span>
                                    <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] shrink-0"
                                      onClick={() => updateTask(task.id, { endImageUrl: undefined, endImageName: undefined })}>
                                      移除
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-foreground/80 bg-background/60 rounded px-1.5 py-1">
                                    仅上传首帧也能生成；设置尾帧可指定结束画面，实现可控运动。
                                  </div>
                                )}
                              </div>
                            )}
                            {vid === 'video-motion' && (
                              <div className="text-[10px] text-foreground/80 bg-background/60 rounded px-1.5 py-1">
                                上传主体形象图 + 动作参考视频，人物将完整复刻视频动作（可在参数列调保留原声 / 人物朝向 / 模式）。
                              </div>
                            )}
                            {vid === 'video-replace' && (
                              <div className="text-[10px] text-foreground/80 bg-background/60 rounded px-1.5 py-1">
                                上传原视频 + 要替换的新元素图，AI 识别替换目标并融合光影运镜。
                              </div>
                            )}
                            {vid === 'video-live' && (
                              <div className="text-[10px] text-foreground/80 bg-background/60 rounded px-1.5 py-1">
                                上传单张静态图，生成 3 秒轻微动态的实况图效果，适合社媒分享。
                              </div>
                            )}
                          </div>
                        );
                      })()}
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
                        {!(isVideoModel(task.model) && ['video-free', 'video-storyboard', 'video-library'].includes(task.featureId || '')) && (
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
                        )}
                      </div>

                      
                              {(() => {
                                const slots = (task.featureId ? getFeatureTemplate(task.featureId)?.referenceSlots : undefined) || [];
                                if (slots.length === 0) {
                                  return (
                                    <>
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
                                                  <div className={`absolute top-1.5 left-1.5 size-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${imgIdx === 0 ? 'bg-primary' : 'bg-secondary/90'}`}>
                                                    {imgIdx + 1}
                                                  </div>
                                                  {imgIdx === 0 && (
                                                    <div className="absolute top-1.5 right-1.5 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                                                      主图
                                                    </div>
                                                  )}
                                                </div>
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
                                      {!(isVideoModel(task.model) && ['video-free', 'video-storyboard', 'video-library'].includes(task.featureId || '')) && (
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
                                      )}
                                    </>
                                  );
                                }
                                return (
                                  <div className="grid grid-cols-2 gap-2.5">
                                    {slots.map((s) => {
                                      const slotImgs = task.referenceImages.filter((im) => (im.slot || slots[0].id) === s.id);
                                      return (
                                        <div
                                          key={s.id}
                                          className="rounded-xl border border-border/70 bg-background/60 p-2.5 space-y-2"
                                          tabIndex={0}
                                          onDragOver={(e) => e.preventDefault()}
                                          onDrop={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                              handleAddReferenceImage(task.id, e.dataTransfer.files, s.id);
                                            }
                                          }}
                                          onPaste={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const files = Array.from(e.clipboardData?.files || []);
                                            if (files.length > 0) handleAddReferenceImage(task.id, files, s.id);
                                          }}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                              <span className="text-base">{s.icon}</span>{s.label}
                                            </div>
                                            {s.id === 'base' && (
                                              <>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const baseImg = slotImgs[0];
                                                  if (!baseImg) { toast.warning('请先上传原图'); return; }
                                                  setMaskEditor({ taskId: task.id, url: baseImg.url, name: baseImg.name || s.label });
                                                }}
                                                title="蒙版编辑：涂抹要重绘的区域（如衣服），其他像素保持不变"
                                                className={`ml-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${task.maskEnabled ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-primary hover:border-primary/50'}`}
                                              >
                                                🎯 蒙版{task.maskEnabled ? '✓' : ''}
                                              </button>
                                              </>
                                            )}
                                          </div>
                                          {slotImgs.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                              {slotImgs.map((img, i) => (
                                                <div key={img.id} className="relative w-[62px] h-[82px] rounded-lg overflow-hidden border border-border/60 bg-muted/30 group cursor-pointer" onClick={() => setPreviewImage({ url: img.url, name: img.name || s.label })} title="点击预览">
                                                  <Image src={img.url} alt={img.name || s.label} className="w-full h-full object-cover pointer-events-none" draggable={false} onError={() => handleRemoveReferenceImage(task.id, task.referenceImages.indexOf(img))} />
                                                  <div className="absolute top-1 left-1 size-4 rounded-full bg-primary/80 text-white text-[9px] font-bold flex items-center justify-center">{i + 1}</div>
                                                  <button className="absolute bottom-1 right-1 size-5 rounded bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); handleRemoveReferenceImage(task.id, task.referenceImages.indexOf(img)); }} title="删除">
                                                    <Trash2 className="size-3" />
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          <div className="border-2 border-dashed border-border/50 rounded-lg bg-muted/20 py-3 px-2 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors" onClick={() => document.getElementById(`ref-upload-${task.id}-${s.id}`)?.click()}>
                                            <div className="flex justify-center mb-1">
                                              <div className="size-8 rounded-full bg-accent/70 flex items-center justify-center"><ImagePlus className="size-4 text-muted-foreground" /></div>
                                            </div>
                                            <div className="text-[11px] text-foreground mb-0.5">点击/粘贴/拖拽上传</div>
                                            <div className="text-[9px] text-muted-foreground">PNG, JPG or WebP，最多支持4张</div>
                                          </div>
                                          <Button variant="outline" size="sm" className="w-full h-8 text-xs bg-background hover:bg-accent" onClick={() => document.getElementById(`ref-upload-${task.id}-${s.id}`)?.click()}>
                                            <FolderPlus className="size-3.5 mr-1" />图库上传
                                          </Button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            
                              {/* 动作参考视频（动作跟随/全能替换） */}
                              {(() => {
                                const ft = task.featureId ? getFeatureTemplate(task.featureId) : undefined;
                                if (!ft?.requiresVideo) return null;
                                return (
                                  <div className="pt-1.5 border-t border-border/40">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs font-medium text-foreground flex items-center gap-1">
                                        <Film className="size-3.5 text-primary" />动作参考视频
                                      </div>
                                      {!task.videoRefUrl && (
                                        <Button variant="outline" size="sm" className="h-7 text-xs bg-background hover:bg-accent"
                                          onClick={() => document.getElementById(`ref-video-${task.id}`)?.click()}>
                                          <Upload className="size-3.5 mr-1" />上传视频
                                        </Button>
                                      )}
                                    </div>
                                    {task.videoRefUrl ? (
                                      <div className="mt-1.5 flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
                                        <Film className="size-4 text-primary shrink-0" />
                                        <span className="text-xs text-foreground truncate flex-1">{task.videoRefName || '参考视频.mp4'}</span>
                                        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs shrink-0"
                                          onClick={() => updateTask(task.id, { videoRefUrl: undefined, videoRefName: undefined })}>
                                          移除
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="mt-1.5 rounded-md border border-dashed border-border/50 bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
                                        上传动作参考视频（MP4/MOV），人物的动作将复刻该视频
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                    </div>
                  </div>

                  {/* 隐藏的上传控件 */}
                  <input
                    id={`ref-video-${task.id}`}
                    type="file"
                    accept="video/*,.mp4,.mov,.webm"
                    className="hidden"
                    onChange={(e) => {
                      handleAddReferenceVideo(task.id, e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
                  <input
                    id={`endimage-${task.id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      handleAddEndImage(task.id, e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
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
                  {/* 参考图槽位独立上传控件（款式上身等双参考功能） */}
                  {(() => {
                    const slots = (task.featureId ? getFeatureTemplate(task.featureId)?.referenceSlots : undefined) || [];
                    return slots.map((s) => (
                      <input
                        key={s.id}
                        id={`ref-upload-${task.id}-${s.id}`}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          handleAddReferenceImage(task.id, e.target.files, s.id);
                          e.currentTarget.value = '';
                        }}
                      />
                    ));
                  })()}
                </td>

                {/* Prompt */}
                <td className="px-3 py-3 align-top" style={{ width: colWidth('prompt') }}>
                  {task.featureId === 'video-library' ? (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-center">
                      <p className="text-[11px] text-muted-foreground">我的视频 · 资产查看</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">不参与生成，可在结果区预览 / 下载 / 管理历史视频</p>
                    </div>
                  ) : task.featureId === 'design-remove-bg' ? (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-center">
                      <p className="text-[11px] text-muted-foreground">本地 RMBG 抠图</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">无需提示词 · 主体原样保留</p>
                    </div>
                  ) : (
                    <TaskPromptCell
                      task={task}
                      textOptimizeConfig={textOptimizeConfig}
                      allTextModels={allTextModels}
                      updateTask={updateTask}
                      updateTextOptimizeConfig={updateTextOptimizeConfig}
                      navigate={navigate}
                    />
                  )}
                </td>

                {/* Generation Params */}
                <td className="px-3 py-3 align-top" style={{ width: colWidth('params') }}>
                  {task.featureId === 'video-library' ? (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-center space-y-2">
                      <p className="text-[11px] text-muted-foreground">视频资产管理</p>
                      <p className="text-[10px] text-muted-foreground/70">本功能不参与生成，用于管理已生成的历史视频</p>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] w-full"
                        onClick={() => setHistoryOpen(true)}>
                        <History className="size-3 mr-1" />查看生成历史
                      </Button>
                    </div>
                  ) : task.featureId === 'design-remove-bg' ? (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-center">
                      <p className="text-[11px] text-muted-foreground">本地 RMBG 抠图</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">无需模型 / 分辨率 / 质量参数</p>
                    </div>
                  ) : (
                  <>
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
                        <div className="flex items-center justify-between gap-1">
                          <label className="text-[10px] text-muted-foreground">我的模板</label>
                          <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-primary"
                            onClick={() => saveCurrentAsTemplate(task)}>
                            <Save className="size-3 mr-0.5" />保存当前
                          </Button>
                        </div>
                        {myTemplates.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {myTemplates.map(t => (
                              <button key={t.id} title={`应用「${t.name}」到本任务`} onClick={() => applyTemplate(task, t)}
                                className="group flex items-center gap-0.5 h-6 px-1.5 rounded border border-border/60 bg-muted/20 text-[10px] text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors max-w-full">
                                <span className="truncate max-w-[90px]">{t.name}</span>
                                <X className="size-3 text-muted-foreground group-hover:text-destructive shrink-0"
                                  onClick={(e) => { e.stopPropagation(); removeTemplate(t.id); }} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">保存常用参数，下次一键套用</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">模型</label>
                        <Select
                          value={activeModels.length > 0 ? task.model : ''}
                          onValueChange={(v) => {
                            const patch: Partial<ITask> = { model: v, modelLabel: activeModels.find(m => m.id === v)?.name || v };
                            // 款式上身：切模型时按模型族自动刷新当前部位的专属提示词（gemini→geminiPrompt / gpt-image→gptPrompt），与 gpt 提示词互不混用
                            if (task.featureId === 'shoot-tryon') {
                              const partId = task.tryonType || 'clothes';
                              const part = getFeatureTemplate(task.featureId)?.tryonTypes?.find(t => t.id === partId);
                              if (part) {
                                const isGemini = /nano-banana|gemini/i.test(v);
                                const isGptImage = /gpt-image/i.test(v);
                                const picked = isGemini ? (part.geminiPrompt || part.prompt)
                                  : isGptImage ? (part.gptPrompt || part.prompt)
                                  : part.prompt;
                                if (picked) { patch.prompt = picked; }
                              }
                            }
                            // AI换背景 + 切到 Gemini/Nano Banana 系模型：自动键入专用换背景提示词，
                            // 避免通用提示词该模型理解不了（任务：图1背景→图2背景，人物皮肤/背景颜色全保真、禁止偏色）
                            if (task.featureId === 'shoot-bg' && /nano-banana|gemini/i.test(v)) {
                              const geminiTpl = getFeatureTemplate(task.featureId)?.tryonTypes?.find(t => t.id === 'gemini');
                              if (geminiTpl) {
                                patch.tryonType = 'gemini' as ITask['tryonType'];
                                patch.prompt = geminiTpl.prompt;
                              }
                            }
                            updateTask(task.id, patch);
                          }}
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
                            {activeModels.filter(m => m.isCustom && m.apiConfigId !== 'api-custom-2' && m.apiConfigId !== 'api-custom-3').length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[9px] text-muted-foreground">API 1 模型</SelectLabel>
                                {activeModels.filter(m => m.isCustom && m.apiConfigId !== 'api-custom-2' && m.apiConfigId !== 'api-custom-3').map((m) => (
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
                            {activeModels.filter(m => m.isCustom && m.apiConfigId === 'api-custom-3').length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="text-[9px] text-muted-foreground">API 3 模型</SelectLabel>
                                {activeModels.filter(m => m.isCustom && m.apiConfigId === 'api-custom-3').map((m) => (
                                  <SelectItem key={m.id} value={m.id} className="text-xs">
                                    {m.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      {isVideoModel(task.model) && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">多模型对比（同提示词各出一段）</label>
                        <div className="flex flex-wrap gap-1 max-h-[92px] overflow-y-auto">
                          {activeModels.filter(m => isVideoModel(m.id)).map(m => {
                            const on = comparePick.includes(m.id);
                            return (
                              <button key={m.id} onClick={() => setComparePick(prev => on ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                                className={`h-6 px-1.5 rounded text-[10px] border transition-colors ${on ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
                                {m.name}
                              </button>
                            );
                          })}
                        </div>
                        <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => startCompareGenerate(task, comparePick)}>
                          <Sparkles className="size-3 mr-1" />对比生成
                        </Button>
                      </div>
                      )}
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
                            <label className="text-[10px] text-muted-foreground">{isVideoModel(task.model) ? '视频质量' : '图片质量'}</label>
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
                          <label className="text-[10px] text-muted-foreground">{isVideoModel(task.model) ? '视频质量' : '图片质量'}</label>
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
                      {isVideoModel(task.model) ? (
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">视频时长（秒）</label>
                          <div className="flex gap-1 flex-wrap">
                            {getVideoDurationLimit(task.model).presets.map((n) => (
                              <Button
                                key={n}
                                variant={(task.duration || 5) === n ? 'default' : 'outline'}
                                size="sm"
                                className="h-7 flex-1 text-xs min-w-[28px]"
                                onClick={() => updateTask(task.id, { duration: n })}
                              >
                                {n}s
                              </Button>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => {
                                const el = document.getElementById(`custom-duration-${task.id}`);
                                el?.focus();
                              }}
                            >
                              自定义
                            </Button>
                          </div>
                          <input
                            id={`custom-duration-${task.id}`}
                            type="text"
                            inputMode="numeric"
                            value={String(task.duration || '')}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '');
                              updateTask(task.id, { duration: val === '' ? 0 : parseInt(val) });
                            }}
                            onBlur={(e) => {
                              const v = parseInt(e.target.value);
                              if (isNaN(v) || v < 1) { updateTask(task.id, { duration: 5 }); toast.warning('视频时长不能小于 1 秒'); }
                              else if (v > getVideoDurationLimit(task.model).max) { updateTask(task.id, { duration: getVideoDurationLimit(task.model).max }); toast.warning(`视频时长上限 ${getVideoDurationLimit(task.model).max} 秒`); }
                            }}
                            placeholder={`1-${getVideoDurationLimit(task.model).max}`}
                            className="h-7 w-full text-xs px-2 rounded-md border border-input bg-transparent focus:border-ring focus:ring-1 focus:ring-ring/20 outline-none"
                          />
                          {/* 动作跟随专属：动作参数 */}
                          {task.featureId === 'video-motion' && (
                            <div className="space-y-1.5 pt-1 border-t border-border/40">
                              <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Settings className="size-3" />动作参数
                              </label>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground">保留原声</span>
                                <button
                                  onClick={() => updateTask(task.id, { videoKeepSound: !task.videoKeepSound })}
                                  className={`h-5 w-9 rounded-full transition-colors ${task.videoKeepSound ? 'bg-primary' : 'bg-muted'}`}
                                  title={task.videoKeepSound ? '保留原视频声音' : '不保留声音（默认）'}
                                >
                                  <span className={`block size-4 rounded-full bg-white shadow transition-transform ${task.videoKeepSound ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">人物朝向</label>
                                <Select value={task.videoOrientation || 'image'} onValueChange={(v) => updateTask(task.id, { videoOrientation: v === 'image' ? undefined : (v as 'front' | 'back' | 'left' | 'right') })}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="image" className="text-xs">跟随形象图</SelectItem>
                                    <SelectItem value="front" className="text-xs">正面</SelectItem>
                                    <SelectItem value="back" className="text-xs">背面</SelectItem>
                                    <SelectItem value="left" className="text-xs">左侧</SelectItem>
                                    <SelectItem value="right" className="text-xs">右侧</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">控制模式</label>
                                <Select value={task.videoMode || 'standard'} onValueChange={(v) => updateTask(task.id, { videoMode: v === 'standard' ? undefined : v })}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="standard" className="text-xs">标准 Standard</SelectItem>
                                    <SelectItem value="pro" className="text-xs">专业 Pro</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
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
                      )}
                      {!isVideoModel(task.model) && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">批量生成（背景/提示词变体 × 自动排队）</label>
                        <input
                          value={batchBg}
                          onChange={(e) => setBatchBg(e.target.value)}
                          placeholder="背景变体，逗号分隔，如：白色棚拍, 沙滩, 城市街拍"
                          className="h-7 w-full text-xs px-2 rounded-md border border-input bg-transparent focus:border-ring focus:ring-1 focus:ring-ring/20 outline-none"
                        />
                        <input
                          value={batchSuffix}
                          onChange={(e) => setBatchSuffix(e.target.value)}
                          placeholder="提示词变体，逗号分隔，如：侧面展示, 背面展示"
                          className="h-7 w-full text-xs px-2 rounded-md border border-input bg-transparent focus:border-ring focus:ring-1 focus:ring-ring/20 outline-none"
                        />
                        <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => startBatchGenerate(task)}>
                          <Layers className="size-3 mr-1" />批量生成
                        </Button>
                      </div>
                      )}
                    </div>
                  )}
                  </>
                  )}
                </td>

                {/* Actions */}
                <td className="px-3 py-3 align-top" style={{ width: colWidth('action') }}>
                  {task.featureId === 'video-library' ? (
                    <Button variant="outline" size="sm" className="h-8 text-xs w-full" onClick={() => setHistoryOpen(true)}>
                      <History className="size-3.5 mr-1" />管理视频
                    </Button>
                  ) : (
                  <div className="flex flex-col gap-1.5">
                    <Button
                      size="sm"
                      className={`h-8 text-xs ${task.status === 'failed' ? 'bg-primary hover:bg-primary/90' : ''}`}
                      onClick={() => handleGenerate(task.id)}
                      disabled={task.status === 'generating'}
                    >
                      {task.status === 'generating' ? (
                        <RefreshCw className="size-3.5 mr-1 animate-spin" />
                      ) : task.status === 'failed' ? (
                        <RotateCcw className="size-3.5 mr-1" />
                      ) : (
                        <Play className="size-3.5 mr-1 fill-current" />
                      )}
                      {task.status === 'failed' ? '重试' : '立即生成'}
                    </Button>
                    {task.featureId !== 'design-remove-bg' && (
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
                    )}
                  </div>
                  )}
                </td>

                {/* Results - 弹性列，占满剩余空间 */}
                <td className="px-3 py-3 align-top" style={resultsFlexCol ? { minWidth: Math.max(300, colWidth('results') || 300), width: 'auto' } : { width: colWidth('results') }}>
                  {(task.featureId === 'video-library' ? tasks.flatMap(t => t.results.filter(r => r.type === 'video')) : task.results).length === 0 && task.status !== 'generating' ? (
                    <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground bg-muted/20 rounded-md border border-dashed border-border/60">
                      {task.featureId === 'video-library' ? '暂无视频资产（生成视频后会自动汇总到此处）' : '暂无生成结果'}
                    </div>
                  ) : (
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                      {/* 已生成的图片 */}
                      {(task.featureId === 'video-library' ? tasks.flatMap(t => t.results.filter(r => r.type === 'video')) : task.results).map((img, imgIdx) => {
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
                                <span className="flex items-center gap-1">
                                  {img.duration ? <span>{img.duration}s</span> : null}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDownloadVideo(task.index, img.url, imgIdx); }}
                                    className="h-5 px-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-0.5 font-medium"
                                    title="下载/转存视频（防过期丢失）"
                                  >
                                    <Download className="size-3" />
                                    转存
                                  </button>
                                </span>
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
                                  {task.referenceImages.length > 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCompare({ before: task.referenceImages[0].url, after: img.url, taskIndex: task.index, resultIdx: imgIdx });
                                      }}
                                      className="flex-1 h-6 text-[10px] flex items-center justify-center gap-0.5 rounded-md border bg-white/90 border-white/50 text-foreground hover:bg-white transition-colors"
                                      title="原图 vs 效果图对比"
                                    >
                                      <span className="hidden md:inline">对比原图</span>
                                      <span className="md:hidden">对比</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* 操作按钮区 */}
                            <div className="p-1.5 space-y-1 pointer-events-auto">
                              <div className="px-0.5 text-[9px] text-muted-foreground truncate" title={img.model}>
                                {img.model ? (activeModels.find(m => m.id === img.model)?.name || img.model) : ''}
                              </div>
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

       {/* 原图 vs 效果图对比 */}
       <Dialog open={!!compare} onOpenChange={(open) => !open && setCompare(null)}>
         <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2 text-sm">
               <ChevronsLeftRight className="size-4" />原图 vs 效果图对比{compare ? `（任务#${compare.taskIndex}-结果${compare.resultIdx + 1}）` : ''}
             </DialogTitle>
           </DialogHeader>
           {compare && (
             <div
               ref={compareRef}
               className="relative w-full aspect-[3/4] overflow-hidden select-none bg-black/95 touch-none cursor-ew-resize"
               onPointerDown={updateComparePos}
               onPointerMove={(e) => { if (e.buttons === 1) updateComparePos(e); }}
             >
               <img src={compare.after} alt="效果图" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
               <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - comparePos}% 0 0)` }}>
                 <img src={compare.before} alt="原图" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
               </div>
               {/* 分隔线 */}
               <div className="absolute top-0 bottom-0 w-0.5 bg-white/85 shadow-md" style={{ left: `${comparePos}%` }}>
                 <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-7 rounded-full bg-white text-foreground flex items-center justify-center shadow-lg pointer-events-none">
                   <ChevronsLeftRight className="size-4" />
                 </div>
               </div>
               <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">原图</span>
               <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">效果</span>
             </div>
           )}
         </DialogContent>
       </Dialog>

       {/* 生成历史（跨任务汇总） */}
       <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
         <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2 text-sm">
               <History className="size-4" />生成历史
               <span className="text-[10px] font-normal text-muted-foreground">共 {historyItems.length} 条，跨全部任务汇总</span>
             </DialogTitle>
           </DialogHeader>
           <div className="flex items-center gap-2 flex-wrap">
             <div className="relative flex-1 min-w-[180px]">
               <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
               <Input
                 placeholder="搜索模型 / 功能 / 任务号..."
                 className="h-8 pl-8 text-xs"
                 value={historySearch}
                 onChange={(e) => setHistorySearch(e.target.value)}
               />
             </div>
             <div className="flex gap-1 flex-wrap max-h-9 overflow-y-auto">
               {historyCats.map(c => (
                 <button key={c} onClick={() => setHistoryCat(c)}
                   className={`h-7 px-2 rounded text-[10px] border transition-colors ${historyCat === c ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
                   {c === 'all' ? '全部' : c === 'video' ? '视频' : c}
                 </button>
               ))}
             </div>
             <div className="flex gap-1 flex-wrap max-h-9 overflow-y-auto">
               <button onClick={() => setHistoryProject('all')}
                 className={`h-7 px-2 rounded text-[10px] border transition-colors ${historyProject === 'all' ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
                 全部项目
               </button>
               {projects.map(p => (
                 <button key={p.id} onClick={() => setHistoryProject(p.id)}
                   className={`h-7 px-2 rounded text-[10px] border transition-colors ${historyProject === p.id ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border/60 bg-muted/20 text-foreground hover:border-primary/30'}`}>
                   {p.name}
                 </button>
               ))}
             </div>
             <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportHistoryCsv}>
               <Download className="size-3 mr-1" />导出
             </Button>
             <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={clearAllResults}>
               <Trash2 className="size-3 mr-1" />清空
             </Button>
           </div>
           <div className="flex-1 overflow-y-auto pr-1">
             {filteredHistory.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-10 text-xs text-muted-foreground bg-muted/20 rounded-md border border-dashed border-border/60">
                 暂无匹配的生成结果
               </div>
             ) : (
               <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                 {filteredHistory.map((item) => (
                   <div key={item.resultId} className="group relative rounded-md border border-border/50 bg-card overflow-hidden">
                     <div className="relative aspect-[3/4] bg-muted/30">
                       {item.type === 'video' ? (
                         <video src={item.url} preload="metadata" className="w-full h-full object-cover" />
                       ) : (
                         <Image src={item.url} alt={`历史 ${item.taskIndex}`} loading="lazy" decoding="async"
                           className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }} />
                       )}
                       {/* hover 操作 */}
                       <div className="absolute inset-x-0 bottom-0 flex gap-1 p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                         <button
                           onClick={() => item.type === 'video'
                             ? handleDownloadVideo(item.taskIndex, item.url, item.resultIndex)
                             : handleDownloadResult(item.taskId, item.resultId, item.url, 'jpg', item.taskIndex, item.resultIndex)}
                           className="flex-1 h-6 text-[10px] rounded bg-white/90 text-foreground hover:bg-white flex items-center justify-center gap-0.5">
                           <Download className="size-3" />下载
                         </button>
                         {item.type !== 'video' && (
                           <button
                             onClick={() => handleUseResultAsReference(item.taskId, item.url, item.resultId)}
                             className="flex-1 h-6 text-[10px] rounded bg-white/90 text-foreground hover:bg-white flex items-center justify-center gap-0.5">
                             <ImagePlus className="size-3" />参考
                           </button>
                         )}
                       </div>
                     </div>
                     <div className="px-1.5 py-1 text-[9px] text-muted-foreground truncate" title={`${item.modelName} · ${item.featureName}`}>
                       #{item.taskIndex} · {item.featureName}
                     </div>
                   </div>
                 ))}
               </div>
             )}
           </div>
         </DialogContent>
       </Dialog>

       {/* 蒙版编辑器 */}
       <MaskEditor
         open={!!maskEditor}
         onClose={() => setMaskEditor(null)}
         imageUrl={maskEditor?.url || ''}
         imageName={maskEditor?.name}
         onSave={(maskDataUrl) => {
           if (maskEditor) {
             updateTask(maskEditor.taskId, {
               maskEnabled: maskDataUrl !== null,
               maskDataUrl: maskDataUrl || undefined,
               maskMode: maskDataUrl ? 'manual_fixed' : undefined,
             });
           }
         }}
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
