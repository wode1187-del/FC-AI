import type { IFeatureTemplate } from '../types';

export const designSketchToGarment: IFeatureTemplate = {
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
  };
