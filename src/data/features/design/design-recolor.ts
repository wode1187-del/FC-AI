import type { IFeatureTemplate } from '../types';

export const designRecolor: IFeatureTemplate = {
    id: 'design-recolor',
    name: '服装改色',
    description: '快速修改服装的颜色',
    icon: '🎨',
    category: 'design',
    mode: 'img2img',
    prompt: '只修改服装的颜色，其他所有像素完全保持不变。人物面部、发型、肤色、姿势、背景、灯光、衣服以外的一切细节都不得重绘、不得调色、不得变形。仅将衣服区域的颜色替换为指定颜色，衣服的款式、版型、面料纹理、图案、褶皱、光影全部与原图一致。颜色过渡自然，不得影响衣服以外的任何区域。禁止皮肤变色。禁止背景变色。禁止偏色',
    negativePrompt: '款式变形、图案错乱、颜色溢出、模糊、人物改变、背景改变、肤色改变、重绘非衣服区域',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2', 'nano-banana-2'],
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'PNG 无损（推荐）', imageCount: 1 },
    requiresImage: true,
    referenceSlots: [
      { id: 'base', label: '上传原图', icon: '👕', hint: '原始服装照片' },
      { id: 'color', label: '上传色图', icon: '🎨', hint: '想要换成的颜色参考图' },
    ],
    steps: ['上传原图（服装）', '上传色图（目标颜色）', 'AI 保持款式不变只换色', '输出改色效果图'],
  };
