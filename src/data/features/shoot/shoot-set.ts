import type { IFeatureTemplate } from '../types';

export const shootSet: IFeatureTemplate = {
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
  };
