import type { IFeatureTemplate } from '../types';

export const shootFlat: IFeatureTemplate = {
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
  };
