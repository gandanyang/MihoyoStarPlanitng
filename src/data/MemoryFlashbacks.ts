/**
 * 童年记忆闪回数据
 *
 * 每个星之碎片对应一段童年记忆。
 * 闪回触发时机：采集碎片后 → 播放闪回 → 获得碎片物品。
 */

import { type DialogueLine } from '../systems/StorySystem';

/** 记忆闪回颜色（暖色调，怀旧感） */
const MEM_COLORS = {
  scene: '#e8d8c0',   // 场景描述（暖棕）
  inner: '#c8b8a0',   // 内心独白（柔和棕）
  grandpa: '#d8c8a0', // 爷爷（温暖金）
  light: '#f0d080',   // 灯/夏雅（暖光黄，灯意象专属）
};

/**
 * 第一块碎片：归属
 * 触发条件：森林采集星之碎片
 * 记忆内容：小时候跟爷爷在田埂看星星
 */
export const SHARD_1_FLASHBACK: DialogueLine[] = [
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '（碎片在掌心发出微光，林澈的意识被拉回了很久以前。）',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '夏天的夜晚，田埂上坐着两个人。',
  },
  {
    speaker: '爷爷',
    color: MEM_COLORS.grandpa,
    text: '「小澈，你看那颗。」',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '爷爷的手指向天空，指尖沾着泥土。',
  },
  {
    speaker: '爷爷',
    color: MEM_COLORS.grandpa,
    text: '「那颗叫牵牛星。旁边那两颗是它的翅膀。」',
  },
  {
    speaker: '林澈',
    color: MEM_COLORS.inner,
    text: '那时候的我，觉得星星真的会飞。',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '（记忆渐渐模糊，只剩下田埂上两个人的轮廓。）',
  },
  {
    speaker: '林澈',
    color: MEM_COLORS.inner,
    text: '……多久没想起这件事了。',
  },
];

/**
 * 第二块碎片：连接
 * 触发条件：与夏雅好感达到阈值
 * 记忆内容：小时候在村里跟小伙伴玩耍
 */
export const SHARD_2_FLASHBACK: DialogueLine[] = [
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '（碎片的光芒变得温暖，像午后的阳光。）',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '村口的老槐树下，几个孩子围在一起。',
  },
  {
    speaker: '林澈',
    color: MEM_COLORS.inner,
    text: '那时候认识村里每个人，叫得出每个人的名字。',
  },
  {
    speaker: '夏雅',
    color: MEM_COLORS.scene,
    text: '「小澈！过来玩！」',
  },
  {
    speaker: '林澈',
    color: MEM_COLORS.inner,
    text: '不知道从什么时候开始，我忘了这种感觉。',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '（光芒消散，手心的碎片安静地躺着。）',
  },
];

/**
 * 第三块碎片：创造
 * 触发条件：种田达到一定数量
 * 记忆内容：小时候用木头做玩具
 */
export const SHARD_3_FLASHBACK: DialogueLine[] = [
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '（碎片的光里，似乎有什么东西在生长。）',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '院子里的木头上，刻着歪歪扭扭的痕迹。',
  },
  {
    speaker: '爷爷',
    color: MEM_COLORS.grandpa,
    text: '「小澈，你在做什么？」',
  },
  {
    speaker: '林澈',
    color: MEM_COLORS.inner,
    text: '「我在做船。」',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '爷爷蹲下来看了一会儿，没有笑。',
  },
  {
    speaker: '爷爷',
    color: MEM_COLORS.grandpa,
    text: '「嗯，做得不错。」',
  },
  {
    speaker: '林澈',
    color: MEM_COLORS.inner,
    text: '那是我第一次觉得，自己做出的东西是有意义的。',
  },
];

/** 按碎片索引获取闪回数据 */
export function getShardFlashback(shardIndex: number): DialogueLine[] | null {
  switch (shardIndex) {
    case 0: return SHARD_1_FLASHBACK;
    case 1: return SHARD_2_FLASHBACK;
    case 2: return SHARD_3_FLASHBACK;
    default: return null;
  }
}

