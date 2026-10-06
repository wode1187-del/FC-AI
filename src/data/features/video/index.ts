import type { IFeatureTemplate } from '../types';
import { videoFree } from './video-free';
import { videoImg2video } from './video-img2video';
import { videoStoryboard } from './video-storyboard';
import { videoMotion } from './video-motion';
import { videoReplace } from './video-replace';
import { videoLive } from './video-live';
import { videoLibrary } from './video-library';

export const VIDEO_TEMPLATES: IFeatureTemplate[] = [videoFree, videoImg2video, videoStoryboard, videoMotion, videoReplace, videoLive, videoLibrary];
