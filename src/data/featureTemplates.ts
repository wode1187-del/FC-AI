// ============================================================
// 功能模板系统：服装商拍 / 服装设计 / 视频生成
// 每个功能 = 预置专业提示词 + 自动推荐模型 + 默认参数
// 选择功能后一键应用到任务，无需再填关键词
// ============================================================
import type { IModel } from './models';

export type FeatureCategory = 'shoot' | 'design' | 'video';
export type FeatureMode =
  | 'img2img'      // 图生图：参考图 -> 目标效果
  | 'text2img'     // 文生图：文字 -> 图
  | 'img2video'    // 图生视频：参考图 -> 动态视频
  | 'text2video'   // 文生视频：文字 -> 视频
  | 'video-motion' // 动作跟随：形象图 + 动作参考视频
  | 'library';     // 资产管理（我的视频）

export interface IFeatureTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: FeatureCategory;
  mode: FeatureMode;
  /** 预置专业提示词（免填关键词，直接可用） */
  prompt: string;
  negativePrompt?: string;
  /** 自动推荐模型 id（在现有图像模型或视频模型中） */
  recommendedModel: string;
  /** 自定义可选模型 id 列表；为空表示全部模型可选 */
  customModels?: string[];
  params: {
    ratio?: string;
    quality?: string;
    imageCount?: number;
    background?: string;
    /** 视频时长（秒） */
    duration?: number;
  };
  /** 是否需要上传参考图 */
  requiresImage: boolean;
  /** 是否需要动作参考视频（动作跟随） */
  requiresVideo?: boolean;
  /** 底层实现流程说明（展示给用户） */
  steps: string[];
}

// ============================================================
// 视频生成模型（独立于图像模型，走可灵 / 即梦 Seedance API）
// ============================================================
export const VIDEO_MODELS: IModel[] = [
  {
    id: 'kling-v3',
    name: 'KLING 3.0（可灵）',
    apiSource: '可灵 AI',
    apiType: 'kling',
    resolutions: ['16:9 横屏', '9:16 竖屏', '1:1 方形'],
    qualities: ['1080P 高清', '720P 标准'],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'kling-v2-6',
    name: 'KLING 2.6（可灵）',
    apiSource: '可灵 AI',
    apiType: 'kling',
    resolutions: ['16:9 横屏', '9:16 竖屏', '1:1 方形'],
    qualities: ['1080P 高清', '720P 标准'],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'doubao-seedance-2.5',
    name: 'SEEDANCE 2.5（即梦）',
    apiSource: '火山方舟',
    apiType: 'seedance',
    resolutions: ['16:9 横屏', '9:16 竖屏', '1:1 方形'],
    qualities: ['1080P 高清', '720P 标准'],
    isActive: true,
    isCustom: false,
  },
];

export const FEATURE_CATEGORIES: { id: FeatureCategory; name: string; icon: string; desc: string }[] = [
  { id: 'shoot', name: '服装商拍', icon: '📸', desc: '服装上身、商拍套图、模特试穿等电商出图' },
  { id: 'design', name: '服装设计', icon: '🎨', desc: '改款、改色、线稿、面料图案等设计功能' },
  { id: 'video', name: '视频生成', icon: '🎬', desc: '商品展示视频、动作跟随、故事板等视频创作' },
];

