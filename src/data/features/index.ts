import type { IFeatureTemplate, FeatureCategory } from './types';
import { SHOOT_TEMPLATES } from './shoot';
import { DESIGN_TEMPLATES } from './design';
import { VIDEO_TEMPLATES } from './video';

export * from './types';
export * from './videoModels';
export * from './categories';

export const FEATURE_TEMPLATES: IFeatureTemplate[] = [
  ...SHOOT_TEMPLATES,
  ...DESIGN_TEMPLATES,
  ...VIDEO_TEMPLATES,
];

// 便捷查询
export function getFeatureTemplate(id: string): IFeatureTemplate | undefined {
  return FEATURE_TEMPLATES.find(f => f.id === id);
}

export function getFeaturesByCategory(cat: FeatureCategory): IFeatureTemplate[] {
  return FEATURE_TEMPLATES.filter(f => f.category === cat);
}
