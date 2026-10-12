import type { IFeatureTemplate } from '../types';

export const shootModelSwap: IFeatureTemplate = {
    id: 'shoot-model-swap',
    name: '模特变身',
    description: '款式不变，随心更换模特',
    icon: '💃',
    category: 'shoot',
    mode: 'img2img',
    // 服装逐项锁定 + 防泛红：换人不换衣，肤色随新模特但保持自然不偏暖
    prompt: '将服装从原图穿到一位风格迥异的新专业模特身上。服装（颜色、图案、印花、材质、版型、廓形、领口、袖口、门襟、纽扣、拉链、缝线、腰带、长短、松紧、配饰）必须严格保持与原图完全一致，不得改变、丢失、简化或替换任何服装细节，面料贴合新模特身体自然垂坠，褶皱和光影随服装自然呈现。新模特可选择不同肤色、身材、发型、气质，但人物姿态自然舒展、重心稳定、双脚着地，五官协调、皮肤质感真实。皮肤颜色保持所选肤色的自然呈现，禁止皮肤泛红、发粉、偏暖、偏色，禁止场景环境光晕染到皮肤造成色偏。影棚或场景商业摄影，干净背景，高清细节。',
    negativePrompt: '服装变形、服装变色、图案丢失、印花错乱、版型改变、衣料脱落、走光、多余肢体、多手多腿、手指粘连畸形、五官扭曲、面部畸形、混血杂糅、皮肤泛红、肤色偏粉、肤色偏暖、皮肤偏色、肤色不均、环境光晕染皮肤、透视变形、悬空浮空、身体穿地、模糊、低分辨率',
    modifyOptions: [
      { group: '模特风格', multiple: false, options: [
        { value: '都市休闲', label: '都市休闲' }, { value: '优雅知性', label: '优雅知性' },
        { value: '时尚潮流', label: '时尚潮流' }, { value: '运动活力', label: '运动活力' },
        { value: '名媛高级感', label: '名媛高级感' }, { value: '欧美超模', label: '欧美超模' },
      ]},
      { group: '气质', multiple: false, options: [
        { value: '清冷高级', label: '清冷' }, { value: '甜美温柔', label: '甜美' },
        { value: '飒爽利落', label: '飒爽' }, { value: '复古优雅', label: '复古' },
        { value: '成熟御姐', label: '御姐' }, { value: '知性干练', label: '知性' },
      ]},
      { group: '人种', multiple: false, options: [
        { value: '亚洲面孔', label: '亚洲' }, { value: '欧美面孔', label: '欧美' },
        { value: '混血面孔', label: '混血' }, { value: '拉丁面孔', label: '拉丁' },
      ]},
      { group: '身材', multiple: false, options: [
        { value: '高挑纤瘦', label: '高挑纤瘦' }, { value: '匀称标准', label: '匀称标准' },
        { value: '丰腴曲线', label: '丰腴曲线' }, { value: '健美塑形', label: '健美塑形' },
      ]},
      { group: '肤色', multiple: false, options: [
        { value: '自然白皙', label: '自然白皙' }, { value: '健康小麦', label: '健康小麦' },
        { value: '蜜糖色', label: '蜜糖色' }, { value: '深棕色', label: '深棕' },
      ]},
      { group: '发型', multiple: false, options: [
        { value: '黑色直发', label: '黑长直' }, { value: '波浪卷发', label: '波浪卷' },
        { value: '干练短发', label: '干练短发' }, { value: '柔顺披肩发', label: '柔顺披肩' },
        { value: '高马尾', label: '高马尾' }, { value: '优雅盘发', label: '盘发' },
      ]},
      { group: '姿态', multiple: false, options: [
        { value: '自然站立', label: '站立' }, { value: '行走动态', label: '行走' },
        { value: '优雅坐姿', label: '坐姿' }, { value: '回眸转身', label: '回眸' },
        { value: '单手叉腰', label: '叉腰' }, { value: '侧身展示', label: '侧身' },
      ]},
      { group: '配件', multiple: false, options: [
        { value: '无配件纯服装', label: '无配件' }, { value: '墨镜', label: '墨镜' },
        { value: '帽子', label: '帽子' }, { value: '手提包', label: '手包' },
        { value: '珠宝首饰', label: '首饰' }, { value: '腰带', label: '腰带' },
      ]},
      { group: '镜头', multiple: false, options: [
        { value: '正面全身', label: '正面全身' }, { value: '三视角展示', label: '三视角' },
        { value: '正背面展示', label: '正背面' }, { value: '半身特写', label: '半身特写' },
        { value: '服装细节特写', label: '细节特写' },
      ]},
      { group: '场景', multiple: false, options: [
        { value: '纯白影棚', label: '纯白影棚' }, { value: '浅灰影棚', label: '浅灰影棚' },
        { value: '深灰影棚', label: '深灰影棚' }, { value: '纯色背景', label: '纯色背景' },
        { value: '极简留白背景', label: '极简留白' }, { value: '绿幕抠图背景', label: '绿幕' },
        { value: '家居卧室', label: '家居卧室' }, { value: '客厅沙发', label: '客厅' },
        { value: '书房书架', label: '书房' }, { value: '咖啡厅', label: '咖啡厅' },
        { value: '城市街拍', label: '城市街拍' }, { value: '复古老街', label: '复古老街' },
        { value: '现代建筑前', label: '现代建筑' }, { value: '橱窗店铺前', label: '橱窗店铺' },
        { value: '户外自然绿植', label: '户外自然' }, { value: '海边沙滩', label: '海边' },
        { value: '城市天台', label: '天台' }, { value: '露台花园', label: '花园' },
        { value: '春日出游', label: '春日出游' }, { value: '夏日泳池', label: '夏日泳池' },
        { value: '秋日落叶', label: '秋日' }, { value: '冬日雪景', label: '冬日雪景' },
        { value: '办公室通勤', label: '办公室' }, { value: '商务会议空间', label: '商务空间' },
      ]},
      { group: '表情', multiple: false, options: [
        { value: '自信微笑', label: '自信微笑' }, { value: '高冷酷脸', label: '高冷酷脸' },
        { value: '温柔浅笑', label: '温柔浅笑' }, { value: '自然无表情', label: '自然' },
        { value: '不看镜头展示服装', label: '展示款' },
      ]},
      { group: '摄影风格', multiple: false, options: [
        { value: '商业大片', label: '商业大片' }, { value: '极简画报', label: '极简画报' },
        { value: '时装周大片', label: '时装周大片' }, { value: '生活方式', label: '生活方式' },
      ]},
      { group: '光影', multiple: false, options: [
        { value: '柔光棚拍', label: '柔光棚拍' }, { value: '环形补光', label: '环形补光' },
        { value: '伦勃朗光', label: '伦勃朗光' }, { value: '窗边自然光', label: '窗边自然光' },
        { value: '硬朗侧光', label: '硬朗侧光' },
      ]},
      { group: '展示用途', multiple: false, options: [
        { value: '电商主图', label: '电商主图' }, { value: '详情页', label: '详情页' },
        { value: '社媒种草', label: '社媒种草' }, { value: '品牌画册', label: '品牌画册' },
      ]},
    ],
    recommendedModel: 'gpt-image-2',
    customModels: ['gpt-image-2', 'gpt-image-2.5-flare', 'jimeng-5.0', 'seedream-5.0-lite'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传带模特或仅服装的图', 'AI 逐项锁定服装不变', '替换/生成不同模特形象', '输出多款模特效果'],
  };
