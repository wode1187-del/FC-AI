import type { IFeatureTemplate } from '../types';

export const designRecolor: IFeatureTemplate = {
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
  };
