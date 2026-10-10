import type { IFeatureTemplate } from '../types';

export const designRemoveBg: IFeatureTemplate = {
    id: 'design-remove-bg',
    name: '移除背景',
    description: '一键抠图，移除背景生成透明PNG',
    icon: '🖼️',
    category: 'design',
    mode: 'img2img',
    prompt: '将上传图中的主体完整抠出，彻底移除原背景，输出为透明背景（PNG）的主体图。主体本身必须严格保持原样：人物轮廓、五官、发型、肤色、服装的颜色/图案/材质/版型/褶皱/光影、手部、配饰以及一切可见细节都百分百还原，禁止重绘主体、禁止改变主体的任何像素、禁止调色、禁止偏色。仅将背景区域替换为全透明，主体边缘干净平滑、无背景残留、无白边、无半透明阴影。商业抠图标准，适合上架与二次设计。',
    negativePrompt: '背景残留、白边、主体残缺、边缘毛刺、重绘主体、人物改变、偏色、肤色改变、调色、颜色改变、图案改变、细节改变、阴影残留',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'],
    params: { ratio: '自适应尺寸', quality: 'High（高质量）', imageCount: 1, background: 'Transparent（透明，仅支持PNG）' },
    requiresImage: true,
    steps: ['上传商品/模特图', 'AI 精准识别主体边缘', '移除背景生成透明PNG', '输出透明底抠图素材'],
  };
