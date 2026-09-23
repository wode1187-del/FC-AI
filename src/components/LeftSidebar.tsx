import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  ChevronDown,
  Settings,
  Plus,
  Copy,
  Trash2,
  Edit3,
  Share2,
  Sparkles,
  Play,
  Upload,
  FolderPlus,
  Grid3X3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
import FeaturePicker from '@/components/FeaturePicker';
import { getResolutionGroups } from '@/data/models';
import { useNavigate } from 'react-router-dom';

export default function LeftSidebar() {
  const navigate = useNavigate();
  const {
    projects,
    currentProjectId,
    currentProject,
    setCurrentProjectId,
    addProject,
    renameProject,
    deleteProject,
    duplicateProject,
    toggleShareProject,
    presets,
    applyPreset,
    savePreset,
    duplicatePreset,
    activeModels,
    getResolutionsForModel,
    getQualitiesForModel,
    getBackgroundsForModel,
    applyParamsToAll,
    addTask,
    batchGenerate,
    taskStats,
    setNewTaskParams,
  } = useApp();

  // Left sidebar state
  const [selectedPreset, setSelectedPreset] = useState(presets[0]?.id || '');
  const [selectedModel, setSelectedModel] = useState(activeModels[0]?.id || '');
  const [selectedRatio, setSelectedRatio] = useState(() => {
    const list = getResolutionsForModel(activeModels[0]?.id || '');
    return list.find(r => r === '1K · 1:1 正方形 · 1024×1024') || list[0] || '1K · 1:1 正方形 · 1024×1024';
  });
  const [selectedQuality, setSelectedQuality] = useState(() => {
    const list = getQualitiesForModel(activeModels[0]?.id || '');
    return list.find(q => q.startsWith('High')) || list[0] || 'High（模型原生高质量 · PNG 无损）';
  });
  const [selectedBackground, setSelectedBackground] = useState('Auto（自动）');
  const isGpt25Model = selectedModel.includes('gpt-image-2.5') || selectedModel.includes('gpt_image_2.5');
  const [imageCount, setImageCount] = useState(4);
  const [customCount, setCustomCount] = useState('');
  const [showCustomCount, setShowCustomCount] = useState(false);
  const [totalPrompt, setTotalPrompt] = useState('保持人物、服装与构图不变，仅迁移光影与色调，商业电商摄影，高画质，自然肤色。');
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState('');

  // Batch settings
  const [startRow, setStartRow] = useState(1);
  const [endRow, setEndRow] = useState(10);
  const [concurrency, setConcurrency] = useState('5');

  // Dialog state
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [renameProjectOpen, setRenameProjectOpen] = useState(false);
  const [renameProjectName, setRenameProjectName] = useState('');
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // 左侧栏参数变化时同步到全局 newTaskParams，确保所有新增任务入口（新增单行/新增行等）都能拿到当前参数
  useEffect(() => {
    const modelLabel = activeModels.find(m => m.id === selectedModel)?.name || selectedModel;
    setNewTaskParams({
      model: selectedModel,
      modelLabel,
      ratio: selectedRatio,
      quality: selectedQuality,
      background: selectedBackground,
      imageCount: showCustomCount ? parseInt(customCount) || 1 : imageCount,
      prompt: totalPrompt,
      negativePrompt: showNegativePrompt ? negativePrompt : undefined,
    });
  }, [selectedModel, selectedRatio, selectedQuality, selectedBackground, imageCount, showCustomCount, customCount, totalPrompt, negativePrompt, showNegativePrompt, activeModels, setNewTaskParams]);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    const resolutions = getResolutionsForModel(modelId);
    const qualities = getQualitiesForModel(modelId);
    if (resolutions.length > 0) setSelectedRatio(resolutions[0]);
    if (qualities.length > 0) setSelectedQuality(qualities[0]);
  };

  const handleApplyToAll = () => {
    const modelLabel = activeModels.find(m => m.id === selectedModel)?.name || selectedModel;
    applyParamsToAll({
      model: selectedModel,
      modelLabel,
      ratio: selectedRatio,
      quality: selectedQuality,
      background: selectedBackground,
      imageCount: showCustomCount ? parseInt(customCount) || 1 : imageCount,
    });
    toast.success('参数已应用到全部任务');
  };

  const handleApplyPromptToAll = () => {
    applyParamsToAll({
      prompt: totalPrompt,
      negativePrompt: negativePrompt,
    });
    toast.success('提示词已应用到全部任务');
  };

  const handleApplyPreset = () => {
    const params = applyPreset(selectedPreset);
    if (params) {
      if (params.model) {
        setSelectedModel(params.model);
        const resolutions = getResolutionsForModel(params.model);
        const qualities = getQualitiesForModel(params.model);
        if (params.ratio) setSelectedRatio(params.ratio);
        else if (resolutions.length > 0) setSelectedRatio(resolutions[0]);
        if (params.quality) setSelectedQuality(params.quality);
        else if (qualities.length > 0) setSelectedQuality(qualities[0]);
      }
      if (typeof params.imageCount === 'number') setImageCount(params.imageCount);
      if (params.prompt) setTotalPrompt(params.prompt);
      if (params.negativePrompt) setNegativePrompt(params.negativePrompt);
      toast.success('预设已应用');
    }
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      toast.error('请输入预设名称');
      return;
    }
    savePreset(newPresetName.trim(), {
      model: selectedModel,
      ratio: selectedRatio,
      quality: selectedQuality,
      background: selectedBackground,
      imageCount: showCustomCount ? parseInt(customCount) || 1 : imageCount,
      prompt: totalPrompt,
      negativePrompt,
    });
    toast.success('预设已保存');
    setSavePresetOpen(false);
    setNewPresetName('');
  };

  const handleDuplicatePreset = () => {
    duplicatePreset(selectedPreset);
    toast.success('预设已复制');
  };

  const handleNewProject = () => {
    if (!newProjectName.trim()) {
      toast.error('请输入项目名称');
      return;
    }
    addProject(newProjectName.trim());
    setNewProjectOpen(false);
    setNewProjectName('');
    toast.success('项目已创建');
  };

  const handleRenameProject = () => {
    if (!renameProjectName.trim()) {
      toast.error('请输入项目名称');
      return;
    }
    renameProject(currentProjectId, renameProjectName.trim());
    setRenameProjectOpen(false);
    setRenameProjectName('');
    toast.success('项目已重命名');
  };

  const handleDeleteProject = () => {
    if (projects.length <= 1) {
      toast.error('至少保留一个项目');
      return;
    }
    deleteProject(currentProjectId);
    toast.success('项目已删除');
  };

  const handleDuplicateProject = () => {
    duplicateProject(currentProjectId);
    toast.success('项目已复制');
  };

  const handleNewTask = () => {
    const modelLabel = activeModels.find(m => m.id === selectedModel)?.name || selectedModel;
    addTask({
      model: selectedModel,
      modelLabel,
      ratio: selectedRatio,
      quality: selectedQuality,
      background: selectedBackground,
      imageCount: showCustomCount ? parseInt(customCount) || 1 : imageCount,
      prompt: totalPrompt,
      negativePrompt: showNegativePrompt ? negativePrompt : undefined,
    });
    toast.success('已新增 1 个任务');
  };

  const handleBatchGenerate = () => {
    if (taskStats.total === 0) {
      toast.warning('暂无任务');
      return;
    }
    const start = Math.max(1, Math.floor(startRow));
    const end = Math.min(50, Math.floor(endRow));
    if (start > end) {
      toast.warning('起始行不能大于结束行');
      return;
    }
    const taskCount = end - start + 1;
    if (taskCount > 50) {
      toast.warning('单次批量生成最多 50 个任务');
      return;
    }
    const conc = Math.max(1, Math.min(20, parseInt(concurrency) || 1));
    batchGenerate(start, end, conc);
    toast.success(`已开始批量生成（${start}-${end}行，${conc}并发）`);
  };

  const countOptions = [1, 2, 4, 6];

  return (
    <aside className="w-[320px] shrink-0 h-[calc(100vh-3rem)] bg-card border-r border-border/40 flex flex-col">
      <Tabs defaultValue="params" className="flex flex-col h-full">
        <TabsList className="mx-3 mt-3 shrink-0 bg-muted/50">
          <TabsTrigger value="params" className="flex-1 text-xs">参数列表</TabsTrigger>
          <TabsTrigger value="prompt" className="flex-1 text-xs">AI 提示词</TabsTrigger>
        </TabsList>

        <TabsContent value="params" className="flex-1 overflow-y-auto px-3 py-3 space-y-4 data-[state=active]:flex data-[state=active]:flex-col data-[state=active]:flex-1">
          {/* 功能模板（服装商拍 / 服装设计 / 视频生成） */}
          <FeaturePicker />

          {/* Current Project */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">当前项目</label>
              <span className="text-xs text-muted-foreground">{currentProject?.taskCount || 0} 个任务</span>
            </div>
            <Select value={currentProjectId} onValueChange={setCurrentProjectId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-sm">
                    <span className="flex items-center gap-2">
                      {p.name}
                      <span className="text-xs text-muted-foreground">({p.taskCount})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tech Type + Biz Tag */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">技术类型</label>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Settings className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
            <div className="px-3 py-2 bg-muted/30 rounded-md text-sm">{currentProject?.techType || 'AI图生图'}</div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">业务标签</label>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Settings className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
            <div className="px-3 py-2 bg-muted/30 rounded-md text-sm">{currentProject?.bizTag || '电商/女装'}</div>
          </div>

          {/* Project Actions */}
          <div className="grid grid-cols-4 gap-1.5">
            <Button variant="outline" size="sm" className="h-8 text-xs flex-col gap-0.5 py-1" onClick={() => setNewProjectOpen(true)}>
              <Plus className="size-3.5" />
              <span className="text-[10px]">新建项目</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs flex-col gap-0.5 py-1" onClick={handleDuplicateProject}>
              <Copy className="size-3.5" />
              <span className="text-[10px]">复制项目</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs flex-col gap-0.5 py-1" onClick={() => { setRenameProjectName(currentProject?.name || ''); setRenameProjectOpen(true); }}>
              <Edit3 className="size-3.5" />
              <span className="text-[10px]">重命名</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs flex-col gap-0.5 py-1 text-destructive hover:text-destructive" onClick={handleDeleteProject}>
              <Trash2 className="size-3.5" />
              <span className="text-[10px]">删除项目</span>
            </Button>
          </div>

          <div className="border-t border-border/40 pt-3 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">参数预设</label>
            <Select value={selectedPreset} onValueChange={setSelectedPreset}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-sm">
                    {p.name} {p.isSystem && <Badge variant="outline" className="ml-2 text-[10px]">系统</Badge>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-3 gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleApplyPreset}>应用预设</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSavePresetOpen(true)}>保存为新预设</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleDuplicatePreset}>复制预设</Button>
            </div>
          </div>

          {/* Share Project */}
          <div className="flex items-center justify-between border-t border-border/40 pt-3">
            <div className="flex items-center gap-2">
              <Share2 className="size-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">共享项目</span>
            </div>
            <Switch
              checked={currentProject?.isShared || false}
              onCheckedChange={() => toggleShareProject(currentProjectId)}
            />
          </div>

          {/* Model */}
          <div className="border-t border-border/40 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">模型</label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-primary hover:text-primary"
                onClick={() => navigate('/api')}
              >
                配置 API
              </Button>
            </div>
            <Select
              value={selectedModel}
              onValueChange={handleModelChange}
              disabled={activeModels.length === 0}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={activeModels.length === 0 ? '请先配置API并添加模型' : '选择模型'} />
              </SelectTrigger>
              <SelectContent>
                {activeModels.filter(m => !m.isCustom).length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] text-muted-foreground">内置模型</SelectLabel>
                    {activeModels.filter(m => !m.isCustom).map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-sm">
                        {m.name} {m.isDefault && <Badge variant="outline" className="ml-2 text-[10px]">默认</Badge>}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {activeModels.filter(m => m.isCustom && m.apiConfigId !== 'api-custom-2').length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] text-muted-foreground">API 1 模型</SelectLabel>
                    {activeModels.filter(m => m.isCustom && m.apiConfigId !== 'api-custom-2').map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-sm">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {activeModels.filter(m => m.isCustom && m.apiConfigId === 'api-custom-2').length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] text-muted-foreground">API 2 模型</SelectLabel>
                    {activeModels.filter(m => m.isCustom && m.apiConfigId === 'api-custom-2').map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-sm">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Total Prompt */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">总提示词</label>
            <Textarea
              value={totalPrompt}
              onChange={(e) => setTotalPrompt(e.target.value)}
              placeholder="输入提示词..."
              className="min-h-[80px] text-sm resize-none"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs text-primary border-primary/30 hover:bg-primary/5"
              onClick={handleApplyPromptToAll}
            >
              <Sparkles className="size-3.5 mr-1" />
              应用提示词到全部任务
            </Button>
          </div>

          {/* Negative Prompt Toggle */}
          <div>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs justify-start"
              onClick={() => setShowNegativePrompt(!showNegativePrompt)}
            >
              <Plus className="size-3.5 mr-1" />
              添加反向提示词
              <ChevronDown className={`size-3.5 ml-auto transition-transform ${showNegativePrompt ? 'rotate-180' : ''}`} />
            </Button>
            {showNegativePrompt && (
              <Textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="反向提示词..."
                className="mt-2 min-h-[60px] text-sm resize-none"
              />
            )}
          </div>

          {/* Generation Params */}
          <div className="border-t border-border/40 pt-3 space-y-3">
            <label className="text-sm font-medium text-foreground">生成参数</label>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">比例与分辨率</label>
              <Select value={selectedRatio} onValueChange={setSelectedRatio}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[420px]">
                  {getResolutionGroups(getResolutionsForModel(selectedModel)).map((group) => (
                    <div key={group.label}>
                      <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground bg-muted/40 border-b border-border/30">
                        {group.label}
                      </div>
                      {group.items.map((r) => (
                        <SelectItem key={r} value={r} className="text-sm">{r}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isGpt25Model ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">图片质量</label>
                  <Select value={selectedQuality} onValueChange={setSelectedQuality}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getQualitiesForModel(selectedModel).map((q) => (
                        <SelectItem key={q} value={q} className="text-sm">{q}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">背景</label>
                  <Select value={selectedBackground} onValueChange={setSelectedBackground}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getBackgroundsForModel(selectedModel).map((bg) => (
                        <SelectItem key={bg} value={bg} className="text-sm">{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">图片质量</label>
                <Select value={selectedQuality} onValueChange={setSelectedQuality}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getQualitiesForModel(selectedModel).map((q) => (
                      <SelectItem key={q} value={q} className="text-sm">{q}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Image Count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">出图数量</label>
              <span className="text-xs text-primary">最多 20 张</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {countOptions.map((n) => (
                <Button
                  key={n}
                  variant={imageCount === n && !showCustomCount ? 'default' : 'outline'}
                  size="sm"
                  className="h-10 text-sm flex flex-col gap-0 py-1"
                  onClick={() => { setImageCount(n); setShowCustomCount(false); }}
                >
                  <span className="text-base font-semibold">{n}</span>
                  <span className="text-[10px]">张</span>
                </Button>
              ))}
              <Button
                variant={showCustomCount ? 'default' : 'outline'}
                size="sm"
                className="h-10 text-xs flex flex-col gap-0.5 py-1.5"
                onClick={() => setShowCustomCount(!showCustomCount)}
              >
                <Plus className="size-3.5 mx-auto" />
                <span className="text-[10px] leading-tight">自定义</span>
              </Button>
            </div>
            {showCustomCount && (
              <Input
                type="text"
                inputMode="numeric"
                value={customCount}
                onChange={(e) => {
                  // 只允许输入数字
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  // 直接更新，不做限制
                  setCustomCount(val);
                }}
                placeholder="自定义张数（1-20）"
                className="h-8 text-sm"
              />
            )}
          </div>

          {/* Apply to All */}
          <Button
            variant="outline"
            className="w-full h-10 text-sm font-medium text-primary border-primary/40 hover:bg-primary/5"
            onClick={handleApplyToAll}
          >
            应用到全部任务
          </Button>

          {/* Batch Settings */}
          <div className="border-t border-border/40 pt-3 space-y-3">
            <label className="text-sm font-medium text-foreground">批量设置</label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">起始行</label>
                <Input
  type="text"
  inputMode="numeric"
                  value={startRow}
                  onChange={(e) => setStartRow(parseInt(e.target.value) || 1)}
                  className="h-8 text-sm text-center"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">结束行</label>
                <Input
  type="text"
  inputMode="numeric"
                  value={endRow}
                  onChange={(e) => setEndRow(parseInt(e.target.value) || 1)}
                  className="h-8 text-sm text-center"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">生成并发</label>
                <Select value={concurrency} onValueChange={setConcurrency}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="1">1 行</SelectItem>
                     <SelectItem value="3">3 行</SelectItem>
                     <SelectItem value="5">5 行</SelectItem>
                     <SelectItem value="10">10 行</SelectItem>
                     <SelectItem value="20">20 行</SelectItem>
                   </SelectContent>
                </Select>
              </div>
            </div>
             <p className="text-[11px] text-muted-foreground leading-relaxed">
               最多支持 20 并发 / 50 个任务排队执行；并发数过高可能触发API限流，请根据API配额调整
             </p>
          </div>

          {/* New Task */}
          <Button
            variant="outline"
            className="w-full h-10 text-sm font-medium text-primary border-primary/40 hover:bg-primary/5"
            onClick={handleNewTask}
          >
            <Plus className="size-4 mr-1" />
            新建任务
          </Button>

          {/* Import Actions */}
          <div className="grid grid-cols-3 gap-1.5">
            <Button variant="outline" size="sm" className="h-9 text-xs">
              <Upload className="size-3.5 mr-1" />
              导入到普通
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-xs">
              <Grid3X3 className="size-3.5 mr-1" />
              导入全部
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={handleNewTask}>
              <Plus className="size-3.5 mr-1" />
              新增单行
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" className="h-9 text-xs">
              <Plus className="size-3.5 mr-1" />
              新增参考列
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-xs">
              <Copy className="size-3.5 mr-1" />
              复制参考任务
            </Button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Batch Generate Button */}
          <Button
            className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20"
            onClick={handleBatchGenerate}
          >
            <Play className="size-5 mr-2 fill-current" />
            批量生成
          </Button>
        </TabsContent>

        <TabsContent value="prompt" className="flex-1 overflow-y-auto px-3 py-3 data-[state=active]:flex data-[state=active]:flex-col data-[state=active]:flex-1">
          <div className="space-y-3 h-full">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">AI 提示词模板</label>
              <Textarea
                value={totalPrompt}
                onChange={(e) => setTotalPrompt(e.target.value)}
                placeholder="在此输入或编辑提示词模板..."
                className="min-h-[200px] text-sm resize-none flex-1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">反向提示词</label>
              <Textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="反向提示词..."
                className="min-h-[100px] text-sm resize-none"
              />
            </div>
            <Button
              variant="outline"
              className="w-full h-9 text-sm text-primary border-primary/30 hover:bg-primary/5"
              onClick={handleApplyPromptToAll}
            >
              <Sparkles className="size-4 mr-1" />
              应用提示词到全部任务
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* New Project Dialog */}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <Input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="请输入项目名称"
            className="mt-2"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProjectOpen(false)}>取消</Button>
            <Button onClick={handleNewProject}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Project Dialog */}
      <Dialog open={renameProjectOpen} onOpenChange={setRenameProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
          </DialogHeader>
          <Input
            value={renameProjectName}
            onChange={(e) => setRenameProjectName(e.target.value)}
            placeholder="请输入项目名称"
            className="mt-2"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameProjectOpen(false)}>取消</Button>
            <Button onClick={handleRenameProject}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Preset Dialog */}
      <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>保存为新预设</DialogTitle>
          </DialogHeader>
          <Input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="请输入预设名称"
            className="mt-2"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSavePresetOpen(false)}>取消</Button>
            <Button onClick={handleSavePreset}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
