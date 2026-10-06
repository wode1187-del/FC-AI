import type { IFeatureTemplate } from '../types';

export const shootPose: IFeatureTemplate = {
    id: 'shoot-pose',
    name: '模特换姿',
    description: '快速生成创意姿势套图',
    icon: '🧍',
    category: 'shoot',
    mode: 'img2img',
    prompt: '保持模特的面貌和服装完全不变，让模特摆出多种不同的创意姿势（叉腰、撩发、回眸、侧身、行走等），姿势自然优雅，动作流畅，影棚商业摄影，柔和灯光，干净背景，高清细节。',
    negativePrompt: '面部变形、服装变形、多余肢体、姿势僵硬、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传模特图', 'AI 锁定人物与服装', '生成多种自然姿势', '输出姿势套图'],
  };
