import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { scopedStorage, logger } from '@lark-apaas/client-toolkit-lite';
import { toast } from 'sonner';
import type { IProject, ITask, IApiConfig, IModel, IPreset, ITextOptimizeConfig } from '@/data/models';
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
    const mockActive = MOCK_MODELS.filter(m => m.isActive);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      // 同步内置模型(MOCK, isCustom=false)的最新定义：内置模型随版本更新即时生效，
      // 用户自定义模型(isCustom=true)原样保留，避免缓存里的旧内置数据掩盖修复/新模型
      const merged = cached.map(m => {
        const mock = mockActive.find(mm => mm.id === m.id && !mm.isCustom);
        return mock ? { ...m, ...mock } : m;
      });
      mockActive.forEach(mm => {
        if (!merged.some(m => m.id === mm.id)) merged.push(mm);
      });
      return merged;
    }
    return mockActive;
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
    () => tasks.filter(t => t.projectId === currentProjectId),
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

  // 从 ratio 字符串中解析宽高，如 "2K · 3:4 竖版 · 1536×2048" → { width: 1536, height: 2048 }
  const parseSizeFromRatio = (ratioStr: string): { width: number; height: number } => {
    const match = ratioStr.match(/(\d+)\s*[×xX]\s*(\d+)/);
    if (match) {
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
    return { width: 1024, height: 1024 };
  };

  // 获取真实模型 ID（去掉 api-{type}_ 前缀）
  // 支持的前缀格式：api-openai_ / api-google_ / api-volcengine_ / api-custom-1_ / api-custom-2_ 等
  const getRealModelId = (modelId: string): string => {
    // 通用规则：如果模型ID以 api- 开头且包含下划线，去掉第一个下划线及之前的部分
    const match = modelId.match(/^api-[^_]+_(.+)$/);
    if (match) return match[1];
    return modelId;
  };


  // ---- Generate ----
  const generateTask = useCallback(async (taskId: string, append = false) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.prompt.trim()) return;

    // 追加模式：记录本次追加张数，更新总张数用于占位框显示
    const appendCount = task.imageCount || 1;
    const requestedCount = append ? appendCount : (task.imageCount || 1);  // 本次实际请求的张数
    const totalImageCount = append ? task.results.length + appendCount : (task.imageCount || 1);

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'generating', imageCount: totalImageCount, errorMsg: undefined, startedAt: Date.now(), completedAt: undefined, durationMs: undefined } : t));

    const generateStartTime = Date.now();

    // 超时保护：固定4分钟
    const GENERATE_TIMEOUT_MS = 180000; // 3分钟
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

      // 构造请求体（OpenAI 兼容格式）
      const body: Record<string, unknown> = {
        model: realModelId,
        prompt: task.prompt,
        n: append ? appendCount : (task.imageCount || 1),
      };

      const presetKey = matchModelPresetKey(task.model);
      const isGoogleModel = presetKey?.startsWith('nano-banana') || presetKey?.startsWith('gemini');

      // 自适应尺寸不传 size；Google Gemini/Nano Banana 官方用 image_size+aspect_ratio，不用 size
      if (!isAutoSize && !isGoogleModel) {
        if (presetKey?.startsWith('wan')) {
          // Wan 2.7 官方推荐缩写档位 1K/2K/4K（T2I 可 4K，I2I 最高 2K）
          const wm = task.ratio.match(/^(\d+(?:\.\d+)?K)/);
          if (wm) body.size = wm[1];
        } else {
          body.size = sizeStr;
        }
      }
      if (!isAutoSize && isGoogleModel) {
        const gm = task.ratio.match(/^(\d+(?:\.\d+)?K)\s*·\s*(\d+:\d+)/);
        if (gm) {
          body.image_size = gm[1];
          body.aspect_ratio = gm[2];
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


      // 负向提示词
      if (task.negativePrompt?.trim()) {
        body.negative_prompt = task.negativePrompt;
      }

      // response_format：gpt-image 系列不支持此参数且总是返回 base64，故跳过；
      // 其他 API 设为 url（大多数 API 默认就是 url，显式指定增强兼容性）
      if (presetKey !== 'gpt-image-2' && presetKey !== 'gpt-image-2.5-flare' && presetKey !== 'gpt-image-2.5-sunburst') {
        body.response_format = 'url';
      }



      // ===== 判断是否为图生图模式（有参考图时走图生图） =====
      const hasReference = task.referenceImages && task.referenceImages.length > 0;
      let imageEditFiles: File[] = [];
      let imageEditBase64List: string[] = [];
      let isImageEditMode = false;

      // 压缩图片：最长边限制为 maxSize，质量 quality，输出 JPEG
      const compressImage = async (file: File, maxSize = 2048, quality = 0.85): Promise<File> => {
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 🗜️ 开始压缩参考图：原始大小=${(file.size / 1024).toFixed(1)}KB, type=${file.type}`);
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            let { width, height } = img;
            // eslint-disable-next-line no-console
            logger.info(`${debugPrefix} 🗜️ 原始尺寸: ${width}x${height}`);
            // 等比缩放
            const scale = Math.min(1, maxSize / Math.max(width, height));
            if (scale < 1) {
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              // eslint-disable-next-line no-console
              logger.warn(`${debugPrefix} 🗜️ canvas 不可用，使用原始文件`);
              resolve(file);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  resolve(file);
                  return;
                }
                const compressedName = file.name.replace(/\.[^.]+$/, '') + '_compressed.jpg';
                const compressedFile = new File([blob], compressedName, { type: 'image/jpeg' });
                // eslint-disable-next-line no-console
                logger.info(`${debugPrefix} 🗜️ 压缩完成: ${width}x${height}, ${(compressedFile.size / 1024).toFixed(1)}KB ` +
                  `(压缩率 ${((1 - compressedFile.size / file.size) * 100).toFixed(1)}%)`);
                resolve(compressedFile);
              },
              'image/jpeg',
              quality,
            );
          };
          img.onerror = () => {
            // eslint-disable-next-line no-console
            logger.warn(`${debugPrefix} 🗜️ 图片加载失败，使用原始文件`);
            resolve(file);
          };
          img.src = URL.createObjectURL(file);
        });
      };

      // File 转 base64 字符串
      const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      // 生成全透明 mask 文件（用于 edits 端点图生图）
      let maskFileCache: File | null = null;
      const getMaskFile = async (): Promise<File> => {
        if (maskFileCache) return maskFileCache;
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        maskFileCache = await new Promise<File>((resolve) => {
          canvas.toBlob(
            (blob) => resolve(new File([blob!], 'mask.png', { type: 'image/png' })),
            'image/png',
          );
        });
        return maskFileCache;
      };

      // 参考图 URL 转 Blob 工具函数
      const imageUrlToBlob = async (url: string, name: string): Promise<File> => {
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 🖼️ 参考图 URL 类型检测:`, { arg0: url.substring(0, 30), arg1: '...' });
        const resp = await fetch(url);
        const blob = await resp.blob();
        const ext = name.split('.').pop()?.toLowerCase() || 'png';
        let mime = blob.type;
        if (!mime || mime === 'application/octet-stream') {
          mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        }
        const file = new File([blob], name || `reference.${ext}`, { type: mime });
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 🖼️ 参考图转换完成:`, { arg0: file.name, arg1: (file.size / 1024).toFixed(1) + 'KB', arg2: file.type });
        return file;
      };

      if (hasReference) {
        const refs = task.referenceImages;
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} ========== 图生图：参考图信息 ==========`);
        // eslint-disable-next-line no-console
        logger.info(`${debugPrefix} 参考图数量:`, String(refs.length));

        try {
          // 并行处理所有参考图
          const processed = await Promise.all(
            refs.map(async (ref, idx) => {
              // eslint-disable-next-line no-console
              logger.info(`${debugPrefix} 参考图[${idx + 1}]: ${ref.name} (${(ref.size / 1024).toFixed(1)}KB)`);
              const rawFile = await imageUrlToBlob(ref.url, ref.name);
              const compressed = await compressImage(rawFile, 2048, 0.85);
              const b64 = await fileToBase64(compressed);
              return { file: compressed, b64 };
            })
          );
          imageEditFiles = processed.map((p) => p.file);
          imageEditBase64List = processed.map((p) => p.b64);
          isImageEditMode = true;
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
        } else {
          // auto：根据模型类型决定优先顺序（修复：此前只计算 presetKey 未向 endpoints 添加任何端点，
          // 导致图生图端点数组为空、请求从未发出，报"所有图生图端点均不可用"）
          const presetKeyForEndpoint = matchModelPresetKey(task.model);
          const presetLower = (presetKeyForEndpoint || '').toLowerCase();
          const isGptImage = presetLower.includes('gpt-image');
          const isChatModel = presetLower.includes('grok') || presetLower.includes('gemini');
          if (isGptImage) {
            // OpenAI gpt-image 系：图生图标准端点为 /images/edits
            endpoints.push(...buildEditEndpoints());
          } else if (isChatModel) {
            // 多模态 chat 模型：chat 优先，edits 兜底
            endpoints.push(...buildChatEndpoints());
            endpoints.push(...buildEditEndpoints());
          } else {
            // 其他模型：edits + chat + generations 兜底，由请求循环逐个尝试
            endpoints.push(...buildEditEndpoints());
            endpoints.push(...buildChatEndpoints());
            endpoints.push(...buildGenEndpoints());
          }
        }
        } else {
          // 文生图模式：仅尝试最常用的 2 个端点，其他少见端点不再探测
          if (hasV1Suffix) {
            endpoints.push(`${rawBaseUrl}/images/generations`);
            endpoints.push(`${baseWithoutV1}/v1/images/generations`);
          } else {
            endpoints.push(`${rawBaseUrl}/v1/images/generations`);
            endpoints.push(`${rawBaseUrl}/images/generations`);
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
      const cacheEndpointKey = isImageEditMode ? 'cachedImageEndpoint' : 'cachedTextEndpoint';
      const cacheFailuresKey = isImageEditMode ? 'cachedImageEndpointFailures' : 'cachedTextEndpointFailures';
      const cachedEndpointUrl = isImageEditMode ? apiConfig.cachedImageEndpoint : apiConfig.cachedTextEndpoint;
      const cachedFailures = isImageEditMode ? (apiConfig.cachedImageEndpointFailures ?? 0) : (apiConfig.cachedTextEndpointFailures ?? 0);
      const hasEndpointCache = !!cachedEndpointUrl && cachedFailures < 2;

      const effectiveEndpoints: string[] = [];
      if (hasEndpointCache && cachedEndpointUrl) {
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

        // 格式4: chat/completions 多模态 { choices: [{ message: { content: [{image_url, image_file, image}] } }] }
        if (result.length === 0 && Array.isArray(obj.choices)) {
          for (const choice of obj.choices) {
            const content = choice?.message?.content;
            if (Array.isArray(content)) {
              for (const part of content) {
                if (part?.image_url?.url) result.push(part.image_url.url);
                else if (part?.image_file?.url) result.push(part.image_file.url);
                else if (part?.image?.b64_json) result.push(`data:image/png;base64,${part.image.b64_json}`);
                else if (typeof part === 'string') {
                  // 跳过文本块，只取图片
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

      // ===== 标准 OpenAI 尺寸（当 size 不支持时降级使用）=====
      const STANDARD_SIZES = ['1024x1024', '1024x1792', '1792x1024'];

      // 找最接近的标准尺寸
      const findClosestStandardSize = (w: number, h: number): string => {
        const targetRatio = w / h;
        let best = STANDARD_SIZES[0];
        let bestDiff = Infinity;
        for (const sz of STANDARD_SIZES) {
          const [sw, sh] = sz.split('x').map(Number);
          const diff = Math.abs(targetRatio - sw / sh);
          if (diff < bestDiff) { bestDiff = diff; best = sz; }
        }
        return best;
      };

      // ===== 请求体降级阶梯：遇到 invalid_request 时依次去掉多余字段 =====
      const buildBodyVariants = (base: Record<string, unknown>): Array<{ label: string; body: Record<string, unknown> }> => {
        const variants: Array<{ label: string; body: Record<string, unknown> }> = [];
        variants.push({ label: '完整请求体', body: { ...base } });

        // 变体2：去掉 response_format（少数 API 不支持此字段）
        if ('response_format' in base) {
          const v = { ...variants[variants.length - 1].body };
          delete v.response_format;
          variants.push({ label: '去掉 response_format', body: v });
        }

        // 变体3：去掉 quality（少数 API 不支持 quality 参数）
        if ('quality' in base) {
          const v = { ...variants[variants.length - 1].body };
          delete v.quality;
          variants.push({ label: '去掉 quality', body: v });
        }

        return variants;
      };

      const bodyVariants = buildBodyVariants(body);
      // eslint-disable-next-line no-console
      logger.info(`${debugPrefix} 将尝试 ${bodyVariants.length} 种请求体降级方案:`, String(bodyVariants.map(v => v.label)));

      const parseErrorDetail = (responseText: string): { code?: string; message?: string; full: string } => {
        try {
          const parsed = JSON.parse(responseText);
          return {
            code: parsed?.error?.code || parsed?.code || undefined,
            message: parsed?.error?.message || parsed?.message || parsed?.error || undefined,
            full: responseText,
          };
        } catch {
          return { full: responseText };
        }
      };

      const isInvalidRequestError = (status: number, errInfo: ReturnType<typeof parseErrorDetail>): boolean => {
        if (errInfo.code === 'invalid_request') return true;
        if (errInfo.code === 'invalid_parameter') return true;
        if (errInfo.code === 'bad_request') return true;
        if (status === 400 || status === 422) return true;
        if (status === 503 && (errInfo.code === 'invalid_request' || (errInfo.message && String(errInfo.message).toLowerCase().includes('invalid')))) {
          return true;
        }
        const lowerFull = errInfo.full.toLowerCase();
        if (lowerFull.includes('invalid_request')) return true;
        if (lowerFull.includes('invalid size')) return true;
        if (lowerFull.includes('unsupported size')) return true;
        if (lowerFull.includes('size must be')) return true;
        if (lowerFull.includes('invalid parameter')) return true;
        return false;
      };

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
              let useCacheStrategy = false;
              if (hasValidCache && cachedStrategy) {
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
                // ====== edits 端点：图像编辑（精简为3种核心方案）======
                // 首先尝试 image + mask（标准OpenAI方式，mask=全透明=整图编辑=图生图效果）
                attempts.push({
                  label: 'edits + mask(全透明) · field=image',
                  mode: 'edits-mask',
                  format: 'formdata',
                  fieldName: 'image',
                  extraParams: { __useMask: 'true' },
                });
                // 纯 image 字段
                attempts.push({
                  label: 'edits 基础 · field=image',
                  mode: 'edits',
                  format: 'formdata',
                  fieldName: 'image',
                  extraParams: {},
                });
                attempts.push({
                  label: 'edits 基础 · field=images',
                  mode: 'edits',
                  format: 'formdata',
                  fieldName: 'images',
                  extraParams: {},
                });
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
                    // 多图时在提示词前标注参考图序号
                    const refCount = imageEditBase64List.length;
                    let promptText = String(variant.body.prompt || '');
                    if (refCount > 1) {
                      const refLabels = Array.from({ length: refCount }, (_, i) => `参考图${i + 1}`).join('、');
                      promptText = `[共 ${refCount} 张参考图：${refLabels}，按顺序排列]\n${promptText}`;
                    }
                    const chatContent: Array<Record<string, unknown>> = [
                      { type: 'text', text: promptText },
                    ];
                    // 所有参考图按顺序作为 image_url 块追加
                    imageEditBase64List.forEach((b64, idx) => {
                      chatContent.push({
                        type: 'image_url',
                        image_url: { url: b64 },
                      });
                    });
                    const chatBody = {
                      model: variant.body.model,
                      n: variant.body.n || 1,
                      size: variant.body.size,
                      messages: [
                        {
                          role: 'user',
                          content: chatContent,
                        },
                      ],
                    };
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
                    logger.info(`${debugPrefix}   📦 FormData 参考图数量=${imageEditFiles.length}, 字段名=${attempt.fieldName}`);
                    imageEditFiles.forEach((file, idx) => {
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

                    // edits 端点加 mask（全透明，等于"编辑整张图"）
                    if (attempt.extraParams.__useMask === 'true') {
                      const mask = await getMaskFile();
                      fd.append('mask', mask, mask.name);
                    }

                    // 图生图关键参数：mode + image_weight（只有attempt明确要求时才添加）
                    if (isGenEndpoint && attempt.extraParams.mode) {
                      fd.append('mode', attempt.extraParams.mode);
                      fd.append('image_weight', attempt.extraParams.image_weight || strength);
                    } else if (isEditEndpoint) {
                      fd.append('strength', strength);
                    }

                    // variations 端点不需要 prompt
                    if (!isVarEndpoint && attempt.extraParams.__useMask !== 'true' ? true : !isVarEndpoint) {
                      let promptText = String(variant.body.prompt || '');
                      // 多图时标注参考图数量和顺序
                      if (imageEditFiles.length > 1) {
                        const refLabels = Array.from({ length: imageEditFiles.length }, (_, i) => `参考图${i + 1}`).join('、');
                        promptText = `[共 ${imageEditFiles.length} 张参考图：${refLabels}，按顺序排列]\n${promptText}`;
                      }
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
                    // 多图时给 prompt 加参考图序号说明
                    if (imageEditBase64List.length > 1 && jsonBody.prompt) {
                      const refLabels = Array.from({ length: imageEditBase64List.length }, (_, i) => `参考图${i + 1}`).join('、');
                      jsonBody.prompt = `[共 ${imageEditBase64List.length} 张参考图：${refLabels}，按顺序排列]\n${String(jsonBody.prompt)}`;
                    }
                    if (imageEditBase64List.length === 1) {
                      jsonBody[attempt.fieldName] = imageEditBase64List[0];
                    } else {
                      // 多图：只用 images 数组字段，去掉冗余的 image_0/images[0] 等导致JSON解析错误
                      jsonBody.images = imageEditBase64List;
                      // 同时保留第一张用原字段名（部分API只认单图字段）
                      jsonBody[attempt.fieldName] = imageEditBase64List[0];
                    }
                    // 图生图关键参数：mode + image_weight（只有attempt明确要求时才添加，避免第三方平台不支持导致失败）
                    if (isGenEndpoint && attempt.extraParams.mode) {
                      jsonBody.mode = attempt.extraParams.mode;
                      jsonBody.image_weight = attempt.extraParams.image_weight || strength;
                    } else if (isEditEndpoint) {
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
                  lastError = fetchMsg;
                  // 超时直接停止，不再尝试下一种策略，避免等待太久
                  if (isAbort) {
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
              break; // CORS 错误不用试变体了，直接跳下一个 endpoint
            }

            // 如果是 HTTP 开头的错误（我们自己 throw 的），继续降级或换下一个 endpoint
            if (e instanceof Error && e.message.startsWith('HTTP')) {
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
                if (imageEditBase64List.length === 1) {
                  jsonBody[fieldName] = imageEditBase64List[0];
                } else {
                  jsonBody.images = imageEditBase64List;
                  jsonBody[fieldName] = imageEditBase64List[0];
                }
                // 多图时给 prompt 加参考图序号说明
                if (imageEditBase64List.length > 1 && jsonBody.prompt) {
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
                  const mask = await getMaskFile();
                  fd.append('mask', mask, mask.name);
                }
                if (!isVarEndpoint) {
                  let promptText = String(successVariantBodyForFill.prompt || '');
                  if (imageEditFiles.length > 1) {
                    const refLabels = Array.from({ length: imageEditFiles.length }, (_, k) => `参考图${k + 1}`).join('、');
                    promptText = `[共 ${imageEditFiles.length} 张参考图：${refLabels}，按顺序排列]\n${promptText}`;
                  }
                  fd.append('prompt', promptText);
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
                    if (imageEditFiles.length > 1) {
                      const refLabels = Array.from({ length: imageEditFiles.length }, (_, i) => `参考图${i + 1}`).join('、');
                      promptText = `[共 ${imageEditFiles.length} 张参考图：${refLabels}，按顺序排列]\n${promptText}`;
                    }
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
                  break; // CORS 跳出 endpoint 循环
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

      const newResults = images.map((url: string, i: number) => ({
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

  // 按模型名称模糊匹配对应的预设参数 key（支持带 api-{type}_ 前缀的 ID）
  function matchModelPresetKey(modelIdOrName: string): string | null {
    const lower = modelIdOrName.toLowerCase().replace(/_/g, '-');
    // 精确匹配：先尝试去掉 api-{provider}- 前缀（三段格式）
    // 如果 MODEL_RESOLUTIONS 中没有，再尝试去掉 api-{provider}-{id}- 前缀（四段格式）
    let baseId = lower;
    // 先尝试三段格式：api-{provider}-{model} → {model}
    const match2 = lower.match(/^api-[^-]+-(.+)$/);
    if (match2) {
      baseId = match2[1];
      // 如果三段格式的结果在 MODEL_RESOLUTIONS 中，直接返回
      if (MODEL_RESOLUTIONS[baseId]) return baseId;
      // 如果不在，再尝试四段格式：api-{provider}-{id}-{model} → {model}
      const match3 = lower.match(/^api-[^-]+-[^-]+-(.+)$/);
      if (match3) {
        baseId = match3[1];
        if (MODEL_RESOLUTIONS[baseId]) return baseId;
      }
    }
    if (MODEL_RESOLUTIONS[lower]) return lower;
    // 模糊匹配 —— 更具体的放前面
    if (lower.includes('seedream-5.0-pro') || lower.includes('seedream-5-pro') || lower.includes('seedream5.0pro') || lower.includes('seedream-5-pro')) return 'seedream-5.0-pro';
    if (lower.includes('seedream-5.0-lite') || lower.includes('seedream-5-lite') || lower.includes('seedream5.0lite')) return 'seedream-5.0-lite';
    if (lower.includes('seedream')) return 'seedream-5.0-lite';
    if (lower.includes('qwen-image-3') || lower.includes('qwen-image3') || lower.includes('qwen-image-3.0')) return 'qwen-image-3';
    if (lower.includes('qwen-image')) return 'qwen-image-3';
    if (lower.includes('gemini-3.1-pro') || lower.includes('gemini-3-pro') || lower.includes('gemini3pro')) return 'gemini-3.1-pro-image';
    if (lower.includes('gemini-3.1-flash') || lower.includes('gemini-3-flash') || lower.includes('gemini3flash')) return 'nano-banana-2';
    if (lower.includes('nano-banana') || lower.includes('nanobanana') || lower.includes('爆炸香蕉')) return 'nano-banana-2';
    if (lower.includes('gemini')) return 'nano-banana-2';
    // GPT-Image 2.5 系列（更精确的匹配放前面）
    // GPT-Image 2.5 系列（更精确的匹配放前面）
    if (lower.includes('gpt-image-2.5-flare') || lower.includes('gpt-image-2-5-flare') || lower.includes('2.5-flare')) return 'gpt-image-2.5-flare';
    if (lower.includes('gpt-image-2.5-sunburst') || lower.includes('gpt-image-2-5-sunburst') || lower.includes('2.5-sunburst')) return 'gpt-image-2.5-sunburst';
    if (lower.includes('gpt-image-2.5') || lower.includes('gpt-image-2-5')) return 'gpt-image-2.5-flare';
    if (lower.includes('gpt-image')) return 'gpt-image-2';
    if (lower.includes('jimeng') || lower.includes('ji-meng') || lower.includes('即梦')) return 'jimeng-5.0';
    if (lower.includes('flux-1.1-pro') || lower.includes('flux-1-1-pro') || lower.includes('flux1.1pro')) return 'flux-1.1-pro';
    if (lower.includes('flux-1-dev') || lower.includes('flux-1.dev') || lower.includes('flux-dev')) return 'flux-1-dev';
    if (lower.includes('flux-1-schnell') || lower.includes('flux-1.schnell') || lower.includes('flux-schnell')) return 'flux-1-schnell';
    if (lower.includes('flux')) return 'flux-1.1-pro';
    // Wan 2.7 系列
    if (lower.includes('wan-2.7-global-i2i-pro') || lower.includes('wan2.7-i2i-pro')) return 'wan-2.7-global-i2i-pro';
    if (lower.includes('wan-2.7-global-i2i') || lower.includes('wan2.7-i2i')) return 'wan-2.7-global-i2i';
    if (lower.includes('wan-2.7-global-t2i') || lower.includes('wan2.7-t2i')) return 'wan-2.7-global-t2i';
    if (lower.includes('wan')) return 'wan-2.7-global-i2i';
    // Grok Imagine 系列
    if (lower.includes('grok-imagine-image-2.0') || lower.includes('grok-imagine-2') || lower.includes('grok2')) return 'grok-imagine-image-2.0';
    if (lower.includes('grok-imagine') || lower.includes('grok')) return 'grok-imagine-image-2.0';
    return null;
  }

  const getResolutionsForModel = useCallback((modelId: string) => {
    const key = matchModelPresetKey(modelId);
    if (key) return MODEL_RESOLUTIONS[key] || MODEL_RESOLUTIONS['flux-1.1-pro'] || [];
    return MODEL_RESOLUTIONS['flux-1.1-pro'] || ['1:1正方形·1024×1024', '3:4竖版·768×1024', '4:3横版·1024×768'];
  }, []);

      const getQualitiesForModel = useCallback((modelId: string) => {
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

  // 递归从响应数据中提取模型数组（支持多种 OpenAI 兼容格式）
  function extractModelsFromResponse(data: unknown): any[] {
    if (!data) return [];
    // 直接是数组
    if (Array.isArray(data)) return data;
    if (typeof data !== 'object') return [];

    const obj = data as Record<string, unknown>;
    // 常见字段名
    const candidates = ['data', 'models', 'model_list', 'list', 'items', 'result', 'data.data'];
    for (const key of candidates) {
      if (Array.isArray(obj[key])) return obj[key] as any[];
    }
    // data 是对象再往下找一层
    if (obj.data && typeof obj.data === 'object') {
      const nested = extractModelsFromResponse(obj.data);
      if (nested.length > 0) return nested;
    }
    // 兜底：返回对象中第一个数组
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return obj[key] as any[];
    }
    return [];
  }

  // 从响应中提取分页信息
  function extractPaginationInfo(data: unknown): { hasMore: boolean; nextPage?: string | number | null; total?: number } {
    if (!data || typeof data !== 'object') return { hasMore: false };
    const obj = data as Record<string, unknown>;
    const hasMore = Boolean(
      obj.has_more ?? obj.hasMore ?? obj.hasNext ?? obj.has_next ?? false,
    );
    const nextPage = (obj.next_page ?? obj.nextPage ?? obj.after ?? obj.nextCursor ?? obj.page_token) as string | number | null | undefined;
    const total = typeof obj.total === 'number' ? obj.total : typeof obj.total_count === 'number' ? obj.total_count : undefined;
    return { hasMore, nextPage, total };
  }

  // 从模型项中提取 id 和 name（兼容多种字段格式）
  function extractModelInfo(item: any): { id: string; name: string } | null {
    if (!item || typeof item !== 'object') return null;
    const id = String(item.id ?? item.model ?? item.model_id ?? item.modelId ?? '').trim();
    if (!id) return null;
    const name = String(item.name ?? item.model_name ?? item.display_name ?? item.displayName ?? id).trim();
    return { id, name };
  }

  // 按模型名称/ID 模糊匹配内置预设 key
  function matchPresetKeyForModel(modelId: string, modelName: string): string {
    const lower = `${modelId} ${modelName}`.toLowerCase().replace(/_/g, '-');
    if (MODEL_RESOLUTIONS[modelId]) return modelId;
    // 更具体的放前面
    if (lower.includes('seedream-5.0-pro') || lower.includes('seedream-5-pro') || lower.includes('seedream5.0pro')) return 'seedream-5.0-pro';
    if (lower.includes('seedream-5.0-lite') || lower.includes('seedream-5-lite') || lower.includes('seedream5.0lite')) return 'seedream-5.0-lite';
    if (lower.includes('seedream')) return 'seedream-5.0-lite';
    if (lower.includes('qwen-image-3') || lower.includes('qwen-image3') || lower.includes('qwen-image-3.0')) return 'qwen-image-3';
    if (lower.includes('qwen-image')) return 'qwen-image-3';
    if (lower.includes('gemini-3.1-pro') || lower.includes('gemini-3-pro')) return 'gemini-3.1-pro-image';
    if (lower.includes('gemini-3.1-flash') || lower.includes('gemini-3-flash')) return 'nano-banana-2';
    if (lower.includes('nano-banana') || lower.includes('nanobanana') || lower.includes('爆炸香蕉')) return 'nano-banana-2';
    if (lower.includes('gemini')) return 'nano-banana-2';
    if (lower.includes('gpt-image')) return 'gpt-image-2';
    if (lower.includes('jimeng') || lower.includes('ji-meng') || lower.includes('即梦')) return 'jimeng-5.0';
    if (lower.includes('flux-1-1-pro') || lower.includes('flux-1.1-pro') || lower.includes('flux1.1pro')) return 'flux-1.1-pro';
    if (lower.includes('flux-1-dev') || lower.includes('flux-1.dev') || lower.includes('flux-dev')) return 'flux-1-dev';
    if (lower.includes('flux-1-schnell') || lower.includes('flux-1.schnell') || lower.includes('flux-schnell')) return 'flux-1-schnell';
    if (lower.includes('flux')) return 'flux-1.1-pro';
    return 'flux-1.1-pro';
  }

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

  const verifyApiConfig = useCallback(async (id: string): Promise<boolean> => {
    const config = apiConfigs.find(c => c.id === id);
    if (!config || !config.baseUrl || !config.apiKey) {
      updateApiConfig(id, { status: 'error', errorMsg: '请填写接口地址和密钥' });
      return false;
    }

    const isSecondary = config.isSecondary || id === 'api-custom-2';
    const suffix = isSecondary ? ' · API 2' : '';
    const sourceLabel = isSecondary ? '自定义兼容接口 · API 2' : config.label;

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
    const suffix = isSecondary ? ' · API 2' : '';
    const sourceLabel = isSecondary ? '自定义兼容接口 · API 2' : config.label;
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
