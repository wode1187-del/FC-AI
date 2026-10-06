import type { IFeatureTemplate } from '../types';

export const shootBg: IFeatureTemplate = {
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
  };
