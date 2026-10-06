import type { IFeatureTemplate } from '../types';

export const designPatternExtract: IFeatureTemplate = {
    id: 'design-pattern-extract',
    name: '图案提取',
    description: '一键提取服装图案或印花',
    icon: '🔍',
    category: 'design',
    mode: 'img2img',
    prompt: '提取服装上的图案或印花，去除服装结构影响，输出干净完整的图案主体，图案细节清晰、色彩还原准确，纯白背景，适合用于面料设计与二次应用。',
    negativePrompt: '服装结构残留、图案残缺、颜色失真、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '1K · 1:1 正方形 · 1024×1024', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传带图案的服装图', 'AI 识别图案区域', '提取纯净图案主体', '输出可复用图案素材'],
  };
