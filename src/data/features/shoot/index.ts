import type { IFeatureTemplate } from '../types';
import { shootTryon } from './shoot-tryon';
import { shootDetail } from './shoot-detail';
import { shootSet } from './shoot-set';
import { shootMix } from './shoot-mix';
import { shootFlat } from './shoot-flat';
import { shootModelSwap } from './shoot-model-swap';
import { shootFaceSwap } from './shoot-face-swap';
import { shootShoes } from './shoot-shoes';
import { shootIron } from './shoot-iron';
import { shoot3d } from './shoot-3d';
import { shootPose } from './shoot-pose';
import { shootBg } from './shoot-bg';
import { shootLogo } from './shoot-logo';

export const SHOOT_TEMPLATES: IFeatureTemplate[] = [shootTryon, shootFlat, shootIron, shoot3d, shootModelSwap, shootBg, shootLogo, shootSet, shootMix, shootFaceSwap, shootShoes, shootDetail, shootPose];
