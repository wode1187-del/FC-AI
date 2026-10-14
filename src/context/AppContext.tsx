import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { scopedStorage, logger } from '@lark-apaas/client-toolkit-lite';
import { toast } from 'sonner';
import { removeBackgroundLocal } from '@/lib/removeBg';
import type { IProject, ITask, IApiConfig, IModel, IPreset, ITextOptimizeConfig, IGenerateResult } from '@/data/models';
import { getFeatureTemplate, isVideoModel, VIDEO_MODELS } from '@/data/featureTemplates';
import type { IFeatureTemplate } from '@/data/featureTemplates';
import {
  MOCK_PROJECTS,
  MOCK_TASKS,
  MOCK_PRESETS,
  MOCK_MODELS,
  MOCK_API_CONFIGS,
  MODEL_RESOLUTIONS,
  MODEL_QUALITIES,
  MODEL_BACKGROUNDS,
} from '@/data/models';
import {
  parseSizeFromRatio,
  getRealModelId,
  matchModelPresetKey,
  extractModelsFromResponse,
  extractPaginationInfo,
  extractModelInfo,
  matchPresetKeyForModel,
} from '@/lib/api/modelUtils';
import {
  STANDARD_SIZES,
  findClosestStandardSize,
  buildBodyVariants,
  parseErrorDetail,
  isInvalidRequestError,
} from '@/lib/api/requestUtils';
import {
  compressImage,
  fileToBase64,
  getMaskFile,
  maskDataUrlToFile,
  getImageNaturalSize,
  resizeMaskFile,
  imageUrlToBlob,
  composeTwoImagesToSingle,
} from '@/lib/api/imageUtils';

// Storage keys

// ---- Persistence helpers ----
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.warn('storage parse failed, fallback to default:', String(e));
    return fallback;
  }
}

/**
 * 清理任务中已失效的 blob URL 图片
 * - blob URL 只在当前会话有效，页面刷新后失效
 * - 从 localStorage 恢复数据时过滤掉这些失效引用，避免资源加载报错
 */
function sanitizeBlobUrls(tasks: ITask[]): ITask[] {
  return tasks.map((t) => ({
    ...t,
    referenceImages: t.referenceImages.filter((img) => {
      if (!img.url) return false;
      // data URL 和 http(s) URL 跨会话仍然有效，保留
      if (img.url.startsWith('data:') || img.url.startsWith('http')) return true;
      // blob URL 刷新后失效，丢弃
      if (img.url.startsWith('blob:')) return false;
      return true;
    }),
    results: t.results.filter((r) => {
      if (!r.url) return false;
      if (r.url.startsWith('data:') || r.url.startsWith('http')) return true;
      if (r.url.startsWith('blob:')) return false;
      return true;
    }),
  }));
}

function safeSetItem(key: string, value: unknown) {
  try {
    scopedStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    logger.error('storage save failed:', String(e));
  }
}

/**
 * 合并已保存的 apiConfigs 与默认配置：
 * - 已存在 id 的配置保留用户值（baseUrl / apiKey / status 等）
 * - 默认配置里新增的 id 自动补齐（避免后续新增 API 类型时老用户为空）
 * - 保证顺序与默认配置一致
 */
function mergeApiConfigs(saved: IApiConfig[] | undefined | null, defaults: IApiConfig[]): IApiConfig[] {
  if (!saved || !Array.isArray(saved) || saved.length === 0) return defaults;
  const savedMap = new Map(saved.map((c) => [c.id, c]));
  return defaults.map((def) => {
    const s = savedMap.get(def.id);
    if (!s) return def;
    // 只合并字段，不替换整个对象，保证默认配置新增字段也能落地
    return {
      ...def,
      baseUrl: typeof s.baseUrl === 'string' ? s.baseUrl : def.baseUrl,
      apiKey: typeof s.apiKey === 'string' ? s.apiKey : def.apiKey,
      status: typeof s.status === 'string' ? s.status : def.status,
      errorMsg: s.errorMsg ?? def.errorMsg,
      verifiedAt: s.verifiedAt ?? def.verifiedAt,
      isSecondary: s.isSecondary ?? def.isSecondary,
    };
  });
}
const KEY_PROJECTS = 'fc_ai_projects';
const KEY_TASKS = 'fc_ai_tasks';
const KEY_ACTIVE_MODELS = 'fc_ai_active_models';
const KEY_API_CONFIGS = 'fc_ai_api_configs';
const KEY_PRESETS = 'fc_ai_presets';
const KEY_CURRENT_PROJECT_ID = 'fc_ai_current_project_id';
const KEY_TEXT_OPTIMIZE_CONFIG = 'fc_ai_text_optimize_config';

const DEFAULT_TEXT_OPTIMIZE_CONFIG: ITextOptimizeConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  customModels: [],
  loadedModels: [],
};

interface TaskStats {
  total: number;
  queued: number;
  completed: number;
  failed: number;
}

