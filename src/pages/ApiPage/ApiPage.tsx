import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Check, Copy, Eye, EyeOff, RefreshCw, X, AlertTriangle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import type { IApiConfig } from '@/data/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const API_TABS = [
  { id: 'openai', label: 'OpenAI / GPT Image', sub: 'GPT-IMAGE-2' },
  { id: 'google', label: 'Google / Nano Banana', sub: '爆炸香蕉' },
  { id: 'volcengine', label: '火山引擎 / 即梦', sub: '即梦 5.0' },
  { id: 'custom', label: '自定义兼容接口', sub: 'OpenAI Compatible' },
  { id: 'prompt', label: '提示词优化 API', sub: '独立文本模型' },
];

// 提示词优化内置模型（OpenAI 兼容）
const BUILTIN_TEXT_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.1-mini',
  'claude-3.5-sonnet',
  'claude-3.7-sonnet',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'deepseek-chat',
  'qwen-plus',
];

export default function ApiPage() {
  const {
    apiConfigs,
    allModels,
    activeModels,
    updateApiConfig,
    verifyApiConfig,
    setActiveModels,
    addCustomModel,
    textOptimizeConfig,
    updateTextOptimizeConfig,
    addTextOptimizeModel,
    removeTextOptimizeModel,
    loadTextOptimizeModels,
  } = useApp();

  // 提示词优化 Tab 表单状态
  const [promptCustomModel, setPromptCustomModel] = useState('');
  const [promptKeyVisible, setPromptKeyVisible] = useState(false);
  const [promptModelSearch, setPromptModelSearch] = useState('');
  const [promptModelsLoading, setPromptModelsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('openai');
  const [searchParams, setSearchParams] = useSearchParams();

  // URL 参数控制激活 Tab（支持从生成台跳转直达）
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && API_TABS.some(t => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };
  const [modelSearch, setModelSearch] = useState('');
  const [customModelId, setCustomModelId] = useState('');
  const [customModelName, setCustomModelName] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyWarning, setVerifyWarning] = useState<string>('');

  // 二级自定义API (仅在 custom tab 显示)
  const customPrimary = apiConfigs.find((c) => c.id === 'api-custom-1');
  const customSecondary = apiConfigs.find((c) => c.id === 'api-custom-2');

  const getConfigByType = useCallback(
    (type: string, isSecondary = false) => {
      if (type === 'custom' && isSecondary) return customSecondary;
      return apiConfigs.find((c) => c.type === type && !c.isSecondary);
    },
    [apiConfigs, customSecondary],
  );

  const filteredModels = useMemo(() => {
    return allModels.filter(
      (m) =>
        m.apiType === activeTab &&
        (m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.id.toLowerCase().includes(modelSearch.toLowerCase())),
    );
  }, [allModels, activeTab, modelSearch]);

  const customApiModels = useMemo(() => {
    return allModels.filter(
      (m) =>
        (m.apiType === 'custom' || m.isCustom) &&
        (m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.id.toLowerCase().includes(modelSearch.toLowerCase())),
    );
  }, [allModels, modelSearch]);

  const displayModels = activeTab === 'custom' ? customApiModels : filteredModels;

  const isModelActive = useCallback(
    (modelId: string) => activeModels.some((m) => m.id === modelId),
    [activeModels],
  );

  const toggleModel = useCallback(
    (modelId: string) => {
      if (isModelActive(modelId)) {
        setActiveModels(activeModels.filter((m) => m.id !== modelId));
      } else {
        const model = allModels.find((m) => m.id === modelId);
        if (model) setActiveModels([...activeModels, model]);
      }
    },
    [activeModels, allModels, isModelActive, setActiveModels],
  );

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyKey = async (key: string) => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      toast.success('密钥已复制');
    } catch {
      toast.error('复制失败');
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    setVerifyWarning('');
    const prevCount = allModels.filter((m) => m.apiConfigId === id).length;
    const ok = await verifyApiConfig(id);
    const newCount = allModels.filter((m) => m.apiConfigId === id).length;
    setVerifyingId(null);
    if (ok) {
      const loaded = newCount > prevCount ? newCount - prevCount : newCount;
      toast.success(`验证成功，已加载 ${loaded} 个模型`);
      if (loaded < 10) {
        setVerifyWarning('加载模型数量较少，API 可能启用了分页。请检查 API 文档或手动添加自定义模型 ID。');
      }
    } else {
      const config = apiConfigs.find((c) => c.id === id);
      toast.error(config?.errorMsg || '验证失败，请检查配置');
    }
  };

  const handleAddCustomModel = () => {
    if (!customModelId.trim()) {
      toast.error('请输入模型ID');
      return;
    }
    // 默认加到 API 1（custom-primary），如果 API 2 已验证则两个都可加（这里加到 API 1）
    addCustomModel('api-custom-1', customModelId.trim(), customModelName.trim() || undefined);
    toast.success(`已添加候选模型: ${customModelName || customModelId}`);
    setCustomModelId('');
    setCustomModelName('');
  };

  // 计算统计
  const tabActiveCount = useMemo(() => {
    if (activeTab === 'custom') {
      return activeModels.filter((m) => m.apiType === 'custom' || m.isCustom).length;
    }
    return activeModels.filter((m) => m.apiType === activeTab).length;
  }, [activeModels, activeTab]);

  const tabTotalCount = useMemo(() => {
    if (activeTab === 'custom') return customApiModels.length;
    return filteredModels.length;
  }, [activeTab, filteredModels.length, customApiModels.length]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-xl font-semibold text-foreground">API 接口管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            连接官方或 OpenAI 兼容的生图服务，验证成功后完整载入模型
          </p>
        </div>

        <Card className="border-border/60">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">接口配置</CardTitle>
            <CardDescription>
              支持 OpenAI / Google / 火山引擎 / 自定义兼容接口，可同时启用多个 API
            </CardDescription>
          </CardHeader>
          <CardContent>
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid grid-cols-5 mb-6 w-full">
                {API_TABS.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="flex flex-col gap-0.5 py-2">
                    <span className="text-xs font-medium">{tab.label}</span>
                    <span className="text-[10px] text-muted-foreground">{tab.sub}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {API_TABS.map((tab) => {
                const config = getConfigByType(tab.id);
                if (!config) return null;
                const isVerified = config.status === 'verified';

                return (
                  <TabsContent key={tab.id} value={tab.id} className="space-y-6 mt-0">
                    {/* Primary API Config */}
                    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{tab.label}</span>
                          {tab.id === 'custom' && (
                            <Badge variant="outline" className="text-[10px] py-0 h-5">
                              API 1
                            </Badge>
                          )}
                        </div>
                        <Badge
                          variant={isVerified ? 'default' : 'secondary'}
                          className="text-[10px] font-normal"
                        >
                          {isVerified ? '已验证' : config.status === 'error' ? '验证失败' : '待验证'}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">接口地址 (Base URL)</Label>
                          <Input
                            value={config.baseUrl}
                            onChange={(e) => updateApiConfig(config.id, { baseUrl: e.target.value })}
                            placeholder="https://api.example.com/v1"
                            className="h-9 text-sm font-mono"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">API 密钥</Label>
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <Input
                                type={visibleKeys[config.id] ? 'text' : 'password'}
                                value={config.apiKey}
                                onChange={(e) => updateApiConfig(config.id, { apiKey: e.target.value })}
                                placeholder="sk-..."
                                className="h-9 text-sm font-mono pr-20"
                              />
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => toggleKeyVisibility(config.id)}
                                >
                                  {visibleKeys[config.id] ? (
                                    <EyeOff className="size-3.5" />
                                  ) : (
                                    <Eye className="size-3.5" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleCopyKey(config.apiKey)}
                                  disabled={!config.apiKey}
                                >
                                  <Copy className="size-3.5" />
                                </Button>
                              </div>
                            </div>
                            <Button
                              onClick={() => handleVerify(config.id)}
                              variant="default"
                              size="sm"
                              className="h-9"
                              disabled={verifyingId === config.id}
                            >
                              <RefreshCw className={`size-3.5 mr-1.5 ${verifyingId === config.id ? 'animate-spin' : ''}`} />
                              {verifyingId === config.id ? '加载中...' : '验证并加载模型'}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">图生图字段名</Label>
                          <Select
                            value={config.imageEditField || 'auto'}
                            onValueChange={(val) => {
                              updateApiConfig(config.id, {
                                 imageEditField: val as IApiConfig['imageEditField'],
                                 cachedImageEditStrategy: undefined,
                                 cachedImageEditStrategyFailures: 0,
                              });
                            }}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">自动检测（推荐）</SelectItem>
                              <SelectItem value="images">images</SelectItem>
                              <SelectItem value="image">image</SelectItem>
                              <SelectItem value="source_image">source_image</SelectItem>
                              <SelectItem value="image_file">image_file</SelectItem>
                              <SelectItem value="input_image">input_image</SelectItem>
                              <SelectItem value="init_image">init_image</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                             <span>自动检测会依次尝试，成功后自动缓存</span>
                             {config.cachedImageEditStrategy && (
                               <Badge variant="outline" className="text-[10px] h-4 py-0">
                                 已缓存: {config.cachedImageEditStrategy.endpointType}/{config.cachedImageEditStrategy.format}
                               </Badge>
                             )}
                           </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">图生图模式</Label>
                          <Select
                            value={config.imageEditMode || 'auto'}
                            onValueChange={(val) => {
                              updateApiConfig(config.id, {
                                imageEditMode: val as IApiConfig['imageEditMode'],
                              });
                            }}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">自动检测（推荐）</SelectItem>
                                 <SelectItem value="generations">generations 端点传图</SelectItem>
                                 <SelectItem value="edits">edits 图像编辑端点</SelectItem>
                                 <SelectItem value="variations">variations 变体端点</SelectItem>
                                 <SelectItem value="chat">chat 多模态方式</SelectItem>
                               </SelectContent>
                             </Select>
                             <div className="text-[11px] text-muted-foreground">
                               自动检测优先级：generations(JSON) → generations(FormData) → chat多模态 → edits+mask → edits → variations
                             </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">图生图强度</Label>
                            <span className="text-xs font-mono text-foreground">
                              {(config.imageEditStrength ?? 0.75).toFixed(2)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.1}
                            max={1}
                            step={0.05}
                            value={config.imageEditStrength ?? 0.75}
                            onChange={(e) => {
                              updateApiConfig(config.id, {
                                imageEditStrength: parseFloat(e.target.value),
                              });
                            }}
                            className="w-full h-2 accent-primary"
                          />
                          <div className="text-[11px] text-muted-foreground flex justify-between">
                            <span>偏创意（弱）</span>
                            <span>偏还原（强）</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Secondary Custom API (only for custom tab) */}
                    {tab.id === 'custom' && customSecondary && (
                      <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border/40">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">自定义兼容接口 API 2</span>
                            <Badge variant="outline" className="text-[10px] py-0 h-5">
                              独立地址 · 并行使用
                            </Badge>
                          </div>
                          <Badge
                            variant={customSecondary.status === 'verified' ? 'default' : 'secondary'}
                            className="text-[10px] font-normal"
                          >
                            {customSecondary.status === 'verified'
                              ? '已验证'
                              : customSecondary.status === 'error'
                                ? '验证失败'
                                : '待验证'}
                          </Badge>
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">接口地址 (Base URL)</Label>
                            <Input
                              value={customSecondary.baseUrl}
                              onChange={(e) =>
                                updateApiConfig(customSecondary.id, { baseUrl: e.target.value })
                              }
                              placeholder="https://api2.example.com/v1"
                              className="h-9 text-sm font-mono"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">API 密钥</Label>
                            <div className="flex gap-2">
                              <div className="flex-1 relative">
                                <Input
                                  type={visibleKeys[customSecondary.id] ? 'text' : 'password'}
                                  value={customSecondary.apiKey}
                                  onChange={(e) =>
                                    updateApiConfig(customSecondary.id, { apiKey: e.target.value })
                                  }
                                  placeholder="sk-..."
                                  className="h-9 text-sm font-mono pr-20"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => toggleKeyVisibility(customSecondary.id)}
                                  >
                                    {visibleKeys[customSecondary.id] ? (
                                      <EyeOff className="size-3.5" />
                                    ) : (
                                      <Eye className="size-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleCopyKey(customSecondary.apiKey)}
                                    disabled={!customSecondary.apiKey}
                                  >
                                    <Copy className="size-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <Button
                                onClick={() => handleVerify(customSecondary.id)}
                                variant="default"
                                size="sm"
                                className="h-9"
                                disabled={verifyingId === customSecondary.id}
                              >
                                <RefreshCw className={`size-3.5 mr-1.5 ${verifyingId === customSecondary.id ? 'animate-spin' : ''}`} />
                                {verifyingId === customSecondary.id ? '加载中...' : '验证并加载模型'}
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">图生图字段名</Label>
                            <Select
                              value={customSecondary.imageEditField || 'auto'}
                              onValueChange={(val) => {
                                updateApiConfig(customSecondary.id, {
                                 imageEditField: val as IApiConfig['imageEditField'],
                                 cachedImageEditStrategy: undefined,
                                 cachedImageEditStrategyFailures: 0,
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">自动检测（推荐）</SelectItem>
                                <SelectItem value="images">images</SelectItem>
                                <SelectItem value="image">image</SelectItem>
                                <SelectItem value="source_image">source_image</SelectItem>
                                <SelectItem value="image_file">image_file</SelectItem>
                                <SelectItem value="input_image">input_image</SelectItem>
                                <SelectItem value="init_image">init_image</SelectItem>
                              </SelectContent>
                            </Select>
                             <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                               <span>自动检测会依次尝试，成功后自动缓存</span>
                               {customSecondary.cachedImageEditStrategy && (
                                 <Badge variant="outline" className="text-[10px] h-4 py-0">
                                   已缓存: {customSecondary.cachedImageEditStrategy.endpointType}/{customSecondary.cachedImageEditStrategy.format}
                                 </Badge>
                               )}
                             </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">图生图模式</Label>
                            <Select
                              value={customSecondary.imageEditMode || 'auto'}
                              onValueChange={(val) => {
                                updateApiConfig(customSecondary.id, {
                                  imageEditMode: val as IApiConfig['imageEditMode'],
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">自动检测（推荐）</SelectItem>
                                <SelectItem value="edits">edits 端点</SelectItem>
                                <SelectItem value="generations">generations 端点传图</SelectItem>
                                <SelectItem value="variations">variations 端点</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="text-[11px] text-muted-foreground">
                              自动检测会依次尝试 edits → generations → variations 三种端点
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">图生图强度</Label>
                              <span className="text-xs font-mono text-foreground">
                                {(customSecondary.imageEditStrength ?? 0.75).toFixed(2)}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.1}
                              max={1}
                              step={0.05}
                              value={customSecondary.imageEditStrength ?? 0.75}
                              onChange={(e) => {
                                updateApiConfig(customSecondary.id, {
                                  imageEditStrength: parseFloat(e.target.value),
                                });
                              }}
                              className="w-full h-2 accent-primary"
                            />
                            <div className="text-[11px] text-muted-foreground flex justify-between">
                              <span>偏创意（弱）</span>
                              <span>偏还原（强）</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Model Library */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">模型库</span>
                          <span className="text-xs text-muted-foreground">
                            待确认 {tabTotalCount - tabActiveCount} / {tabTotalCount} · 已生效 {tabActiveCount} 个
                            {tab.id === 'custom' && ' · 两个接口共用'}
                          </span>
                        </div>
                      </div>

                      {/* Search + Add custom */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="search"
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            placeholder="搜索模型名称..."
                            className="h-9 pl-9 text-sm"
                          />
                        </div>
                        {tab.id === 'custom' && (
                          <>
                            <Input
                              value={customModelId}
                              onChange={(e) => setCustomModelId(e.target.value)}
                              placeholder="自定义模型ID"
                              className="h-9 w-48 text-sm font-mono"
                            />
                            <Input
                              value={customModelName}
                              onChange={(e) => setCustomModelName(e.target.value)}
                              placeholder="模型名称"
                              className="h-9 w-36 text-sm"
                            />
                            <Button onClick={handleAddCustomModel} variant="secondary" size="sm" className="h-9">
                              <Plus className="size-3.5 mr-1" />
                              添加候选
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Model Grid */}
                      {verifyWarning && (
                        <div className="flex items-start gap-2 p-2.5 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800">
                          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">加载数量异常：</span>
                            {verifyWarning}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                            onClick={() => setVerifyWarning('')}
                            aria-label="关闭警告"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[320px] overflow-y-auto pr-1">
                        {displayModels.length === 0 ? (
                          <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                            {isVerified ? '暂无匹配的模型' : '请先验证 API 配置以加载模型'}
                          </div>
                        ) : (
                          displayModels.map((model) => {
                            const active = isModelActive(model.id);
                            return (
                              <button
                                key={model.id}
                                onClick={() => toggleModel(model.id)}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-left transition-colors ${
                                  active
                                    ? 'border-primary/50 bg-primary/5 text-foreground'
                                    : 'border-border/50 bg-card hover:border-border hover:bg-muted/30 text-foreground/80'
                                }`}
                              >
                                <div
                                  className={`size-4 shrink-0 rounded border flex items-center justify-center ${
                                    active
                                      ? 'bg-primary border-primary text-primary-foreground'
                                      : 'border-border/60'
                                  }`}
                                >
                                  {active && <Check className="size-3" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium truncate">
                                    {model.name}
                                    {model.apiConfigId === 'api-custom-2' && (
                                      <span className="ml-1 inline-block px-1 py-0.5 rounded text-[9px] bg-secondary/10 text-secondary align-middle">
                                        API 2
                                      </span>
                                    )}
                                    {model.apiConfigId === 'api-custom-1' && (
                                      <span className="ml-1 inline-block px-1 py-0.5 rounded text-[9px] bg-primary/10 text-primary align-middle">
                                        API 1
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">{model.id}</div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/40">
                        <p className="text-xs text-muted-foreground">
                          点击模型添加或取消，确定后所选模型才会出现在生成参数中
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveModels([])}
                            className="h-8"
                          >
                            <X className="size-3.5 mr-1" />
                            清空全部
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => toast.success(`已保存 ${activeModels.length} 个生效模型`)}
                            className="h-8"
                          >
                            <Check className="size-3.5 mr-1" />
                            确定使用
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                );
              })}

              {/* 提示词优化 API Tab - 独立于图片模型 */}
              <TabsContent value="prompt" className="space-y-6 mt-0">
                <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <span className="text-sm font-medium">提示词优化 API 配置</span>
                      <Badge variant="outline" className="text-[10px] py-0 h-5">
                        独立文本模型 · 不与生图 API 混用
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    用于 AI 自动优化提示词功能，单独配置文本大模型 API，与图片生成模型完全分离
                  </p>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">接口地址 (Base URL)</Label>
                      <Input
                        value={textOptimizeConfig.baseUrl}
                        onChange={(e) => updateTextOptimizeConfig({ baseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                        className="h-9 text-sm font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        兼容 OpenAI /v1 协议的 API 地址，结尾不带斜杠
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">API 密钥</Label>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            type={promptKeyVisible ? 'text' : 'password'}
                            value={textOptimizeConfig.apiKey}
                            onChange={(e) => updateTextOptimizeConfig({ apiKey: e.target.value })}
                            placeholder="sk-..."
                            className="h-9 text-sm font-mono pr-20"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setPromptKeyVisible(!promptKeyVisible)}
                            >
                              {promptKeyVisible ? (
                                <EyeOff className="size-3.5" />
                              ) : (
                                <Eye className="size-3.5" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={async () => {
                                if (!textOptimizeConfig.apiKey) return;
                                try {
                                  await navigator.clipboard.writeText(textOptimizeConfig.apiKey);
                                  toast.success('密钥已复制');
                                } catch {
                                  toast.error('复制失败');
                                }
                              }}
                              disabled={!textOptimizeConfig.apiKey}
                            >
                              <Copy className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                        <Button
                          onClick={async () => {
                            setPromptModelsLoading(true);
                            await loadTextOptimizeModels();
                            setPromptModelsLoading(false);
                          }}
                          variant="default"
                          size="sm"
                          className="h-9 shrink-0"
                          disabled={promptModelsLoading || !textOptimizeConfig.baseUrl || !textOptimizeConfig.apiKey}
                        >
                          <RefreshCw className={`size-3.5 mr-1.5 ${promptModelsLoading ? 'animate-spin' : ''}`} />
                          {promptModelsLoading ? '加载中...' : '加载模型'}
                        </Button>
                      </div>
                    </div>

                    {/* 模型搜索与选择网格 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">
                          选择模型
                          {textOptimizeConfig.loadedModels.length > 0 && (
                            <span className="ml-1 text-[11px] text-muted-foreground">
                              · 已加载 {textOptimizeConfig.loadedModels.length} 个
                            </span>
                          )}
                        </Label>
                        <div className="text-[11px] text-muted-foreground">
                          当前选中: <span className="font-medium text-foreground font-mono">{textOptimizeConfig.model}</span>
                        </div>
                      </div>

                      {(textOptimizeConfig.loadedModels.length > 0 || BUILTIN_TEXT_MODELS.length > 0) && (
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="search"
                            value={promptModelSearch}
                            onChange={(e) => setPromptModelSearch(e.target.value)}
                            placeholder="搜索模型名称..."
                            className="h-8 pl-9 text-xs"
                          />
                        </div>
                      )}

                      {textOptimizeConfig.loadedModels.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground bg-card/50 rounded-md border border-dashed border-border/60">
                          请先配置 API 并点击「加载模型」
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto pr-1">
                          {textOptimizeConfig.loadedModels
                            .filter((m) => m.toLowerCase().includes(promptModelSearch.toLowerCase()))
                            .length === 0 && (
                            <div className="col-span-full flex flex-col items-center justify-center py-6 text-xs text-muted-foreground">
                              暂无匹配的模型
                            </div>
                          )}
                          {textOptimizeConfig.loadedModels
                            .filter((m) => m.toLowerCase().includes(promptModelSearch.toLowerCase()))
                            .slice(0, 100)
                            .map((m) => {
                              const active = textOptimizeConfig.model === m;
                              return (
                                <button
                                  key={m}
                                  onClick={() => updateTextOptimizeConfig({ model: m })}
                                  className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-left transition-colors ${
                                    active
                                      ? 'border-primary/50 bg-primary/5 text-foreground'
                                      : 'border-border/50 bg-card hover:border-border hover:bg-muted/30 text-foreground/80'
                                  }`}
                                >
                                  <div
                                    className={`size-3.5 shrink-0 rounded border flex items-center justify-center ${
                                      active
                                        ? 'bg-primary border-primary text-primary-foreground'
                                        : 'border-border/60'
                                    }`}
                                  >
                                    {active && <Check className="size-2.5" />}
                                  </div>
                                  <span className="text-xs font-mono truncate flex-1 min-w-0">{m}</span>
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* 自定义模型 */}
                    <div className="space-y-1.5 pt-1 border-t border-border/40">
                      <Label className="text-xs text-muted-foreground">自定义模型</Label>
                      <div className="flex gap-2">
                        <Input
                          value={promptCustomModel}
                          onChange={(e) => setPromptCustomModel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (promptCustomModel.trim()) {
                                addTextOptimizeModel(promptCustomModel.trim());
                                toast.success(`已添加模型: ${promptCustomModel.trim()}`);
                                setPromptCustomModel('');
                              }
                            }
                          }}
                          placeholder="输入模型名称后回车添加"
                          className="h-8 text-sm flex-1"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            if (promptCustomModel.trim()) {
                              addTextOptimizeModel(promptCustomModel.trim());
                              toast.success(`已添加模型: ${promptCustomModel.trim()}`);
                              setPromptCustomModel('');
                            }
                          }}
                          disabled={!promptCustomModel.trim()}
                        >
                          <Plus className="size-3.5 mr-1" />
                          添加
                        </Button>
                      </div>
                      {textOptimizeConfig.customModels.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {textOptimizeConfig.customModels.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 text-[11px] bg-muted text-foreground px-2 py-0.5 rounded-md"
                            >
                              {m}
                              <button
                                onClick={() => removeTextOptimizeModel(m)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-2">
                    <Badge variant="default" className="text-[10px] font-normal">
                      已保存 · 本机存储
                    </Badge>
                  </div>
                </div>

                {/* 使用说明 */}
                <div className="space-y-3 p-4 rounded-lg bg-card border border-border/40">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-warning" />
                    <span className="text-sm font-medium">使用说明</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-5">
                    <li>提示词优化 API 与生图 API 完全独立，可使用不同的服务商和密钥</li>
                    <li>推荐使用成本较低的文本模型（如 gpt-4o-mini / deepseek-chat）做提示词扩写</li>
                    <li>配置保存后，在生成台点击「AI 优化并写入」即可自动扩写提示词</li>
                    <li>所有配置仅保存在本机浏览器中，不会上传到任何服务器</li>
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Quick Info Card */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">支持的分辨率参数</CardTitle>
              <Badge variant="outline" className="text-[10px] h-4 py-0">
                图片模型
              </Badge>
            </div>
            <CardDescription className="text-xs">
              各主流图片模型支持的像素尺寸，系统已内置完整映射
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {allModels
                .filter((m) => !m.isCustom)
                .map((model) => (
                  <div
                    key={model.id}
                    className="p-3 rounded-md border border-border/50 bg-card/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{model.name}</span>
                      <span className="text-[10px] text-muted-foreground">{model.apiSource}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {model.resolutions.slice(0, 4).map((r) => (
                        <span
                          key={r}
                          className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded"
                        >
                          {r.split('·')[0]}
                        </span>
                      ))}
                      {model.resolutions.length > 4 && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded">
                          +{model.resolutions.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
