import type { IFeatureTemplate } from '../types';

export const designSketch: IFeatureTemplate = {
    id: 'design-sketch',
    name: '线稿生成',
    description: '输入文字或图案，一键生成服装线稿',
    icon: '✏️',
    category: 'design',
    mode: 'img2img',
    prompt: '将上传的服装图转换为干净的服装设计线稿，黑白线条稿，清晰表现款式结构、版型线条与工艺细节，专业服装技术图纸风格，白底黑线，线条流畅利落。',
    negativePrompt: '填色、阴影、背景杂乱、线条断裂、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传服装图', 'AI 提取款式轮廓', '生成专业线稿', '输出多张线稿图'],
  };
