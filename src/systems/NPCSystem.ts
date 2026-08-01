/**
 * NPC 系统（Phase 5）
 *
 * 职责：
 *   - 持有三个 NPC 的固定数据
 *   - 根据 TimeSystem 当前时间，判定每个 NPC 应在哪个场景的哪个位置
 *   - 提供按场景查询 NPC 的接口（供 MapScene create 时创建 sprite）
 *   - 每帧 update 推进 NPC 插值移动
 *
 * 日程（三 NPC 共用结构，名字/颜色/对话不同）：
 *   06:00-08:00  farm   （出生/家）
 *   08:00-12:00  town   （上午在小镇）
 *   12:00-18:00  forest （下午在森林）
 *   18:00-22:00  farm   （回家）
 *
 * 目标坐标（在各场景中的固定点，像素）：
 *   farm:   (3*16+8, 11*16+8)  木屋旁
 *   town:   (15*16+8, 10*16+8) 小镇中央
 *   forest: (15*16+8, 10*16+8) 森林中央
 */

import { NPC, ScheduleEntry } from '../entities/NPC';
import { getTime } from '../data/TimeSystem';
import { COLORS, type DialogueLine } from './StorySystem';

/** 瓦片尺寸 */
const T = 16;

/**
 * 场景内固定目标点（像素），每个 NPC 在场景内错开站位。
 * 原因：若三个 NPC 站同一格，交互检测按数组顺序遍历（elder 排第一），
 *       会导致靠近时永远触发村长任务对话，商店/少女无法交互。
 * 各点均避开碰撞区（farm 木屋上墙 row12、town 石屋、forest 四角石簇）。
 */
type Spot = { x: number; y: number };
type NpcId = 'elder' | 'shopkeeper' | 'mystery' | 'miner' | 'gardener' | 'adventurer';
type SpotMap = Record<NpcId, Spot>;
const SPOTS: { farm: SpotMap; town: SpotMap; forest: SpotMap; mine: SpotMap } = {
  farm: {
    elder: { x: 3 * T + 8, y: 11 * T + 8 },
    shopkeeper: { x: 7 * T + 8, y: 11 * T + 8 },
    mystery: { x: 3 * T + 8, y: 8 * T + 8 },
    miner: { x: 10 * T + 8, y: 11 * T + 8 },
    gardener: { x: 5 * T + 8, y: 8 * T + 8 },
    adventurer: { x: 8 * T + 8, y: 8 * T + 8 },
  },
  town: {
    elder: { x: 13 * T + 8, y: 10 * T + 8 },
    shopkeeper: { x: 16 * T + 8, y: 10 * T + 8 },
    mystery: { x: 15 * T + 8, y: 8 * T + 8 },
    miner: { x: 14 * T + 8, y: 12 * T + 8 },
    gardener: { x: 18 * T + 8, y: 10 * T + 8 },
    adventurer: { x: 12 * T + 8, y: 12 * T + 8 },
  },
  forest: {
    elder: { x: 13 * T + 8, y: 10 * T + 8 },
    shopkeeper: { x: 17 * T + 8, y: 10 * T + 8 },
    mystery: { x: 15 * T + 8, y: 8 * T + 8 },
    miner: { x: 14 * T + 8, y: 12 * T + 8 },
    gardener: { x: 18 * T + 8, y: 8 * T + 8 },
    adventurer: { x: 12 * T + 8, y: 10 * T + 8 },
  },
  mine: {
    elder: { x: 8 * T + 8, y: 10 * T + 8 },
    shopkeeper: { x: 10 * T + 8, y: 10 * T + 8 },
    mystery: { x: 8 * T + 8, y: 8 * T + 8 },
    miner: { x: 12 * T + 8, y: 10 * T + 8 },
    gardener: { x: 10 * T + 8, y: 8 * T + 8 },
    adventurer: { x: 6 * T + 8, y: 10 * T + 8 },
  },
};

