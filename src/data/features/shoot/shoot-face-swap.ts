import type { IFeatureTemplate } from '../types';

export const shootFaceSwap: IFeatureTemplate = {
    id: 'shoot-face-swap',
    name: '智能换脸',
    description: '一键更换模特脸的五官',
    icon: '😊',
    category: 'shoot',
    mode: 'img2img',
    prompt: '这是一张图生图编辑任务。以图1为底图，除面部五官外，图1的每一个像素都必须原样保留，不得重绘、不得调色、不得修改任何细节。唯一允许的修改区域：面部五官和脸型轮廓——眼睛、眉毛、鼻子、嘴唇、脸型轮廓、下颌线、颧骨位置、面部骨骼结构，全部精确匹配图2的人脸特征。以下内容必须像素级保持图1原样：发际线、额头、头发、颈部、胸口、手臂、手部、服装、背景、灯光、阴影、肤色。换脸后面部肤色必须和图1颈部肤色完全一致，无缝衔接无色差。禁止重绘面部以外的任何区域，禁止调整全局色调，禁止美化，禁止改变任何细节。',
    negativePrompt: '面部变形、五官错位、肤色断层、恐怖谷、模糊',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2', 'nano-banana-2'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'XHigh（超高精度）', imageCount: 1 },
    requiresImage: true,
    referenceSlots: [
      { id: 'base', label: '原模特图', icon: '💃', hint: '要换脸的人物照片（底图）' },
      { id: 'face', label: '目标人脸', icon: '😊', hint: '要换成的人脸照片' },
    ],
    steps: ['上传原模特图（底图）', '上传目标人脸照片', 'AI 将目标人脸换到模特身上', '输出换脸效果图'],
  };
