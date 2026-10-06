import type { IFeatureTemplate } from '../types';

export const designInnovate: IFeatureTemplate = {
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
  };
