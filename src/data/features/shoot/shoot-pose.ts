import type { IFeatureTemplate } from '../types';

export const shootPose: IFeatureTemplate = {
    id: 'shoot-pose',
    name: '模特换姿',
    description: '快速生成创意姿势套图',
    icon: '🧍',
    category: 'shoot',
    mode: 'img2img',
    // 身份锁定强约束：换姿不换人——锁定五官/发型/身材/服装/场景，只动姿态
    prompt: '保持模特的身份、外貌、身材、发型、当前所穿服装（颜色/图案/材质/版型/配饰）以及所在场景、地面、背景、灯光完全不变，只调整模特的姿态、动作、神情、镜头与光影表现。让模特在同一个真实场景中摆出自然的服装展示姿势，姿态舒展、重心稳定、动作连贯不生硬，服装随动作自然垂坠、贴合身体，不出现衣服脱离身体、布料飘飞、走光等异常。人物与地面接触真实（双脚着地、坐姿受力），透视与画面比例自然。商业服装摄影质感，高清细节。',
    negativePrompt: '面部变形、五官移位、发型改变、身材改变、服装变形、服装颜色改变、图案错乱、衣料脱落、衣服滑落、走光、多余肢体、多手多腿、手指粘连、手指畸形、脚部畸形、悬空浮空、身体穿地、透视变形、姿势僵硬、关节反折、光影不一致、背景变化、场景改变、模糊、低分辨率',
    modifyOptions: [
      { group: '姿态主轴', multiple: true, options: [
        { value: '站立展示', label: '站立' }, { value: '行走中', label: '行走' },
        { value: '优雅坐姿', label: '坐姿' }, { value: '靠墙倚立', label: '靠墙' },
        { value: '单腿重心', label: '单腿' }, { value: '回眸转身', label: '回眸' },
        { value: '动态跨步', label: '跨步' }, { value: '低身蹲姿', label: '蹲姿' },
      ]},
      { group: '手部动作', multiple: true, options: [
        { value: '单手叉腰', label: '叉腰' }, { value: '双手插袋', label: '插袋' },
        { value: '轻抚衣领', label: '抚领' }, { value: '撩发露肩', label: '撩发' },
        { value: '手搭肩臂', label: '搭肩' }, { value: '自然拎包', label: '拎包' },
        { value: '托腮凝视', label: '托腮' }, { value: '双手自然下垂', label: '自然' },
      ]},
      { group: '头部朝向', multiple: false, options: [
        { value: '正面看镜头', label: '正面' }, { value: '侧脸四十五度', label: '45°侧' },
        { value: '回眸侧望', label: '回眸' }, { value: '低眉垂眼', label: '低眉' },
        { value: '微仰抬颌', label: '微仰' }, { value: '低头看衣', label: '低头' },
      ]},
      { group: '服装专项展示', multiple: true, options: [
        { value: '展示裙摆', label: '裙摆' }, { value: '展示腰带腰线', label: '腰线' },
        { value: '展示领口', label: '领口' }, { value: '展示袖口', label: '袖口' },
        { value: '展示后背', label: '后背' }, { value: '展示整体廓形', label: '廓形' },
        { value: '展示裤长鞋型', label: '裤长鞋' },
      ]},
      { group: '动作幅度', multiple: false, options: [
        { value: '优雅静态', label: '优雅静态' }, { value: '动态抓拍', label: '动态抓拍' },
        { value: '时尚大步', label: '时尚大步' }, { value: '定格瞬间', label: '定格瞬间' },
      ]},
      { group: '景别', multiple: false, options: [
        { value: '全身', label: '全身' }, { value: '七分身', label: '七分身' },
        { value: '半身', label: '半身' }, { value: '细节特写', label: '特写' },
      ]},
      { group: '视角', multiple: false, options: [
        { value: '正面', label: '正面' }, { value: '侧面', label: '侧面' },
        { value: '45°侧', label: '45°侧' }, { value: '背面', label: '背面' },
      ]},
      { group: '表情', multiple: false, options: [
        { value: '自信微笑', label: '自信微笑' }, { value: '高冷酷脸', label: '高冷酷脸' },
        { value: '自然无表情', label: '自然' }, { value: '温柔浅笑', label: '温柔浅笑' },
        { value: '不看镜头展示服装', label: '展示款' },
      ]},
      { group: '摄影风格', multiple: false, options: [
        { value: '商业大片', label: '商业大片' }, { value: '极简画报', label: '极简画报' },
        { value: '生活随拍', label: '生活随拍' }, { value: '街拍杂志', label: '街拍杂志' },
        { value: '高级时装大片', label: '时装大片' },
      ]},
      { group: '机位镜头', multiple: false, options: [
        { value: '平视全身', label: '平视全身' }, { value: '广角', label: '广角' },
        { value: '长焦压缩', label: '长焦' }, { value: '俯拍', label: '俯拍' },
        { value: '低角度仰拍', label: '低角度' },
      ]},
      { group: '光影', multiple: false, options: [
        { value: '柔光棚拍', label: '柔光棚拍' }, { value: '环形补光', label: '环形补光' },
        { value: '伦勃朗光', label: '伦勃朗光' }, { value: '窗边自然光', label: '窗边自然光' },
        { value: '硬朗侧光', label: '硬朗侧光' },
      ]},
    ],
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传模特图', 'AI 锁定人物身份与服装', '选择姿态/镜头/光影组合', '输出多张姿势套图'],
  };