/** 构建日程（按 NPC id 查专属站位） */
function buildSchedule(npcId: NpcId): ScheduleEntry[] {
  // 矿工：上午在矿洞，下午在农场
  if (npcId === 'miner') {
    return [
      { time: '06:00', location: 'farm', ...SPOTS.farm.miner },
      { time: '08:00', location: 'mine', ...SPOTS.mine.miner },
      { time: '16:00', location: 'farm', ...SPOTS.farm.miner },
    ];
  }
  // 花匠：全天在农场附近
  if (npcId === 'gardener') {
    return [
      { time: '06:00', location: 'farm', ...SPOTS.farm.gardener },
      { time: '10:00', location: 'forest', ...SPOTS.forest.gardener },
      { time: '14:00', location: 'farm', ...SPOTS.farm.gardener },
    ];
  }
  // 冒险家：上午在小镇，下午在森林
  if (npcId === 'adventurer') {
    return [
      { time: '06:00', location: 'farm', ...SPOTS.farm.adventurer },
      { time: '08:00', location: 'town', ...SPOTS.town.adventurer },
      { time: '14:00', location: 'forest', ...SPOTS.forest.adventurer },
      { time: '18:00', location: 'farm', ...SPOTS.farm.adventurer },
    ];
  }
  // 原有 NPC：老日程
  return [
    { time: '06:00', location: 'farm', ...SPOTS.farm[npcId] },
    { time: '08:00', location: 'town', ...SPOTS.town[npcId] },
    { time: '12:00', location: 'forest', ...SPOTS.forest[npcId] },
    { time: '18:00', location: 'farm', ...SPOTS.farm[npcId] },
  ];
}

// ============ NPC 对话剧本（新版 StoryDialogue 全屏播放） ============

/** 村长：主线对话由 QuestSystem 驱动，此处为兜底台词 */
const ELDER_DIALOGUES: DialogueLine[] = [
  { speaker: '村长', color: COLORS.elder, text: '星火镇是个好地方。多和镇上的人聊聊吧。' },
];

/** 商店老板：欢迎 + 买卖引导 */
const SHOPKEEPER_DIALOGUES: DialogueLine[] = [
  { speaker: '商店老板', color: '#8ac8a0', text: '欢迎光临星辰杂货店！' },
  { speaker: '商店老板', color: '#8ac8a0', text: '收获的作物、挖到的矿石都可以卖给我换金币。种子和工具也有卖。' },
  { speaker: '', color: COLORS.system, text: '（按 [E] 键打开商店。）' },
];

/** 神秘少女：神秘感对话，暗示岛屿与星辰的关联 */
const MYSTERY_DIALOGUES: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（一个少女站在树影下，她似乎一直在等着林澈。少女抬起头。）' },
  { speaker: '神秘少女', color: '#b8a0e8', text: '……你来了。' },
  { speaker: '林澈', color: COLORS.linche, text: '你认识我？' },
  { speaker: '神秘少女', color: '#b8a0e8', text: '这座岛上的星星告诉我，会有一个从远方回来的人。' },
  { speaker: '神秘少女', color: '#b8a0e8', text: '你身上……有那颗星的味道。夜深的时候，记得抬头看看。' },
  { speaker: '', color: COLORS.system, text: '（少女说完，转身消失在林间。）' },
];

/** 矿工老张：挖矿引导 */
const MINER_DIALOGUES: DialogueLine[] = [
  { speaker: '矿工老张', color: '#d8a050', text: '哟，新来的小伙子！我是老张，矿洞这片归我管。' },
  { speaker: '矿工老张', color: '#d8a050', text: '矿洞里能挖到石头、铜矿、铁矿。拿到镇上卖了能换钱。' },
  { speaker: '矿工老张', color: '#d8a050', text: '不过挖矿费体力，别把自个儿累趴下咯。' },
  { speaker: '', color: COLORS.system, text: '（靠近发光的矿脉，按 [E] 键开采。矿洞可从小镇进入。）' },
];

