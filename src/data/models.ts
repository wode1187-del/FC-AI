// EXPORTS: IProject, ITask, IReferenceImage, IGenerateResult, IApiConfig, IModel, IPreset, ITextOptimizeConfig, MOCK_PROJECTS, MOCK_TASKS, MOCK_PRESETS, MOCK_MODELS, MOCK_API_CONFIGS, MODEL_RESOLUTIONS, MODEL_QUALITIES, getResolutionGroups

// 项目
export interface IProject {
  id: string;
  name: string;
  techType: string;
  bizTag: string;
  isShared: boolean;
  taskCount: number;
  createdAt: number;
}

// 参考图
export interface IReferenceImage {
  id: string;
  url: string;
  name: string;
  size: number;
}

// 生成结果
export interface IGenerateResult {
  id: string;
  url: string;
  model: string;
  prompt: string;
  createdAt: number;
  width: number;
  height: number;
  /** 结果类型：图片（默认）或视频（视频生成功能产出 mp4） */
  type?: 'image' | 'video';
  /** 视频时长（秒），视频结果特有 */
  duration?: number;
  downloadedJpg?: boolean;  // 是否已下载 JPG
  downloadedPng?: boolean;  // 是否已下载 PNG
}

// 任务
export interface ITask {
  id: string;
  projectId: string;
  index: number;
  enabled: boolean;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  referenceImages: IReferenceImage[];
  prompt: string;
  negativePrompt?: string;
  model: string;
  modelLabel?: string;
  ratio: string;
  quality: string;
  imageCount: number;
  results: IGenerateResult[];
  background?: string;
  /** 视频生成时长（秒），视频功能任务特有 */
  duration?: number;
  /** 视频动作参考（URL），动作跟随/全能替换功能特有 */
  videoRefUrl?: string;
  errorMsg?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

// API 配置
export interface IApiConfig {
  id: string;
  type: 'openai' | 'google' | 'volcengine' | 'custom' | 'kling' | 'seedance';
  label: string;
  baseUrl: string;
  apiKey: string;
  status: 'unverified' | 'verified' | 'error';
  errorMsg?: string;
  verifiedAt?: number;
  isSecondary?: boolean;
  /** 图生图字段名：'auto' 自动检测，或指定字段名 */
  imageEditField?: 'auto' | 'images' | 'image' | 'source_image' | 'image_file' | 'input_image' | 'init_image';
  /** 自动检测到的成功字段名（缓存） */
  cachedImageEditField?: string;
  /** 缓存字段名连续失败次数（达到3次清除缓存重新检测） */
  cachedImageEditFailures?: number;
  /** 图生图模式：自动检测 / edits端点 / generations端点传图 / variations端点 */
  imageEditMode?: 'auto' | 'edits' | 'generations' | 'variations' | 'chat';
  /** 图生图参考图强度 0-1，用于 strength/denoise/image_weight */
  imageEditStrength?: number;
  /** 缓存的图生图成功策略（endpoint类型 + 格式 + 字段名等），加速后续请求 */
  cachedImageEditStrategy?: {
    endpointType: 'generations' | 'edits' | 'variations' | 'chat';
    format: 'formdata' | 'json' | 'chat';
    fieldName: string;
    extraParams?: Record<string, string>;
  };
  /** 缓存策略连续失败次数 */
  cachedImageEditStrategyFailures?: number;
  /** 文生图缓存的成功端点URL，跳过端点探测 */
  cachedTextEndpoint?: string;
  /** 文生图缓存的成功请求体变体索引 */
  cachedTextBodyVariantIndex?: number;
  /** 文生图端点缓存连续失败次数（达到2次清除重新探测） */
  cachedTextEndpointFailures?: number;
  /** 图生图缓存的成功端点URL，跳过端点探测 */
  cachedImageEndpoint?: string;
  /** 图生图缓存的成功请求体变体索引 */
  cachedImageBodyVariantIndex?: number;
  /** 图生图端点缓存连续失败次数（达到2次清除重新探测） */
  cachedImageEndpointFailures?: number;
  /** 是否只支持单张返回（n>1时只返回1张），检测到后缓存，避免重复扣费 */
  singleImageOnly?: boolean;
}

// 模型
export interface IModel {
  id: string;
  name: string;
  apiSource: string;
  apiType: string;
  resolutions: string[];
  qualities: string[];
  isActive: boolean;
  isCustom: boolean;
  isDefault?: boolean;
  apiConfigId?: string;  // 所属 API 配置 ID，用于区分 API 1 / API 2 的同名模型
}

// 提示词优化 API 配置（独立于图片模型 API）
export interface ITextOptimizeConfig {
  baseUrl: string;       // API Base URL，如 https://api.openai.com/v1
  apiKey: string;        // API 密钥
  model: string;         // 当前选中的模型名
  customModels: string[]; // 用户自定义添加的模型名列表
  loadedModels: string[]; // 从 API /v1/models 加载的模型名列表
}

// 参数预设
export interface IPreset {
  id: string;
  name: string;
  model: string;
  ratio: string;
  quality: string;
  imageCount: number;
  prompt: string;
  negativePrompt?: string;
  isSystem?: boolean;
}

// ===== Mock 数据 =====

export const MOCK_PROJECTS: IProject[] = [
  {
    id: 'p1',
    name: '女装光影迁移',
    techType: 'AI图生图',
    bizTag: '电商/女装',
    isShared: false,
    taskCount: 4,
    createdAt: Date.now() - 86400000 * 7,
  },
  {
    id: 'p2',
    name: '春季新品海报',
    techType: 'AI图生图',
    bizTag: '电商/海报',
    isShared: true,
    taskCount: 6,
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'p3',
    name: '详情页主图',
    techType: 'AI图生图',
    bizTag: '电商/主图',
    isShared: false,
    taskCount: 2,
    createdAt: Date.now() - 86400000 * 1,
  },
];

export const MOCK_TASKS: ITask[] = [
  {
    id: 't1',
    projectId: 'p1',
    index: 1,
    enabled: true,
    status: 'pending',
    referenceImages: [],
    prompt: '保持人物、服装与构图不变，仅迁移光影与色调，商业电商摄影，高画质，自然肤色',
    negativePrompt: '',
    model: 'gpt-image-2',
    modelLabel: 'gpt-image-2 · API 2',
    ratio: '2K · 3:4 竖版 · 1536×2048',
    quality: 'High（模型原生高质量 · PNG 无损）',
    imageCount: 4,
    results: [],
    createdAt: Date.now() - 3600000 * 2,
  },
  {
    id: 't2',
    projectId: 'p1',
    index: 2,
    enabled: true,
    status: 'pending',
    referenceImages: [],
    prompt: '',
    negativePrompt: '',
    model: 'gpt-image-2',
    modelLabel: 'gpt-image-2 · API 2',
    ratio: '2K · 3:4 竖版 · 1536×2048',
    quality: 'High（模型原生高质量 · PNG 无损）',
    imageCount: 4,
    results: [],
    createdAt: Date.now() - 3600000 * 1.5,
  },
  {
    id: 't3',
    projectId: 'p1',
    index: 3,
    enabled: true,
    status: 'pending',
    referenceImages: [],
    prompt: '',
    negativePrompt: '',
    model: 'gpt-image-2',
    modelLabel: 'gpt-image-2 · API 2',
    ratio: '2K · 3:4 竖版 · 1536×2048',
    quality: 'High（模型原生高质量 · PNG 无损）',
    imageCount: 4,
    results: [],
    createdAt: Date.now() - 3600000 * 1,
  },
  {
    id: 't4',
    projectId: 'p1',
    index: 4,
    enabled: false,
    status: 'pending',
    referenceImages: [],
    prompt: '',
    negativePrompt: '',
    model: 'gpt-image-2',
    modelLabel: 'gpt-image-2 · API 2',
    ratio: '2K · 3:4 竖版 · 1536×2048',
    quality: 'High（模型原生高质量 · PNG 无损）',
    imageCount: 4,
    results: [],
    createdAt: Date.now() - 1800000,
  },
];

export const MOCK_PRESETS: IPreset[] = [
  {
    id: 'preset1',
    name: '通用·柔和自然光',
    model: 'gpt-image-2',
    ratio: '2K · 3:4 竖版 · 1536×2048',
    quality: 'High（模型原生高质量 · PNG 无损）',
    imageCount: 4,
    prompt: '专业商业摄影，柔和自然光，高画质，细节丰富',
    negativePrompt: '',
    isSystem: true,
  },
  {
    id: 'preset2',
    name: '电商主图·高对比',
    model: 'gpt-image-2',
    ratio: '1K · 1:1 正方形 · 1024×1024',
    quality: 'High（模型原生高质量 · PNG 无损）',
    imageCount: 4,
    prompt: '电商主图，高对比度，简洁背景，产品突出，专业棚拍',
    negativePrompt: '水印,文字,模糊,低质',
    isSystem: true,
  },
  {
    id: 'preset3',
    name: '人像写真·电影感',
    model: 'gemini-2.0-flash-image',
    ratio: '3:4竖版·1536×2048',
    quality: 'High',
    imageCount: 2,
    prompt: '电影感人像，浅景深，柔和逆光，胶片质感',
    negativePrompt: '失真,过曝',
    isSystem: true,
  },
  {
    id: 'preset4',
    name: '风景海报·极简',
    model: 'nano-banana-2',
    ratio: '16:9宽屏·1024×576',
    quality: 'High',
    imageCount: 1,
    prompt: '极简风景，留白构图，高级感，大气磅礴',
    negativePrompt: '',
    isSystem: true,
  },
  {
    id: 'preset5',
    name: '产品摄影·360°',
    model: 'jimeng-5.0',
    ratio: '1:1正方形·1024×1024',
    quality: '超清',
    imageCount: 6,
    prompt: '360度产品展示，纯白背景，均匀布光，商业级精度',
    negativePrompt: '阴影过重,反光',
    isSystem: true,
  },
];

// 内置模型库
export const MOCK_MODELS: IModel[] = [
  {
    id: 'gpt-image-2',
    name: 'GPT-IMAGE-2',
    apiSource: 'OpenAI / GPT Image',
    apiType: 'openai',
    resolutions: [
      '自适应尺寸',
      '自由尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 16:9 宽屏 · 1280×720',
      '1K · 9:16 竖屏 · 720×1280',
      '1K · 3:2 经典 · 1536×1024',
      '1K · 2:3 竖版经典 · 1024×1536',
      '1K · 4:5 社交 · 1024×1280',
      '1K · 5:4 近方 · 1280×1024',
      '1K · 21:9 超宽 · 1680×720',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 3:4 竖版 · 1536×2048',
      '2K · 4:3 横版 · 2048×1536',
      '2K · 16:9 宽屏 · 2048×1152',
      '2K · 9:16 竖屏 · 1152×2048',
      '2K · 3:2 经典 · 2304×1536',
      '2K · 2:3 竖版经典 · 1536×2304',
      '2K · 4:5 社交 · 1536×1920',
      '2K · 5:4 近方 · 1920×1536',
      '2K · 21:9 超宽 · 2688×1152',
      '4K · 1:1 正方形 · 2880×2880',
      '4K · 3:4 竖版 · 2480×3312',
      '4K · 4:3 横版 · 3312×2480',
      '4K · 16:9 宽屏 · 3840×2160',
      '4K · 9:16 竖屏 · 2160×3840',
      '4K · 3:2 经典 · 3504×2336',
      '4K · 2:3 竖版经典 · 2336×3504',
      '4K · 4:5 社交 · 2560×3200',
      '4K · 5:4 近方 · 3200×2560',
      '4K · 21:9 超宽 · 3840×1648',
      ],
    qualities: [
      'High（高质量）',
      'Medium（中等质量）',
      'Low（低质量）',
      ],
    isActive: true,
    isCustom: false,
    isDefault: true,
  },
  {
    id: 'gpt-image-2.5-flare',
    name: 'GPT-IMAGE-2.5 FLARE',
    apiSource: 'OpenAI',
    apiType: 'openai',
    resolutions: [
      '自适应尺寸',
      '自由尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 16:9 宽屏 · 1280×720',
      '1K · 9:16 竖屏 · 720×1280',
      '1K · 3:2 经典 · 1536×1024',
      '1K · 2:3 竖版经典 · 1024×1536',
      '1K · 4:5 社交 · 1024×1280',
      '1K · 5:4 近方 · 1280×1024',
      '1K · 21:9 超宽 · 1680×720',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 3:4 竖版 · 1536×2048',
      '2K · 4:3 横版 · 2048×1536',
      '2K · 16:9 宽屏 · 2048×1152',
      '2K · 9:16 竖屏 · 1152×2048',
      '2K · 3:2 经典 · 2304×1536',
      '2K · 2:3 竖版经典 · 1536×2304',
      '2K · 4:5 社交 · 1536×1920',
      '2K · 5:4 近方 · 1920×1536',
      '2K · 21:9 超宽 · 2688×1152',
      '4K · 1:1 正方形 · 2880×2880',
      '4K · 3:4 竖版 · 2480×3312',
      '4K · 4:3 横版 · 3312×2480',
      '4K · 16:9 宽屏 · 3840×2160',
      '4K · 9:16 竖屏 · 2160×3840',
      '4K · 3:2 经典 · 3504×2336',
      '4K · 2:3 竖版经典 · 2336×3504',
      '4K · 4:5 社交 · 2560×3200',
      '4K · 5:4 近方 · 3200×2560',
      '4K · 21:9 超宽 · 3840×1648',
      ],
    qualities: [
      'Max（最高精度）',
      'XHigh（超高精度）',
      'High（高质量）',
      'Medium（中等质量）',
      'Low（低质量）',
      'Auto（自动选择）',
      ],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'gpt-image-2.5-sunburst',
    name: 'GPT-IMAGE-2.5 SUNBURST',
    apiSource: 'OpenAI',
    apiType: 'openai',
    resolutions: [
      '自适应尺寸',
      '自由尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 16:9 宽屏 · 1280×720',
      '1K · 9:16 竖屏 · 720×1280',
      '1K · 3:2 经典 · 1536×1024',
      '1K · 2:3 竖版经典 · 1024×1536',
      '1K · 4:5 社交 · 1024×1280',
      '1K · 5:4 近方 · 1280×1024',
      '1K · 21:9 超宽 · 1680×720',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 3:4 竖版 · 1536×2048',
      '2K · 4:3 横版 · 2048×1536',
      '2K · 16:9 宽屏 · 2048×1152',
      '2K · 9:16 竖屏 · 1152×2048',
      '2K · 3:2 经典 · 2304×1536',
      '2K · 2:3 竖版经典 · 1536×2304',
      '2K · 4:5 社交 · 1536×1920',
      '2K · 5:4 近方 · 1920×1536',
      '2K · 21:9 超宽 · 2688×1152',
      '4K · 1:1 正方形 · 2880×2880',
      '4K · 3:4 竖版 · 2480×3312',
      '4K · 4:3 横版 · 3312×2480',
      '4K · 16:9 宽屏 · 3840×2160',
      '4K · 9:16 竖屏 · 2160×3840',
      '4K · 3:2 经典 · 3504×2336',
      '4K · 2:3 竖版经典 · 2336×3504',
      '4K · 4:5 社交 · 2560×3200',
      '4K · 5:4 近方 · 3200×2560',
      '4K · 21:9 超宽 · 3840×1648',
      ],
    qualities: [
      'Max（最高精度）',
      'XHigh（超高精度）',
      'High（高质量）',
      'Medium（中等质量）',
      'Low（低质量）',
      'Auto（自动选择）',
      ],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'wan-2.7-global-i2i',
    name: 'Wan 2.7 Global I2I',
    apiSource: 'Wan / 万相',
    apiType: 'wan',
    resolutions: [
      '自适应尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 16:9 宽屏 · 1280×720',
      '1K · 9:16 竖屏 · 720×1280',
      '1K · 3:2 经典 · 1536×1024',
      '1K · 2:3 竖版经典 · 1024×1536',
      '1K · 4:5 社交 · 1024×1280',
      '1K · 5:4 近方 · 1280×1024',
      '1K · 21:9 超宽 · 1680×720',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 3:4 竖版 · 1536×2048',
      '2K · 4:3 横版 · 2048×1536',
      '2K · 16:9 宽屏 · 2048×1152',
      '2K · 9:16 竖屏 · 1152×2048',
      '2K · 3:2 经典 · 2304×1536',
      '2K · 2:3 竖版经典 · 1536×2304',
      '2K · 4:5 社交 · 1536×1920',
      '2K · 5:4 近方 · 1920×1536',
      '2K · 21:9 超宽 · 2688×1152',
      ],
    qualities: [
      'Standard（官方默认）',
],
    isActive: true,
    isCustom: false,
    isDefault: false,
  },
  {
    id: 'wan-2.7-global-i2i-pro',
    name: 'Wan 2.7 Global I2I Pro',
    apiSource: 'Wan / 万相',
    apiType: 'wan',
    resolutions: [
      '自适应尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 16:9 宽屏 · 1280×720',
      '1K · 9:16 竖屏 · 720×1280',
      '1K · 3:2 经典 · 1536×1024',
      '1K · 2:3 竖版经典 · 1024×1536',
      '1K · 4:5 社交 · 1024×1280',
      '1K · 5:4 近方 · 1280×1024',
      '1K · 21:9 超宽 · 1680×720',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 3:4 竖版 · 1536×2048',
      '2K · 4:3 横版 · 2048×1536',
      '2K · 16:9 宽屏 · 2048×1152',
      '2K · 9:16 竖屏 · 1152×2048',
      '2K · 3:2 经典 · 2304×1536',
      '2K · 2:3 竖版经典 · 1536×2304',
      '2K · 4:5 社交 · 1536×1920',
      '2K · 5:4 近方 · 1920×1536',
      '2K · 21:9 超宽 · 2688×1152',
      ],
    qualities: [
      'Standard（官方默认）',
],
    isActive: true,
    isCustom: false,
    isDefault: false,
  },
  {
    id: 'wan-2.7-global-t2i',
    name: 'Wan 2.7 Global T2I',
    apiSource: 'Wan / 万相',
    apiType: 'wan',
    resolutions: [
      '自适应尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 16:9 宽屏 · 1280×720',
      '1K · 9:16 竖屏 · 720×1280',
      '1K · 3:2 经典 · 1536×1024',
      '1K · 2:3 竖版经典 · 1024×1536',
      '1K · 4:5 社交 · 1024×1280',
      '1K · 5:4 近方 · 1280×1024',
      '1K · 21:9 超宽 · 1680×720',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 3:4 竖版 · 1536×2048',
      '2K · 4:3 横版 · 2048×1536',
      '2K · 16:9 宽屏 · 2048×1152',
      '2K · 9:16 竖屏 · 1152×2048',
      '2K · 3:2 经典 · 2304×1536',
      '2K · 2:3 竖版经典 · 1536×2304',
      '2K · 4:5 社交 · 1536×1920',
      '2K · 5:4 近方 · 1920×1536',
      '2K · 21:9 超宽 · 2688×1152',
      '4K · 1:1 正方形 · 2816×2816',
      '4K · 3:4 竖版 · 2304×3072',
      '4K · 4:3 横版 · 3072×2304',
      '4K · 16:9 宽屏 · 3840×2160',
      '4K · 9:16 竖屏 · 2160×3840',
      '4K · 3:2 经典 · 3072×2048',
      '4K · 2:3 竖版经典 · 2048×3072',
      '4K · 4:5 社交 · 2304×2880',
      '4K · 5:4 近方 · 2880×2304',
      '4K · 21:9 超宽 · 3840×1648',
      ],
    qualities: [
      'Standard（官方默认）',
],
    isActive: true,
    isCustom: false,
    isDefault: false,
  },
  {
    id: 'grok-imagine-image-2.0',
    name: 'Grok Imagine Image 2.0',
    apiSource: 'xAI / Grok',
    apiType: 'grok',
    resolutions: [
      '自适应尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 16:9 宽屏 · 1280×720',
      '1K · 9:16 竖屏 · 720×1280',
      '1K · 3:2 经典 · 1536×1024',
      '1K · 2:3 竖版经典 · 1024×1536',
      '1K · 4:5 社交 · 1024×1280',
      '1K · 5:4 近方 · 1280×1024',
      '1K · 21:9 超宽 · 1680×720',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 3:4 竖版 · 1536×2048',
      '2K · 4:3 横版 · 2048×1536',
      '2K · 16:9 宽屏 · 2048×1152',
      '2K · 9:16 竖屏 · 1152×2048',
      '2K · 3:2 经典 · 2304×1536',
      '2K · 2:3 竖版经典 · 1536×2304',
      '2K · 4:5 社交 · 1536×1920',
      '2K · 5:4 近方 · 1920×1536',
      '2K · 21:9 超宽 · 2688×1152',
      ],
    qualities: [
'1K 标准',
'2K 高清',
],
    isActive: true,
    isCustom: false,
    isDefault: false,
  },
  {
    id: 'gemini-2.0-flash-image',
    name: 'Gemini 2.0 Flash Image',
    apiSource: 'Google / Nano Banana',
    apiType: 'google',
    resolutions: [
      '自适应尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 16:9 宽屏 · 1280×720',
      '1K · 9:16 竖屏 · 720×1280',
      '1K · 3:2 经典 · 1536×1024',
      '1K · 2:3 竖版经典 · 1024×1536',
      '1K · 4:5 社交 · 1024×1280',
      '1K · 5:4 近方 · 1280×1024',
      '1K · 21:9 超宽 · 1680×720',
      ],
    qualities: [
'PNG 无损（推荐）',
'JPEG 平衡',
],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'nano-banana-2',
    name: 'Nano Banana（爆炸香蕉）',
    apiSource: 'Google / Nano Banana',
    apiType: 'google',
    resolutions: [
      '自适应尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 2:3 竖版经典 · 848×1264',
      '1K · 3:2 经典 · 1264×848',
      '1K · 3:4 竖版 · 896×1200',
      '1K · 4:3 横版 · 1200×896',
      '1K · 4:5 社交 · 928×1152',
      '1K · 5:4 近方 · 1152×928',
      '1K · 16:9 宽屏 · 1376×768',
      '1K · 9:16 竖屏 · 768×1376',
      '1K · 21:9 超宽 · 1584×672',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 2:3 竖版经典 · 1696×2528',
      '2K · 3:2 经典 · 2528×1696',
      '2K · 3:4 竖版 · 1792×2400',
      '2K · 4:3 横版 · 2400×1792',
      '2K · 4:5 社交 · 1856×2304',
      '2K · 5:4 近方 · 2304×1856',
      '2K · 16:9 宽屏 · 2752×1536',
      '2K · 9:16 竖屏 · 1536×2752',
      '2K · 21:9 超宽 · 3168×1344',
      '4K · 1:1 正方形 · 4096×4096',
      '4K · 2:3 竖版经典 · 3392×5056',
      '4K · 3:2 经典 · 5056×3392',
      '4K · 3:4 竖版 · 3584×4800',
      '4K · 4:3 横版 · 4800×3584',
      '4K · 4:5 社交 · 3712×4608',
      '4K · 5:4 近方 · 4608×3712',
      '4K · 16:9 宽屏 · 5504×3072',
      '4K · 9:16 竖屏 · 3072×5504',
      '4K · 21:9 超宽 · 6336×2688',
      ],
    qualities: [
'PNG 无损（推荐）',
'JPEG 平衡',
],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'jimeng-5.0',
    name: '即梦5.0',
    apiSource: '火山引擎 / 即梦',
    apiType: 'volcengine',
    resolutions: [
      '自适应尺寸（由模型决定）',
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 4:3 横版 · 1152×864',
      '1K · 3:4 竖版 · 864×1152',
      '1K · 16:9 宽屏 · 1312×736',
      '1K · 9:16 竖屏 · 736×1312',
      '1K · 3:2 经典 · 1248×832',
      '1K · 2:3 竖版经典 · 832×1248',
      '1K · 21:9 超宽 · 1568×672',
      '1.5K · 1:1 正方形 · 1536×1536',
      '1.5K · 4:3 横版 · 1792×1344',
      '1.5K · 3:4 竖版 · 1344×1792',
      '1.5K · 16:9 宽屏 · 2048×1152',
      '1.5K · 9:16 竖屏 · 1152×2048',
      '1.5K · 21:9 超宽 · 2352×1008',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 4:3 横版 · 2304×1728',
      '2K · 3:4 竖版 · 1728×2304',
      '2K · 16:9 宽屏 · 2848×1600',
      '2K · 9:16 竖屏 · 1600×2848',
      '2K · 3:2 经典 · 2496×1664',
      '2K · 2:3 竖版经典 · 1664×2496',
      '2K · 21:9 超宽 · 3136×1344',
      ],
    qualities: [
    'Standard（官方默认）',
    ],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'flux-1.1-pro',
    name: 'FLUX.1.1 Pro',
    apiSource: '自定义兼容接口',
    apiType: 'custom',
    resolutions: [
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 9:16 竖屏 · 832×1216',
      '1K · 16:9 宽屏 · 1216×832',
      '1.4K · 1:1 高清 · 1408×1408',
      ],
    qualities: [
'Standard',
'High',
'Quality（质量优先）',
],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'flux-1-dev',
    name: 'FLUX.1 Dev',
    apiSource: '自定义兼容接口',
    apiType: 'custom',
    resolutions: [
      '1K · 1:1 正方形 · 1024×1024',
      '0.5K · 1:1 标清 · 512×512',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      ],
    qualities: [
'Standard',
'High',
],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'flux-1-schnell',
    name: 'FLUX.1 Schnell',
    apiSource: '自定义兼容接口',
    apiType: 'custom',
    resolutions: [
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      ],
    qualities: [
'Standard（快速）',
],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'seedream-5.0-lite',
    name: 'Seedream 5.0 Lite',
    apiSource: '火山引擎 / 即梦',
    apiType: 'volcengine',
    resolutions: [
      '自适应尺寸（由模型决定）',
      '2K · 1:1 正方形 · 2048×2048',
      '2K · 4:3 横版 · 2304×1728',
      '2K · 3:4 竖版 · 1728×2304',
      '2K · 16:9 宽屏 · 2848×1600',
      '2K · 9:16 竖屏 · 1600×2848',
      '2K · 3:2 经典 · 2496×1664',
      '2K · 2:3 竖版经典 · 1664×2496',
      '2K · 21:9 超宽 · 3136×1344',
      '3K · 1:1 正方形 · 3072×3072',
      '3K · 4:3 横版 · 3456×2592',
      '3K · 3:4 竖版 · 2592×3456',
      '3K · 16:9 宽屏 · 4096×2304',
      '3K · 9:16 竖屏 · 2304×4096',
      '3K · 3:2 经典 · 3744×2496',
      '3K · 2:3 竖版经典 · 2496×3744',
      '3K · 21:9 超宽 · 4704×2016',
      '4K · 1:1 正方形 · 4096×4096',
      '4K · 4:3 横版 · 4704×3520',
      '4K · 3:4 竖版 · 3520×4704',
      '4K · 16:9 宽屏 · 5504×3040',
      '4K · 9:16 竖屏 · 3040×5504',
      '4K · 3:2 经典 · 4992×3328',
      '4K · 2:3 竖版经典 · 3328×4992',
      '4K · 21:9 超宽 · 6240×2656',
      ],
    qualities: [
    'Standard（官方默认）',
    ],
    isActive: true,
    isCustom: false,
  },
];

export const MOCK_API_CONFIGS: IApiConfig[] = [
  {
    id: 'api-openai',
    type: 'openai',
    label: 'OpenAI / GPT Image',
    baseUrl: '',
    apiKey: '',
    status: 'unverified',
  },
  {
    id: 'api-google',
    type: 'google',
    label: 'Google / Nano Banana',
    baseUrl: '',
    apiKey: '',
    status: 'unverified',
  },
  {
    id: 'api-volcengine',
    type: 'volcengine',
    label: '火山引擎 / 即梦',
    baseUrl: '',
    apiKey: '',
    status: 'unverified',
  },
  {
    id: 'api-custom-1',
    type: 'custom',
    label: '自定义兼容接口 API 1',
    baseUrl: '',
    apiKey: '',
    status: 'unverified',
  },
  {
    id: 'api-custom-2',
    type: 'custom',
    label: '自定义兼容接口 API 2',
    baseUrl: '',
    apiKey: '',
    status: 'unverified',
    isSecondary: true,
  },
  {
    id: 'api-kling',
    type: 'kling',
    label: '可灵视频',
    baseUrl: 'https://api-beijing.klingai.com',
    apiKey: '',
    status: 'unverified',
  },
  {
    id: 'api-seedance',
    type: 'seedance',
    label: '即梦视频',
    baseUrl: 'https://ark.cn-beijing.volces.com',
    apiKey: '',
    status: 'unverified',
  },
];

// 分辨率映射表（用于ratio解析）
export const MODEL_RESOLUTIONS: Record<string, string[]> = {
  'gpt-image-2.5-flare': [
    '自适应尺寸',
    '自由尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 16:9 宽屏 · 1280×720',
    '1K · 9:16 竖屏 · 720×1280',
    '1K · 3:2 经典 · 1536×1024',
    '1K · 2:3 竖版经典 · 1024×1536',
    '1K · 4:5 社交 · 1024×1280',
    '1K · 5:4 近方 · 1280×1024',
    '1K · 21:9 超宽 · 1680×720',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 3:4 竖版 · 1536×2048',
    '2K · 4:3 横版 · 2048×1536',
    '2K · 16:9 宽屏 · 2048×1152',
    '2K · 9:16 竖屏 · 1152×2048',
    '2K · 3:2 经典 · 2304×1536',
    '2K · 2:3 竖版经典 · 1536×2304',
    '2K · 4:5 社交 · 1536×1920',
    '2K · 5:4 近方 · 1920×1536',
    '2K · 21:9 超宽 · 2688×1152',
    '4K · 1:1 正方形 · 2880×2880',
    '4K · 3:4 竖版 · 2480×3312',
    '4K · 4:3 横版 · 3312×2480',
    '4K · 16:9 宽屏 · 3840×2160',
    '4K · 9:16 竖屏 · 2160×3840',
    '4K · 3:2 经典 · 3504×2336',
    '4K · 2:3 竖版经典 · 2336×3504',
    '4K · 4:5 社交 · 2560×3200',
    '4K · 5:4 近方 · 3200×2560',
    '4K · 21:9 超宽 · 3840×1648',
    ],
  'gpt-image-2.5-sunburst': [
    '自适应尺寸',
    '自由尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 16:9 宽屏 · 1280×720',
    '1K · 9:16 竖屏 · 720×1280',
    '1K · 3:2 经典 · 1536×1024',
    '1K · 2:3 竖版经典 · 1024×1536',
    '1K · 4:5 社交 · 1024×1280',
    '1K · 5:4 近方 · 1280×1024',
    '1K · 21:9 超宽 · 1680×720',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 3:4 竖版 · 1536×2048',
    '2K · 4:3 横版 · 2048×1536',
    '2K · 16:9 宽屏 · 2048×1152',
    '2K · 9:16 竖屏 · 1152×2048',
    '2K · 3:2 经典 · 2304×1536',
    '2K · 2:3 竖版经典 · 1536×2304',
    '2K · 4:5 社交 · 1536×1920',
    '2K · 5:4 近方 · 1920×1536',
    '2K · 21:9 超宽 · 2688×1152',
    '4K · 1:1 正方形 · 2880×2880',
    '4K · 3:4 竖版 · 2480×3312',
    '4K · 4:3 横版 · 3312×2480',
    '4K · 16:9 宽屏 · 3840×2160',
    '4K · 9:16 竖屏 · 2160×3840',
    '4K · 3:2 经典 · 3504×2336',
    '4K · 2:3 竖版经典 · 2336×3504',
    '4K · 4:5 社交 · 2560×3200',
    '4K · 5:4 近方 · 3200×2560',
    '4K · 21:9 超宽 · 3840×1648',
    ],
  'gpt-image-2': [
    '自适应尺寸',
    '自由尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 16:9 宽屏 · 1280×720',
    '1K · 9:16 竖屏 · 720×1280',
    '1K · 3:2 经典 · 1536×1024',
    '1K · 2:3 竖版经典 · 1024×1536',
    '1K · 4:5 社交 · 1024×1280',
    '1K · 5:4 近方 · 1280×1024',
    '1K · 21:9 超宽 · 1680×720',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 3:4 竖版 · 1536×2048',
    '2K · 4:3 横版 · 2048×1536',
    '2K · 16:9 宽屏 · 2048×1152',
    '2K · 9:16 竖屏 · 1152×2048',
    '2K · 3:2 经典 · 2304×1536',
    '2K · 2:3 竖版经典 · 1536×2304',
    '2K · 4:5 社交 · 1536×1920',
    '2K · 5:4 近方 · 1920×1536',
    '2K · 21:9 超宽 · 2688×1152',
    '4K · 1:1 正方形 · 2880×2880',
    '4K · 3:4 竖版 · 2480×3312',
    '4K · 4:3 横版 · 3312×2480',
    '4K · 16:9 宽屏 · 3840×2160',
    '4K · 9:16 竖屏 · 2160×3840',
    '4K · 3:2 经典 · 3504×2336',
    '4K · 2:3 竖版经典 · 2336×3504',
    '4K · 4:5 社交 · 2560×3200',
    '4K · 5:4 近方 · 3200×2560',
    '4K · 21:9 超宽 · 3840×1648',
    ],
  'wan-2.7-global-i2i': [
    '自适应尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 16:9 宽屏 · 1280×720',
    '1K · 9:16 竖屏 · 720×1280',
    '1K · 3:2 经典 · 1536×1024',
    '1K · 2:3 竖版经典 · 1024×1536',
    '1K · 4:5 社交 · 1024×1280',
    '1K · 5:4 近方 · 1280×1024',
    '1K · 21:9 超宽 · 1680×720',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 3:4 竖版 · 1536×2048',
    '2K · 4:3 横版 · 2048×1536',
    '2K · 16:9 宽屏 · 2048×1152',
    '2K · 9:16 竖屏 · 1152×2048',
    '2K · 3:2 经典 · 2304×1536',
    '2K · 2:3 竖版经典 · 1536×2304',
    '2K · 4:5 社交 · 1536×1920',
    '2K · 5:4 近方 · 1920×1536',
    '2K · 21:9 超宽 · 2688×1152',
    ],
  'wan-2.7-global-i2i-pro': [
    '自适应尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 16:9 宽屏 · 1280×720',
    '1K · 9:16 竖屏 · 720×1280',
    '1K · 3:2 经典 · 1536×1024',
    '1K · 2:3 竖版经典 · 1024×1536',
    '1K · 4:5 社交 · 1024×1280',
    '1K · 5:4 近方 · 1280×1024',
    '1K · 21:9 超宽 · 1680×720',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 3:4 竖版 · 1536×2048',
    '2K · 4:3 横版 · 2048×1536',
    '2K · 16:9 宽屏 · 2048×1152',
    '2K · 9:16 竖屏 · 1152×2048',
    '2K · 3:2 经典 · 2304×1536',
    '2K · 2:3 竖版经典 · 1536×2304',
    '2K · 4:5 社交 · 1536×1920',
    '2K · 5:4 近方 · 1920×1536',
    '2K · 21:9 超宽 · 2688×1152',
    ],
  'wan-2.7-global-t2i': [
    '自适应尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 16:9 宽屏 · 1280×720',
    '1K · 9:16 竖屏 · 720×1280',
    '1K · 3:2 经典 · 1536×1024',
    '1K · 2:3 竖版经典 · 1024×1536',
    '1K · 4:5 社交 · 1024×1280',
    '1K · 5:4 近方 · 1280×1024',
    '1K · 21:9 超宽 · 1680×720',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 3:4 竖版 · 1536×2048',
    '2K · 4:3 横版 · 2048×1536',
    '2K · 16:9 宽屏 · 2048×1152',
    '2K · 9:16 竖屏 · 1152×2048',
    '2K · 3:2 经典 · 2304×1536',
    '2K · 2:3 竖版经典 · 1536×2304',
    '2K · 4:5 社交 · 1536×1920',
    '2K · 5:4 近方 · 1920×1536',
    '2K · 21:9 超宽 · 2688×1152',
    '4K · 1:1 正方形 · 2816×2816',
    '4K · 3:4 竖版 · 2304×3072',
    '4K · 4:3 横版 · 3072×2304',
    '4K · 16:9 宽屏 · 3840×2160',
    '4K · 9:16 竖屏 · 2160×3840',
    '4K · 3:2 经典 · 3072×2048',
    '4K · 2:3 竖版经典 · 2048×3072',
    '4K · 4:5 社交 · 2304×2880',
    '4K · 5:4 近方 · 2880×2304',
    '4K · 21:9 超宽 · 3840×1648',
    ],
  'grok-imagine-image-2.0': [
    '自适应尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 16:9 宽屏 · 1280×720',
    '1K · 9:16 竖屏 · 720×1280',
    '1K · 3:2 经典 · 1536×1024',
    '1K · 2:3 竖版经典 · 1024×1536',
    '1K · 4:5 社交 · 1024×1280',
    '1K · 5:4 近方 · 1280×1024',
    '1K · 21:9 超宽 · 1680×720',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 3:4 竖版 · 1536×2048',
    '2K · 4:3 横版 · 2048×1536',
    '2K · 16:9 宽屏 · 2048×1152',
    '2K · 9:16 竖屏 · 1152×2048',
    '2K · 3:2 经典 · 2304×1536',
    '2K · 2:3 竖版经典 · 1536×2304',
    '2K · 4:5 社交 · 1536×1920',
    '2K · 5:4 近方 · 1920×1536',
    '2K · 21:9 超宽 · 2688×1152',
    ],
  'gemini-2.0-flash-image': [
    '自适应尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 16:9 宽屏 · 1280×720',
    '1K · 9:16 竖屏 · 720×1280',
    '1K · 3:2 经典 · 1536×1024',
    '1K · 2:3 竖版经典 · 1024×1536',
    '1K · 4:5 社交 · 1024×1280',
    '1K · 5:4 近方 · 1280×1024',
    '1K · 21:9 超宽 · 1680×720',
    ],
  'nano-banana-2': [
    '自适应尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 2:3 竖版经典 · 848×1264',
    '1K · 3:2 经典 · 1264×848',
    '1K · 3:4 竖版 · 896×1200',
    '1K · 4:3 横版 · 1200×896',
    '1K · 4:5 社交 · 928×1152',
    '1K · 5:4 近方 · 1152×928',
    '1K · 16:9 宽屏 · 1376×768',
    '1K · 9:16 竖屏 · 768×1376',
    '1K · 21:9 超宽 · 1584×672',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 2:3 竖版经典 · 1696×2528',
    '2K · 3:2 经典 · 2528×1696',
    '2K · 3:4 竖版 · 1792×2400',
    '2K · 4:3 横版 · 2400×1792',
    '2K · 4:5 社交 · 1856×2304',
    '2K · 5:4 近方 · 2304×1856',
    '2K · 16:9 宽屏 · 2752×1536',
    '2K · 9:16 竖屏 · 1536×2752',
    '2K · 21:9 超宽 · 3168×1344',
    '4K · 1:1 正方形 · 4096×4096',
    '4K · 2:3 竖版经典 · 3392×5056',
    '4K · 3:2 经典 · 5056×3392',
    '4K · 3:4 竖版 · 3584×4800',
    '4K · 4:3 横版 · 4800×3584',
    '4K · 4:5 社交 · 3712×4608',
    '4K · 5:4 近方 · 4608×3712',
    '4K · 16:9 宽屏 · 5504×3072',
    '4K · 9:16 竖屏 · 3072×5504',
    '4K · 21:9 超宽 · 6336×2688',
    ],
  'jimeng-5.0': [
    '自适应尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 4:3 横版 · 1152×864',
    '1K · 3:4 竖版 · 864×1152',
    '1K · 16:9 宽屏 · 1312×736',
    '1K · 9:16 竖屏 · 736×1312',
    '1K · 3:2 经典 · 1248×832',
    '1K · 2:3 竖版经典 · 832×1248',
    '1K · 21:9 超宽 · 1568×672',
    '1.5K · 1:1 正方形 · 1536×1536',
    '1.5K · 4:3 横版 · 1792×1344',
    '1.5K · 3:4 竖版 · 1344×1792',
    '1.5K · 16:9 宽屏 · 2048×1152',
    '1.5K · 9:16 竖屏 · 1152×2048',
    '1.5K · 21:9 超宽 · 2352×1008',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 4:3 横版 · 2304×1728',
    '2K · 3:4 竖版 · 1728×2304',
    '2K · 16:9 宽屏 · 2848×1600',
    '2K · 9:16 竖屏 · 1600×2848',
    '2K · 3:2 经典 · 2496×1664',
    '2K · 2:3 竖版经典 · 1664×2496',
    '2K · 21:9 超宽 · 3136×1344',
  ],
  'flux-1.1-pro': [
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 9:16 竖屏 · 832×1216',
    '1K · 16:9 宽屏 · 1216×832',
    '1.4K · 1:1 高清 · 1408×1408',
    ],
  'flux-1-dev': [
    '1K · 1:1 正方形 · 1024×1024',
    '0.5K · 1:1 标清 · 512×512',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    ],
  'flux-1-schnell': [
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 4:3 横版 · 1024×768',
    ],
  'gemini-3.1-pro-image': [
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 16:9 宽屏 · 1024×576',
    '1K · 9:16 手机竖屏 · 576×1024',
    '1K · 4:3 横版 · 1024×768',
    '1K · 3:4 竖版 · 768×1024',
    '1K · 3:2 经典横版 · 1024×683',
    '1K · 2:3 经典竖版 · 683×1024',
    '1K · 5:4 近方 · 1024×819',
    '1K · 4:5 社交竖版 · 819×1024',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 16:9 宽屏 · 2048×1152',
    '2K · 9:16 手机竖屏 · 1152×2048',
    '2K · 4:3 横版 · 2048×1536',
    '2K · 3:4 竖版 · 1536×2048',
    '2K · 3:2 经典横版 · 2048×1365',
    '2K · 2:3 经典竖版 · 1365×2048',
    '2K · 5:4 近方 · 2048×1638',
    '2K · 4:5 社交竖版 · 1638×2048',
    '4K · 1:1 正方形 · 4096×4096',
    '4K · 16:9 宽屏 · 4096×2304',
    '4K · 9:16 手机竖屏 · 2304×4096',
    '4K · 4:3 横版 · 4096×3072',
    '4K · 3:4 竖版 · 3072×4096',
    '4K · 3:2 经典横版 · 4096×2731',
    '4K · 2:3 经典竖版 · 2731×4096',
    '4K · 5:4 近方 · 4096×3277',
    '4K · 4:5 社交竖版 · 3277×4096',
  ],
  'qwen-image-3': [
    '自动 · 模型推荐 · 1664×928',
    '常用 · 1:1 正方形 · 1024×1024',
    '常用 · 1:1 正方形 · 2048×2048',
    '常用 · 16:9 宽屏 · 1664×928',
    '常用 · 16:9 宽屏 · 1920×1080',
    '常用 · 9:16 竖屏 · 928×1664',
    '常用 · 9:16 竖屏 · 1080×1920',
    '常用 · 4:3 横版 · 1472×1104',
    '常用 · 3:4 竖版 · 1104×1472',
    '常用 · 3:2 横版 · 1536×1024',
    '常用 · 2:3 竖版 · 1024×1536',
    '常用 · 4:5 社交 · 1280×1600',
    '常用 · 5:4 近方 · 1600×1280',
    '常用 · 21:9 超宽 · 2048×878',
    '自定义 · 自定义尺寸 · 宽×高',
  ],
  'seedream-5.0-lite': [
    '自适应尺寸（由模型决定）',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 4:3 横版 · 2304×1728',
    '2K · 3:4 竖版 · 1728×2304',
    '2K · 16:9 宽屏 · 2848×1600',
    '2K · 9:16 竖屏 · 1600×2848',
    '2K · 3:2 经典 · 2496×1664',
    '2K · 2:3 竖版经典 · 1664×2496',
    '2K · 21:9 超宽 · 3136×1344',
    '3K · 1:1 正方形 · 3072×3072',
    '3K · 4:3 横版 · 3456×2592',
    '3K · 3:4 竖版 · 2592×3456',
    '3K · 16:9 宽屏 · 4096×2304',
    '3K · 9:16 竖屏 · 2304×4096',
    '3K · 3:2 经典 · 3744×2496',
    '3K · 2:3 竖版经典 · 2496×3744',
    '3K · 21:9 超宽 · 4704×2016',
    '4K · 1:1 正方形 · 4096×4096',
    '4K · 4:3 横版 · 4704×3520',
    '4K · 3:4 竖版 · 3520×4704',
    '4K · 16:9 宽屏 · 5504×3040',
    '4K · 9:16 竖屏 · 3040×5504',
    '4K · 3:2 经典 · 4992×3328',
    '4K · 2:3 竖版经典 · 3328×4992',
    '4K · 21:9 超宽 · 6240×2656',
  ],
  'seedream-5.0-pro': [
    '自适应尺寸（由模型决定）',
    '1K · 1:1 正方形 · 1024×1024',
    '1K · 4:3 横版 · 1152×864',
    '1K · 3:4 竖版 · 864×1152',
    '1K · 16:9 宽屏 · 1312×736',
    '1K · 9:16 竖屏 · 736×1312',
    '1K · 3:2 经典 · 1248×832',
    '1K · 2:3 竖版经典 · 832×1248',
    '1K · 21:9 超宽 · 1568×672',
    '1.5K · 1:1 正方形 · 1536×1536',
    '1.5K · 4:3 横版 · 1792×1344',
    '1.5K · 3:4 竖版 · 1344×1792',
    '1.5K · 16:9 宽屏 · 2048×1152',
    '1.5K · 9:16 竖屏 · 1152×2048',
    '1.5K · 21:9 超宽 · 2352×1008',
    '2K · 1:1 正方形 · 2048×2048',
    '2K · 4:3 横版 · 2304×1728',
    '2K · 3:4 竖版 · 1728×2304',
    '2K · 16:9 宽屏 · 2848×1600',
    '2K · 9:16 竖屏 · 1600×2848',
    '2K · 3:2 经典 · 2496×1664',
    '2K · 2:3 竖版经典 · 1664×2496',
    '2K · 21:9 超宽 · 3136×1344',
  ],
};
export function getResolutionGroups(resolutions: string[]): { label: string; items: string[] }[] {
  const groups: { label: string; items: string[] }[] = [];
  const order = ['自适应', '自动', '0.5K', '1K', '1.4K', '1.5K', '2K', '3K', '4K', '极端', '常用', '自定义'];
  const map = new Map<string, string[]>();
  for (const r of resolutions) {
    let key = '自适应';
    if (r.startsWith('自动 ')) key = '自动';
    else if (r.startsWith('0.5K ')) key = '0.5K';
    else if (r.startsWith('1K ')) key = '1K';
    else if (r.startsWith('1.4K ')) key = '1.4K';
    else if (r.startsWith('1.5K ')) key = '1.5K';
    else if (r.startsWith('2K ')) key = '2K';
    else if (r.startsWith('3K ')) key = '3K';
    else if (r.startsWith('4K ')) key = '4K';
    else if (r.startsWith('极端 ')) key = '极端';
    else if (r.startsWith('常用 ')) key = '常用';
    else if (r.startsWith('自定义 ')) key = '自定义';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  for (const k of order) {
    if (map.has(k)) groups.push({ label: k + '尺寸', items: map.get(k)! });
  }
  return groups;
}

// 质量选项映射（按模型API特性）
export const MODEL_QUALITIES: Record<string, string[]> = {
  'gpt-image-2.5-flare': [
    'Max（最高精度）',
    'XHigh（超高精度）',
    'High（高质量）',
    'Medium（中等质量）',
    'Low（低质量）',
    'Auto（自动选择）',
    ],
  'gpt-image-2.5-sunburst': [
    'Max（最高精度）',
    'XHigh（超高精度）',
    'High（高质量）',
    'Medium（中等质量）',
    'Low（低质量）',
    'Auto（自动选择）',
    ],
  'gpt-image-2': [
    'High（高质量）',
    'Medium（中等质量）',
    'Low（低质量）',
    ],
  'wan-2.7-global-i2i': [
    'Standard（官方默认）',
    ],
  'wan-2.7-global-i2i-pro': [
    'Standard（官方默认）',
    ],
  'wan-2.7-global-t2i': [
    'Standard（官方默认）',
    ],
  'grok-imagine-image-2.0': [
    '1K 标准',
    '2K 高清',
    ],
  'gemini-2.0-flash-image': [
    'PNG 无损（推荐）',
    'JPEG 平衡',
    ],
  'nano-banana-2': [
    'PNG 无损（推荐）',
    'JPEG 平衡',
    ],
  'jimeng-5.0': [
    'Standard（官方默认）',
    ],
  'flux-1.1-pro': [
    'Standard',
    'High',
    'Quality（质量优先）',
    ],
  'flux-1-dev': [
    'Standard',
    'High',
    ],
  'flux-1-schnell': [
    'Standard（快速）',
    ],
  'gemini-3.1-pro-image': [
    'PNG 无损（推荐）',
    'JPEG 平衡',
  ],
  'qwen-image-3': [
    '1K 快速草稿',
    '2K 最终成品',
  ],
  'seedream-5.0-lite': [
    'Standard（官方默认）',
  ],
  'seedream-5.0-pro': [
    'Standard（官方默认）',
  ],
};

// 模型背景选项配置（gpt-image 2.5 系列支持透明背景）
export const MODEL_BACKGROUNDS: Record<string, string[]> = {
  'gpt-image-2.5-flare': ['Auto（自动）', 'Opaque（不透明）', 'Transparent（透明，仅支持PNG）'],
  'gpt-image-2.5-sunburst': ['Auto（自动）', 'Opaque（不透明）', 'Transparent（透明，仅支持PNG）'],
};
