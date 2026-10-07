import type { IFeatureTemplate } from '../types';

export const shootBg: IFeatureTemplate = {
    id: 'shoot-bg',
    name: 'AI换背景',
    description: '模特/物品背景随心换',
    icon: '🌄',
    category: 'shoot',
    mode: 'img2img',
    prompt: '把图2的背景换到图1上，同时保持图1人物（或商品）形状/体型不变。禁止改变图1人物（或物品）的结构。注意背景细节要求百分百还原。',
    negativePrompt: '人物改变、人脸改变、五官变化、人物重绘、人物变形、人物微调、人物美颜、人物美化、人物边缘模糊、人物偏色、服装改变、颜色改变、保留图2人物、任何对人物区域的修改',
    recommendedModel: 'nano-banana-2',
    customModels: ['nano-banana-2', 'gpt-image-2', 'gpt-image-2.5-flare'],
    params: { ratio: '2K · 3:4 竖版 · 1792×2400', quality: 'PNG 无损（推荐）', imageCount: 1 },
    requiresImage: true,
    referenceSlots: [
      { id: 'base', label: '上传原图', icon: '💃', hint: '含人物/商品的原始照片' },
      { id: 'bg', label: '上传背景', icon: '🌄', hint: '想要替换成的背景场景图' },
    ],
    steps: ['上传原图（含人物/商品）', '上传想要的背景图', 'AI 抠出主体并合成新背景', '输出换背景效果图'],
    tryonTypes: [
      {
        id: 'basic', label: '基础换背景', icon: '🌄',
        prompt: '把图2的背景换到图1上，同时保持图1人物（或商品）形状/体型不变。禁止改变图1人物（或物品）的结构。注意背景细节要求百分百还原。',
      },
      {
        id: 'pro', label: '加强版换背景', icon: '💪',
        prompt: '以图1为底图，将图1的原始背景替换为图2的背景场景。图1中主体人物（或商品）的所有可见部分完全保持不变：轮廓、肤色、服装颜色/图案/材质/版型、姿势、手部、配饰、任何可见细节都不得重绘、不得调色、不得变形，无论图1是全身、半身、下半身还是不露脸构图，所见即所保。图2里的人物不要保留，只取图2的背景环境（墙面、窗帘、地面、家具等）。主体与新背景之间边缘自然融合，光影方向与图2背景一致。商业摄影质感，高清细节。',
      },
    ],
  };
