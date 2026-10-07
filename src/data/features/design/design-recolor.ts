import type { IFeatureTemplate } from '../types';

export const designRecolor: IFeatureTemplate = {
    id: 'design-recolor',
    name: '服装改色',
    description: '快速修改服装的颜色',
    icon: '🎨',
    category: 'design',
    mode: 'img2img',
    prompt: '严格保持原图的所有内容不变：人物面部、发型、肤色、姿势、背景、灯光全部原样保留。只做一件事：把服装的颜色改成指定颜色。服装的款式、版型、面料纹理、图案结构、褶皱、光影全部与原图一致，只是颜色变成指定颜色。颜色过渡自然，符合面料质感，不得改变服装的任何其他细节。',
    negativePrompt: '款式变形、图案错乱、颜色溢出、模糊、人物改变、保留图2人物',
    recommendedModel: 'nano-banana-2',
    customModels: ['nano-banana-2', 'gpt-image-2', 'gpt-image-2.5-flare'],
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'PNG 无损（推荐）', imageCount: 1 },
    requiresImage: true,
    referenceSlots: [
      { id: 'base', label: '上传原图', icon: '👕', hint: '原始服装照片' },
      { id: 'color', label: '上传色图', icon: '🎨', hint: '想要换成的颜色参考图' },
    ],
    steps: ['上传原图（服装）', '上传色图（目标颜色）', 'AI 保持款式不变只换色', '输出改色效果图'],
  };
