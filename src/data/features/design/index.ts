import type { IFeatureTemplate } from '../types';
import { designModify } from './design-modify';
import { designInnovate } from './design-innovate';
import { designRecolor } from './design-recolor';
import { designFabric } from './design-fabric';
import { designPattern } from './design-pattern';
import { designSketch } from './design-sketch';
import { designSketchToGarment } from './design-sketch-to-garment';
import { designRemoveBg } from './design-remove-bg';
import { designPatternExtract } from './design-pattern-extract';
import { designUpscale } from './design-upscale';

export const DESIGN_TEMPLATES: IFeatureTemplate[] = [designModify, designInnovate, designRecolor, designFabric, designPattern, designSketch, designSketchToGarment, designRemoveBg, designPatternExtract, designUpscale];
