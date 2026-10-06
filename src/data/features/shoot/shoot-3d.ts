import type { IFeatureTemplate } from '../types';

export const shoot3d: IFeatureTemplate = {
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
  };