// ============================================================
// 30 个子功能模板
// ============================================================
export const FEATURE_TEMPLATES: IFeatureTemplate[] = [
  // ==================== 服装商拍（13） ====================
  {
    id: 'shoot-tryon',
    name: '款式上身',
    description: '服装图一键上身试穿',
    icon: '👕',
    category: 'shoot',
    mode: 'img2img',
    prompt: '将上传的服装平铺图/挂拍图穿到一位专业电商女模特身上，模特身材匀称、自然站立，服装完全贴合模特身体、版型自然垂坠，保持服装的颜色、图案、材质细节完全不变，影棚商业摄影灯光，浅灰纯色背景，高清细节，电商主图质感。',
    negativePrompt: '服装变形、图案错乱、多余肢体、手指变形、水印、文字、低质量、模糊',
    recommendedModel: 'gpt-image-2',
    customModels: ['gpt-image-2', 'gpt-image-2.5-flare', 'jimeng-5.0', 'seedream-5.0-lite', 'nano-banana-2'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传服装图（平铺/挂拍/白底单品均可）', 'AI 识别服装轮廓与面料细节', '图生图模型将服装穿到虚拟模特身上', '输出多张上身效果图'],
  },
  {
    id: 'shoot-detail',
    name: '商品详情',
    description: '商品图快速生成详情图',
    icon: '🛍️',
    category: 'shoot',
    mode: 'img2img',
    prompt: '将上传的商品图优化为电商详情页首图，主体清晰居中，保留商品全部细节特征，干净渐变背景衬托商品质感，商业产品摄影，柔和自然光，高分辨率细节，适合放在详情页顶部。',
    negativePrompt: '文字、水印、杂乱背景、变形、模糊、低质量',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传商品原图', 'AI 抠出主体并保留细节', '生成干净背景的商品主图', '输出多张可用的详情首图'],
  },
  {
    id: 'shoot-set',
    name: '商拍套图',
    description: '一键生成电商商品套图',
    icon: '📦',
    category: 'shoot',
    mode: 'img2img',
    prompt: '基于上传的服装图，生成一组成体系列商拍图：模特全身展示、模特半身细节、挂拍平铺、局部特写等不同角度与场景，服装款式、颜色、材质保持一致，统一影棚商业摄影风格，柔和灯光，干净背景，电商套图质感。',
    negativePrompt: '服装变形、颜色突变、多余文字、水印、模糊',
    recommendedModel: 'jimeng-5.0',
    customModels: ['jimeng-5.0', 'gpt-image-2', 'seedream-5.0-lite', 'gpt-image-2.5-flare'],
    params: { ratio: '2K · 3:4 竖版 · 1728×2304', quality: 'Standard（官方默认）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传服装图', 'AI 分析款式与版型', '批量生成不同场景/角度的套图', '输出一组统一风格的商拍图'],
  },
  {
    id: 'shoot-mix',
    name: '多款搭配',
    description: '自由组合款式，生成模特搭配图',
    icon: '🧥',
    category: 'shoot',
    mode: 'img2img',
    prompt: '将上传的多件服装款式自由组合搭配，穿在同一位模特身上形成完整穿搭，单品之间颜色与风格协调，模特自然摆姿展示整套搭配，影棚商业摄影，柔和自然光，纯色背景，高清细节。',
    negativePrompt: '服装变形、单品混色、多余肢体、模糊、水印',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传多张单品图', 'AI 自动组合搭配逻辑', '生成模特完整穿搭图', '输出多套搭配效果'],
  },
  {
    id: 'shoot-flat',
    name: '平铺生成',
    description: '款式图转换平铺展示图',
    icon: '🟫',
    category: 'shoot',
    mode: 'img2img',
    prompt: '将上传的服装图转换为干净的白底平铺展示图，服装完全平铺展开、正面展示，版型对称、无褶皱，保留颜色图案材质细节，纯白背景，顶部俯拍视角，商业服装平铺摄影，均匀柔和光线。',
    negativePrompt: '褶皱、阴影过重、模特上身、变形、文字、水印',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传服装图', 'AI 展平服装并对称化', '生成白底平铺图', '输出多张平铺展示图'],
  },
  {
    id: 'shoot-model-swap',
    name: '模特变身',
    description: '款式不变，随心更换模特',
    icon: '💃',
    category: 'shoot',
    mode: 'img2img',
    prompt: '保持服装款式、颜色、版型完全不变，将服装穿到一位不同风格的专业女模特身上，模特可更换为不同肤色、身材、发型、气质，自然站立展示服装，影棚商业摄影，柔和灯光，干净背景，高清细节。',
    negativePrompt: '服装变形、图案错乱、多余肢体、模糊',
    recommendedModel: 'gpt-image-2',
    customModels: ['gpt-image-2', 'gpt-image-2.5-flare', 'jimeng-5.0', 'seedream-5.0-lite'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传带模特或仅服装的图', 'AI 锁定服装不变', '替换/生成不同模特形象', '输出多款模特效果'],
  },
  {
    id: 'shoot-face-swap',
    name: '智能换脸',
    description: '一键更换模特脸的五官',
    icon: '😊',
    category: 'shoot',
    mode: 'img2img',
    prompt: '保持人物的姿态、发型、服装和背景完全不变，仅更换面部的五官，生成自然逼真的新面孔，面部光影与肤色和原图协调，表情自然，高清写实，看不出替换痕迹。',
    negativePrompt: '面部变形、五官错位、肤色断层、恐怖谷、模糊',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2', 'nano-banana-2'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'XHigh（超高精度）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传人物照片', 'AI 定位面部关键点', '生成新的自然五官', '输出多张换脸效果'],
  },
  {
    id: 'shoot-shoes',
    name: '鞋靴试穿',
    description: '鞋靴图一键上身试穿',
    icon: '👟',
    category: 'shoot',
    mode: 'img2img',
    prompt: '将上传的鞋靴图穿到模特脚上，鞋靴保持颜色、材质、细节完全不变，与模特整体穿搭协调，模特自然站姿或行走姿态，影棚商业摄影，柔和灯光，干净背景，高清细节。',
    negativePrompt: '鞋型变形、多余肢体、模糊、水印、文字',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传鞋靴图', 'AI 识别鞋型与材质', '图生图穿到模特脚上', '输出多张试穿效果'],
  },
  {
    id: 'shoot-iron',
    name: '衣服去皱',
    description: '一键去除服装褶皱',
    icon: '🧺',
    category: 'shoot',
    mode: 'img2img',
    prompt: '去除服装上的所有褶皱与折痕，让衣服变得平整挺括、版型利落，保持服装的颜色、图案、材质和结构完全不变，自然悬垂效果，商业服装展示质感，干净背景，高清细节。',
    negativePrompt: '残留褶皱、变形、纹理丢失、模糊',
    recommendedModel: 'nano-banana-2',
    customModels: ['nano-banana-2', 'gpt-image-2', 'gpt-image-2.5-flare'],
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'PNG 无损（推荐）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传带褶皱的服装图', 'AI 识别褶皱区域', '非破坏编辑抹平褶皱', '输出平整服装图'],
  },
  {
    id: 'shoot-3d',
    name: '服装转3D',
    description: '款式图生成3D白底展示图',
    icon: '🧊',
    category: 'shoot',
    mode: 'img2img',
    prompt: '将上传的服装款式图转换为 3D 立体白底展示效果，服装呈现立体体积感、真实材质光影、可旋转展示的 3D 质感，纯白背景，产品级 3D 渲染，细节精致，电商 3D 展示图风格。',
    negativePrompt: '平面感、变形、文字、水印、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传服装款式图', 'AI 重建服装立体结构', '生成 3D 质感白底渲染图', '输出多角度效果'],
  },
  {
    id: 'shoot-pose',
    name: '模特换姿',
    description: '快速生成创意姿势套图',
    icon: '🧍',
    category: 'shoot',
    mode: 'img2img',
    prompt: '保持模特的面貌和服装完全不变，让模特摆出多种不同的创意姿势（叉腰、撩发、回眸、侧身、行走等），姿势自然优雅，动作流畅，影棚商业摄影，柔和灯光，干净背景，高清细节。',
    negativePrompt: '面部变形、服装变形、多余肢体、姿势僵硬、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传模特图', 'AI 锁定人物与服装', '生成多种自然姿势', '输出姿势套图'],
  },
  {
    id: 'shoot-bg',
    name: 'AI换背景',
    description: '模特/物品背景随心换',
    icon: '🌄',
    category: 'shoot',
    mode: 'img2img',
    prompt: '保持主体（模特或商品）的形状、颜色、细节完全不变，将背景替换为干净简约的商业场景：纯色影棚、简约街头、自然户外、精致室内等，光线与主体协调自然，商业摄影质感，高清细节。',
    negativePrompt: '主体变形、边缘破损、光影不协调、模糊',
    recommendedModel: 'nano-banana-2',
    customModels: ['nano-banana-2', 'gpt-image-2', 'gpt-image-2.5-flare'],
    params: { ratio: '2K · 3:4 竖版 · 1792×2400', quality: 'PNG 无损（推荐）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传含主体图片', 'AI 精准抠出主体', '生成新背景并融合光影', '输出多张背景效果'],
  },
  {
    id: 'shoot-logo',
    name: 'Logo添加',
    description: '为商品图添加品牌Logo',
    icon: '🏷️',
    category: 'shoot',
    mode: 'img2img',
    prompt: '在上传的商品图合适位置（衣领、胸口、袖口、标签处）添加一个精致低调的品牌 Logo 刺绣/印花，Logo 融入服装材质与光影，自然不突兀，保持商品其他部分完全不变，商业摄影质感，高清细节。',
    negativePrompt: 'Logo 变形、文字乱码、突兀贴图感、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传商品图', 'AI 定位 Logo 添加位置', '生成融入面料的品牌标识', '输出多张带 Logo 效果'],
  },

  // ==================== 服装设计（10） ====================
  {
    id: 'design-modify',
    name: '自由改款',
    description: '选中区域输入描述，一键完成改款',
    icon: '✂️',
    category: 'design',
    mode: 'img2img',
    prompt: '在保持服装整体风格与结构的基础上，对款式进行局部改款设计：调整领型、袖型、下摆、长度、版型松紧等，改款后服装细节精致、可生产落地，正面展示，干净白底，设计稿质感。',
    negativePrompt: '结构混乱、变形、文字、水印、模糊',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2', 'seedream-5.0-lite'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'XHigh（超高精度）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传款式图', 'AI 识别款式结构', '按改款意图调整局部', '输出改款设计稿'],
  },
  {
    id: 'design-innovate',
    name: '款式创新',
    description: '一键生成全新服装款式',
    icon: '💡',
    category: 'design',
    mode: 'text2img',
    prompt: '设计一款全新的时尚女装服装款式，版型新颖、结构合理、可生产落地，面料质感真实，细节精致，正面展示，干净纯白背景，服装设计效果图风格，高清画质。',
    negativePrompt: '结构不合理、变形、多余肢体、文字、水印、模糊',
    recommendedModel: 'gpt-image-2',
    customModels: ['gpt-image-2', 'gpt-image-2.5-flare', 'seedream-5.0-lite'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: false,
    steps: ['选择款式创新功能', 'AI 结合流行趋势生成新款式', '输出多款全新设计', '可继续微调'],
  },
  {
    id: 'design-recolor',
    name: '服装改色',
    description: '快速修改服装的颜色',
    icon: '🎨',
    category: 'design',
    mode: 'img2img',
    prompt: '保持服装的款式、版型、面料纹理和图案结构完全不变，仅更改服装的颜色为新的配色方案，颜色过渡自然、符合面料质感，干净背景展示，商业服装设计图质感，高清细节。',
    negativePrompt: '款式变形、图案错乱、颜色溢出、模糊',
    recommendedModel: 'nano-banana-2',
    customModels: ['nano-banana-2', 'gpt-image-2', 'gpt-image-2.5-flare'],
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'PNG 无损（推荐）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传服装图', 'AI 锁定款式与面料', '非破坏性更换颜色', '输出多组配色效果'],
  },
  {
    id: 'design-fabric',
    name: '面料上身',
    description: '替换图案or面料，预览上身效果',
    icon: '🧵',
    category: 'design',
    mode: 'img2img',
    prompt: '将上传的面料或图案应用到服装款式上，面料纹理、图案印花贴合服装版型自然垂坠，褶皱处图案跟随变形自然，保持服装结构不变，模特上身或平铺展示，商业设计预览图质感，高清细节。',
    negativePrompt: '图案错乱、生硬贴图、版型变形、模糊',
    recommendedModel: 'nano-banana-2',
    customModels: ['nano-banana-2', 'gpt-image-2', 'seedream-5.0-lite'],
    params: { ratio: '2K · 3:4 竖版 · 1792×2400', quality: 'PNG 无损（推荐）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传款式图 + 面料/图案图', 'AI 提取面料纹理', '贴合版型应用到服装', '输出上身效果预览'],
  },
  {
    id: 'design-pattern',
    name: '四方生图',
    description: '输入文字，生成四方连续图案',
    icon: '🔁',
    category: 'design',
    mode: 'text2img',
    prompt: '生成一张可无缝平铺的四方连续服装面料图案，图案边缘完美衔接、无接缝，色彩协调、风格统一，适合服装印花与面料生产，高清细节，专业纺织图案设计。',
    negativePrompt: '接缝明显、图案断裂、边缘不衔接、模糊',
    recommendedModel: 'seedream-5.0-lite',
    customModels: ['seedream-5.0-lite', 'gpt-image-2', 'jimeng-5.0'],
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'Standard（官方默认）', imageCount: 4 },
    requiresImage: false,
    steps: ['选择四方生图', 'AI 生成无缝图案', '图案可无限平铺', '输出多款花型方案'],
  },
  {
    id: 'design-sketch',
    name: '线稿生成',
    description: '输入文字或图案，一键生成服装线稿',
    icon: '✏️',
    category: 'design',
    mode: 'img2img',
    prompt: '将上传的服装图转换为干净的服装设计线稿，黑白线条稿，清晰表现款式结构、版型线条与工艺细节，专业服装技术图纸风格，白底黑线，线条流畅利落。',
    negativePrompt: '填色、阴影、背景杂乱、线条断裂、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传服装图', 'AI 提取款式轮廓', '生成专业线稿', '输出多张线稿图'],
  },
  {
    id: 'design-sketch-to-garment',
    name: '线稿成款',
    description: '根据线稿图，生成真实成衣图',
    icon: '🧵',
    category: 'design',
    mode: 'img2img',
    prompt: '将上传的服装线稿渲染为真实成衣效果图，服装呈现真实面料质感、光影与立体感，颜色与工艺细节精致，正面展示，干净背景，服装设计效果图，高清写实。',
    negativePrompt: '线稿残留、结构变形、文字、水印、模糊',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2', 'flux-1.1-pro'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'XHigh（超高精度）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传线稿图', 'AI 理解款式结构', '渲染真实面料与光影', '输出成衣效果图'],
  },
  {
    id: 'design-cutout',
    name: '抠图褪底',
    description: '一键抠出商品或模特',
    icon: '🖼️',
    category: 'design',
    mode: 'img2img',
    prompt: '将上传的商品图或模特图处理为纯白背景，主体完整抠出，边缘干净利落、无残留背景，保持主体颜色与细节完全不变，商业电商白底图标准，适合上架与二次设计。',
    negativePrompt: '边缘毛刺、主体残缺、背景残留、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传商品/模特图', 'AI 精准识别主体边缘', '抠出主体生成白底图', '输出多张白底素材'],
  },
  {
    id: 'design-pattern-extract',
    name: '图案提取',
    description: '一键提取服装图案或印花',
    icon: '🔍',
    category: 'design',
    mode: 'img2img',
    prompt: '提取服装上的图案或印花，去除服装结构影响，输出干净完整的图案主体，图案细节清晰、色彩还原准确，纯白背景，适合用于面料设计与二次应用。',
    negativePrompt: '服装结构残留、图案残缺、颜色失真、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '1K · 1:1 正方形 · 1024×1024', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传带图案的服装图', 'AI 识别图案区域', '提取纯净图案主体', '输出可复用图案素材'],
  },
  {
    id: 'design-upscale',
    name: '高清放大',
    description: '图片一键高清无损放大',
    icon: '🔍',
    category: 'design',
    mode: 'img2img',
    prompt: '将上传的图片进行高清无损放大，细节增强、边缘锐利、纹理清晰，保持原图内容与色彩完全不变，画质提升至电商大图标准，无锯齿无模糊。',
    negativePrompt: '变形、纹理涂抹、颜色偏移、模糊',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2'],
    params: { ratio: '4K · 1:1 正方形 · 2880×2880', quality: 'XHigh（超高精度）', imageCount: 1 },
    requiresImage: true,
    steps: ['上传需放大的图片', 'AI 增强细节与清晰度', '输出 4K 级高清图', '可直接用于大图场景'],
  },

  // ==================== 视频生成（7） ====================
  {
    id: 'video-free',
    name: '自由创作',
    description: '任意素材，随心创作',
    icon: '🎬',
    category: 'video',
    mode: 'text2video',
    prompt: '专业商品展示视频：镜头从远到近缓缓推进，围绕服装商品展示细节与质感，画面流畅稳定，自然光线，电商广告级质感，主体清晰。',
    negativePrompt: '画面抖动、主体变形、模糊、文字水印',
    recommendedModel: 'kling-v3',
    customModels: ['kling-v3', 'kling-v2-6', 'doubao-seedance-2.5'],
    params: { ratio: '16:9 横屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: false,
    steps: ['选择自由创作', 'AI 按预置脚本生成商品展示视频', '输出成片', '可在我的视频中管理'],
  },
  {
    id: 'video-img2video',
    name: '图生视频',
    description: '上传图片生成商品展示视频',
    icon: '🖼️',
    category: 'video',
    mode: 'img2video',
    prompt: '让上传的商品图片动起来：镜头缓缓推进并围绕商品旋转展示，服装随动作自然摆动，光影柔和，画面流畅稳定，电商商品展示视频质感。',
    negativePrompt: '画面抖动、主体变形、撕裂、模糊',
    recommendedModel: 'kling-v3',
    customModels: ['kling-v3', 'kling-v2-6', 'doubao-seedance-2.5'],
    params: { ratio: '9:16 竖屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: true,
    steps: ['上传商品图', 'AI 驱动画面动态化', '生成展示视频', '输出 5 秒成片'],
  },
  {
    id: 'video-storyboard',
    name: '故事板视频',
    description: '专业级视频脚本生成',
    icon: '📋',
    category: 'video',
    mode: 'text2video',
    prompt: '商品广告故事：开篇特写商品细节，中景模特展示上身效果，结尾全景收尾品牌氛围，分镜流畅衔接，情绪递进，专业广告片质感，电商品牌广告级成片。',
    negativePrompt: '跳帧、镜头突兀、主体变形、模糊',
    recommendedModel: 'doubao-seedance-2.5',
    customModels: ['doubao-seedance-2.5', 'kling-v3'],
    params: { ratio: '16:9 横屏', quality: '1080P 高清', imageCount: 1, duration: 10 },
    requiresImage: false,
    steps: ['选择故事板视频', 'AI 自动编排分镜脚本', '逐镜生成并合成', '输出完整故事板成片'],
  },
  {
    id: 'video-motion',
    name: '动作跟随',
    description: '复刻模特动作，快速生成视频',
    icon: '🏃',
    category: 'video',
    mode: 'video-motion',
    prompt: '让图片中的人物完整复刻参考视频中的动作与表情，主体形象与服装细节保持不变，动作自然流畅，背景保持一致。',
    negativePrompt: '人物变形、动作僵硬、面部畸变、模糊',
    recommendedModel: 'kling-v3',
    customModels: ['kling-v3', 'kling-v2-6'],
    params: { ratio: '9:16 竖屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: true,
    requiresVideo: true,
    steps: ['上传人物形象图', '上传动作参考视频', 'AI 驱动人物复刻动作', '输出动作跟随视频'],
  },
  {
    id: 'video-replace',
    name: '全能替换',
    description: '一键替换视频元素',
    icon: '🔁',
    category: 'video',
    mode: 'video-motion',
    prompt: '保持原视频整体结构与节奏，替换其中的商品/背景/人物等元素，新元素与视频光影和运镜自然融合，画面流畅无痕迹。',
    negativePrompt: '元素错位、光影不协调、画面撕裂、模糊',
    recommendedModel: 'doubao-seedance-2.5',
    customModels: ['doubao-seedance-2.5', 'kling-v3'],
    params: { ratio: '16:9 横屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: true,
    requiresVideo: true,
    steps: ['上传原视频 + 新元素图', 'AI 识别替换目标', '融合新元素生成新视频', '输出替换后的成片'],
  },
  {
    id: 'video-live',
    name: '实况图',
    description: '一键转换 LivePhoto',
    icon: '📱',
    category: 'video',
    mode: 'img2video',
    prompt: '将静态图片转换为轻微动态的实况图效果：主体细微自然的动态（发丝轻飘、衣角微动、光影流动），画面稳定，动效克制优雅，适合社交媒体分享。',
    negativePrompt: '大幅度运动、变形、抖动、模糊',
    recommendedModel: 'kling-v2-6',
    customModels: ['kling-v2-6', 'kling-v3'],
    params: { ratio: '1:1 方形', quality: '1080P 高清', imageCount: 1, duration: 3 },
    requiresImage: true,
    steps: ['上传静态图片', 'AI 生成轻微动态', '输出 3 秒实况效果', '可直接分享'],
  },
  {
    id: 'video-library',
    name: '我的视频',
    description: '快捷管理视频资产',
    icon: '🗂️',
    category: 'video',
    mode: 'library',
    prompt: '',
    negativePrompt: '',
    recommendedModel: 'kling-v3',
    params: { ratio: '16:9 横屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: false,
    steps: ['查看历史生成的视频', '预览、下载、管理视频资产'],
  },
];

// 便捷查询
export function getFeatureTemplate(id: string): IFeatureTemplate | undefined {
  return FEATURE_TEMPLATES.find(f => f.id === id);
}

export function getFeaturesByCategory(cat: FeatureCategory): IFeatureTemplate[] {
  return FEATURE_TEMPLATES.filter(f => f.category === cat);
}

export function getVideoModelById(id: string): IModel | undefined {
  return VIDEO_MODELS.find(m => m.id === id);
}

/** 是否为视频模型 */
export function isVideoModel(modelId: string): boolean {
  return VIDEO_MODELS.some(m => m.id === modelId);
}
