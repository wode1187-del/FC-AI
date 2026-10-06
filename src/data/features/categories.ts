import type { FeatureCategory } from './types';

export const FEATURE_CATEGORIES: { id: FeatureCategory; name: string; icon: string; desc: string }[] = [
  { id: 'shoot', name: '服装商拍', icon: '📸', desc: '服装上身、商拍套图、模特试穿等电商出图' },
  { id: 'design', name: '服装设计', icon: '🎨', desc: '改款、改色、线稿、面料图案等设计功能' },
  { id: 'video', name: '视频生成', icon: '🎬', desc: '商品展示视频、动作跟随、故事板等视频创作' },
];
