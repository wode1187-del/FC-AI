import type { IFeatureTemplate } from '../types';

export const designCutout: IFeatureTemplate = {
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
  };