interface AppContextType {
  // Projects
  projects: IProject[];
  currentProjectId: string;
  currentProject: IProject | undefined;
  setCurrentProjectId: (id: string) => void;
  addProject: (name: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  toggleShareProject: (id: string) => void;

  // Tasks
  projectTasks: ITask[];
  tasks: ITask[];
  taskStats: TaskStats;
  addTask: (params?: Partial<ITask>) => void;
  removeTask: (taskId: string) => void;
  updateTask: (taskId: string, updates: Partial<ITask>) => void;
  applyParamsToAll: (params: Partial<ITask>) => void;
  generateTask: (taskId: string, append?: boolean) => Promise<void>;
  batchGenerate: (startIndex: number, endIndex: number, concurrency: number) => Promise<void>;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;

  // 左侧栏当前参数（新增任务时默认使用）
  newTaskParams: Partial<ITask>;
  setNewTaskParams: (params: Partial<ITask>) => void;
  markResultDownloaded: (taskId: string, resultId: string, format: 'jpg' | 'png') => void;

  // Models
  activeModels: IModel[];
  allModels: IModel[];
  setActiveModels: (models: IModel[]) => void;
  addCustomModel: (apiId: string, modelId: string, modelName?: string) => void;
  getResolutionsForModel: (modelId: string) => string[];
  getQualitiesForModel: (modelId: string) => string[];
    getBackgroundsForModel: (modelId: string) => string[];

  // API Configs
  apiConfigs: IApiConfig[];
  updateApiConfig: (id: string, updates: Partial<IApiConfig>) => void;
  verifyApiConfig: (id: string) => Promise<boolean>;

  // Presets
  presets: IPreset[];
  applyPreset: (presetId: string) => Partial<ITask> | null;
  savePreset: (name: string, params: Partial<ITask> & { prompt: string; negativePrompt?: string }) => void;
  duplicatePreset: (presetId: string) => void;

  // Text Optimize Config（提示词优化 API，独立于图片模型）
  textOptimizeConfig: ITextOptimizeConfig;
  updateTextOptimizeConfig: (updates: Partial<ITextOptimizeConfig>) => void;
  addTextOptimizeModel: (modelName: string) => void;
  removeTextOptimizeModel: (modelName: string) => void;
  loadTextOptimizeModels: () => Promise<boolean>;

  // 视频生成（可灵 / 即梦 Seedance）
  generateVideoTask: (taskId: string) => Promise<void>;
  // 一键应用功能模板（预置提示词 + 推荐模型 + 参数）
  applyFeature: (featureId: string) => IFeatureTemplate | null;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // ---- State ----
  const [projects, setProjects] = useState<IProject[]>(() => safeParse(scopedStorage.getItem(KEY_PROJECTS), MOCK_PROJECTS));

  const [currentProjectId, setCurrentProjectIdState] = useState<string>(() => {
    const saved = scopedStorage.getItem(KEY_CURRENT_PROJECT_ID);
    return saved || MOCK_PROJECTS[0]?.id || '';
  });

  const [tasks, setTasks] = useState<ITask[]>(() => {
    const saved = scopedStorage.getItem(KEY_TASKS);
    if (saved) {
      const parsed = safeParse<ITask[]>(saved, []);
      return sanitizeBlobUrls(parsed);
    }
    return MOCK_TASKS.filter(t => t.projectId === MOCK_PROJECTS[0]?.id);
  });

  const [apiConfigs, setApiConfigsState] = useState<IApiConfig[]>(() => {
    const saved = scopedStorage.getItem(KEY_API_CONFIGS);
    const parsed = saved ? safeParse<IApiConfig[]>(saved, []) : null;
    return mergeApiConfigs(parsed, MOCK_API_CONFIGS);
  });

  // 从 API 加载的自定义模型（验证后存入，按 apiId 区分来源）
  const [customLoadedModels, setCustomLoadedModels] = useState<IModel[]>(() => safeParse(scopedStorage.getItem('fc_ai_custom_loaded_models'), []));

  // 所有模型：内置 + 从 API 加载的
  const allModels = useMemo<IModel[]>(() => [...MOCK_MODELS, ...customLoadedModels], [customLoadedModels]);

  const [activeModels, setActiveModelsState] = useState<IModel[]>(() => {
    const cached = safeParse<IModel[]>(scopedStorage.getItem(KEY_ACTIVE_MODELS), []);
    // 内置模型一律不勾选（默认不激活）：只保留用户自定义(API)模型。
    // 内置模型随版本更新即时生效，用户无需勾选；如需使用可到 API 页面手动勾选。
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached.filter(m => m.isCustom);
    }
    return [];
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 左侧栏当前选择的参数，用于新增任务时继承
  const [newTaskParams, setNewTaskParamsState] = useState<Partial<ITask>>({
    imageCount: 1,
  });

  const [presets, setPresets] = useState<IPreset[]>(() => safeParse(scopedStorage.getItem(KEY_PRESETS), MOCK_PRESETS));

  // 提示词优化 API 配置
  const [textOptimizeConfig, setTextOptimizeConfig] = useState<ITextOptimizeConfig>(() => {
    const saved = scopedStorage.getItem(KEY_TEXT_OPTIMIZE_CONFIG);
    if (!saved) return DEFAULT_TEXT_OPTIMIZE_CONFIG;
    try {
      const parsed = JSON.parse(saved) as Partial<ITextOptimizeConfig>;
      return {
        ...DEFAULT_TEXT_OPTIMIZE_CONFIG,
        ...parsed,
        customModels: Array.isArray(parsed.customModels) ? parsed.customModels : [],
        loadedModels: Array.isArray(parsed.loadedModels) ? parsed.loadedModels : [],
      };
    } catch {
      return DEFAULT_TEXT_OPTIMIZE_CONFIG;
    }
  });

  // ---- Persist ----
  useEffect(() => { safeSetItem(KEY_PROJECTS, projects); }, [projects]);
  useEffect(() => { scopedStorage.setItem(KEY_CURRENT_PROJECT_ID, currentProjectId); }, [currentProjectId]);
  useEffect(() => { safeSetItem(KEY_TASKS, tasks); }, [tasks]);
  useEffect(() => { safeSetItem(KEY_ACTIVE_MODELS, activeModels); }, [activeModels]);
  useEffect(() => { safeSetItem('fc_ai_custom_loaded_models', customLoadedModels); }, [customLoadedModels]);
  useEffect(() => {
    logger.info('persisting apiConfigs, count=' + apiConfigs.length +
      ', hasKey=' + apiConfigs.map(c => c.id + ':' + (c.apiKey ? 'yes' : 'no')).join(','));
    safeSetItem(KEY_API_CONFIGS, apiConfigs);
  }, [apiConfigs]);
  useEffect(() => { safeSetItem(KEY_PRESETS, presets); }, [presets]);
  useEffect(() => { safeSetItem(KEY_TEXT_OPTIMIZE_CONFIG, textOptimizeConfig); }, [textOptimizeConfig]);

  // ---- Computed ----
  const currentProject = useMemo(
    () => projects.find(p => p.id === currentProjectId),
    [projects, currentProjectId]
  );

  const projectTasks = useMemo(
    () => tasks.filter(t => t.projectId === currentProjectId && !t.featureStudio),
    [tasks, currentProjectId]
  );

  const taskStats = useMemo<TaskStats>(() => {
    const list = projectTasks;
    return {
      total: list.length,
      queued: list.filter(t => t.status === 'pending' || t.status === 'generating').length,
      completed: list.filter(t => t.status === 'completed').length,
      failed: list.filter(t => t.status === 'failed').length,
    };
  }, [projectTasks]);

  // ---- Project Actions ----
  const setCurrentProjectId = useCallback((id: string) => {
    setCurrentProjectIdState(id);
    // Load tasks for new project
    const saved = scopedStorage.getItem(KEY_TASKS);
    const allTasks: ITask[] = saved ? safeParse<ITask[]>(saved, []) : MOCK_TASKS;
    const projectTasksList = sanitizeBlobUrls(allTasks.filter(t => t.projectId === id));
    if (projectTasksList.length === 0 && id) {
      // Create default task for empty project
      const newTask: ITask = {
        id: `t_${Date.now()}`,
        projectId: id,
        index: 1,
        enabled: true,
        status: 'pending',
        referenceImages: [],
        prompt: '',
        model: activeModels[0]?.id || 'gpt-image-2',
        modelLabel: activeModels[0]?.name || 'gpt-image-2',
        ratio: activeModels[0]?.resolutions.find((r: string) => r === '1K · 1:1 正方形 · 1024×1024') || activeModels[0]?.resolutions[0] || '1K · 1:1 正方形 · 1024×1024',
        quality: activeModels[0]?.qualities.find((q: string) => q.startsWith('High')) || activeModels[0]?.qualities[0] || 'High（模型原生高质量 · PNG 无损）',
        imageCount: 4,
        results: [],
        createdAt: Date.now(),
      };
      setTasks(prev => [...prev, newTask]);
    } else {
      setTasks(allTasks);
    }
  }, [activeModels]);

  const addProject = useCallback((name: string) => {
    const newProject: IProject = {
      id: `p_${Date.now()}`,
      name,
      techType: 'AI图生图',
      bizTag: '电商/女装',
      isShared: false,
      taskCount: 1,
      createdAt: Date.now(),
    };
    setProjects(prev => [...prev, newProject]);
    const newTask: ITask = {
      id: `t_${Date.now()}`,
      projectId: newProject.id,
      index: 1,
      enabled: true,
      status: 'pending',
      referenceImages: [],
      prompt: '',
      model: activeModels[0]?.id || 'gpt-image-2',
      modelLabel: activeModels[0]?.name || 'gpt-image-2',
      ratio: activeModels[0]?.resolutions.find((r: string) => r === '1K · 1:1 正方形 · 1024×1024') || activeModels[0]?.resolutions[0] || '1K · 1:1 正方形 · 1024×1024',
      quality: activeModels[0]?.qualities.find((q: string) => q.startsWith('High')) || activeModels[0]?.qualities[0] || 'High（模型原生高质量 · PNG 无损）',
      imageCount: 4,
      results: [],
      createdAt: Date.now(),
    };
    setTasks(prev => [...prev, newTask]);
  }, [activeModels]);

  const renameProject = useCallback((id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    setTasks(prev => prev.filter(t => t.projectId !== id));
    if (currentProjectId === id) {
      const remaining = projects.filter(p => p.id !== id);
      if (remaining.length > 0) {
        setCurrentProjectIdState(remaining[0].id);
      }
    }
  }, [currentProjectId, projects]);

  const duplicateProject = useCallback((id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    const newId = `p_${Date.now()}`;
    const newProject: IProject = {
      ...project,
      id: newId,
      name: `${project.name} 副本`,
      createdAt: Date.now(),
    };
    setProjects(prev => [...prev, newProject]);
    // Duplicate tasks
    const origTasks = tasks.filter(t => t.projectId === id);
    const newTasks = origTasks.map((t, i) => ({
      ...t,
      id: `t_${Date.now()}_${i}`,
      projectId: newId,
      index: i + 1,
      createdAt: Date.now(),
      results: [],
      status: 'pending' as const,
    }));
    setTasks(prev => [...prev, ...newTasks]);
  }, [projects, tasks]);

  const toggleShareProject = useCallback((id: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, isShared: !p.isShared } : p));
  }, []);

  // ---- Task Actions ----
  const setNewTaskParams = useCallback((params: Partial<ITask>) => {
    setNewTaskParamsState(prev => ({ ...prev, ...params }));
  }, []);

  const addTask = useCallback((params?: Partial<ITask>) => {
    const projTasks = tasks.filter(t => t.projectId === currentProjectId);
    const maxIndex = Math.max(...projTasks.map(t => t.index), 0);
    const defaultModel = activeModels[0];
    // 参数优先级：调用传入 > newTaskParams（左侧栏当前值）> 硬编码默认值
    const merged = { ...newTaskParams, ...params };
    const newTask: ITask = {
      id: `t_${Date.now()}`,
      projectId: currentProjectId,
      index: maxIndex + 1,
      enabled: true,
      status: 'pending',
      referenceImages: [],
      prompt: merged.prompt ?? '',
      negativePrompt: merged.negativePrompt,
      model: merged.model ?? defaultModel?.id ?? 'gpt-image-2',
      modelLabel: merged.modelLabel ?? defaultModel?.name ?? 'gpt-image-2',
      ratio: merged.ratio ?? (defaultModel?.resolutions.find((r: string) => r === '1K · 1:1 正方形 · 1024×1024') || defaultModel?.resolutions[0] || '1K · 1:1 正方形 · 1024×1024'),
      quality: merged.quality ?? (defaultModel?.qualities.find((q: string) => q.startsWith('High')) || defaultModel?.qualities[0] || 'High（模型原生高质量 · PNG 无损）'),
      imageCount: merged.imageCount ?? 1,
      background: merged.background,
      featureId: merged.featureId,
      featureStudio: merged.featureStudio,
      results: [],
      createdAt: Date.now(),
    };
    setTasks(prev => [...prev, newTask]);
    setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, taskCount: p.taskCount + 1 } : p));
  }, [currentProjectId, activeModels, tasks, newTaskParams]);

  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => {
      const filtered = prev.filter(t => t.id !== taskId);
      // Reindex remaining tasks of same project
      const task = prev.find(t => t.id === taskId);
      if (!task) return filtered;
      const projId = task.projectId;
      let idx = 1;
      return filtered.map(t => {
        if (t.projectId === projId) {
          return { ...t, index: idx++ };
        }
        return t;
      });
    });
    setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, taskCount: Math.max(0, p.taskCount - 1) } : p));
  }, [currentProjectId]);

  const updateTask = useCallback((taskId: string, updates: Partial<ITask>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  }, []);

  // 标记生成结果已下载
  const markResultDownloaded = useCallback((taskId: string, resultId: string, format: 'jpg' | 'png') => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        results: t.results.map(r => {
          if (r.id !== resultId) return r;
          return format === 'jpg'
            ? { ...r, downloadedJpg: true }
            : { ...r, downloadedPng: true };
        }),
      };
    }));
  }, []);

  const applyParamsToAll = useCallback((params: Partial<ITask>) => {
    setTasks(prev => prev.map(t => {
      if (t.projectId === currentProjectId && t.enabled) {
        return { ...t, ...params };
      }
      return t;
    }));
  }, [currentProjectId]);

  // 一键应用功能模板：载入预置提示词 + 自动推荐模型 + 默认参数（免填关键词）
  const applyFeature = useCallback((featureId: string): IFeatureTemplate | null => {
    const tpl = getFeatureTemplate(featureId);
    if (!tpl) return null;
    const isVideo = isVideoModel(tpl.recommendedModel);
    // 视频模型自动激活（加入 activeModels，使模型下拉可显示/切换）
    if (isVideo) {
      setActiveModelsState(prev =>
        prev.some(m => m.id === tpl.recommendedModel)
          ? prev
          : [...prev, ...VIDEO_MODELS.filter(vm => !prev.some(p => p.id === vm.id))],
      );
    }
    const modelLabel = isVideo
      ? (VIDEO_MODELS.find(m => m.id === tpl.recommendedModel)?.name || tpl.recommendedModel)
      : (MOCK_MODELS.find(m => m.id === tpl.recommendedModel)?.name || tpl.recommendedModel);
    const update: Partial<ITask> = {
      model: tpl.recommendedModel,
      modelLabel,
      prompt: tpl.prompt,
      negativePrompt: tpl.negativePrompt || undefined,
      imageCount: tpl.params.imageCount || 1,
      background: tpl.params.background,
      featureId: tpl.id,
    };
    if (tpl.params.ratio) update.ratio = tpl.params.ratio;
    if (tpl.params.quality) update.quality = tpl.params.quality;
    if (tpl.params.duration) update.duration = tpl.params.duration;
    // 所有功能模板点击后都自动创建任务行，让用户直接看到对应的任务条
    addTask(update);
    return tpl;
  }, [applyParamsToAll, addTask, setNewTaskParamsState]);

  // 根据模型 ID 查找对应的 API 配置
  const findApiConfigForModel = useCallback((modelId: string): IApiConfig | null => {
    // 1. 先在 allModels 中查找，有 apiConfigId 的直接匹配
    const modelInfo = allModels.find(m => m.id === modelId);
    if (modelInfo?.apiConfigId) {
      const cfg = apiConfigs.find(c => c.id === modelInfo.apiConfigId);
      if (cfg?.baseUrl && cfg?.apiKey) return cfg;
    }

    // 2. 内置模型：根据 apiType 匹配对应类型的已配置 API
    if (modelInfo?.apiType && modelInfo.apiType !== 'custom') {
      const cfg = apiConfigs.find(c => c.type === modelInfo.apiType && c.baseUrl && c.apiKey && c.status === 'verified');
      if (cfg) return cfg;
    }

    // 3. 兜底：找第一个已验证且有 baseUrl/apiKey 的配置
    const fallback = apiConfigs.find(c => c.baseUrl && c.apiKey && c.status === 'verified');
    return fallback || null;
  }, [allModels, apiConfigs]);


  // ---- Generate ----
  const generateTask = useCallback(async (taskId: string, append = false) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.prompt.trim()) return;

    // 追加模式：记录本次追加张数，更新总张数用于占位框显示
    const appendCount = task.imageCount || 1;
    // 不支持一次返回多张的模型，强制 n=1，避免自动补齐多次请求重复扣费
    const modelLower = task.model.toLowerCase();
    const supportsBatch = modelLower.includes('gpt-image'); // 仅 gpt-image 系列官方支持 n>1
    // gemini/nano-banana 款式上身双槽：generations 单图每次只出 1 张，用"补齐循环逐张(n=1)补足"支持多张。
    // 若不纳入多张支持：body 会发 n=2 被上游按 2 扣费、却只回 1 张（扣费与结果不一致）。
    const isGeminiTryonMulti = task.featureId === 'shoot-tryon' &&
      (modelLower.includes('nano-banana') || modelLower.includes('gemini')) &&
      (task.imageCount || 1) > 1;
    const multiEnabled = supportsBatch || isGeminiTryonMulti;
    const actualRequestedCount = multiEnabled ? (append ? appendCount : (task.imageCount || 1)) : 1;
    const requestedCount = actualRequestedCount;
    // 移除背景（本地 RMBG 逐张抠图）：占位张数按参考图数量显示，而非 imageCount
    const isLocalRemoveBg = task.featureId === 'design-remove-bg';
    const totalImageCount = isLocalRemoveBg
      ? (task.referenceImages?.length || 1)
      : (multiEnabled ? (append ? task.results.length + appendCount : (task.imageCount || 1)) : (append ? task.results.length + 1 : 1));

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'generating', imageCount: totalImageCount, errorMsg: undefined, startedAt: Date.now(), completedAt: undefined, durationMs: undefined } : t));

    const generateStartTime = Date.now();

    // 超时保护：图生图/4K大图可能需要较长时间，放宽到5分钟
    const GENERATE_TIMEOUT_MS = 300000; // 5分钟
        const fetchWithTimeout = (url: string, init: RequestInit = {}): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
            return fetch(url, { ...init, signal: controller.signal }).finally(() => {
        window.clearTimeout(timeoutId);
      });
    };

    // ===== 调试日志 Step 1: 任务基础参数 =====
    const debugPrefix = `[生成调试 #${task.index}]`;
    // eslint-disable-next-line no-console
    logger.info(`${debugPrefix} ========== 开始生成 ==========`);
      logger.info(`${debugPrefix} 📌 版本标记: v1.3.2-gpt25-fix`);
    // eslint-disable-next-line no-console
    logger.info(`${debugPrefix} 任务ID:`, String(task.id));
    // eslint-disable-next-line no-console
    logger.info(`${debugPrefix} 模型ID (原始):`, String(task.model));
    // eslint-disable-next-line no-console
    logger.info(`${debugPrefix} 提示词:`, String(task.prompt));
    // eslint-disable-next-line no-console
    logger.info(`${debugPrefix} 负向提示词:`, String(task.negativePrompt || '(无)'));
    // eslint-disable-next-line no-console
    logger.info(`${debugPrefix} 分辨率ratio原文:`, String(task.ratio));
    // eslint-disable-next-line no-console
    logger.info(`${debugPrefix} 质量:`, String(task.quality));
    // eslint-disable-next-line no-console
    logger.info(`${debugPrefix} 张数:`, String(task.imageCount));

    // 这些变量定义在 try 外，catch 中可以引用
    let lastError: string | null = null;
    let lastFullError: string | null = null;
    let apiConfig: IApiConfig | null = null;

    // ===== 移除背景：本地 RMBG 抠图（不上 API、不扣费、不重绘、不偏色） =====
    if (task.featureId === 'design-remove-bg' && task.referenceImages && task.referenceImages.length > 0) {
      const refs = task.referenceImages;
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 🖼️ 移除背景：走本地 RMBG 抠图（不调 API、不扣费），共 ${refs.length} 张参考图`);
      try {
        toast.info('本地 RMBG 抠图中（首次约176MB模型加载，之后缓存秒开）…');
        // 逐张抠图（顺序执行，避免 worker 并发冲突），每张参考图输出一张透明 PNG
        const localList = [];
        for (const ref of refs) {
          // eslint-disable-next-line no-console
          logger.info(`${debugPrefix}   🖼️ 抠图 ${ref.name || '参考图'}…`);
          const local = await removeBackgroundLocal(ref.url);
          localList.push(local);
          // eslint-disable-next-line no-console
          logger.info(`${debugPrefix}   ✅ ${local.width}×${local.height}`);
        }
        const newResults = localList.map((local, i) => ({
          id: `r_${Date.now()}_${i}`,
          url: local.url,
          model: task.model,
          prompt: task.prompt,
          createdAt: Date.now(),
          width: local.width,
          height: local.height,
        }));
        setTasks(prev => prev.map(t => t.id === taskId ? {
          ...t,
          status: 'completed',
          results: newResults,
          errorMsg: undefined,
          completedAt: Date.now(),
          durationMs: Date.now() - generateStartTime,
        } : t));
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} ✅ 本地 RMBG 抠图完成，共 ${localList.length} 张透明PNG`);
        return;
      } catch (localErr) {
        // eslint-disable-next-line no-console
        logger.error(`${debugPrefix} ⚠️ 本地 RMBG 抠图失败，回退到 API 生成：${String(localErr)}`);
        toast.error('本地抠图失败，已回退到 API 生成');
        // 不 return，继续走下方正常 API 流程
      }
    }

    try {
      // 找到对应 API 配置
      apiConfig = findApiConfigForModel(task.model);
      if (!apiConfig || !apiConfig.baseUrl || !apiConfig.apiKey) {
        // eslint-disable-next-line no-console
        logger.error(`${debugPrefix} ❌ 未找到可用的 API 配置`);
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 所有 apiConfigs:`, String(apiConfigs.map(c => ({ id: c.id, type: c.type, status: c.status, hasBaseUrl: !!c.baseUrl, hasKey: !!c.apiKey }))));
        throw new Error('未找到可用的 API 配置，请先在「API接口」页面配置并验证');
      }

      // ===== 调试日志 Step 2: API 配置 =====
      const maskedKey = apiConfig.apiKey.length > 8
        ? apiConfig.apiKey.slice(0, 4) + '****' + apiConfig.apiKey.slice(-4)
        : '***';
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 匹配到API配置:`, String({
        id: apiConfig.id,
        type: apiConfig.type,
        baseUrl: apiConfig.baseUrl,
        apiKey: maskedKey,
        status: apiConfig.status,
      }));

      const realModelId = getRealModelId(task.model);
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 真实模型ID (去掉前缀后):`, String(realModelId));

      const { width, height } = parseSizeFromRatio(task.ratio);
      const sizeStr = `${width}x${height}`;
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 解析出的尺寸:`, String({ width, height, sizeStr }));

      // 检查是否是"自适应尺寸"，如果是则不传 size
      let isAutoSize = task.ratio.includes('自适应') || task.ratio.includes('自动') || task.ratio.includes('自由尺寸') || task.ratio.includes('由模型决定');
      // 自动检测：模型名已包含分辨率标识（-1k/-2k/-3k/-4k/-1080p/-2160p/-hd/-fhd等）时，不传size参数
      const modelHasResolutionSuffix = /-(1k|2k|3k|4k|1080p|2160p|720p|480p|hd|fhd|uhd|qhd)(?=[-_]|$)/i.test(realModelId);
      if (modelHasResolutionSuffix && !isAutoSize) {
        isAutoSize = true;
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 🔧 模型名已含分辨率标识(${realModelId})，自动跳过size参数，避免平台重复附加分辨率`);
      }
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 是否自适应尺寸:`, String(isAutoSize));

      const presetKey = matchModelPresetKey(task.model);
      const isGoogleModel = presetKey?.startsWith('nano-banana') || presetKey?.startsWith('gemini');
      // Inpaint 局部重绘模型（FLUX Kontext / MJ inpaint / 豆包 SeedEdit）：官方 edits 只认 image+mask+prompt，
      // 不传 n / size / response_format / negative_prompt / strength，避免服务器拒绝或断连
      const isInpaintModel = presetKey === 'flux-kontext' || presetKey === 'mj-inpaint' || presetKey === 'doubao-seededit-3.0-i2i';

      // 构造请求体（OpenAI 兼容格式）
      const body: Record<string, unknown> = {
        model: realModelId,
        prompt: task.prompt,
      };
      // inpaint 模型不传 n（官方固定单张）；其他模型按需传 n
      if (!isInpaintModel) {
        body.n = append ? appendCount : (task.imageCount || 1);
      }

      // 自适应尺寸不传 size；Google Gemini/Nano Banana 官方用 image_size+aspect_ratio，不用 size
      if (!isAutoSize && !isGoogleModel && !isInpaintModel) {
        if (presetKey?.startsWith('wan')) {
          // Wan 2.7 官方推荐缩写档位 1K/2K/4K（T2I 可 4K，I2I 最高 2K）
          const wm = task.ratio.match(/^(\d+(?:\.\d+)?K)/);
          if (wm) body.size = wm[1];
        } else if (presetKey?.startsWith('seedream') || presetKey?.startsWith('jimeng')) {
          // 火山 Seedream/即梦：官方 GenerateImages 用档位词 size(1K/2K/4K) + aspect_ratio，
          // 中转不认纯像素 size（如 3520x4704 会被降档为 2048x2048），必须发档位词 + 比例
          const sm = task.ratio.match(/^(\d+(?:\.\d+)?K)/);
          if (sm) body.size = sm[1];
          const ar = task.ratio.match(/(\d+):(\d+)/);
          if (ar) body.aspect_ratio = `${ar[1]}:${ar[2]}`;
        } else {
          body.size = sizeStr;
        }
      }
      if (!isAutoSize && isGoogleModel) {
        // nano-banana/gemini：
        // ① image_size 档位词 + aspect_ratio → images/generations 文生图（官方推荐，用户验证能出 1K-4K）
        // ② 同时带 size 像素 → 图生图 generations 端点（v1.3.x 旧版验证能出 4K；中转认 size 像素档位）
        const gm = task.ratio.match(/^(\d+(?:\.\d+)?K)\s*·\s*(\d+:\d+)/);
        if (gm) {
          body.image_size = gm[1];
          body.aspect_ratio = gm[2];
        }
        // 附加 size 像素（不覆盖 image_size；二者并存，中转认哪个用哪个）
        const pm = task.ratio.match(/(\d+)\s*×\s*(\d+)/);
        if (pm) {
          body.size = `${pm[1]}x${pm[2]}`;
        }
      }

      // 质量参数：不同 API 格式不同，按模型类型适配
      const qualityLower = task.quality.toLowerCase();
      if (presetKey === 'gpt-image-2') {
        // OpenAI GPT Image 2: quality = low / medium / high (官方支持集，非 dall-e 的 hd/standard)
        if (qualityLower.includes('high') || qualityLower.includes('hd') || qualityLower.includes('无损')) {
          body.quality = 'high';
        } else if (qualityLower.includes('low') || qualityLower.includes('低') || qualityLower.includes('快速')) {
          body.quality = 'low';
        } else {
          body.quality = 'medium';
        }
      } else if (presetKey === 'gpt-image-2.5-flare' || presetKey === 'gpt-image-2.5-sunburst') {
        // GPT Image 2.5: quality = auto / low / medium / high / xhigh / max
        if (qualityLower.includes('max') || qualityLower.includes('最高')) {
          body.quality = 'max';
        } else if (qualityLower.includes('xhigh') || qualityLower.includes('超高') || qualityLower.includes('x-high')) {
          body.quality = 'xhigh';
        } else if (qualityLower.includes('high') || qualityLower.includes('hd') || qualityLower.includes('高质量')) {
          body.quality = 'high';
        } else if (qualityLower.includes('medium') || qualityLower.includes('中等') || qualityLower.includes('平衡')) {
          body.quality = 'medium';
        } else if (qualityLower.includes('low') || qualityLower.includes('低') || qualityLower.includes('快速')) {
          body.quality = 'low';
        } else {
          body.quality = 'auto';
        }
        
        // 背景参数处理：auto / opaque / transparent
        if (task.background) {
          const bgLower = task.background.toLowerCase();
          if (bgLower.includes('transparent') || bgLower.includes('透明')) {
            body.background = 'transparent';
          } else if (bgLower.includes('opaque') || bgLower.includes('不透明')) {
            body.background = 'opaque';
          } else {
            body.background = 'auto';
          }
        }
      } else if (presetKey?.startsWith('grok')) {
        // Grok Imagine: 质量选项 1K/2K 映射到 resolution 参数
        if (qualityLower.includes('2k') || qualityLower.includes('2K')) {
          body.resolution = '2k';
        } else {
          body.resolution = '1k';
        }
        // quality 默认 medium
        body.quality = 'medium';
      }


      // 负向提示词（gpt-image 系列官方不支持 negative_prompt，跳过）
      if (task.negativePrompt?.trim() && !presetKey?.startsWith('gpt-image') && !isInpaintModel) {
        body.negative_prompt = task.negativePrompt;
      }

      // response_format：gpt-image 系列不支持此参数且总是返回 base64，故跳过；
      // inpaint 模型官方 edits 不接受 response_format，跳过；
      // 其他 API 设为 url（大多数 API 默认就是 url，显式指定增强兼容性）
      if (presetKey !== 'gpt-image-2' && presetKey !== 'gpt-image-2.5-flare' && presetKey !== 'gpt-image-2.5-sunburst' && !isInpaintModel) {
        body.response_format = 'url';
      }



      // ===== 判断是否为图生图模式（有参考图时走图生图） =====
      const hasReference = task.referenceImages && task.referenceImages.length > 0;
      let imageEditFiles: File[] = [];
      let imageEditBase64List: string[] = [];
      let isImageEditMode = false;
      // 双槽款式上身状态（model=模特底图 / style=衣服款式）。函数作用域声明，供后续端点/请求体分支读取。
      let isDualSlotTryon = false;
      let dualPresetKey = '';
      let dualIsOpenAIImage = false;
      let dualIsGoogle = false;
      let dualIsVolc = false;
      let dualIsGrok = false;
      let dualIsWan = false;
      let isFaceSwap = false;
      let isBgSwap = false;
      // 按模型家族生成 slot 感知指令前缀（函数作用域，供 chat/formdata/json 三处分支调用）
      let buildDualSlotInstruction: () => string = () => '';
      // 色彩保真指令后缀（根据 task.colorLevel/colorScope/colorIntensity 生成）
      let buildColorPreserveSuffix: () => string = () => '';

      // 图片处理工具：已移至 src/lib/api/imageUtils.ts（compressImage / fileToBase64 / getMaskFile / maskDataUrlToFile / getImageNaturalSize / resizeMaskFile / imageUrlToBlob）
      const maskFileCache: { file: File | null } = { file: null };

      if (hasReference) {
        const refs = task.referenceImages;
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} ========== 图生图：参考图信息 ==========`);
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 参考图数量:`, String(refs.length));

        try {
          // 按 slot 排序：衣服款式(style)在前=参考图1，模特底图(model)在后=参考图2。
          // 该顺序与界面槽位（上传款式→上传模特）及用户手输提示词的"图1衣服、图2模特"一致，
          // 也与系统追加的结构化角色前缀编号对齐，避免编号错位导致换衣混乱。
          const slotOrder = (slot?: string) => {
            if (slot === 'style' || slot === 'base' || slot === 'fabric') return 0;  // 底图/衣服/面料=图1
            if (slot === 'model' || slot === 'face' || slot === 'fabric-style') return 1;  // 模特/人脸/款式底图=图2
            return 2;
          };
          const sortedRefs = [...refs].sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot));
          // 并行处理所有参考图
          const processed = await Promise.all(
            sortedRefs.map(async (ref, idx) => {
              // eslint-disable-next-line no-console
              logger.info(`${debugPrefix} 参考图[${idx + 1}]: ${ref.name} (${(ref.size / 1024).toFixed(1)}KB, slot=${ref.slot || '无'})`);
              const rawFile = await imageUrlToBlob(ref.url, ref.name, debugPrefix);
              const compressed = await compressImage(rawFile, 2048, 0.85, debugPrefix);
              const b64 = await fileToBase64(compressed);
              return { file: compressed, b64 };
            })
          );
          imageEditFiles = processed.map((p) => p.file);
          imageEditBase64List = processed.map((p) => p.b64);
          isImageEditMode = true;

          // ===== 双槽检测：款式上身(style+model) 或 智能换脸(base+face) =====
          // sortedRefs 已按 slotOrder 排序：底图=图1在前，人脸/模特=图2在后
          const slotList = sortedRefs.map((r) => r.slot || '');
          const isStyleModel = slotList.includes('model') && slotList.includes('style');
          const isBaseFace = slotList.includes('base') && slotList.includes('face');
          const isBaseBg = slotList.includes('base') && slotList.includes('bg');
          const isBaseColor = slotList.includes('base') && slotList.includes('color');
          const isFabric = slotList.includes('fabric') && slotList.includes('fabric-style');
          isDualSlotTryon = isImageEditMode &&
            (isStyleModel || isBaseFace || isBaseBg || isBaseColor || isFabric) &&
            imageEditBase64List.length >= 2;
          isFaceSwap = isBaseFace && !isStyleModel;
          isBgSwap = isBaseBg && !isStyleModel && !isBaseFace;
          dualPresetKey = (matchModelPresetKey(task.model) || '').toLowerCase();
          dualIsOpenAIImage = dualPresetKey.startsWith('gpt-image');
          dualIsGoogle = dualPresetKey.startsWith('nano-banana') || dualPresetKey.startsWith('gemini');
          dualIsVolc = dualPresetKey.startsWith('seedream') || dualPresetKey.startsWith('jimeng');
          dualIsGrok = dualPresetKey.startsWith('grok');
          dualIsWan = dualPresetKey.startsWith('wan');
          // eslint-disable-next-line no-console
          if (isDualSlotTryon) {
            logger.info(`${debugPrefix} 👥 双槽${isFaceSwap ? '智能换脸' : '款式上身'}：参考图顺序=[图1${isFaceSwap ? '原模特底图' : '衣服款式'}, 图2${isFaceSwap ? '目标人脸' : '模特底图'}], 模型=${task.model}, family=` +
              `${dualIsOpenAIImage ? 'openai-edits' : dualIsGoogle ? 'google-chat' : dualIsVolc ? 'volc-gen' : dualIsGrok ? 'grok-edits' : dualIsWan ? 'wan-chat' : 'generic'}`);
          }

          // 双槽核心兜底：无论用户输入长/短提示词，都在前面追加结构化参考图角色说明，
          // 明确"图1=衣服款式、图2=模特底图、以图2为底图换衣"，避免用户短提示词导致模型张冠李戴。
          // 图片顺序已保证：imageEditBase64List[0]=衣服(图1)，[1]=模特(图2)。
          buildDualSlotInstruction = (): string => {
            if (!isDualSlotTryon) return '';
            // 智能换脸场景：图1=原模特底图，图2=目标人脸
            if (isFaceSwap) {
              if (dualIsGrok) {
                return `[<IMAGE_0>=底图，<IMAGE_1>=目标人脸。以 <IMAGE_0> 为底图，除面部五官和脸型轮廓外每个像素原样保留不重绘不调色；唯一修改区域：眼睛、眉毛、鼻子、嘴唇、脸型轮廓、下颌线、颧骨、面部骨骼结构精确匹配 <IMAGE_1>；其他全部像素级不变。]\n\n用户提示词：`;
              }
              return `[参考图1=底图，参考图2=目标人脸。以参考图1为底图，除面部五官和脸型轮廓外，图1的每一个像素都必须原样保留，不得重绘、不得调色、不得修改任何细节。唯一允许的修改区域：面部五官和脸型轮廓——眼睛、眉毛、鼻子、嘴唇、脸型轮廓、下颌线、颧骨位置、面部骨骼结构，全部精确匹配图2的人脸特征。以下内容必须像素级保持图1原样：发际线、额头、头发、颈部、胸口、手臂、手部、服装、背景、灯光、阴影、肤色。换脸后面部肤色必须和图1颈部肤色完全一致，无缝衔接无色差。禁止重绘面部以外任何区域，禁止调整全局色调，禁止美化，禁止改变任何细节。]\n\n用户提示词：`;
            }
            // AI换背景场景：图1=原图（人物/商品），图2=背景图
            if (isBgSwap) {
              if (dualIsGrok) {
                return `[<IMAGE_0>=原图（含人物/商品），<IMAGE_1>=背景图。严格保持 <IMAGE_0> 主体（面部、发型、肤色、服装、姿势）每个像素不变，不得调色不得重绘；仅将背景替换为 <IMAGE_1> 的场景，主体边缘自然融合。]\n\n用户提示词：`;
              }
              return `[参考图1=原图（含人物/商品），参考图2=背景图。严格保持参考图1主体（面部、五官、发型、肤色、服装颜色/图案/材质、姿势、手部、配饰）每一个像素完全不变，不得调色、不得重绘、不得改变任何细节和颜色；仅将参考图1的背景替换为参考图2的背景场景。主体与新背景之间边缘自然融合，主体本身的颜色和光影必须与参考图1完全一致，不得因新背景而偏色。]\n\n用户提示词：`;
            }
            // 服装改色场景：图1=原图，图2=色图（或无图2仅用颜色代码）
            if (isBaseColor) {
              return `[参考图1=原图（含人物和服装）。严格保持参考图1中除服装颜色外的每一个像素完全不变：人物面部、五官、发型、肤色、姿势、手部、配饰、背景、灯光、阴影全部原样保留，不得重绘、不得调色、不得变形。唯一允许修改的区域：服装本身的颜色——只改衣服的颜色，衣服的款式、版型、面料纹理、图案、褶皱、光影全部与参考图1一致。如果有参考图2，只取参考图2的颜色值，不要参考图2的款式和人物。]\n\n用户提示词：`;
            }
            // 面料上身场景：图1=面料/图案，图2=款式底图；按部位细分（full/top/bottom/inner）
            if (isFabric) {
              const fType = task.tryonType || 'full';
              const fMap: Record<string, string> = {
                full: '将参考图1中的面料纹理、图案、印花完整应用到参考图2服装的整件服装表面，只替换服装的面料/图案，服装的款式、版型、结构、轮廓、尺寸完全不变',
                top: '只将参考图1中的面料纹理、图案、印花应用到参考图2模特的上装（上身衣服）表面，上装的版型、结构、轮廓完全不变，下装、人体、场景背景、灯光等其余部分完全保持参考图2原样',
                bottom: '只将参考图1中的面料纹理、图案、印花应用到参考图2模特的下装（裤子/裙子）表面，下装的版型、裤长/裙长完全不变，上装、人体、场景背景、灯光等其余部分完全保持参考图2原样',
                inner: '只将参考图1中的面料纹理、图案、印花应用到参考图2模特的内搭衣服表面，内搭的版型、结构、轮廓完全不变，外套、下装、人体、场景背景、灯光等其余部分完全保持参考图2原样',
              };
              const fAction = fMap[fType] || fMap.full;
              if (dualIsGrok) {
                return `[<IMAGE_0>=面料/图案图，<IMAGE_1>=服装款式底图（模特穿着图）。以 <IMAGE_1> 为底图，严格保持其服装的款式、版型、结构、轮廓、尺寸以及人体、背景完全不变，${fAction}，面料贴合版型自然垂坠，褶皱处图案跟随变形自然，无生硬贴图感。]\n\n用户提示词：`;
              }
              return `[参考图1=面料/图案图，参考图2=服装款式底图（模特穿着图）。以参考图2为底图，严格保持参考图2服装的款式、版型、结构、轮廓、尺寸以及人体、背景完全不变，${fAction}，面料贴合版型自然垂坠，褶皱处图案跟随变形自然，无缝衔接，无生硬贴图感，商业设计预览质感。]\n\n用户提示词：`;
            }
            // 款式上身场景：根据换装类型调整描述
            const tryonType = task.tryonType || 'clothes';
            const typeMap: Record<string, { item: string; itemLabel: string; action: string }> = {
              clothes: { item: '服装', itemLabel: '衣服款式图（平铺/挂拍单品）', action: '穿到' },
              pants: { item: '裤子', itemLabel: '裤子款式图', action: '穿到' },
              inner: { item: '内搭', itemLabel: '内搭款式图', action: '穿到' },
              skirt: { item: '裙子', itemLabel: '裙子款式图', action: '穿到' },
              accessory: { item: '配饰', itemLabel: '配饰图（包/帽/围巾/首饰）', action: '佩戴到' },
              shoes: { item: '鞋子', itemLabel: '鞋子款式图', action: '穿到' },
            };
            const t = typeMap[tryonType] || typeMap.clothes;
            if (dualIsGrok) {
              return `[<IMAGE_0>=${t.itemLabel}，<IMAGE_1>=模特照片（底图）。以 <IMAGE_1> 为底图，严格保持其模特的面部、五官、发型、身材、姿势、肤色与拍摄场景、灯光完全不变，不得更换模特或重新生成人物；仅将 <IMAGE_0> 中的${t.item}（颜色、图案、材质、版型）${t.action} <IMAGE_1> 模特身上，自然贴合垂坠，光影与 <IMAGE_1> 一致。]\n\n用户提示词：`;
            }
            // Gemini/Nano Banana：多模态对话模型，需要比 gpt 更明确、结构化的指令，否则会自行重绘/改色/换人
            if (dualIsGoogle) {
              return `这是一张"图1（${t.itemLabel}）"和一张"图2（模特照片底图）"。你的任务只有一个：把图1中的${t.item}${t.action}图2的模特身上，然后原样输出图2这张模特照片，只改变他身上的这一件${t.item}。

必须做到：
1. 以图2为底图，图2模特的每一处都原样保留：面部五官、发型、身材、姿势、肤色、皮肤颜色、手上动作、鞋、以及背景、场景、光线、色调，全部一个像素都不要改。
2. 图2模特的皮肤颜色必须与图2完全一致，禁止偏色、禁止泛红、禁止变色。
3. 背景的颜色和光影必须与图2完全一致，禁止改背景、禁止给背景换色、禁止添加新背景元素。
4. 只把图1里那件${t.item}的颜色、图案、材质、版型照搬穿到图2模特对应部位，衣服要自然贴合身体、垂坠自然、褶皱和光影跟随身体。
5. 这是换装，不是重绘。禁止把图2模特画成另一个人、禁止换脸、禁止改变身材、禁止给皮肤上色、禁止调整整体色调。

最终只输出图2被换上图1衣服后的这一张完整照片。`;
            }
            return `[参考图1=${t.itemLabel}，参考图2=模特底图。以参考图2为底图，保持参考图2模特的面部、五官、发型、身材、姿势、肤色与场景背景、灯光完全不变，不得更换模特或重新生成人物；仅将参考图1中的${t.item}（颜色、图案、材质、版型）${t.action}参考图2模特身上，保持细节不变，自然贴合垂坠，光影与参考图2一致。]\n\n用户提示词：`;
          };

          // 色彩保真：根据 task.colorLevel/colorScope/colorIntensity 生成防偏色指令后缀
          buildColorPreserveSuffix = (): string => {
            const level = task.colorLevel;
            if (!level) return '';
            const scope = task.colorScope || [];
            const intensity = task.colorIntensity ?? 75;
            const levelText = level === 'ultra' ? '极致还原' : level === 'high' ? '高保真' : '标准';
            // 换背景场景（图1=人物原图，图2=背景图）：色彩保真文案必须围绕"人物参照图1、背景参照图2"编写，
            // 避免通用文案（"肤色与参考图2一致"）误导模型把背景图当主体重绘
            if (isBgSwap) {
              const bgScopeMap: Record<string, string> = {
                clothes: '保持图1人物所穿服装的颜色、图案、材质完全不变，禁止偏色、变色、褪色',
                skin: '保持图1人物肤色自然真实，与图1原图完全一致，禁止偏色、过曝、苍白、泛红',
                bg: '保持图2背景的颜色、色调、明暗与图2原图完全一致，禁止偏色、变色',
                light: '保持图1原拍摄光线色温，禁止色温漂移、过度偏暖或偏冷',
                wb: '白平衡中性准确，禁止色偏、滤镜色、饱和度异常',
                nored: '禁止整体偏红、泛红、红色色温漂移、面部潮红，保持中性白平衡，画面不得偏暖红',
              };
              const bgParts: string[] = [];
              if (scope.length > 0) {
                scope.forEach(s => { if (bgScopeMap[s]) bgParts.push(bgScopeMap[s]); });
              } else {
                bgParts.push(bgScopeMap.skin!, bgScopeMap.bg!);
              }
              if (bgParts.length === 0) return '';
              return `\n\n【色彩保真·${levelText}】${bgParts.join('；')}。整体色彩还原度${intensity}%，禁止色彩漂移、滤镜化。`;
            }
            const scopeMap: Record<string, string> = {
              clothes: '严格保持参考图1服装的原始颜色、色相、饱和度、明度完全不变，禁止偏红、偏黄、偏绿、偏蓝、褪色、变色、色偏',
              skin: '模特肤色保持自然真实，与参考图2一致，禁止偏色、过曝、苍白、色偏',
              bg: '背景颜色与光线色调与参考图2一致，禁止偏色',
              light: '保持原拍摄光线色温，禁止色温漂移、过度偏暖或偏冷',
              wb: '白平衡中性准确，禁止色偏、滤镜色、饱和度异常',
              nored: '禁止整体偏红、泛红、红色色温漂移、面部潮红，保持中性白平衡，画面不得偏暖红',
            };
            const parts: string[] = [];
            if (scope.length > 0) {
              scope.forEach(s => { if (scopeMap[s]) parts.push(scopeMap[s]); });
            } else {
              parts.push(scopeMap.clothes!, scopeMap.skin!);
            }
            if (task.lockClothesHue) {
              parts.push('服装色相对比参考图1严格锁定，色相偏移不超过3度，不得偏色');
            }
            if (parts.length === 0) return '';
            return `\n\n【色彩保真·${levelText}】${parts.join('；')}。整体色彩还原度${intensity}%，禁止色彩漂移、滤镜化。`;
          };

          // eslint-disable-next-line no-console
          logger.info(`${debugPrefix} 🖼️ 全部 ${imageEditFiles.length} 张参考图处理完成`);
        } catch (e) {
          // eslint-disable-next-line no-console
          logger.error(`${debugPrefix} ❌ 参考图处理失败:`, String(e));
          isImageEditMode = false;
        }
      }

      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 生成模式:`, String(isImageEditMode ? '🖼️ 图生图模式（有参考图）' : '📝 文生图模式（无参考图）'));
      if (isImageEditMode && imageEditFiles.length > 0) {
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 参考图文件列表:`, JSON.stringify(imageEditFiles.map((f, i) => `[${i + 1}] ${f.name} (${(f.size / 1024).toFixed(1)}KB, ${f.type})`)));
      }

      // ===== 调试日志 Step 3: 请求体 =====
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 请求体 (body):`, JSON.stringify(body, null, 2));

      // 拼接请求 URL（尝试多种路径，提高兼容性）—— 图生图模式优先 edits
      const rawBaseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
      // 检查 baseUrl 是否已经包含 /v1 后缀，避免重复拼接导致 /v1/v1/xxx
      const hasV1Suffix = /\/v1$/.test(rawBaseUrl);
      const baseWithoutV1 = rawBaseUrl.replace(/\/v1$/, '');
      // 构建 endpoints 列表（按优先级排序）
      const endpoints: string[] = [];
      if (isImageEditMode) {
        // 图生图模式：根据配置的 imageEditMode 选择策略
        const mode = apiConfig.imageEditMode || 'auto';
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 🖼️ 图生图模式: ${mode}`);

        const buildEditEndpoints = (): string[] => {
          if (hasV1Suffix) {
            return [
              `${rawBaseUrl}/images/edits`,
              `${baseWithoutV1}/v1/images/edits`,
            ];
          }
          return [
            `${rawBaseUrl}/v1/images/edits`,
            `${rawBaseUrl}/images/edits`,
          ];
        };

        const buildGenEndpoints = (): string[] => {
          if (hasV1Suffix) {
            return [
              `${rawBaseUrl}/images/generations`,
              `${baseWithoutV1}/v1/images/generations`,
            ];
          }
          return [
            `${rawBaseUrl}/v1/images/generations`,
            `${rawBaseUrl}/images/generations`,
          ];
        };

        const buildVarEndpoints = (): string[] => {
          if (hasV1Suffix) {
            return [
              `${rawBaseUrl}/images/variations`,
              `${baseWithoutV1}/v1/images/variations`,
            ];
          }
          return [
            `${rawBaseUrl}/v1/images/variations`,
            `${rawBaseUrl}/images/variations`,
          ];
        };

        const buildChatEndpoints = (): string[] => {
          if (hasV1Suffix) {
            return [
              `${rawBaseUrl}/chat/completions`,
              `${baseWithoutV1}/v1/chat/completions`,
            ];
          }
          return [
            `${rawBaseUrl}/v1/chat/completions`,
            `${rawBaseUrl}/chat/completions`,
          ];
        };

        if (mode === 'edits') {
          endpoints.push(...buildEditEndpoints());
        } else if (mode === 'generations') {
          endpoints.push(...buildGenEndpoints());
        } else if (mode === 'variations') {
          endpoints.push(...buildVarEndpoints());
        } else if (mode === 'chat') {
          endpoints.push(...buildChatEndpoints());
        } else if (isDualSlotTryon) {
          // 双槽款式上身：按各模型家族原生多图参考能力选首选端点（研究结论：）
          // - gpt-image：/images/edits 多图 formdata（重复 append image，第1张=底图）
          // - Nano Banana/Gemini：/chat/completions 多模态（交错图标签）
          // - 火山 Seedream：/images/generations + 顶层 image 数组
          // - Grok：/images/edits JSON images 数组；Wan：多模态 chat
          if (dualIsGoogle) {
            // Google/Nano Banana：走 generations 端点 + size 像素（2026-10-12 备份 5c7df2b 用户确认能出 2K/4K）。
            // 注意：chat/completions 多模态下该中转忽略一切尺寸字段、强制输出 1K(896×1200)，故不能用 chat。
            // 双槽 generations 多图 images 数组能将图1款式+图2模特都传给上游（昨天实测结果正确）。
            endpoints.push(buildGenEndpoints()[0]);
          } else if (dualIsVolc) {
            endpoints.push(buildGenEndpoints()[0]);
          } else if (dualIsOpenAIImage) {
            endpoints.push(buildEditEndpoints()[0]);
          } else if (dualIsGrok) {
            endpoints.push(buildEditEndpoints()[0]);
          } else if (dualIsWan) {
            endpoints.push(buildChatEndpoints()[0]);
          } else {
            endpoints.push(buildEditEndpoints()[0]);
          }
          // eslint-disable-next-line no-console
          logger.info(`${debugPrefix} 👕 双槽端点策略：${endpoints.map(e => e.split('/v1/').pop() || e.split('/').pop()).join(' → ')}`);
        } else {
          // auto：根据模型类型决定优先顺序（修复：此前只计算 presetKey 未向 endpoints 添加任何端点，
          // 导致图生图端点数组为空、请求从未发出，报"所有图生图端点均不可用"）
          const presetKeyForEndpoint = matchModelPresetKey(task.model);
          const presetLower = (presetKeyForEndpoint || '').toLowerCase();
          const isGptImage = presetLower.includes('gpt-image');
          const isChatModel = presetLower.includes('grok') || presetLower.includes('gemini') || presetLower.includes('nano-banana');
          // 火山即梦/Seedream 系（jimeng-5.0 / seedream-5.0-*）：官方图生图为 /images/generations（GenerateImages），
          // size 支持 2K/4K 像素。edits 端点不识别 4K 像素，会把尺寸降档（如 3520×4704 被降为 2048×2048 1:1）。
          const isVolcImage = presetLower.includes('jimeng') || presetLower.includes('seedream');
          if (isDualSlotTryon) {
            // 双槽功能（换脸/款式上身/换背景）：只试首选端点一个URL，避免多端点探测扣费
            endpoints.push(buildEditEndpoints()[0]);
          } else if (isGptImage) {
            // OpenAI gpt-image 系：图生图标准端点为 /images/edits
            endpoints.push(buildEditEndpoints()[0]);
          } else if (isChatModel) {
            // 多模态 chat 模型：Grok 走 chat 端点；
            // Gemini/Nano Banana 图生图改走 generations + size 像素（chat 下中转忽略尺寸强制 1K）
            const isGeminiLike = presetLower.includes('gemini') || presetLower.includes('nano-banana');
            if (isGeminiLike) {
              endpoints.push(buildGenEndpoints()[0]);
            } else {
              endpoints.push(buildChatEndpoints()[0]);
            }
          } else if (isVolcImage) {
            // 火山即梦/Seedream：走 generations 端点 + size 像素（支持 2K/4K，不降档）
            endpoints.push(buildGenEndpoints()[0]);
          } else {
            // 其他模型：edits 端点
            endpoints.push(buildEditEndpoints()[0]);
          }
        }
        } else {
          // 文生图模式：只试一个端点，避免多端点探测扣费
          if (hasV1Suffix) {
            endpoints.push(`${rawBaseUrl}/images/generations`);
          } else {
            endpoints.push(`${rawBaseUrl}/v1/images/generations`);
          }
        }

      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 原始 baseUrl:`, String(rawBaseUrl));
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 是否含 /v1 后缀:`, String(hasV1Suffix));
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 将尝试的 endpoints:`, String(endpoints));

      // ===== 成功配置缓存：有缓存时直接用，跳过端点和变体探测 =====
      // 按图生图 / 文生图分别缓存，避免互相混淆
      // 改色+用户蒙版：mask 仅在 edits 端点支持（generations 不支持 mask 且大 base64 易触发服务端断连），
      // 必须强制走 edits，禁用一切端点/策略缓存，否则蒙版失效并可能重复扣费
      const forceEditsForMask = task.featureId === 'design-recolor' && task.maskEnabled && !!task.maskDataUrl;
      const cacheEndpointKey = isImageEditMode ? 'cachedImageEndpoint' : 'cachedTextEndpoint';
      const cacheFailuresKey = isImageEditMode ? 'cachedImageEndpointFailures' : 'cachedTextEndpointFailures';
      const cachedEndpointUrl = isImageEditMode ? apiConfig.cachedImageEndpoint : apiConfig.cachedTextEndpoint;
      const cachedFailures = isImageEditMode ? (apiConfig.cachedImageEndpointFailures ?? 0) : (apiConfig.cachedTextEndpointFailures ?? 0);
      const hasEndpointCache = !!cachedEndpointUrl && cachedFailures < 2;

      const effectiveEndpoints: string[] = [];
      // 双槽款式上身 / 改色带蒙版：跳过单图端点缓存，强制按双图/蒙版策略走 edits，
      // 避免单图成功形状与双图/mask 不匹配、或缓存把蒙版带到不支持的 generations
      if (!isDualSlotTryon && !forceEditsForMask && hasEndpointCache && cachedEndpointUrl) {
        // 端点规范化：旧版本可能缓存了单数 /images/edit，自动转为复数 /images/edits
        let normalizedEndpoint = cachedEndpointUrl;
        if (normalizedEndpoint.endsWith('/images/edit') && !normalizedEndpoint.endsWith('/images/edits')) {
          normalizedEndpoint = normalizedEndpoint.replace(/\/images\/edit$/, '/images/edits');
          logger.info(`${debugPrefix} 🔧 缓存端点已规范化: ${cachedEndpointUrl} → ${normalizedEndpoint}`);
        }
        effectiveEndpoints.push(normalizedEndpoint);
        logger.info(`${debugPrefix} 💾 使用缓存端点 [${isImageEditMode ? '图生图' : '文生图'}]:`, String(normalizedEndpoint));
      } else {
        effectiveEndpoints.push(...endpoints);
      }

      let images: string[] = [];
      let triedEndpoints = 0;
      let successEndpoint = '';
      let successVariantBody: Record<string, unknown> | null = null;
      // 记录主请求实际成功的图生图配置（补齐时使用，确保配置一致）
      let successFieldName = '';
      let successMode = '';
      let successExtraParams: Record<string, string> = {};

      // ===== 统一图片结果解析函数 =====
      // 支持 OpenAI / images/edits / chat/completions 等多种响应格式
      const parseImagesFromResponse = (resp: unknown): string[] => {
        const result: string[] = [];
        if (!resp || typeof resp !== 'object') return result;
        const obj = resp as Record<string, any>;

        // 格式1: { data: [{ url, b64_json, revised_prompt }, ...] }  (OpenAI 标准)
        if (Array.isArray(obj.data)) {
          for (const item of obj.data) {
            if (item?.url) result.push(item.url);
            else if (item?.b64_json) result.push(`data:image/png;base64,${item.b64_json}`);
            else if (typeof item === 'string') result.push(item);
          }
        }

        // 格式2: { images: [url|{url}|{b64_json}, ...] }
        if (result.length === 0 && Array.isArray(obj.images)) {
          for (const img of obj.images) {
            if (typeof img === 'string') result.push(img);
            else if (img?.url) result.push(img.url);
            else if (img?.b64_json) result.push(`data:image/png;base64,${img.b64_json}`);
          }
        }

        // 格式3: { output.results } / { results } / { items } / { list } / { image_list }
        if (result.length === 0) {
          const nestedKeys = ['output', ''];
          const arrKeys = ['results', 'items', 'list', 'image_list', 'data'];
          for (const nest of nestedKeys) {
            const container = nest ? (obj[nest] as Record<string, any> | undefined) : obj;
            if (!container || typeof container !== 'object') continue;
            for (const key of arrKeys) {
              const arr = container[key];
              if (Array.isArray(arr) && arr.length > 0) {
                for (const img of arr) {
                  if (typeof img === 'string') result.push(img);
                  else if (img?.url) result.push(img.url);
                  else if (img?.b64_json) result.push(`data:image/png;base64,${img.b64_json}`);
                }
                if (result.length > 0) break;
              }
            }
            if (result.length > 0) break;
          }
        }

        // 格式4: chat/completions 多模态 { choices: [{ message: { content: [...] | "string" } }] }
        if (result.length === 0 && Array.isArray(obj.choices)) {
          for (const choice of obj.choices) {
            const content = choice?.message?.content;
            if (Array.isArray(content)) {
              for (const part of content) {
                if (part?.image_url?.url) result.push(part.image_url.url);
                else if (part?.image_file?.url) result.push(part.image_file.url);
                else if (part?.image?.b64_json) result.push(`data:image/png;base64,${part.image.b64_json}`);
              }
            } else if (typeof content === 'string') {
              // content 是字符串：用正则提取所有 http(s) 图片URL
              const urlMatches = content.match(/https?:\/\/[^\s\)\]"']+\.(?:png|jpg|jpeg|webp|gif|bmp)[^\s\)\]"']*/gi);
              if (urlMatches) {
                for (const url of urlMatches) {
                  if (!result.includes(url)) result.push(url);
                }
              }
            }
          }
        }

        // 格式5: 根对象本身是字符串数组
        if (result.length === 0 && Array.isArray(obj) && typeof obj[0] === 'string') {
          return obj as string[];
        }

        // 格式6: { data: { images: [...] } } / { images: { url: ..., ... } } 更深层嵌套
        if (result.length === 0) {
          const deepFind = (node: unknown, depth: number): string[] => {
            if (depth > 5 || !node || typeof node !== 'object') return [];
            const found: string[] = [];
            const objNode = node as Record<string, any>;
            // 常见图片字段名
            const imageFieldKeys = ['url', 'image_url', 'imageUrl', 'b64_json', 'b64Json', 'base64', 'img', 'src'];
            for (const key of Object.keys(objNode)) {
              const val = objNode[key];
              if (Array.isArray(val)) {
                for (const item of val) {
                  if (typeof item === 'string' && (item.startsWith('http') || item.startsWith('data:image'))) {
                    found.push(item);
                  } else if (item && typeof item === 'object') {
                    found.push(...deepFind(item, depth + 1));
                  }
                }
                if (found.length > 0) break;
              } else if (val && typeof val === 'object') {
                if (imageFieldKeys.some(k => val[k] && (typeof val[k] === 'string'))) {
                  for (const k of imageFieldKeys) {
                    if (val[k] && typeof val[k] === 'string') {
                      const v = val[k];
                      if (v.startsWith('http') || v.startsWith('data:image')) {
                        if (k === 'b64_json' || k === 'b64Json' || k === 'base64') {
                          found.push(`data:image/png;base64,${v}`);
                        } else {
                          found.push(v);
                        }
                      }
                    }
                  }
                }
                if (found.length === 0) {
                  found.push(...deepFind(val, depth + 1));
                }
              }
            }
            return found;
          };
          const deep = deepFind(obj, 0);
          if (deep.length > 0) result.push(...deep);
        }

        // 去重（同一响应可能被多个格式匹配到相同图片）
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const url of result) {
          if (!seen.has(url)) {
            seen.add(url);
            deduped.push(url);
          }
        }

        return deduped;
      };

      // ===== 请求体降级阶梯 / 标准尺寸降级：已移至 src/lib/api/requestUtils.ts =====
      const bodyVariants = buildBodyVariants(body);
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 将尝试 ${bodyVariants.length} 种请求体降级方案:`, String(bodyVariants.map(v => v.label)));

      let endpointSucceeded = false;

      // 外层：遍历 endpoint（有缓存时只有 1 个）
      for (const endpoint of effectiveEndpoints) {
        triedEndpoints++;
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 📡 尝试端点 [${triedEndpoints}/${endpoints.length}]:`, String(endpoint));

        // 内层：对每个 endpoint 尝试多种请求体变体（降级阶梯）
        for (let vi = 0; vi < bodyVariants.length; vi++) {
          const variant = bodyVariants[vi];
          // eslint-disable-next-line no-console
          logger.info(`${debugPrefix}   🧪 请求体变体 [${vi + 1}/${bodyVariants.length}]: ${variant.label}`);
          // eslint-disable-next-line no-console
          logger.info(`${debugPrefix}   请求体:`, JSON.stringify(variant.body, null, 2));

          try {
            let requestBody: BodyInit = JSON.stringify(variant.body);
            const requestHeaders: Record<string, string> = {
              'Authorization': `Bearer ${apiConfig.apiKey}`,
              'Accept': 'application/json',
            };

            // 图生图模式：按优先级尝试多种方式
            // 优先级：generations(JSON base64) → generations(FormData) → chat多模态 → edits+mask → edits → variations
            const isImagesEndpoint =
              endpoint.includes('/images/edit') ||
              endpoint.includes('/images/edits') ||
              endpoint.includes('/images/variations') ||
              endpoint.includes('/images/variation') ||
              endpoint.includes('/images/generations');
            const isChatEndpoint = endpoint.includes('/chat/completions');
            const useImageEditFlow = isImageEditMode && (isImagesEndpoint || isChatEndpoint) && imageEditFiles.length > 0;

            let fieldResult: { res: Response; responseText: string } | null = null;
            let succeededFieldName = '';
            let succeededMode = '';
            let succeededExtraParams: Record<string, string> = {};

            if (useImageEditFlow) {
              // ========== 图生图：构建尝试策略（按优先级排序）==========
              type ImageEditAttempt = {
                label: string;
                mode: string;
                format: 'formdata' | 'json' | 'chat';
                fieldName: string;
                extraParams: Record<string, string>;
              };
              const attempts: ImageEditAttempt[] = [];

              const isGenEndpoint = endpoint.includes('/images/generations');
              const isVarEndpoint = endpoint.includes('/images/variations');
              const isEditEndpoint = endpoint.includes('/images/edit');
              const strength = (apiConfig.imageEditStrength ?? 0.75).toString();

              const cachedStrategy = apiConfig.cachedImageEditStrategy;
              const hasValidCache = !!cachedStrategy && (apiConfig.cachedImageEditStrategyFailures || 0) < 3;

              // 如果有缓存且命中当前端点类型，直接用缓存策略（只尝试1种，加速）
              // 双槽款式上身：跳过策略缓存，按家族原生双图形状重新探测（单图成功形状≠双图形状）
              // 改色带蒙版：mask 只在 edits 支持，跳过策略缓存强制走 edits
              let useCacheStrategy = false;
              if (!isDualSlotTryon && !forceEditsForMask && hasValidCache && cachedStrategy) {
                const cacheEndpointType = cachedStrategy.endpointType;
                if (
                  (cacheEndpointType === 'generations' && isGenEndpoint) ||
                  (cacheEndpointType === 'edits' && isEditEndpoint) ||
                  (cacheEndpointType === 'variations' && isVarEndpoint) ||
                  (cacheEndpointType === 'chat' && isChatEndpoint)
                ) {
                  useCacheStrategy = true;
                  // eslint-disable-next-line no-console
                  logger.info(`${debugPrefix}   💾 使用缓存策略: ${cachedStrategy.endpointType}/${cachedStrategy.format}, ` +
                    `field=${cachedStrategy.fieldName}`);
                }
              }

              if (useCacheStrategy && cachedStrategy) {
                // chat 模型（nano-banana/gemini/grok）图生图必须用 messages 多模态；
                // 历史缓存的 chat/json（顶层 prompt + image_url + response_format）不适配服务端，强制转 chat 多模态
                const chatPresetLower = String(matchModelPresetKey(task.model) || '').toLowerCase();
                const isChatModelPreset = chatPresetLower.includes('gemini') || chatPresetLower.includes('nano-banana') || chatPresetLower.includes('grok');
                if (isChatModelPreset && (cachedStrategy.endpointType || '').includes('chat')) {
                  attempts.push({
                    label: `缓存策略: chat多模态(messages, field=${cachedStrategy.fieldName})`,
                    mode: 'chat',
                    format: 'chat',
                    fieldName: cachedStrategy.fieldName,
                    extraParams: cachedStrategy.extraParams || {},
                  });
                } else {
                  // 只尝试缓存的那一种策略
                  attempts.push({
                    label: `缓存策略: ${cachedStrategy.endpointType}/${cachedStrategy.format} field=${cachedStrategy.fieldName}`,
                    mode: cachedStrategy.endpointType + '-' + cachedStrategy.format,
                    format: cachedStrategy.format === 'json' || cachedStrategy.format === 'chat'
                      ? cachedStrategy.format
                      : 'formdata',
                    fieldName: cachedStrategy.fieldName,
                    extraParams: cachedStrategy.extraParams || {},
                  });
                }
              } else if (isChatEndpoint && imageEditBase64List.length > 0) {
                // ====== chat/completions 多模态方式（多张参考图按顺序作为image_url content块）======
                attempts.push({
                  label: 'chat多模态（参考图+提示词）',
                  mode: 'chat',
                  format: 'chat',
                  fieldName: 'image_url',
                  extraParams: {},
                });
              } else if (isGenEndpoint) {
                // ====== generations 端点：图生图首选（先无mode兼容，再有mode标准）======

                // 第1优先级：JSON + base64 + image 字段（无mode，第三方平台兼容性最好）
                if (imageEditBase64List.length > 0) {
                  attempts.push({
                    label: 'JSON base64 · field=image（无mode）',
                    mode: 'generations-json',
                    format: 'json',
                    fieldName: 'image',
                    extraParams: {},
                  });
                }

                // 第2优先级：JSON + base64 + image 字段（含mode，GPT-Image官方标准）
                if (imageEditBase64List.length > 0) {
                  attempts.push({
                    label: 'JSON base64 · field=image（含mode）',
                    mode: 'generations-json',
                    format: 'json',
                    fieldName: 'image',
                    extraParams: { mode: 'image-to-image', image_weight: strength },
                  });
                }

                // 第3优先级：FormData + image 字段（无mode）
                attempts.push({
                  label: 'FormData · field=image（无mode）',
                  mode: 'generations-form',
                  format: 'formdata',
                  fieldName: 'image',
                  extraParams: {},
                });

                // 第4优先级：FormData + image 字段（含mode）
                attempts.push({
                  label: 'FormData · field=image（含mode）',
                  mode: 'generations-form',
                  format: 'formdata',
                  fieldName: 'image',
                  extraParams: { mode: 'image-to-image', image_weight: strength },
                });

                // 第5优先级：FormData + images 字段（部分API用复数）
                attempts.push({
                  label: 'FormData · field=images',
                  mode: 'generations-form',
                  format: 'formdata',
                  fieldName: 'images',
                  extraParams: {},
                });
              } else if (isEditEndpoint) {
                // ====== edits 端点：图像编辑 ======
                // 双槽功能（换脸/款式上身）：只保留 field=image 一种方案，失败直接报错，不盲目探测扣费
                if (isDualSlotTryon) {
                  attempts.push({
                    label: 'edits · field=image',
                    mode: 'edits',
                    format: 'formdata',
                    fieldName: 'image',
                    extraParams: {},
                  });
                } else {
                  // 普通图生图：只保留 field=image 一种方案，避免多变体探测扣费
                  // 服装改色且启用了用户蒙版：携带真实蒙版做区域重绘
                  const hasUserMask = task.featureId === 'design-recolor' && task.maskEnabled && task.maskDataUrl;
                  attempts.push({
                    label: hasUserMask ? 'edits 基础 · field=image（带用户蒙版）' : 'edits 基础 · field=image',
                    mode: 'edits',
                    format: 'formdata',
                    fieldName: 'image',
                    extraParams: hasUserMask ? { __useMask: 'true' } : {},
                  });
                }
              } else if (isVarEndpoint) {
                // ====== variations 端点（最不优先）======
                attempts.push({
                  label: 'variations · field=image（无prompt）',
                  mode: 'variations',
                  format: 'formdata',
                  fieldName: 'image',
                  extraParams: {},
                });
                attempts.push({
                  label: 'variations · field=images（无prompt）',
                  mode: 'variations',
                  format: 'formdata',
                  fieldName: 'images',
                  extraParams: {},
                });
              }

              // eslint-disable-next-line no-console
              logger.info(`${debugPrefix}   🖼️ 图生图策略：共 ${attempts.length} 种尝试方案 ` +
                `(endpoint=${endpoint.split('/').pop()}, cache=${useCacheStrategy ? 'ON' : 'off'})`);

              let fieldLastError = '';

              // 生成全透明 mask（用于 edits 端点）
              let maskFile: File | null = null;
              const getMaskFile = async (): Promise<File> => {
                if (maskFile) return maskFile;
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                maskFile = await new Promise<File>((resolve) => {
                  canvas.toBlob(
                    (blob) => resolve(new File([blob!], 'mask.png', { type: 'image/png' })),
                    'image/png',
                  );
                });
                return maskFile;
              };

              for (let ai = 0; ai < attempts.length; ai++) {
                const attempt = attempts[ai];
                // eslint-disable-next-line no-console
                logger.info(`${debugPrefix}   🖼️ 尝试 [${ai + 1}/${attempts.length}]: ${attempt.label}`);

                try {
                  let fieldRes: Response;
                  let fieldResponseText: string;

                  if (attempt.format === 'chat') {
                    // ===== chat/completions 多模态方式 =====
                    const refCount = imageEditBase64List.length;
                    let promptText = String(variant.body.prompt || '');
                    // 双槽：用 slot 感知指令；否则维持原有泛化编号
                    const dualInstr = buildDualSlotInstruction();
                    // 款式上身（shoot-tryon）双槽按模型取独立提示词：gpt 用 gptPrompt、gemini 用 geminiPrompt，
                    // 彻底分离不混用（gemini 需结构化强指令防重绘，gpt 简洁即可）
                    if (isDualSlotTryon && task.featureId === 'shoot-tryon') {
                      const tt = getFeatureTemplate(task.featureId)?.tryonTypes?.find(x => x.id === (task.tryonType || 'clothes'));
                      if (tt) {
                        if (dualIsGoogle && tt.geminiPrompt) promptText = tt.geminiPrompt;
                        else if (tt.gptPrompt) promptText = tt.gptPrompt;
                        else promptText = tt.prompt || promptText;
                      }
                    } else if (dualInstr) {
                      // 双槽 gemini/nano-banana（换背景/换脸/面料）：使用其专属指令作为唯一提示词，
                      // 不再叠加通用 prompt，避免与 gpt 的提示词混杂、减少模型误解（gpt 用 input_fidelity 锁身份，gemini 需独立指令）
                      if (isDualSlotTryon && dualIsGoogle) {
                        promptText = dualInstr;
                      } else {
                        promptText = dualInstr + promptText;
                      }
                    } else if (refCount > 1) {
                      const refLabels = Array.from({ length: refCount }, (_, i) => `参考图${i + 1}`).join('、');
                      promptText = `[共 ${refCount} 张参考图：${refLabels}，按顺序排列]\n${promptText}`;
                    }
                    // Gemini/nano-banana 走 chat 多模态，没有 gpt 的 input_fidelity 锁身份机制，
                    // 换装时容易重绘模特面部/表情。款式上身+gemini 时追加"像素级身份锁定"后缀，
                    // 把表情/神态/头部角度/姿态全部锁死，避免变成另一张脸（gpt 走 edits 端点不经过此分支）
                    if (task.featureId === 'shoot-tryon' && dualIsGoogle) {
                      promptText += '\n\n【最重要·像素级身份锁定】这是对图2这张照片的局部修改，只替换服装，不是重新生成照片。图2中人物的一切必须与图2原图完全一致、一个像素都不能改变：表情、眼神、神态、嘴角、眉毛、头型、头部角度与朝向、脸型、五官、发型、身材、姿势、手部动作、肤色，以及背景、场景、光线、色调、构图。禁止改变表情和神态、禁止换脸、禁止重绘整张照片、禁止调整整体色调。最终必须是与图2同一张脸、同一个表情、同一个头部角度、同一种姿势的同一张照片。';
                    }
                    const colorSuffix = buildColorPreserveSuffix();
                    if (colorSuffix) promptText = promptText + colorSuffix;
                    const chatContent: Array<Record<string, unknown>> = [];
                    if (isDualSlotTryon && imageEditBase64List.length >= 2) {
                      // Google/Gemini 官方最佳实践：每张图前插文字标签，再发图，最后放指令。
                      if (isFaceSwap) {
                        chatContent.push({ type: 'text', text: '图1（原模特底图）：' });
                        chatContent.push({ type: 'image_url', image_url: { url: imageEditBase64List[0] } });
                        chatContent.push({ type: 'text', text: '图2（目标人脸照片）：' });
                        chatContent.push({ type: 'image_url', image_url: { url: imageEditBase64List[1] } });
                        for (let ei = 2; ei < imageEditBase64List.length; ei++) {
                          chatContent.push({ type: 'text', text: `图${ei + 1}：` });
                          chatContent.push({ type: 'image_url', image_url: { url: imageEditBase64List[ei] } });
                        }
                        chatContent.push({ type: 'text', text: '指令：以图1为底图，保持图1的身材、姿势、发型、服装、背景完全不变，只把图1的面部替换成图2的脸，五官特征照搬图2。' + promptText });
                      } else if (isBgSwap) {
                        chatContent.push({ type: 'text', text: '图1（原图/含人物商品）：' });
                        chatContent.push({ type: 'image_url', image_url: { url: imageEditBase64List[0] } });
                        chatContent.push({ type: 'text', text: '图2（目标背景图）：' });
                        chatContent.push({ type: 'image_url', image_url: { url: imageEditBase64List[1] } });
                        for (let ei = 2; ei < imageEditBase64List.length; ei++) {
                          chatContent.push({ type: 'text', text: `图${ei + 1}：` });
                          chatContent.push({ type: 'image_url', image_url: { url: imageEditBase64List[ei] } });
                        }
                        chatContent.push({ type: 'text', text: '指令：保持图1主体每个像素完全不变，只把图1的背景替换成图2的背景场景，主体颜色和光影与图1一致。' + promptText });
                      } else {
                        const chatTypeMap: Record<string, string> = {
                          clothes: '衣服款式图', pants: '裤子款式图', inner: '内搭款式图',
                          skirt: '裙子款式图', accessory: '配饰图（包/帽/围巾/首饰）', shoes: '鞋子款式图',
                        };
                        const chatItemMap: Record<string, string> = {
                          clothes: '衣服', pants: '裤子', inner: '内搭', skirt: '裙子',
                          accessory: '配饰佩戴到', shoes: '鞋子',
                        };
                        const chatLabel = chatTypeMap[task.tryonType || 'clothes'] || '衣服款式图';
                        const chatItem = chatItemMap[task.tryonType || 'clothes'] || '衣服';
                        chatContent.push({ type: 'text', text: `图1（${chatLabel}）：` });
                        chatContent.push({ type: 'image_url', image_url: { url: imageEditBase64List[0] } });
                        chatContent.push({ type: 'text', text: '图2（模特照片底图）：' });
                        chatContent.push({ type: 'image_url', image_url: { url: imageEditBase64List[1] } });
                        for (let ei = 2; ei < imageEditBase64List.length; ei++) {
                          chatContent.push({ type: 'text', text: `图${ei + 1}：` });
                          chatContent.push({ type: 'image_url', image_url: { url: imageEditBase64List[ei] } });
                        }
                        // 款式上身双槽：图片标签 + 模型专属提示词（gemini/gpt 独立，不叠加通用指令）
                        if (task.featureId === 'shoot-tryon') {
                          chatContent.push({ type: 'text', text: promptText });
                        } else {
                          chatContent.push({ type: 'text', text: `指令：将图1的${chatItem}${chatItem === '配饰佩戴到' ? '' : '穿'}到图2模特身上，保持图2模特的脸、姿势、背景不变，只换${chatItem}。` + promptText });
                        }
                      }
                    } else {
                      chatContent.push({ type: 'text', text: promptText });
                      imageEditBase64List.forEach((b64) => {
                        chatContent.push({ type: 'image_url', image_url: { url: b64 } });
                      });
                    }
                    const chatBody: Record<string, unknown> = {
                      model: variant.body.model,
                      n: variant.body.n || 1,
                      messages: [
                        {
                          role: 'user',
                          content: chatContent,
                        },
                      ],
                    };
                    // nano-banana/gemini 图生图（OpenAI 兼容 chat/completions 多模态）：
                    // 图生图 chat/completions 端点：中转(ai.t8star)只认 size 像素字段（如 "1792x2400"），
                    // 不认 image_size/generationConfig/extra_body（image_size 仅文生图/ images 接口用）。
                    // 2026-10-12 15:52 实测确认：图生图 chat 只发 size 像素即可出正确分辨率(2K/4K)。
                    // 直接从 task.ratio 解析像素强制设置，不依赖 variant.body.size（避免该字段在 chat 分支读取为 undefined）。
                    const pm = task.ratio.match(/(\d+)\s*[x×X]\s*(\d+)/);
                    if (pm) {
                      chatBody.size = `${pm[1]}x${pm[2]}`;
                    } else if (variant.body.size) {
                      chatBody.size = variant.body.size;
                    }
                    // 诊断：确认尺寸参数是否真正进入 chat body（不被 300 字符截断隐藏）
                    // eslint-disable-next-line no-console
                    logger.info(`${debugPrefix}   chat body 尺寸参数: model=${String(chatBody.model)} image_size=${JSON.stringify(chatBody.image_size)} aspect_ratio=${JSON.stringify(chatBody.aspect_ratio)} size=${JSON.stringify(chatBody.size)} generationConfig=${JSON.stringify(chatBody.generationConfig)} extra_body=${JSON.stringify(chatBody.extra_body)} contentBlocks=${Array.isArray((chatBody.messages as any)?.[0]?.content) ? (chatBody.messages as any)[0].content.length : 0}`);
                    requestHeaders['Content-Type'] = 'application/json';
                    // eslint-disable-next-line no-console
                    logger.info(`${debugPrefix}   chat/completions body:`, String(JSON.stringify(chatBody).slice(0, 300) + '...'));

                    fieldRes = await fetchWithTimeout(endpoint, {
                      method: 'POST',
                      mode: 'cors',
                      headers: requestHeaders,
                      body: JSON.stringify(chatBody),
                    });
                    fieldResponseText = await fieldRes.text();
                  } else if (attempt.format === 'formdata') {
                    const fd = new FormData();

                    // 方式A（标准多文件）：同一字段名多次 append
                    // 多数后端框架会自动解析为数组（如 Express multer、Fastify files）
                    // 改色+用户蒙版：edits 必须 image 与 mask 严格 1:1 对齐才能让蒙版区域锁定生效。
                    // 双槽改色(原图base+色图color)若两张都 append 到 image，单张 mask 无法正确对应原图，
                    // 会导致蒙版失效或把色图当主图。因此带蒙版时只发 base 原图（色图信息由提示词【选色】携带）。
                    const maskExclusiveFiles = (attempt.extraParams.__useMask === 'true' && task.featureId === 'design-recolor' && task.maskEnabled)
                      ? imageEditFiles.slice(0, 1)
                      : imageEditFiles;
                    logger.info(`${debugPrefix}   📦 FormData 参考图数量=${imageEditFiles.length}, 字段名=${attempt.fieldName}` +
                      `${maskExclusiveFiles.length < imageEditFiles.length ? '（改色+蒙版：仅发原图 base 与 mask 对齐）' : ''}`);
                    maskExclusiveFiles.forEach((file, idx) => {
                      fd.append(attempt.fieldName, file, file.name);
                      logger.info(`${debugPrefix}     [${idx + 1}] append ${attempt.fieldName}: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
                    });

                    // 多图时不追加 images[0]/image_0 等冗余字段，避免后端解析错误
                    // 只靠同一字段名多次append，多数后端框架会自动解析为数组

                    // 打印 FormData 条目（调试用）
                    const fdEntries = Array.from(fd.entries());
                    logger.info(`${debugPrefix}   📋 FormData 条目数=${fdEntries.length}`);
                    fdEntries.forEach((entry, i) => {
                      const [k, v] = entry;
                      const vInfo = v instanceof File ? `File: ${v.name} (${(v.size / 1024).toFixed(1)}KB)` : String(v).slice(0, 50);
                      logger.info(`${debugPrefix}     [${i}] ${k} = ${vInfo}`);
                    });

                    // edits 端点加 mask：有用户蒙版则用真实蒙版（白=重绘），否则全透明（编辑整张图）
                    if (attempt.extraParams.__useMask === 'true') {
                      if (task.maskEnabled && task.maskDataUrl && task.featureId === 'design-recolor') {
                        // 用户涂抹的真实蒙版：base64 dataURL -> File
                        try {
                          // inpaint 模型要求 mask 与 image 严格同尺寸，需把用户蒙版缩放到压缩后 image 的尺寸
                          let maskFile = await maskDataUrlToFile(task.maskDataUrl);
                          if (isInpaintModel && imageEditFiles.length > 0) {
                            try {
                              const target = await getImageNaturalSize(imageEditFiles[0]);
                              maskFile = await resizeMaskFile(maskFile, target.width, target.height);
                            } catch (e) {
                              logger.warn(`${debugPrefix}   ⚠️ 蒙版缩放失败，使用原始蒙版:`, String(e));
                            }
                          }
                          fd.append('mask', maskFile, maskFile.name);
                        } catch (e) {
                          logger.warn(`${debugPrefix}   ⚠️ 用户蒙版解析失败，回退全透明mask:`, String(e));
                          const mask = await getMaskFile();
                          fd.append('mask', mask, mask.name);
                        }
                      } else {
                        const mask = await getMaskFile();
                        fd.append('mask', mask, mask.name);
                      }
                    }

                    // 图生图关键参数：mode + image_weight（只有attempt明确要求时才添加）
                    if (isGenEndpoint && attempt.extraParams.mode) {
                      fd.append('mode', attempt.extraParams.mode);
                      fd.append('image_weight', attempt.extraParams.image_weight || strength);
                    } else if (isEditEndpoint && !modelLower.includes('gpt-image') && !isInpaintModel) {
                      fd.append('strength', strength);
                    }
                    // 双槽 gpt-image：input_fidelity=high 锁定模特五官/身份，避免重新生成新脸
                    // 【隔离边界】以下逻辑仅属于 gpt-image 系（dualIsOpenAIImage）：
                    //   gemini/nano-banana 不经过此分支（它们走 generations-json 拼图分支，见 L1843 附近）；
                    //   修改 gpt 行为只在此分支内进行，禁止改动 gemini/volc 分支。
                    if (isDualSlotTryon && dualIsOpenAIImage) {
                      fd.append('input_fidelity', 'high');
                    }

                    // variations 端点不需要 prompt
                    if (!isVarEndpoint && attempt.extraParams.__useMask !== 'true' ? true : !isVarEndpoint) {
                      let promptText = String(variant.body.prompt || '');
                      // 款式上身（shoot-tryon）双槽按模型取独立提示词（gpt-image 走 edits formdata 也生效）
                      if (isDualSlotTryon && task.featureId === 'shoot-tryon') {
                        const tt = getFeatureTemplate(task.featureId)?.tryonTypes?.find(x => x.id === (task.tryonType || 'clothes'));
                        if (tt) {
                          if (dualIsOpenAIImage && tt.gptPrompt) promptText = tt.gptPrompt;
                          else if (dualIsGoogle && tt.geminiPrompt) promptText = tt.geminiPrompt;
                          else promptText = tt.prompt || promptText;
                        }
                      } else {
                        // 双槽：用 slot 感知指令；否则维持原有泛化编号
                        const dualInstr = buildDualSlotInstruction();
                        if (dualInstr) {
                          promptText = dualInstr + promptText;
                        } else if (imageEditFiles.length > 1) {
                          const refLabels = Array.from({ length: imageEditFiles.length }, (_, i) => `参考图${i + 1}`).join('、');
                          promptText = `[共 ${imageEditFiles.length} 张参考图：${refLabels}，按顺序排列]\n${promptText}`;
                        }
                      }
                      const colorSuffix = buildColorPreserveSuffix();
                      if (colorSuffix) promptText = promptText + colorSuffix;
                      fd.append('prompt', promptText);
                    }
                    fd.append('model', String(variant.body.model || ''));
                    if (variant.body.n !== undefined) fd.append('n', String(variant.body.n));
                    if (variant.body.size) fd.append('size', String(variant.body.size));
                    if (variant.body.quality) fd.append('quality', String(variant.body.quality));
                    if (variant.body.negative_prompt) fd.append('negative_prompt', String(variant.body.negative_prompt));

                    // 额外参数（跳过内部标记 __useMask）
                    for (const [k, v] of Object.entries(attempt.extraParams)) {
                      if (k.startsWith('__')) continue;
                      fd.append(k, v);
                    }

                    // 日志
                    const entriesLog: Record<string, string> = {};
                    for (const [k, v] of fd.entries()) {
                      if (v instanceof File) {
                        entriesLog[k] = `[File: ${v.name}, ${(v.size / 1024).toFixed(1)}KB, ${v.type}]`;
                      } else {
                        entriesLog[k] = String(v);
                      }
                    }
                    // eslint-disable-next-line no-console
                    logger.info(`${debugPrefix}   FormData:`, JSON.stringify(entriesLog, null, 2));

                    fieldRes = await fetchWithTimeout(endpoint, {
                      method: 'POST',
                      mode: 'cors',
                      headers: requestHeaders,
                      body: fd,
                    });
                    fieldResponseText = await fieldRes.text();
                  } else {
                    // JSON + base64 方式（多图用 images 数组，单图用原字段名保持兼容）
                    const jsonBody: Record<string, unknown> = {
                      ...variant.body,
                    };
                    // 双槽：用 slot 感知结构化指令兜底；否则维持原有泛化编号
                    const dualInstr = buildDualSlotInstruction();
                    if (dualInstr && jsonBody.prompt) {
                      jsonBody.prompt = dualInstr + String(jsonBody.prompt);
                    } else if (imageEditBase64List.length > 1 && jsonBody.prompt) {
                      const refLabels = Array.from({ length: imageEditBase64List.length }, (_, i) => `参考图${i + 1}`).join('、');
                      jsonBody.prompt = `[共 ${imageEditBase64List.length} 张参考图：${refLabels}，按顺序排列]\n${String(jsonBody.prompt)}`;
                    }
                    // 双槽 gemini/nano-banana：generations 端点多图 images 数组被中转忽略、只认单图字段（丢图2），
                    // 故前端把「款式图(上)+模特图(下)」合成一张单图上传，保证两张图都到达且单图可出 2K/4K。
                    // 【隔离边界】以下逻辑仅属于 gemini/nano-banana 系（dualIsGoogle）：
                    //   gpt-image 不经过此分支（它们走 edits formdata 分支，见 L1770 附近）；
                    //   修改 gemini 行为只在此分支内进行，禁止改动 gpt/volc 分支。
                    let composedDual = false;
                    if (isDualSlotTryon && dualIsGoogle && imageEditBase64List.length >= 2) {
                      const composed = await composeTwoImagesToSingle(imageEditBase64List, 768, debugPrefix);
                      if (composed) {
                        composedDual = true;
                        jsonBody[attempt.fieldName] = composed;
                        // 拼图单图一次只能出 1 张：强制 n=1，避免请求 n=2 被上游按 n 扣费却只返回 1 张（扣费与结果不一致）。
                        // 若用户要多张，后续由"数量不足补齐"循环自动再发（见 L2277 补齐逻辑），不会漏张也不重复扣费。
                        if (jsonBody.n !== undefined) {
                          // eslint-disable-next-line no-console
                          logger.info(`${debugPrefix}   🧩 双槽 gemini 拼图单图强制 n: ${jsonBody.n} → 1（一次拼图只出 1 张，避免按 n 扣费）`);
                          jsonBody.n = 1;
                        }
                        const basePrompt = String(jsonBody.prompt || '');
                        // gemini/nano-banana 双槽款式上身：默认强加防泛红/中性白平衡约束（该系模型高频整体偏红），
                        // 不依赖用户开启色彩保真/自动校色开关，避免整图泛红。
                        const antiRed =
                          `整幅输出必须保持中性真实白平衡，禁止整体偏红、泛红、红色色温漂移、面部潮红、皮肤发红，` +
                          `禁止暖红滤镜、禁止红色通道溢出，下半部分模特肤色和背景颜色必须与拼图下半部分原图完全一致，不得偏暖红。`;
                        const colorSuffix = buildColorPreserveSuffix();
                        jsonBody.prompt =
                          `输入图片由上下两半组成：上半部分是衣服款式图，下半部分是模特照片底图。` +
                          `请把上半部分展示的衣服穿到下半部分模特的身上。` +
                          `严格保持下半部分模特每一个像素不变：面部五官、表情、发型、身材、姿势、肤色、皮肤颜色、手上动作、鞋、背景、场景、光线、色调，全部不得重绘、不得偏色、禁止泛红。` +
                          `只改变下半部分模特身上的这一件衣服（款式、颜色、图案、材质来自上半部分）。` +
                          `最终只输出下半部分这位模特被换上该衣服后的完整照片，裁掉上半部分。` +
                          `这是换装不是重绘，禁止换脸、禁止改身材、禁止调整体色调。` +
                          antiRed +
                          (colorSuffix ? colorSuffix : '') +
                          (basePrompt ? `\n用户补充要求：${basePrompt}` : '');
                        // eslint-disable-next-line no-console
                        logger.info(`${debugPrefix}   🧩 双槽 gemini 已合成单图上传（上款式/下模特），prompt 已改写为拼图指令`);
                      }
                    }
                    if (imageEditBase64List.length === 1) {
                      jsonBody[attempt.fieldName] = imageEditBase64List[0];
                    } else if (isDualSlotTryon && dualIsVolc) {
                      // 火山 Seedream：顶层 image 字段直接传数组（图1衣服, 图2模特底图），官方多图参考格式
                      jsonBody.image = imageEditBase64List.slice(0, 14);
                    } else if (!composedDual) {
                      // 多图：images 数组字段；同时保留第一张用原字段名（部分API只认单图字段）
                      jsonBody.images = imageEditBase64List;
                      jsonBody[attempt.fieldName] = imageEditBase64List[0];
                    }
                    // 图生图关键参数：mode + image_weight（只有attempt明确要求时才添加，避免第三方平台不支持导致失败）
                    if (isGenEndpoint && attempt.extraParams.mode) {
                      jsonBody.mode = attempt.extraParams.mode;
                      jsonBody.image_weight = attempt.extraParams.image_weight || strength;
                    } else if (isEditEndpoint && !modelLower.includes('gpt-image')) {
                      jsonBody.strength = strength;
                    }
                    requestHeaders['Content-Type'] = 'application/json';
                    // eslint-disable-next-line no-console
                    logger.info(`${debugPrefix}   JSON body keys: ${Object.keys(jsonBody).join(', ')}`, `(images count=${imageEditBase64List.length}, total base64 chars=${imageEditBase64List.reduce((s, b) => s + b.length, 0)})`);

                    fieldRes = await fetchWithTimeout(endpoint, {
                      method: 'POST',
                      mode: 'cors',
                      headers: requestHeaders,
                      body: JSON.stringify(jsonBody),
                    });
                    fieldResponseText = await fieldRes.text();
                  }

                  // eslint-disable-next-line no-console
                  logger.info(`${debugPrefix}   响应: HTTP ${fieldRes.status} ${fieldRes.statusText}`);

                  if (fieldRes.ok) {
                    // 成功：检查 revised_prompt 验证参考图是否生效
                    let revisedPrompt = '';
                    try {
                      const parsed = JSON.parse(fieldResponseText);
                      revisedPrompt =
                        parsed?.data?.[0]?.revised_prompt ||
                        parsed?.revised_prompt ||
                        '';
                    } catch { /* ignore */ }

                    if (revisedPrompt) {
                      // eslint-disable-next-line no-console
                      logger.info(`${debugPrefix}   📝 revised_prompt:`, String(revisedPrompt));
                      // revised_prompt 与原提示词接近 → 参考图可能未生效（但仍算成功，不做失败判定）
                      const originalPrompt = String(variant.body.prompt || '').trim();
                      if (originalPrompt && revisedPrompt.length < originalPrompt.length * 1.2) {
                        // eslint-disable-next-line no-console
                        logger.warn(`${debugPrefix}   ⚠️ 可能参考图未生效：revised_prompt 与原提示词长度接近`);
                      }
                    } else {
                      // eslint-disable-next-line no-console
                      logger.info(`${debugPrefix}   ℹ️ 响应中无 revised_prompt 字段`);
                    }

                    fieldResult = { res: fieldRes, responseText: fieldResponseText };
                    succeededFieldName = attempt.fieldName;
                    succeededMode = attempt.mode;
                    succeededExtraParams = { ...attempt.extraParams };
                    delete succeededExtraParams.__useMask;
                    break;
                  }

                  const errInfo = parseErrorDetail(fieldResponseText);
                  const lower = fieldResponseText.toLowerCase();
                  const isFieldError =
                    lower.includes('missing required parameter') ||
                    lower.includes('required parameter') ||
                    lower.includes('image is required') ||
                    lower.includes('invalid_request') ||
                    lower.includes('unsupported') ||
                    lower.includes('not support') ||
                    fieldRes.status === 400 ||
                    fieldRes.status === 422;

                  // eslint-disable-next-line no-console
                  logger.warn(`${debugPrefix}   ⚠️ 失败: HTTP ${fieldRes.status} - ${errInfo.message || fieldResponseText.slice(0, 120)}`);

                  fieldLastError = `方案"${attempt.label}"失败: HTTP ${fieldRes.status} - ${errInfo.message || fieldResponseText.slice(0, 200)}`;

                  if (!isFieldError && fieldRes.status !== 404) {
                    lastError = `HTTP ${fieldRes.status}: ${errInfo.message || fieldResponseText.slice(0, 200)}`;
                    lastFullError = fieldResponseText;
                    break;
                  }
                  lastError = fieldLastError;
                  lastFullError = fieldResponseText;
                } catch (fetchErr) {
                  // eslint-disable-next-line no-console
                  logger.warn(`${debugPrefix}   ⚠️ 请求异常:`, String(fetchErr));
                  const fetchMsg = String(fetchErr instanceof Error ? fetchErr.message : fetchErr);
                  const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
                  // 网络级失败（连接被关闭/CORS/跨域/Failed to fetch/ERR_CONNECTION_CLOSED等）：
                  // 请求可能已到达服务器并计费，继续尝试下一个方案只会重复扣费且同样被拦截，立即中止
                  const isNetworkError =
                    fetchErr instanceof TypeError ||
                    /failed to fetch|networkerror|load failed|cors|network|err_connection/i.test(fetchMsg);
                  lastError = fetchMsg;
                  // 超时 / 网络错误：直接终止，不再尝试下一种策略，避免重复计费
                  if (isAbort || isNetworkError) {
                    throw fetchErr;
                  }
                  if (ai === attempts.length - 1) {
                    throw fetchErr;
                  }
                }
              }

              if (!fieldResult) {
                // 所有方案都失败
                // eslint-disable-next-line no-console
                logger.info(`${debugPrefix}   🔄 所有图生图方案失败，尝试下一个变体/端点...`);

                // 缓存策略失败计数
                if (useCacheStrategy && cachedStrategy) {
                  const failCount = (apiConfig.cachedImageEditStrategyFailures || 0) + 1;
                  if (failCount >= 3) {
                    updateApiConfig(apiConfig.id, {
                      cachedImageEditStrategy: undefined,
                      cachedImageEditStrategyFailures: 0,
                    });
                    // eslint-disable-next-line no-console
                    logger.info(`${debugPrefix}   🗑️ 缓存策略已失败${failCount}次，已清除`);
                  } else {
                    updateApiConfig(apiConfig.id, { cachedImageEditStrategyFailures: failCount });
                    // eslint-disable-next-line no-console
                    logger.info(`${debugPrefix}   ⚠️ 缓存策略失败，累计: ${failCount}/3`);
                  }
                }

                // 内容安全策略拒绝（HTTP 451 / content safety / safety policy）等"重试必再被拒"的错误：
                // 内容未变，降级变体/换端点照样被拒，且每次请求都会计费 → 立即终止所有变体与端点，避免重复扣费
                if (
                  lastError &&
                  (lastError.includes('451') ||
                    /content safety|safety policy|rejected by the content/i.test(lastError))
                ) {
                  triedEndpoints = endpoints.length + 1;
                  throw new Error(lastError);
                }

                if (vi < bodyVariants.length - 1) continue;
                if (triedEndpoints < endpoints.length) break;
                throw new Error(lastError || '图生图请求失败');
              }

              // 成功
              // eslint-disable-next-line no-console
              logger.info(`${debugPrefix}   ✅ 图生图成功: mode=${succeededMode}, field="${succeededFieldName}"`);
              // 记录实际成功的配置到函数作用域，供补齐逻辑使用
              successFieldName = succeededFieldName;
              successMode = succeededMode;
              successExtraParams = { ...succeededExtraParams };

              // 缓存完整成功策略（endpoint类型 + 格式 + 字段名 + extraParams）
              if (!apiConfig.cachedImageEditStrategy && succeededMode) {
                let endpointType: 'generations' | 'edits' | 'variations' | 'chat' = 'generations';
                if (isChatEndpoint) endpointType = 'chat';
                else if (isGenEndpoint) endpointType = 'generations';
                else if (isEditEndpoint) endpointType = 'edits';
                else if (isVarEndpoint) endpointType = 'variations';

                const strategy = {
                  endpointType,
                  format:
                    succeededMode.includes('json') || succeededMode === 'chat'
                      ? ('json' as const)
                      : ('formdata' as const),
                  fieldName: succeededFieldName,
                  extraParams:
                    Object.keys(succeededExtraParams).length > 0
                      ? succeededExtraParams
                      : undefined,
                };
                updateApiConfig(apiConfig.id, {
                  cachedImageEditStrategy: strategy,
                  cachedImageEditStrategyFailures: 0,
                });
                // eslint-disable-next-line no-console
                logger.info(`${debugPrefix}   💾 已缓存图生图策略:`, JSON.stringify(strategy));
              }
              // 跳过后面的 fetch
            } else {
              // 文生图模式：JSON 请求体
              requestHeaders['Content-Type'] = 'application/json';
              requestBody = JSON.stringify(variant.body);
            }

            // 统一 res / responseText：图生图已在字段循环中获取，文生图这里发请求
            let res: Response;
            let responseText: string;
            if (useImageEditFlow && fieldResult) {
              res = fieldResult.res;
              responseText = fieldResult.responseText;
            } else {
              logger.info(`${debugPrefix}   📤 发送请求：文生图, endpoint=${endpoint}, body keys=${Object.keys(variant.body).join(',')}`);
              res = await fetchWithTimeout(endpoint, {
                method: 'POST',
                mode: 'cors',
                headers: requestHeaders,
                body: requestBody,
              });
              responseText = await res.text();
            }
            // eslint-disable-next-line no-console
            logger.info(`${debugPrefix}   响应状态:`, { arg0: res.status, arg1: res.statusText });
            logger.info(`${debugPrefix}   响应 headers:`, String(Object.fromEntries(res.headers.entries())));
            // eslint-disable-next-line no-console
            logger.info(`${debugPrefix}   响应完整文本:`, String(responseText));  // 完整打印不截断

            if (!res.ok) {
              const errInfo = parseErrorDetail(responseText);
              let errMsg = errInfo.message || errInfo.full.slice(0, 300);
              // 404 时附加更友好的提示 + 实际请求URL
              if (res.status === 404) {
                errMsg = `${errMsg || 'Invalid URL'}（请求地址: ${endpoint}）\nAPI路径不存在，请检查Base URL是否正确`;
              }
              lastError = `HTTP ${res.status}${errInfo.code ? ` [${errInfo.code}]` : ''}: ${errMsg}`;
              lastFullError = responseText;

              // eslint-disable-next-line no-console
              logger.warn(`${debugPrefix}   ❌ 请求失败:`, String(lastError));
              // eslint-disable-next-line no-console
              logger.warn(`${debugPrefix}   完整错误响应:`, String(responseText));

              // 内容安全策略拒绝（HTTP 451 / content safety / safety policy）等"重试必再被拒"的错误：
              // 内容未变，降级变体/换端点照样被拒，且每次请求都会计费 → 立即终止所有变体与端点，避免重复扣费
              const errMsgLower = errMsg.toLowerCase();
              if (
                res.status === 451 ||
                errMsgLower.includes('content safety') ||
                errMsgLower.includes('safety policy') ||
                errMsgLower.includes('rejected by the content')
              ) {
                lastError = `HTTP ${res.status}${errInfo.code ? ` [${errInfo.code}]` : ''}: ${errMsg}`;
                lastFullError = responseText;
                triedEndpoints = endpoints.length + 1;  // 终止所有端点重试
                break;  // 跳出变体循环，不再降级
              }

              // 无可用渠道（HTTP 503 / "无可用渠道" / "no available distributor" / "no available channel"）：
              // 上游该模型渠道不可用，重试/降级变体/换端点必再失败，且请求已计费 → 立即终止，避免重复扣费
              if (
                res.status === 503 ||
                errMsgLower.includes('无可用渠道') ||
                errMsgLower.includes('no available distributor') ||
                errMsgLower.includes('no available channel') ||
                errMsgLower.includes('channel not available')
              ) {
                lastError = `HTTP ${res.status}: ${errMsg}`;
                lastFullError = responseText;
                triedEndpoints = endpoints.length + 1;  // 终止所有端点重试
                break;  // 跳出变体循环，不再降级
              }

              // 如果是 invalid_request 类错误，且还有下一个变体，继续降级尝试
              if (isInvalidRequestError(res.status, errInfo) && vi < bodyVariants.length - 1) {
                // eslint-disable-next-line no-console
                logger.info(`${debugPrefix}   🔄 检测到 invalid_request，尝试下一个请求体变体...`);
                continue;
              }

              // 如果是 n>1 不支持的错误，跳出到 n=1 循环降级逻辑
              if (
                (task.imageCount || 1) > 1 &&
                (res.status === 400 ||
                  responseText.toLowerCase().includes('n must be') ||
                  responseText.toLowerCase().includes('only supports') ||
                  responseText.toLowerCase().includes('batch size'))
              ) {
                // eslint-disable-next-line no-console
                logger.info(`${debugPrefix} 检测到 n>1 不支持，跳出到 n=1 循环降级...`);
                // 标记让外层也跳出 endpoint 循环
                triedEndpoints = endpoints.length + 1;
                break;
              }

              // 404 / 401 / 405：跳过当前 endpoint，试下一个
              if (res.status === 404 || res.status === 401 || res.status === 405) {
                break;
              }

              // 其他错误且已经是最后一个变体：如果还有下一个 endpoint 继续，否则抛
              if (vi < bodyVariants.length - 1) {
                continue; // 再试试下一个变体
              }
              // endpoint 内所有变体都失败了，如果还有下一个 endpoint 就继续
              if (triedEndpoints < endpoints.length) {
                break; // 跳出变体循环，外层会继续下一个 endpoint
              }
              // 所有 endpoint 所有变体都失败了
              throw new Error(lastError);
            }

            // ===== 请求成功，解析响应 =====
            let data: any = null;
            try {
              data = JSON.parse(responseText);
            } catch (parseErr) {
              lastError = `响应不是有效 JSON: ${responseText.slice(0, 200)}`;
              lastFullError = responseText;
              // eslint-disable-next-line no-console
              logger.error(`${debugPrefix}   ❌ JSON解析失败:`, String(parseErr));
              continue; // 试试下一个变体？不太可能成功但保险起见
            }

            // eslint-disable-next-line no-console
            logger.info(`${debugPrefix}   ✅ 响应数据:`, String(data));

            // ===== 使用统一解析函数提取图片 =====
             const parsedImages = parseImagesFromResponse(data);
             // eslint-disable-next-line no-console
             logger.info(`${debugPrefix}   解析到图片数量:`, { arg0: parsedImages.length, arg1: `(请求 n=${body.n || 1})` });
             if (parsedImages.length === 0 && res.ok) {
               // 响应成功但解析不到图片 - 打印详细诊断信息，便于排查是API返回格式问题还是解析逻辑遗漏
               logger.warn(`${debugPrefix}   ⚠️ HTTP成功但未解析到图片，原始响应:`);
               logger.warn(`${debugPrefix}   响应完整内容前2000字符:`, String(responseText.slice(0, 2000)));
               logger.warn(`${debugPrefix}   响应顶层字段:`, String(Object.keys(data || {}).join(', ')));
               const dataVal = (data as any)?.data;
               if (dataVal) {
                 if (Array.isArray(dataVal)) {
                   logger.warn(`${debugPrefix}   data数组长度:`, { arg0: dataVal.length, arg1: dataVal[0] ? `首个元素keys: ${Object.keys(dataVal[0]).join(', ')}` : '空' });
                 } else if (typeof dataVal === 'object') {
                   logger.warn(`${debugPrefix}   data对象keys:`, String(Object.keys(dataVal).join(', ')));
                 }
               }
             }
             if (parsedImages.length > 0) {
              images = parsedImages;
              successEndpoint = endpoint;
              successVariantBody = { ...variant.body };
              endpointSucceeded = true;
              // eslint-disable-next-line no-console
              logger.info(`${debugPrefix} ✅ 成功！使用变体: ${variant.label}，端点: ${endpoint}`);

              // 缓存成功配置（端点URL + 变体索引），下次直接命中，跳过探测
              // 按图生图 / 文生图分别缓存，避免互相污染
              const cacheVariantKey = isImageEditMode ? 'cachedImageBodyVariantIndex' : 'cachedTextBodyVariantIndex';
              if (!cachedEndpointUrl || cachedFailures > 0) {
                const updates: Partial<IApiConfig> = {};
                (updates as any)[cacheEndpointKey] = endpoint;
                (updates as any)[cacheVariantKey] = vi;
                (updates as any)[cacheFailuresKey] = 0;
                updateApiConfig(apiConfig.id, updates);
                logger.info(`${debugPrefix} 💾 已缓存[${isImageEditMode ? '图生图' : '文生图'}]端点+变体: ${endpoint} (variant #${vi + 1})`);
              }

              break; // 跳出变体循环
            }
            // 响应成功但没解析到图片，试试下一个变体？不太可能，继续当前 endpoint 的下一个变体也不合理
            lastError = '响应成功但未找到图片数据（已尝试多种解析格式）';
            lastFullError = responseText;
            // 这种情况继续试下一个变体也没意义，跳出当前 endpoint
            break;
          } catch (e) {
            // 网络异常（CORS / 超时 等）
            const errMsg = String(e instanceof Error ? e.message : e);
            const isAbort = e instanceof Error && e.name === 'AbortError';
            // eslint-disable-next-line no-console
            logger.error(`${debugPrefix}   ❌ 请求异常:`, { errMsg: errMsg, e: e });

             if (isAbort) {
               lastError = `请求超时（已等待 ${GENERATE_TIMEOUT_MS / 1000} 秒）。4K/高质量大图生成可能需要更长时间，API 可能仍在后台处理中（已扣费）。请稍后在API后台查看结果，或降低分辨率/质量后重试。`;
               lastFullError = errMsg;
               break; // 超时跳出变体循环
             }

            if (
              errMsg.includes('Failed to fetch') ||
              errMsg.includes('NetworkError') ||
              errMsg.includes('TypeError: Failed to fetch') ||
              errMsg.toLowerCase().includes('cors') ||
              errMsg.includes('Load failed')
            ) {
              lastError = '网络错误/CORS跨域限制：浏览器无法直接请求该API。请检查API地址是否正确，或使用代理/在服务端转发请求，或配置API服务端允许跨域(CORS)。';
              lastFullError = errMsg;
              // 网络/CORS 失败：请求可能已到达服务器并计费，继续尝试其他端点只会重复扣费，
              // 立即终止所有端点/变体重试（triedEndpoints 置顶让外层 endpoint 循环结束）
              triedEndpoints = endpoints.length + 1;
              break; // CORS 错误不用试变体了，且不再尝试其他端点
            }

            // 如果是 HTTP 开头的错误（我们自己 throw 的），继续降级或换下一个 endpoint
            if (e instanceof Error && e.message.startsWith('HTTP')) {
              // 内容安全策略拒绝（451）等：重试其他端点必再被拒且重复计费，终止所有端点
              if (e.message.includes('451') || /content safety|safety policy|rejected by the content/i.test(e.message)) {
                triedEndpoints = endpoints.length + 1;
                break;
              }
              // 无可用渠道（503 / 无可用渠道 / no available distributor/channel）：必再失败且已计费，终止所有端点
              if (e.message.includes('503') || /无可用渠道|no available distributor|no available channel|channel not available/i.test(e.message)) {
                triedEndpoints = endpoints.length + 1;
                break;
              }
              // 这里是从 if (!res.ok) 分支 throw 出来的，已经处理过了
              // 如果还有下一个 endpoint，让外层继续
              break;
            }

            throw e;
          }
        }

        if (endpointSucceeded) break; // 跳出 endpoint 循环
      }


      // ===== 数量不足补齐：只要请求张数 > 已返回张数，就强制循环请求剩余张数 =====
      // 注意：补齐时 n=1，其他所有参数（含参考图）与成功请求保持完全一致
      const expectedCount = requestedCount;  // 用本次实际请求张数，避免追加模式下多扣费
      logger.info(`${debugPrefix} 📊 补齐检查：images.length=${images.length}, expectedCount=${expectedCount}(请求n=${requestedCount}, 总imageCount=${task.imageCount}), successEndpoint=${successEndpoint || '(空)'}`);
      if (images.length > 0 && images.length < expectedCount) {
        const remaining = expectedCount - images.length;
        // 如果 successEndpoint 为空，使用第一个端点兜底
        let fillEndpoint = successEndpoint || endpoints[0] || effectiveEndpoints[0] || '';
        // 补齐端点也做规范化
        if (fillEndpoint.endsWith('/images/edit') && !fillEndpoint.endsWith('/images/edits')) {
          fillEndpoint = fillEndpoint.replace(/\/images\/edit$/, '/images/edits');
        }
        logger.info(`${debugPrefix} 🔄 数量不足（已有 ${images.length}/${expectedCount}），强制补齐剩余 ${remaining} 张...`);
        logger.info(`${debugPrefix}    补齐端点: ${fillEndpoint}`);
        logger.info(`${debugPrefix}    图生图模式: ${isImageEditMode ? '是' : '否'}`);
        if (isImageEditMode) {
          logger.info(`${debugPrefix}    参考图数量: ${imageEditFiles.length}张`);
          logger.info(`${debugPrefix}    参考图大小: ${imageEditFiles.map(f => (f.size / 1024).toFixed(1) + 'KB').join(', ')}`);
        }

        // 用成功时的变体 body（n 改为 1），保持其他参数不变
        const successVariantBodyForFill: Record<string, unknown> = successVariantBody
          ? { ...successVariantBody, n: 1 }
          : { ...bodyVariants[0].body, n: 1 };

        for (let i = 0; i < remaining; i++) {
          let singleSuccess = false;
          try {
            let reqBody: BodyInit;
            const reqHeaders: Record<string, string> = {
              'Authorization': `Bearer ${apiConfig.apiKey}`,
              'Accept': 'application/json',
            };

            const isGenEndpoint = fillEndpoint.includes('/images/generations');
            const isEditEndpoint = fillEndpoint.includes('/images/edit');
            const isVarEndpoint = fillEndpoint.includes('/images/variations');
            const isImagesEndpoint = isGenEndpoint || isEditEndpoint || isVarEndpoint;
            const useImageEdit = isImageEditMode && isImagesEndpoint && imageEditFiles.length > 0;

            if (useImageEdit) {
              // 图生图补齐：使用缓存策略的字段名和格式（与主请求成功配置一致）
              const strategy = apiConfig.cachedImageEditStrategy;
              const fieldName = successFieldName || strategy?.fieldName || (isVarEndpoint ? 'image' : 'images');
              const format = successMode ? (successMode.includes('json') || successMode === 'chat' ? 'json' : 'formdata') : (strategy?.format || 'formdata');
              const extraParams = Object.keys(successExtraParams).length > 0 ? successExtraParams : (strategy?.extraParams || {});

              logger.info(`${debugPrefix}    补齐 [${i + 1}/${remaining}]: 图生图 mode=${format}, field=${fieldName}`);

              if (format === 'json') {
                // JSON + base64 方式
                const jsonBody: Record<string, unknown> = { ...successVariantBodyForFill };
                // 【隔离边界】gemini/nano-banana 双槽补齐同样走"拼图单图"（generations 单图一次只出1张，
                // 与主请求一致，避免多图 images 数组丢图2导致换装错；每次补齐 n 已强制为 1）
                if (isDualSlotTryon && dualIsGoogle && imageEditBase64List.length >= 2) {
                  const composed = await composeTwoImagesToSingle(imageEditBase64List, 768, debugPrefix);
                  if (composed) {
                    jsonBody[fieldName] = composed;
                    if (jsonBody.n !== undefined) jsonBody.n = 1;
                    // eslint-disable-next-line no-console
                    logger.info(`${debugPrefix}    🧩 补齐：双槽 gemini 已合成单图上传（上款式/下模特），n 强制为 1`);
                  } else if (imageEditBase64List.length === 1) {
                    jsonBody[fieldName] = imageEditBase64List[0];
                  }
                } else if (imageEditBase64List.length === 1) {
                  jsonBody[fieldName] = imageEditBase64List[0];
                } else if (isDualSlotTryon && dualIsVolc) {
                  jsonBody.image = imageEditBase64List.slice(0, 14);
                } else {
                  jsonBody.images = imageEditBase64List;
                  jsonBody[fieldName] = imageEditBase64List[0];
                }
                // 双槽：用 slot 感知结构化指令兜底；否则维持泛化编号
                const fillDualInstr = buildDualSlotInstruction();
                if (fillDualInstr && jsonBody.prompt) {
                  jsonBody.prompt = fillDualInstr + String(jsonBody.prompt);
                } else if (imageEditBase64List.length > 1 && jsonBody.prompt) {
                  const refLabels = Array.from({ length: imageEditBase64List.length }, (_, k) => `参考图${k + 1}`).join('、');
                  jsonBody.prompt = `[共 ${imageEditBase64List.length} 张参考图：${refLabels}，按顺序排列]\n${String(jsonBody.prompt)}`;
                }
                for (const [k, v] of Object.entries(extraParams)) {
                  if (k.startsWith('__')) continue;
                  jsonBody[k] = v;
                }
                reqHeaders['Content-Type'] = 'application/json';
                reqBody = JSON.stringify(jsonBody);
              } else {
                // FormData 方式
                const fd = new FormData();
                imageEditFiles.forEach((file) => {
                  fd.append(fieldName, file, file.name);
                });
                // 多图时不追加 images[0]/image_0 等冗余字段，避免后端解析错误
                // edits 端点加 mask（全透明）
                if (extraParams.__useMask === 'true') {
                  const mask = await getMaskFile(maskFileCache);
                  fd.append('mask', mask, mask.name);
                }
                if (!isVarEndpoint) {
                  let promptText = String(successVariantBodyForFill.prompt || '');
                  const fillDualInstr = buildDualSlotInstruction();
                  if (fillDualInstr) {
                    promptText = fillDualInstr + promptText;
                  } else if (imageEditFiles.length > 1) {
                    const refLabels = Array.from({ length: imageEditFiles.length }, (_, k) => `参考图${k + 1}`).join('、');
                    promptText = `[共 ${imageEditFiles.length} 张参考图：${refLabels}，按顺序排列]\n${promptText}`;
                  }
                  const colorSuffix = buildColorPreserveSuffix();
                  if (colorSuffix) promptText = promptText + colorSuffix;
                  fd.append('prompt', promptText);
                }
                // 双槽 gpt-image 补齐同样加 input_fidelity=high 锁脸
                if (isDualSlotTryon && dualIsOpenAIImage) {
                  fd.append('input_fidelity', 'high');
                }
                fd.append('model', String(successVariantBodyForFill.model || ''));
                if (successVariantBodyForFill.n !== undefined) fd.append('n', '1');
                if (successVariantBodyForFill.size) fd.append('size', String(successVariantBodyForFill.size));
                if (successVariantBodyForFill.quality) fd.append('quality', String(successVariantBodyForFill.quality));
                if (successVariantBodyForFill.negative_prompt) fd.append('negative_prompt', String(successVariantBodyForFill.negative_prompt));
                for (const [k, v] of Object.entries(extraParams)) {
                  if (k.startsWith('__')) continue;
                  fd.append(k, v);
                }
                reqBody = fd;
              }
            } else {
              // 文生图补齐
              logger.info(`${debugPrefix}    补齐 [${i + 1}/${remaining}]: 文生图`);
              reqHeaders['Content-Type'] = 'application/json';
              reqBody = JSON.stringify(successVariantBodyForFill);
            }

            const res = await fetchWithTimeout(fillEndpoint, {
              method: 'POST',
              mode: 'cors',
              headers: reqHeaders,
              body: reqBody,
            });

            if (res.ok) {
              const text = await res.text();
              let data: any = null;
              try { data = JSON.parse(text); } catch { /* ignore */ }
              const parsed = parseImagesFromResponse(data);
              if (parsed.length > 0) {
                images.push(...parsed);
                singleSuccess = true;
                logger.info(`${debugPrefix}    补齐 [${i + 1}/${remaining}] 成功，返回 ${parsed.length} 张`);
              } else {
                logger.warn(`${debugPrefix}    补齐 [${i + 1}/${remaining}] 响应成功但未解析到图片`);
              }
            } else {
              logger.warn(`${debugPrefix}    补齐 [${i + 1}/${remaining}] 失败: HTTP ${res.status}`);
            }
          } catch (e) {
            logger.warn(`${debugPrefix}    补齐 [${i + 1}/${remaining}] 请求异常:`, String(e));
          }
          if (!singleSuccess) break; // 一张都补不上了，停止后续补齐
        }
        logger.info(`${debugPrefix} 补齐完成，当前共 ${images.length} 张图片`);
      }

      // ===== n > 1 降级处理：循环调用 n 次 n=1 =====
      if (images.length === 0 && (task.imageCount || 1) > 1) {
        const count = task.imageCount || 1;
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 🔄 启用 n=1 降级模式，将循环调用 ${count} 次...`);

        // 用 n=1 重新生成变体列表（去掉 n>1 的那一级，因为 n 已经是 1 了）
        const singleBodyBase = { ...body, n: 1 };
        const singleVariants = buildBodyVariants(singleBodyBase);
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 降级请求 n=1 变体数:`, String(singleVariants.length));

        for (let i = 0; i < count; i++) {
          let singleSuccess = false;

          for (const endpoint of endpoints) {
                // eslint-disable-next-line no-console
            logger.info(`${debugPrefix} 降级调用 [${i + 1}/${count}]: ${endpoint}`);

            for (let vi = 0; vi < singleVariants.length; vi++) {
              const variant = singleVariants[vi];
              // eslint-disable-next-line no-console
              logger.info(`${debugPrefix}   变体 [${vi + 1}/${singleVariants.length}]: ${variant.label}`);

              try {
                let singleRequestBody: BodyInit;
                const singleRequestHeaders: Record<string, string> = {
                  'Authorization': `Bearer ${apiConfig.apiKey}`,
                  'Accept': 'application/json',
                };
                const isSingleEditEndpoint =
                  endpoint.includes('/images/edit') ||
                  endpoint.includes('/images/edits') ||
                  endpoint.includes('/images/variations') ||
                  endpoint.includes('/images/variation');
                const isSingleImagesEndpoint =
                  endpoint.includes('/images/edit') ||
                  endpoint.includes('/images/edits') ||
                  endpoint.includes('/images/variations') ||
                  endpoint.includes('/images/variation') ||
                  endpoint.includes('/images/generations');
                const useSingleImageEdit = isImageEditMode && isSingleImagesEndpoint && imageEditFiles.length > 0;

                if (useSingleImageEdit) {
                  const fd = new FormData();
                  // 使用已缓存的字段名，或 images 作为首选
                  const singleFieldName = apiConfig.cachedImageEditField || 'images';
                  // 遍历所有参考图多次 append（标准多文件上传）
                  imageEditFiles.forEach((file, idx) => {
                    fd.append(singleFieldName, file, file.name);
                  });
                  // 多图时不追加 images[0]/image_0 等冗余字段，避免后端解析错误
                  // variations 不需要 prompt
                  if (!endpoint.includes('/images/variations')) {
                    let promptText = String(variant.body.prompt || '');
                    const singleDualInstr = buildDualSlotInstruction();
                    if (singleDualInstr) {
                      promptText = singleDualInstr + promptText;
                    } else if (imageEditFiles.length > 1) {
                      const refLabels = Array.from({ length: imageEditFiles.length }, (_, i) => `参考图${i + 1}`).join('、');
                      promptText = `[共 ${imageEditFiles.length} 张参考图：${refLabels}，按顺序排列]\n${promptText}`;
                    }
                    const colorSuffix = buildColorPreserveSuffix();
                    if (colorSuffix) promptText = promptText + colorSuffix;
                    fd.append('prompt', promptText);
                  }
                  fd.append('model', String(variant.body.model || ''));
                  if (variant.body.n !== undefined) fd.append('n', String(variant.body.n));
                  if (variant.body.size) fd.append('size', String(variant.body.size));
                  if (variant.body.quality) fd.append('quality', String(variant.body.quality));
                  if (variant.body.negative_prompt) fd.append('negative_prompt', String(variant.body.negative_prompt));
                  // 加入图生图强度参数
                  const singleStrength = (apiConfig.imageEditStrength ?? 0.75).toString();
                  if (endpoint.includes('/images/generations')) {
                    fd.append('mode', 'image-to-image');
                    fd.append('image_weight', singleStrength);
                  } else if (endpoint.includes('/images/edit')) {
                    fd.append('strength', singleStrength);
                  }
                  // 双槽 gpt-image：input_fidelity=high 锁脸
                  if (isDualSlotTryon && dualIsOpenAIImage) {
                    fd.append('input_fidelity', 'high');
                  }
                  singleRequestBody = fd;
                } else {
                  singleRequestHeaders['Content-Type'] = 'application/json';
                  singleRequestBody = JSON.stringify(variant.body);
                }

                const res = await fetchWithTimeout(endpoint, {
                  method: 'POST',
                  mode: 'cors',
                  headers: singleRequestHeaders,
                  body: singleRequestBody,
                });

                const responseText = await res.text();
                // eslint-disable-next-line no-console
                logger.info(`${debugPrefix}   状态:`, { arg0: res.status, arg1: '完整响应:', responseText: responseText });

                if (!res.ok) {
                  const errInfo = parseErrorDetail(responseText);
                  let errMsg = errInfo.message || errInfo.full.slice(0, 300);
                  if (res.status === 404) {
                    errMsg = `${errMsg || 'Invalid URL'}（请求地址: ${endpoint}）\nAPI路径不存在，请检查Base URL是否正确`;
                  }
                  lastError = `HTTP ${res.status}${errInfo.code ? ` [${errInfo.code}]` : ''}: ${errMsg}`;
                  lastFullError = responseText;

                  // 404/401/405：换下一个 endpoint
                  if (res.status === 404 || res.status === 401 || res.status === 405) {
                    break; // 跳出变体循环，试下一个 endpoint
                  }
                  // invalid_request：尝试下一个变体
                  if (isInvalidRequestError(res.status, errInfo) && vi < singleVariants.length - 1) {
                    continue;
                  }
                  // 其他错误：试下一个 endpoint
                  break;
                }

                // 成功：解析图片（n=1降级模式仍需提取所有返回图片，避免API返回多张但只取1张）
                let data: any = null;
                try { data = JSON.parse(responseText); } catch { /* 忽略 */ }

                const parsedImages = parseImagesFromResponse(data);
                 if (parsedImages.length === 0 && res.ok) {
                   logger.warn(`${debugPrefix}   ⚠️ n=1降级模式 HTTP成功但未解析到图片，原始响应前2000字:`);
                   logger.warn(`${debugPrefix}   ${String(responseText.slice(0, 2000))}`);
                 }
                 if (parsedImages.length > 0) {
                   images.push(...parsedImages);
                   singleSuccess = true;
                   successEndpoint = endpoint;
                   // eslint-disable-next-line no-console
                   logger.info(`${debugPrefix}   降级 [${i + 1}/${count}] 解析到 ${parsedImages.length} 张图片`);
                   break;
                 }
                 if (singleSuccess) break; // 变体成功，跳出变体循环
              } catch (fetchErr) {
                const fetchMsg = String(fetchErr instanceof Error ? fetchErr.message : fetchErr);
                const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
                 if (isAbort) {
                   lastError = `请求超时（已等待 ${GENERATE_TIMEOUT_MS / 1000} 秒）。4K/高质量大图生成可能需要更长时间，API 可能仍在后台处理中（已扣费）。请稍后在API后台查看结果，或降低分辨率/质量后重试。`;
                   lastFullError = fetchMsg;
                       break; // 超时跳出变体循环
                 }
                if (fetchMsg.includes('Failed to fetch') || fetchMsg.includes('CORS') || fetchMsg.includes('NetworkError') || fetchMsg.includes('Load failed')) {
                  lastError = '网络错误/CORS跨域限制：浏览器无法直接请求该API。请检查API地址是否正确，或使用代理/在服务端转发请求，或配置API服务端允许跨域(CORS)。';
                  lastFullError = fetchMsg;
                  // 网络/CORS 失败：请求可能已计费，终止所有端点/变体重试，避免重复扣费
                  if (typeof triedEndpoints === 'number') triedEndpoints = endpoints.length + 1;
                  break; // CORS 跳出变体循环，且不再尝试其他端点
                }
              }
            }
            if (singleSuccess) break; // endpoint 成功，跳出 endpoint 循环
          }
          if (!singleSuccess && images.length === 0) {
            // 第一张就失败了，停止继续
            break;
          }
        }
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 降级模式完成，共获得 ${images.length} 张图片`);
      }

      if (images.length === 0) {
        // eslint-disable-next-line no-console
        logger.error(`${debugPrefix} ❌ 所有端点都失败了，最后错误:`, String(lastError));

        // 如果用了缓存端点且失败，增加失败计数；404/端点不存在立即清除，其他错误累计2次清除
        if (hasEndpointCache && cachedEndpointUrl) {
          const failCount = cachedFailures + 1;
          const isEndpointNotFound = lastError && (
            lastError.includes('404') ||
            lastError.includes('Invalid URL') ||
            lastError.includes('not found') ||
            lastError.includes('Cannot POST')
          );
          if (isEndpointNotFound || failCount >= 2) {
            const updates: Partial<IApiConfig> = {};
            const variantKey = isImageEditMode ? 'cachedImageBodyVariantIndex' : 'cachedTextBodyVariantIndex';
            (updates as any)[cacheEndpointKey] = undefined;
            (updates as any)[variantKey] = undefined;
            (updates as any)[cacheFailuresKey] = 0;
            updateApiConfig(apiConfig.id, updates);
            logger.info(`${debugPrefix} 🗑️ [${isImageEditMode ? '图生图' : '文生图'}]端点缓存已失败${failCount}次，已清除，下次将重新探测`);
          } else {
            const updates: Partial<IApiConfig> = {};
            (updates as any)[cacheFailuresKey] = failCount;
            updateApiConfig(apiConfig.id, updates);
            logger.info(`${debugPrefix} ⚠️ [${isImageEditMode ? '图生图' : '文生图'}]端点缓存失败，累计: ${failCount}/2`);
          }
        }

        // 图生图模式下失败，给出明确提示，避免用户误以为是图生图实际是文生图
        if (isImageEditMode) {
          const imgErr = lastError
            ? `${lastError}\n\n（图生图请求失败，所有图生图端点均不可用。该 API 可能不支持图生图功能，请检查 API 配置或更换模型）`
            : '图生图失败，所有图生图端点均不可用。请检查 API 是否支持图生图功能，或尝试切换模型';
          throw new Error(imgErr);
        }

        throw new Error(lastError || '生成失败，未返回图片');
      }

      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} ✅ 生成成功！共 ${images.length} 张图片，成功端点:`, String(successEndpoint));

      // 数量一致性检查：API返回数量 vs 请求数量
      if (images.length !== expectedCount) {
        // eslint-disable-next-line no-console
        logger.warn(`${debugPrefix} ⚠️ 数量不一致: 请求 n=${expectedCount}，实际返回 ${images.length} 张`);
      }

      // 截取前 n 张图片（有些 API 可能忽略 n 参数，返回默认数量）
      if (images.length > expectedCount) {
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} ✂️ 返回图片 ${images.length} 张，截取前 ${expectedCount} 张` +
          `（API 可能忽略了 n 参数）`);
        images = images.slice(0, expectedCount);
      }

      // 如果是图生图模式但成功端点不是 edit/variations/generations 传图，给出警告
      if (isImageEditMode && successEndpoint) {
        const isImageEditEndpoint =
          successEndpoint.includes('/images/edit') ||
          successEndpoint.includes('/images/variations') ||
          successEndpoint.includes('/images/generations');
        if (!isImageEditEndpoint) {
          // eslint-disable-next-line no-console
          logger.warn(`${debugPrefix} ⚠️ 图生图模式但最终成功端点不是图生图路径: ${successEndpoint}`);
        }
      }

      // 自动校色：检测泛红/偏色并自动校正白平衡（生成后后处理）
      const autoCorrectImage = async (url: string): Promise<string> => {
        if (!task.autoCorrectColor) return url;
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = url;
          });
          const canvas = document.createElement('canvas');
          const maxW = 1024;
          const scale = Math.min(1, maxW / img.width);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return url;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const pixels = data.data;
          // 采样计算平均 R/G/B
          let sumR = 0, sumG = 0, sumB = 0, count = 0;
          for (let i = 0; i < pixels.length; i += 40) {
            sumR += pixels[i]; sumG += pixels[i + 1]; sumB += pixels[i + 2]; count++;
          }
          const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count;
          const neutral = (avgG + avgB) / 2;
          const redShift = avgR - neutral;
          if (redShift > 8) {
            // 泛红：将 R 通道拉回接近中性
            const factor = neutral / avgR;
            for (let i = 0; i < pixels.length; i += 4) {
              pixels[i] = Math.min(255, pixels[i] * factor);
            }
            ctx.putImageData(data, 0, 0);
            // eslint-disable-next-line no-console
            logger.info(`${debugPrefix} 🎨 自动校色：检测到泛红(偏移${redShift.toFixed(1)})，已校正白平衡`);
            return await new Promise<string>((resolve) => {
              canvas.toBlob((blob) => {
                if (blob) resolve(URL.createObjectURL(blob)); else resolve(url);
              }, 'image/jpeg', 0.92);
            });
          }
          return url;
        } catch {
          return url;
        }
      };

      const processedImages = task.autoCorrectColor
        ? await Promise.all(images.map((url) => autoCorrectImage(url)))
        : images;

      const newResults = processedImages.map((url: string, i: number) => ({
        id: `r_${Date.now()}_${i}`,
        url,
        model: task.model,
        prompt: task.prompt,
        createdAt: Date.now(),
        width,
        height,
      }));

      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          const combinedResults = append ? [...t.results, ...newResults] : newResults;
          return {
            ...t,
            status: 'completed',
            results: combinedResults.slice(0, 20),
            errorMsg: undefined,
            completedAt: Date.now(),
            durationMs: Date.now() - (t.startedAt || generateStartTime),
          };
        }
        return t;
      }));
    } catch (error) {
      const errorMsg = String(error instanceof Error ? error.message : error);
      // eslint-disable-next-line no-console
      logger.error(`${debugPrefix} ❌ 生成失败:`, { errorMsg: errorMsg, error: error });
      // eslint-disable-next-line no-console
      logger.error(`${debugPrefix} 完整错误详情:`, String({
        error,
        lastError,
        lastFullError,
        task: { id: task?.id, model: task?.model, ratio: task?.ratio, quality: task?.quality, imageCount: task?.imageCount },
        apiConfig: apiConfig ? { id: apiConfig.id, type: apiConfig.type, baseUrl: apiConfig.baseUrl } : null,
      }));
      logger.error('Generate failed:', errorMsg);

      // 拼接错误信息：主信息 + 完整响应原文（如果有）
      let displayError = errorMsg || '生成失败，请检查API配置';
      if (lastFullError && lastFullError !== errorMsg) {
        displayError = `${displayError}\n\n完整响应：${lastFullError}`;
      }

      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: 'failed',
        errorMsg: displayError,
        completedAt: Date.now(),
        durationMs: Date.now() - (t.startedAt || generateStartTime),
      } : t));
    }
  }, [tasks, apiConfigs, allModels, findApiConfigForModel]);

  const batchGenerate = useCallback(async (startIndex: number, endIndex: number, concurrency: number) => {
    const targetTasks = projectTasks
      .filter(t => t.enabled && t.index >= startIndex && t.index <= endIndex && t.status !== 'generating')
      .sort((a, b) => a.index - b.index);

    if (targetTasks.length === 0) return;

    const maxConcurrency = Math.max(1, Math.min(20, concurrency));
    let activeCount = 0;
    let cursor = 0;

    // 并发控制器：同时启动 maxConcurrency 个 worker，每个完成后立即取下一个任务
    await new Promise<void>((resolve) => {
      const startNext = () => {
        while (cursor < targetTasks.length && activeCount < maxConcurrency) {
          const task = targetTasks[cursor++];
          activeCount++;
          generateTask(task.id, false)
            .catch(() => {
              // 单个任务失败不影响其他任务，错误已在 generateTask 内处理
            })
            .finally(() => {
              activeCount--;
              startNext();
            });
        }
        if (activeCount === 0 && cursor >= targetTasks.length) {
          resolve();
        }
      };
      startNext();
    });
  }, [projectTasks, generateTask]);

  // ---- Models ----
  const setActiveModels = useCallback((models: IModel[]) => {
    setActiveModelsState(models);
  }, []);

  const getResolutionsForModel = useCallback((modelId: string) => {
    // 视频模型：返回视频比例（16:9 / 9:16 / 1:1）
    if (modelId.startsWith('kling') || modelId.includes('seedance')) {
      return VIDEO_MODELS.find(m => m.id === modelId)?.resolutions || ['16:9 横屏', '9:16 竖屏', '1:1 方形'];
    }
    const key = matchModelPresetKey(modelId);
    if (key) return MODEL_RESOLUTIONS[key] || MODEL_RESOLUTIONS['flux-1.1-pro'] || [];
    return MODEL_RESOLUTIONS['flux-1.1-pro'] || ['1:1正方形·1024×1024', '3:4竖版·768×1024', '4:3横版·1024×768'];
  }, []);

      const getQualitiesForModel = useCallback((modelId: string) => {
    // 视频模型：视频清晰度档位
    if (modelId.startsWith('kling') || modelId.includes('seedance')) {
      return VIDEO_MODELS.find(m => m.id === modelId)?.qualities || ['1080P 高清', '720P 标准'];
    }
    const s = (modelId || '').toLowerCase();

    // gpt-image-2.5 系列（更精确的匹配放前面）
    if (s.includes('gpt-image-2.5-flare') || s.includes('gpt-image-2.5-sunburst') || s.includes('gpt-image-2-5')) {
      const key = matchModelPresetKey(modelId);
      if (key && MODEL_QUALITIES[key]) return MODEL_QUALITIES[key];
    }

    // gpt-image-2 系列（不包含 2.5）
    if ((s.includes('gpt-image-2') || s.includes('gpt_image_2')) && !s.includes('gpt-image-2.5') && !s.includes('gpt-image-2-5')) {
      return MODEL_QUALITIES['gpt-image-2'] || [];
    }

    // 其他模型走原有逻辑
    const key = matchModelPresetKey(modelId);
    if (key && MODEL_QUALITIES[key]) return MODEL_QUALITIES[key];
    return MODEL_QUALITIES['flux-1.1-pro'] || ['Standard', 'High'];
  }, []);
  const getBackgroundsForModel = useCallback((modelId: string) => {
    const key = matchModelPresetKey(modelId);
    return (key && MODEL_BACKGROUNDS[key]) || MODEL_BACKGROUNDS['gpt-image-2.5-flare'] || [];
  }, []);
  // ---- API Config ----
  const updateApiConfig = useCallback((id: string, updates: Partial<IApiConfig>) => {
    setApiConfigsState(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  // 真实请求 API 拉取模型列表（支持分页 + 多格式解析）
  const fetchModelsFromApi = useCallback(async (
    baseUrl: string,
    apiKey: string,
  ): Promise<{ models: IModel[]; total?: number; warnings: string[] }> => {
    const warnings: string[] = [];
    const allRawModels: Map<string, any> = new Map();

    // 标准化 baseUrl：去掉尾部斜杠
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    // 检查是否已含 /v1 后缀，避免重复拼接
    const hasV1Suffix = /\/v1$/.test(normalizedBase);

    // 可能的 models 端点路径
    const endpoints: string[] = [];
    if (hasV1Suffix) {
      // baseUrl 已含 /v1，直接拼 models
      endpoints.push(`${normalizedBase}/models?limit=1000`);
      endpoints.push(`${normalizedBase}/models?per_page=1000`);
      endpoints.push(`${normalizedBase}/models?page_size=1000`);
      endpoints.push(`${normalizedBase}/models`);
      // 也补一个带 /v1 的（防止误判）
      const baseWithoutV1 = normalizedBase.replace(/\/v1$/, '');
      endpoints.push(`${baseWithoutV1}/v1/models?limit=1000`);
      endpoints.push(`${baseWithoutV1}/v1/models`);
    } else {
      // 不带 /v1 先试（有些 API 路径就是 /models）
      endpoints.push(`${normalizedBase}/models?limit=1000`);
      endpoints.push(`${normalizedBase}/models?per_page=1000`);
      endpoints.push(`${normalizedBase}/models?page_size=1000`);
      endpoints.push(`${normalizedBase}/v1/models?limit=1000`);
      endpoints.push(`${normalizedBase}/v1/models?per_page=1000`);
      endpoints.push(`${normalizedBase}/models`);
      endpoints.push(`${normalizedBase}/v1/models`);
    }

    let responseData: any = null;
    let usedEndpoint = '';
    let lastError: string | null = null;

    // 尝试不同端点，找到能返回数据的
    for (const endpoint of endpoints) {
      try {
        logger.info('请求模型列表:', endpoint);
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          lastError = `HTTP ${res.status}: ${res.statusText}`;
          continue;
        }
        const data = await res.json();
        logger.info('API 模型列表响应:', JSON.stringify(data).slice(0, 500));
        const models = extractModelsFromResponse(data);
        if (models.length > 0) {
          responseData = data;
          usedEndpoint = endpoint;
          // 去重存入
          for (const m of models) {
            const info = extractModelInfo(m);
            if (info) allRawModels.set(info.id, info);
          }
          break;
        }
        // 如果有数据但没解析出模型，继续试下一个端点
        lastError = '响应中未找到模型数组';
      } catch (e) {
        lastError = String(e);
      }
    }

    if (!responseData) {
      throw new Error(lastError || '无法连接到 API 服务');
    }

    // 检查并处理分页
    let pagination = extractPaginationInfo(responseData);
    let pageCount = 1;
    const maxPages = 20; // 安全上限，防止无限循环

    // 如果有分页且模型数少，继续翻页
    while (pagination.hasMore && pagination.nextPage && pageCount < maxPages) {
      pageCount++;
      const url = new URL(usedEndpoint.split('?')[0]);
      // 添加分页参数
      if (typeof pagination.nextPage === 'number') {
        url.searchParams.set('page', String(pagination.nextPage));
        url.searchParams.set('page_size', '1000');
      } else {
        url.searchParams.set('after', String(pagination.nextPage));
        url.searchParams.set('limit', '1000');
      }
      const nextUrl = url.toString();
      logger.info(`加载第 ${pageCount} 页模型:`, nextUrl);
      try {
        const res = await fetch(nextUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) break;
        const data = await res.json();
        const models = extractModelsFromResponse(data);
        const prevSize = allRawModels.size;
        for (const m of models) {
          const info = extractModelInfo(m);
          if (info) allRawModels.set(info.id, info);
        }
        if (models.length === 0 || allRawModels.size === prevSize) break;
        pagination = extractPaginationInfo(data);
      } catch {
        break;
      }
    }

    // 如果模型数 < 10 且我们知道 total 更大，警告分页可能有问题
    if (pagination.total && allRawModels.size < pagination.total && allRawModels.size < 10) {
      warnings.push(`API 报告共 ${pagination.total} 个模型，但仅加载到 ${allRawModels.size} 个，可能存在分页问题`);
    }
    if (pageCount >= maxPages) {
      warnings.push(`已达到最大页数限制 ${maxPages}，可能未加载全部模型`);
    }

    // 转换为 IModel 格式（按模型名匹配预设分辨率/质量）
    const models: IModel[] = Array.from(allRawModels.values()).map((raw) => {
      const rawId = raw.id || '';
      const rawName = raw.name || rawId;
      const presetKey = matchPresetKeyForModel(rawId, rawName);
      return {
        id: rawId,
        name: rawName,
        apiSource: baseUrl,
        apiType: 'custom' as const,
        resolutions: MODEL_RESOLUTIONS[presetKey] || MODEL_RESOLUTIONS['flux-1.1-pro'] || [],
        qualities: MODEL_QUALITIES[presetKey] || MODEL_QUALITIES['flux-1.1-pro'] || ['Standard', 'High'],
        isActive: false,
        isCustom: true,
      };
    });

    return { models, total: pagination.total, warnings };
  }, []);


  // ==================== 视频生成（可灵 / 即梦 Seedance） ====================
  /** 将 blob/网络图转 data URI（可灵取裸 base64，Seedance 支持 data URI） */
  const imageToBase64 = useCallback(async (url: string): Promise<string> => {
    if (url.startsWith('data:')) return url;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(blob);
      });
    } catch {
      return url; // 已是公网 URL，直接透传
    }
  }, []);

  const generateVideoTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.prompt.trim()) return;

    const isKling = task.model.startsWith('kling');
    const apiType = isKling ? 'kling' : 'seedance';
    const apiConfig = apiConfigs.find(c => c.type === apiType && c.baseUrl && c.apiKey && c.status === 'verified');
    if (!apiConfig) {
      updateTask(taskId, { status: 'failed', errorMsg: '未找到可用的视频 API 配置，请先在「API接口」页面配置并验证可灵/即梦视频' });
      return;
    }

    setTasks(prev => prev.map(t => t.id === taskId ? {
      ...t, status: 'generating', errorMsg: undefined, startedAt: Date.now(), completedAt: undefined, durationMs: undefined,
    } : t));

    const startTime = Date.now();
    const durationSec = Math.min(Math.max(task.duration || 5, 3), 15);
    const qualityMode = task.quality?.includes('1080') || task.quality?.includes('高清') ? 'pro' : 'std';
    const ratioKey = task.ratio?.split(' ')[0] || '16:9';

    try {
      let videoUrl = '';
      if (isKling) {
        const hasImage = task.referenceImages.length > 0;
        const endpoint = hasImage
          ? `${apiConfig.baseUrl}/v1/videos/image2video`
          : `${apiConfig.baseUrl}/v1/videos/text2video`;
        const body: Record<string, unknown> = {
          model_name: task.model === 'kling-v2-6' ? 'kling-v2-6' : 'kling-v3',
          prompt: task.prompt,
          negative_prompt: task.negativePrompt || '',
          duration: String(durationSec),
          mode: qualityMode,
          sound: 'off',
        };
        if (hasImage) {
          const img = await imageToBase64(task.referenceImages[0].url);
          body.image = img.startsWith('data:') ? (img.split(',')[1] || img) : img;
        } else {
          body.ratio = ratioKey;
        }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiConfig.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.code !== 0 || !data.data?.task_id) {
          throw new Error(data.message || `可灵请求失败 HTTP ${res.status}`);
        }
        const remoteId = data.data.task_id;
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const q = await fetch(`${apiConfig.baseUrl}/v1/videos/${remoteId}`, {
            headers: { 'Authorization': `Bearer ${apiConfig.apiKey}` },
          });
          const qd = await q.json().catch(() => ({}));
          const st = qd.data?.task_status;
          if (st === 'succeed') {
            videoUrl = qd.data?.task_result?.videos?.[0]?.url || '';
            break;
          }
          if (st === 'failed') throw new Error('可灵生成失败：' + (qd.data?.task_status_msg || '未知错误'));
        }
        if (!videoUrl) throw new Error('视频生成超时，请稍后重试');
      } else {
        // 即梦 Seedance（火山方舟）
        const content: Record<string, unknown>[] = [];
        if (task.referenceImages.length > 0) {
          content.push({ type: 'image', data: await imageToBase64(task.referenceImages[0].url) });
        }
        content.push({ type: 'text', text: task.prompt });
        const res = await fetch(`${apiConfig.baseUrl}/api/plan/v3/contents/generations/tasks`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiConfig.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'doubao-seedance-2-5-260628',
            content,
            ratio: ratioKey,
            duration: Math.min(Math.max(durationSec, 4), 15),
            watermark: false,
          }),
        });
        const data = await res.json().catch(() => ({}));
        const remoteId = data.id || data.task_id;
        if (!res.ok || !remoteId) throw new Error(data.error?.message || data.message || `即梦请求失败 HTTP ${res.status}`);
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const q = await fetch(`${apiConfig.baseUrl}/api/plan/v3/contents/generations/tasks/${remoteId}`, {
            headers: { 'Authorization': `Bearer ${apiConfig.apiKey}` },
          });
          const qd = await q.json().catch(() => ({}));
          if (qd.status === 'succeeded') {
            videoUrl = qd.content?.video_url || '';
            break;
          }
          if (qd.status === 'failed') throw new Error('即梦生成失败：' + (qd.error?.message || '未知错误'));
        }
        if (!videoUrl) throw new Error('视频生成超时，请稍后重试');
      }

      const newResult: IGenerateResult = {
        id: `res_${Date.now()}`,
        url: videoUrl,
        model: task.model,
        prompt: task.prompt,
        createdAt: Date.now(),
        width: 0,
        height: 0,
        type: 'video',
        duration: durationSec,
      };
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t, status: 'completed', completedAt: Date.now(), durationMs: Date.now() - startTime,
        results: [...t.results, newResult].slice(0, 20),
      } : t));
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'failed', errorMsg: msg, completedAt: Date.now(), durationMs: Date.now() - startTime } : t));
    }
  }, [tasks, apiConfigs, updateTask, setTasks]);

  const verifyApiConfig = useCallback(async (id: string): Promise<boolean> => {
    const config = apiConfigs.find(c => c.id === id);
    if (!config || !config.baseUrl || !config.apiKey) {
      updateApiConfig(id, { status: 'error', errorMsg: '请填写接口地址和密钥' });
      return false;
    }

    const isSecondary = config.isSecondary || id === 'api-custom-2';
    const apiNumMatch = /^api-custom-(\d+)$/.exec(id);
    const apiNum = apiNumMatch ? apiNumMatch[1] : '2';
    const suffix = isSecondary ? ` · API ${apiNum}` : '';
    const sourceLabel = isSecondary ? `自定义兼容接口 · API ${apiNum}` : config.label;

    // 视频 API（可灵 / 即梦）：轻量连通性验证
    if (config.type === 'kling' || config.type === 'seedance') {
      try {
        const testUrl = config.type === 'kling'
          ? `${config.baseUrl}/v1/videos`
          : `${config.baseUrl}/api/plan/v3/contents/generations/tasks?page_num=1&page_size=1`;
        const res = await fetch(testUrl, {
          headers: { 'Authorization': `Bearer ${config.apiKey}` },
          signal: AbortSignal.timeout(15000),
        });
        if (res.status === 401 || res.status === 403) {
          updateApiConfig(id, { status: 'error', errorMsg: '鉴权失败：API 密钥无效或已过期' });
          return false;
        }
        updateApiConfig(id, { status: 'verified', verifiedAt: Date.now(), errorMsg: undefined });
        return true;
      } catch {
        updateApiConfig(id, { status: 'error', errorMsg: '无法连接视频 API，请检查接口地址与网络' });
        return false;
      }
    }

    try {
      // 尝试真实请求 API 拉取模型
      const { models: fetchedModels, warnings } = await fetchModelsFromApi(config.baseUrl, config.apiKey);

      if (fetchedModels.length === 0) {
        throw new Error('API 未返回任何模型，请检查接口地址和密钥');
      }

      // 给模型加上 apiConfigId 和后缀，默认 isActive=false（需用户在模型库勾选确认）
      const modelsFromApi: IModel[] = fetchedModels.map((m) => {
        const presetKey = matchModelPresetKey(m.id) || matchModelPresetKey(m.name);
        return {
          ...m,
          id: `${id}_${m.id}`,
          name: m.name + suffix,
          apiSource: sourceLabel,
          apiType: config.type,
          apiConfigId: id,
          isActive: false,
          isCustom: true,
          resolutions: presetKey ? (MODEL_RESOLUTIONS[presetKey] ?? []) : (MODEL_RESOLUTIONS['flux-1.1-pro'] ?? []),
          qualities: presetKey ? (MODEL_QUALITIES[presetKey] ?? []) : (MODEL_QUALITIES['flux-1.1-pro'] ?? []),
        };
      });

      logger.info(`从 API 加载到 ${modelsFromApi.length} 个模型`);
      if (warnings.length > 0) {
        warnings.forEach((w) => logger.warn('模型加载警告:', w));
      }

      // 合并到 customLoadedModels
      setCustomLoadedModels((prev) => {
        const others = prev.filter((m) => m.apiConfigId !== id);
        return [...others, ...modelsFromApi];
      });

      updateApiConfig(id, { status: 'verified', verifiedAt: Date.now(), errorMsg: undefined });
      return true;
    } catch (e) {
      const errorMsg = String(e instanceof Error ? e.message : e);
      logger.error('API 验证失败:', errorMsg);
      updateApiConfig(id, { status: 'error', errorMsg });
      return false;
    }
  }, [apiConfigs, updateApiConfig, fetchModelsFromApi]);

  // 手动添加自定义模型
  const addCustomModel = useCallback((apiId: string, modelId: string, modelName?: string) => {
    const config = apiConfigs.find(c => c.id === apiId);
    if (!config) return;
    const isSecondary = config.isSecondary || apiId === 'api-custom-2';
    const apiNumMatch = /^api-custom-(\d+)$/.exec(apiId);
    const apiNum = apiNumMatch ? apiNumMatch[1] : '2';
    const suffix = isSecondary ? ` · API ${apiNum}` : '';
    const sourceLabel = isSecondary ? `自定义兼容接口 · API ${apiNum}` : config.label;
    const displayName = (modelName || modelId) + suffix;
    const fullId = `${apiId}_${modelId}`;

    setCustomLoadedModels(prev => {
      if (prev.some(m => m.id === fullId)) return prev;
      const presetKey = matchModelPresetKey(modelId) || matchModelPresetKey(displayName);
      const newModel: IModel = {
        id: fullId,
        name: displayName,
        apiSource: sourceLabel,
        apiType: config.type,
        resolutions: presetKey ? (MODEL_RESOLUTIONS[presetKey] ?? []) : (MODEL_RESOLUTIONS['flux-1.1-pro'] ?? []),
        qualities: presetKey ? (MODEL_QUALITIES[presetKey] ?? []) : (MODEL_QUALITIES['flux-1.1-pro'] ?? []),
        isActive: false,
        isCustom: true,
        apiConfigId: apiId,
      };
      return [...prev, newModel];
    });
  }, [apiConfigs]);

  // ---- Presets ----
  const applyPreset = useCallback((presetId: string): Partial<ITask> | null => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return null;
    return {
      model: preset.model,
      modelLabel: MOCK_MODELS.find(m => m.id === preset.model)?.name || preset.model,
      ratio: preset.ratio,
      quality: preset.quality,
      imageCount: preset.imageCount,
      prompt: preset.prompt,
      negativePrompt: preset.negativePrompt,
    };
  }, [presets]);

  const savePreset = useCallback((name: string, params: Partial<ITask> & { prompt: string; negativePrompt?: string }) => {
    const newPreset: IPreset = {
      id: `preset_${Date.now()}`,
      name,
      model: params.model || 'gpt-image-2',
    ratio: params.ratio || '1K · 1:1 正方形 · 1024×1024',
    quality: params.quality || 'High（模型原生高质量 · PNG 无损）',
      imageCount: params.imageCount || 4,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      isSystem: false,
    };
    setPresets(prev => [...prev, newPreset]);
  }, []);

  const duplicatePreset = useCallback((presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    const newPreset: IPreset = {
      ...preset,
      id: `preset_${Date.now()}`,
      name: `${preset.name} 副本`,
      isSystem: false,
    };
    setPresets(prev => [...prev, newPreset]);
  }, [presets]);

  // ---- Text Optimize Config ----
  const updateTextOptimizeConfig = useCallback((updates: Partial<ITextOptimizeConfig>) => {
    setTextOptimizeConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const addTextOptimizeModel = useCallback((modelName: string) => {
    const name = modelName.trim();
    if (!name) return;
    setTextOptimizeConfig(prev => {
      if (prev.customModels.includes(name)) return prev;
      return { ...prev, customModels: [...prev.customModels, name] };
    });
  }, []);

  const removeTextOptimizeModel = useCallback((modelName: string) => {
    setTextOptimizeConfig(prev => ({
      ...prev,
      customModels: prev.customModels.filter(m => m !== modelName),
      // 如果删除的是当前选中模型，回退到默认
      model: prev.model === modelName ? DEFAULT_TEXT_OPTIMIZE_CONFIG.model : prev.model,
    }));
  }, []);

  const loadTextOptimizeModels = useCallback(async (): Promise<boolean> => {
    const { baseUrl, apiKey } = textOptimizeConfig;
    if (!baseUrl || !apiKey) {
      toast.error('请先填写接口地址和密钥');
      return false;
    }

    try {
      const normalizedBase = baseUrl.replace(/\/+$/, '');
      const hasV1Suffix = /\/v1$/.test(normalizedBase);
      const endpoints: string[] = [];
      if (hasV1Suffix) {
        endpoints.push(`${normalizedBase}/models`);
        endpoints.push(`${normalizedBase.replace(/\/v1$/, '')}/v1/models`);
      } else {
        endpoints.push(`${normalizedBase}/v1/models`);
        endpoints.push(`${normalizedBase}/models`);
      }

      let models: string[] = [];
      let lastError = '';

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          });
          if (!res.ok) {
            lastError = `HTTP ${res.status}: ${res.statusText}`;
            continue;
          }
          const data = await res.json();
          // 兼容 OpenAI 格式 { data: [{ id, ... }] } 和直接数组
          const raw = Array.isArray(data) ? data : (data.data || data.models || []);
          const names = raw.map((m: any) => String(m.id || m.name || m.model || '')).filter(Boolean) as string[];
          if (names.length > 0) {
            models = [...new Set(names)].sort();
            break;
          }
          lastError = '响应中未找到模型';
        } catch (e) {
          lastError = String(e);
        }
      }

      if (models.length === 0) {
        throw new Error(lastError || '未获取到任何模型');
      }

      setTextOptimizeConfig(prev => ({ ...prev, loadedModels: models }));
      toast.success(`成功加载 ${models.length} 个模型`);
      return true;
    } catch (e) {
      const errorMsg = String(e instanceof Error ? e.message : e);
      logger.error('加载文本模型失败:', errorMsg);
      toast.error(`加载失败：${errorMsg}`);
      return false;
    }
  }, [textOptimizeConfig]);

  const value = useMemo<AppContextType>(() => ({
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
    projectTasks, tasks, taskStats, addTask, removeTask, updateTask, applyParamsToAll,
    generateTask, batchGenerate, activeModels, allModels, setActiveModels, addCustomModel,
    getResolutionsForModel, getQualitiesForModel, getBackgroundsForModel,
    selectedTaskId,
    setSelectedTaskId,
    newTaskParams,
    setNewTaskParams,
    markResultDownloaded,
    apiConfigs,
    updateApiConfig,
    verifyApiConfig,
    applyPreset,
    savePreset,
    duplicatePreset,
    textOptimizeConfig,
    updateTextOptimizeConfig,
    addTextOptimizeModel,
    removeTextOptimizeModel,
    loadTextOptimizeModels,
    generateVideoTask,
    applyFeature,
  }), [
    projects, currentProjectId, currentProject, setCurrentProjectId,
    addProject, renameProject, deleteProject, duplicateProject, toggleShareProject,
    projectTasks, taskStats, addTask, removeTask, updateTask, applyParamsToAll, generateTask,
    batchGenerate, activeModels, allModels, setActiveModels, addCustomModel, getResolutionsForModel, getQualitiesForModel, getBackgroundsForModel,
     selectedTaskId, setSelectedTaskId, newTaskParams, setNewTaskParams, markResultDownloaded,
    apiConfigs, updateApiConfig, verifyApiConfig,
    presets, applyPreset, savePreset, duplicatePreset,
    textOptimizeConfig, updateTextOptimizeConfig, addTextOptimizeModel, removeTextOptimizeModel,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