/** 碎片收集进度 → 林澈内心独白（影响对话系统） */
export const SHARD_PROGRESS_LINES: Record<number, string[]> = {
  0: [], // 未收集任何碎片
  1: [
    '（最近总是想起小时候的事。）',
    '（好像有什么东西，在慢慢苏醒。）',
  ],
  2: [
    '（原来这些感觉一直都在。）',
    '（不只是在找碎片，也是在找自己。）',
  ],
  3: [
    '（小时候的自己，好像没有消失。）',
    '（只是被藏起来了。）',
  ],
};

/**
 * 灯意象彩蛋闪回（L2，制作人拍板 2026-08-05：「童年点灯回忆=彩蛋」）
 * 触发条件：首次傍晚与夏雅对话结束后（MapScene 内存标记 lampFlashbackDone，一次性，不入档）
 * 记忆内容：小时候林澈晚上迷路，顺着远处的一盏小灯走到夏雅家——"那就跟着灯回来。"
 * 范围限定：彩蛋演出，复用 MemoryFlashbacks 系统，不新增碎片/任务/存档字段。
 */
export const XIYA_LAMP_FLASHBACK: DialogueLine[] = [
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '（碎片的光变得很暖。林澈被拉进一段很旧的记忆。）',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '那年暑假的晚上，村里的小路上没有灯。',
  },
  {
    speaker: '林澈',
    color: MEM_COLORS.inner,
    text: '我迷路了。四周黑黢黢的，越走越慌。',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '远处，有一盏小灯亮着。',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '我顺着光走过去，是夏雅家的院子。',
  },
  {
    speaker: '夏雅',
    color: MEM_COLORS.light,
    text: '（小小的夏雅提着灯，站在门口。）「你怎么又跑这么远？」',
  },
  {
    speaker: '林澈',
    color: MEM_COLORS.inner,
    text: '「我……找不到回去的路了。」',
  },
  {
    speaker: '夏雅',
    color: MEM_COLORS.light,
    text: '「那就跟着灯回来。」',
  },
  {
    speaker: '林澈',
    color: MEM_COLORS.inner,
    text: '后来我总记得这句话。好像跟着光走，就不会迷路。',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '（记忆慢慢暗下去，只留下那一点暖光。）',
  },
];

/**
 * 支线试点：夏雅「院子有人照顾」记忆卡（2026-08-06 制作人拍板方案 A）
 * 触发：花园恢复后，交付木材×3 修复旧藤架完成
 * 记忆内容：爷爷坐在花田边藤架下浇花，夏雅小时候蹲在旁边看
 */
export const XIYA_GARDEN_FLASHBACK: DialogueLine[] = [
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '（记忆里，爷爷坐在花田边的藤架下，给花浇水。）',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '夏雅小时候蹲在旁边，看水珠从叶片上滑落。',
  },
  {
    speaker: '爷爷',
    color: MEM_COLORS.grandpa,
    text: '「院子有人照顾，就不会冷清。」',
  },
];

/**
 * 支线试点：村长「看星星的地方」记忆卡（2026-08-06 制作人拍板方案 A）
 * 触发：村长委托后，夜晚到农田边空地
 * 记忆内容：爷爷坐在空地上看星星，身边放着半壶凉茶
 */
export const ELDER_STAR_FLASHBACK: DialogueLine[] = [
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '（记忆里，爷爷坐在农田边的空地上，抬头看星星。）',
  },
  {
    speaker: '',
    color: MEM_COLORS.scene,
    text: '身边放着半壶凉茶。他一句话也没说，只是看了很久。',
  },
  {
    speaker: '爷爷',
    color: MEM_COLORS.grandpa,
    text: '「那里安静，能看见很远的星星。」',
  },
];
