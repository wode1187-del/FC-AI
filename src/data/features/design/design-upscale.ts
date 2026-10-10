import type { IFeatureTemplate } from '../types';

export const designUpscale: IFeatureTemplate = {
    id: 'design-upscale',
    name: '高清放大',
    description: '图片一键高清无损放大',
    icon: '🔍',
    category: 'design',
    mode: 'img2img',
    prompt: '将上传的图片进行高清无损放大，细节增强、边缘锐利、纹理清晰，保持原图内容与色彩完全不变，画质提升至电商大图标准，无锯齿无模糊。禁止图片变色。禁止图片偏色。',
    negativePrompt: '变形、纹理涂抹、颜色偏移、模糊',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2'],
    params: { ratio: '4K · 1:1 正方形 · 2880×2880', quality: 'XHigh（超高精度）', imageCount: 1 },
    requiresImage: true,
    steps: ['上传需放大的图片', 'AI 增强细节与清晰度', '输出 4K 级高清图', '可直接用于大图场景'],
  };