/** 花匠小梅：种植话题 */
const GARDENER_DIALOGUES: DialogueLine[] = [
  { speaker: '花匠小梅', color: '#a0d888', text: '你好呀，我叫小梅。这些花都是我亲手种的，漂亮吧？' },
  { speaker: '花匠小梅', color: '#a0d888', text: '种东西啊，没什么秘诀。每天来看看它们，浇水、除草……' },
  { speaker: '花匠小梅', color: '#a0d888', text: '只要用心，土地就会用丰收回报你。你的庄园也会一样的。' },
];

/** 冒险家阿飞：冒险与森林提示 */
const ADVENTURER_DIALOGUES: DialogueLine[] = [
  { speaker: '冒险家阿飞', color: '#88b8e8', text: '嘿！新来的庄园主！我叫阿飞，这座岛的每个角落我都跑遍了。' },
  { speaker: '冒险家阿飞', color: '#88b8e8', text: '告诉你个秘密——森林深处有东西在发光，镇长神神秘秘的不肯说。' },
  { speaker: '冒险家阿飞', color: '#88b8e8', text: '想去探险的话，记得备足体力。森林可比看上去大得多！' },
];

/** 六个 NPC（贴图已独立，不再复用） */
const npcs: NPC[] = [
  new NPC('elder', '村长', 'npc_elder', ELDER_DIALOGUES, buildSchedule('elder')),
  new NPC('shopkeeper', '商店老板', 'npc_merchant', SHOPKEEPER_DIALOGUES, buildSchedule('shopkeeper')),
  new NPC('mystery', '神秘少女', 'npc_girl', MYSTERY_DIALOGUES, buildSchedule('mystery')),
  new NPC('miner', '矿工老张', 'npc_miner', MINER_DIALOGUES, buildSchedule('miner')),
  new NPC('gardener', '花匠小梅', 'npc_gardener', GARDENER_DIALOGUES, buildSchedule('gardener')),
  new NPC('adventurer', '冒险家阿飞', 'npc_adventurer', ADVENTURER_DIALOGUES, buildSchedule('adventurer')),
];

/** 读取全部 NPC（只读列表） */
export function getAllNPCs(): readonly NPC[] {
  return npcs;
}

/**
 * 把 "HH:MM" 转成当日分钟数（0-1439）
 */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 根据 TimeSystem 当前时间，刷新所有 NPC 的 currentLocation / targetX / targetY
 * 规则：取 schedule 中 time <= 当前时间 的最后一条
 * 应在场景 create 时、以及 TimeSystem.nextDay 之后调用
 */
export function refreshSchedule(): void {
  const now = getTime();
  const nowMin = now.hour * 60 + now.minute;
  for (const npc of npcs) {
    let active = npc.schedule[0];
    for (const entry of npc.schedule) {
      if (timeToMinutes(entry.time) <= nowMin) {
        active = entry;
      } else {
        break;
      }
    }
    npc.currentLocation = active.location;
    npc.targetX = active.x;
    npc.targetY = active.y;
  }
}

/**
 * 获取当前应出现在指定场景的 NPC 列表
 * （供 MapScene create 时创建 sprite）
 */
export function getNPCsForScene(sceneKey: string): NPC[] {
  return npcs.filter((n) => n.currentLocation === sceneKey);
}

/**
 * 每帧推进所有 NPC 的插值移动
 * （仅对有 sprite 的 NPC 生效，sprite 由 MapScene 创建/销毁）
 */
export function updateNPCs(dtMs: number): void {
  for (const npc of npcs) {
    npc.update(dtMs);
  }
}

/**
 * TimeSystem.nextDay 之后调用：重置 NPC 日程
 * （NPC 仍按时间判定位置，这里只需 refreshSchedule）
 */
export function onDayChange(): void {
  refreshSchedule();
}
