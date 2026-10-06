import type { IFeatureTemplate } from '../types';

export const shootDetail: IFeatureTemplate = {
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
  };
