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
import { isMobileLayout } from '../config';

/** 操作提示文案：移动端（触屏）与桌面端（键盘）差异 */
function hint(pc: string, mob: string): string {
  return isMobileLayout() ? mob : pc;
}

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
    elder: { x: 14 * T + 8, y: 3 * T + 8 },
    shopkeeper: { x: 35 * T + 8, y: 3 * T + 8 },
    mystery: { x: 34 * T + 8, y: 16 * T + 8 },
    miner: { x: 18 * T + 8, y: 18 * T + 8 },
    gardener: { x: 3 * T + 8, y: 14 * T + 8 },
    adventurer: { x: 30 * T + 8, y: 7 * T + 8 },
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
  { speaker: '', color: COLORS.system, text: hint('（按 [E] 键打开商店。）', '（点「交互」打开商店。）') },
  { speaker: '商店老板', color: '#8ac8a0', text: '需要什么随便看。钱货两清，童叟无欺。' },
];

/** 神秘少女：神秘感对话，暗示岛屿与星辰的关联 */
const MYSTERY_DIALOGUES: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（一个少女站在树影下，她似乎一直在等着林澈。少女抬起头。）' },
  { speaker: '神秘少女', color: '#b8a0e8', text: '……你来了。' },
  { speaker: '林澈', color: COLORS.linche, text: '你认识我？' },
  { speaker: '神秘少女', color: '#b8a0e8', text: '不认识。……只是觉得，你应该会来。' },
  { speaker: '神秘少女', color: '#b8a0e8', text: '你身上……有那颗星的味道。' },
  { speaker: '神秘少女', color: '#b8a0e8', text: '你捡起的那块碎片……我也捡到过。' },
  { speaker: '', color: COLORS.system, text: '（林澈想追问，但少女已经转身消失在林间。）' },
];

/** v0.5.3 剧情密度 E6：观星夜后少女追加一句（仅观星完成后，接到固定对话末尾） */
const MYSTERY_AFTER_OBSERVATORY_DIALOGUE: DialogueLine[] = [
  { speaker: '神秘少女', color: '#b8a0e8', text: '你捡到的那片……它也认识你了。' },
  { speaker: '林澈', color: COLORS.linche, text: '你也捡到过？' },
  { speaker: '神秘少女', color: '#b8a0e8', text: '（没有回答，只是看着天空）……快归位了。' },
];

/** 矿工老张：挖矿引导 */
const MINER_DIALOGUES: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（老张看到林澈，咧嘴一笑，露出一口白牙。）' },
  { speaker: '矿工老张', color: '#d8a050', text: '哟，新来的小伙子！我是老张，矿洞这片归我管。' },
  { speaker: '', color: COLORS.system, text: '（老张掏出一块泛着微光的石头，递给林澈。）' },
  { speaker: '矿工老张', color: '#d8a050', text: '这矿里挖出来的东西，比你见过的所有代码都老。' },
  { speaker: '矿工老张', color: '#d8a050', text: '矿洞里能挖到石头、铜矿、铁矿。拿到镇上卖了能换钱。' },
  { speaker: '矿工老张', color: '#d8a050', text: '不过挖矿费体力，别把自个儿累趴下咯。' },
  { speaker: '', color: COLORS.system, text: hint('（靠近发光的矿脉，按 [E] 键开采。矿洞可从小镇进入。）', '（靠近发光的矿脉，点「交互」开采。矿洞可从小镇进入。）') },
  { speaker: '矿工老张', color: '#d8a050', text: '年轻的时候，我也想离开这里。' },
  { speaker: '林澈', color: COLORS.linche, text: '那为什么没走？' },
  { speaker: '矿工老张', color: '#d8a050', text: '（笑）……走不动了。路太长。' },
  { speaker: '林澈', color: COLORS.linche, text: '有时候，路长不是坏事。至少路上还能想清楚一些事。' },
  { speaker: '矿工老张', color: '#d8a050', text: '……说起来，这矿里有些老旧的机器，镇上没人会弄。' },
  { speaker: '林澈', color: COLORS.linche, text: '以前工作的时候，经常处理这些。' },
  { speaker: '矿工老张', color: '#d8a050', text: '哦？那你可帮大忙了。' },
  { speaker: '林澈', color: COLORS.linche, text: '（笑了笑，没接话）' },
];

/** 花匠小梅：种植话题 */
const GARDENER_DIALOGUES: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（小梅蹲在花圃边，正给一株花松土。她抬头看见林澈，笑了。）' },
  { speaker: '花匠小梅', color: '#a0d888', text: '你好呀，我叫小梅。这些花都是我亲手种的，漂亮吧？' },
  { speaker: '', color: COLORS.system, text: '（小梅指了指身旁的一株花。）' },
  { speaker: '花匠小梅', color: '#a0d888', text: '你爷爷以前每天下午都会来闻这株花的味道。他说这和城市的空气不一样。' },
  { speaker: '花匠小梅', color: '#a0d888', text: '种东西啊，没什么秘诀。每天来看看它们，浇水、除草……' },
  { speaker: '花匠小梅', color: '#a0d888', text: '只要用心，土地就会用丰收回报你。你的庄园也会一样的。' },
  { speaker: '花匠小梅', color: '#a0d888', text: '这花不是卖的，是有人托我种的。' },
  { speaker: '林澈', color: COLORS.linche, text: '托给谁？' },
  { speaker: '花匠小梅', color: '#a0d888', text: '不知道。但那个人说，总有一天会有人来收。' },
  { speaker: '林澈', color: COLORS.linche, text: '……这座岛上的事情，好像都是"总有一天"。' },
  { speaker: '花匠小梅', color: '#a0d888', text: '（笑）你也感觉到了？' },
];

/** 冒险家阿风：冒险与森林提示 */
const ADVENTURER_DIALOGUES: DialogueLine[] = [
  { speaker: '冒险家阿风', color: '#88b8e8', text: '嘿！新来的庄园主！我叫阿风，这座岛的每个角落我都跑遍了。' },
  { speaker: '冒险家阿风', color: '#88b8e8', text: '告诉你个秘密——森林深处有东西在发光，镇长神神秘秘的不肯说。' },
  { speaker: '冒险家阿风', color: '#88b8e8', text: '想去探险的话，记得备足体力。森林可比看上去大得多！' },
  { speaker: '冒险家阿风', color: '#88b8e8', text: '森林深处……有些东西，最好别惊醒。' },
  { speaker: '林澈', color: COLORS.linche, text: '（笑）你越这么说，我越想去看。' },
  { speaker: '冒险家阿风', color: '#88b8e8', text: '嘿！你这小子，胆子不小啊！' },
  { speaker: '林澈', color: COLORS.linche, text: '不是胆子大。只是觉得，既然来了这座岛，就该看看它藏着什么。' },
  { speaker: '冒险家阿风', color: '#88b8e8', text: '说得对。有空来森林，我带你转转。' },
];

// ============ v0.5.3 剧情密度：NPC 每日随机一句 ============
// 设计：让 NPC 像真实居民——不每句都服务剧情。
// 选句规则：seed = 当天天数 + NPC id hash，取模选 1 句。
// 同一天同 NPC 固定同一句（读档回来不跳变，因 seed 只依赖天数，不依赖存档）。
// 状态：由 MapScene 持有"当天已说过"的内存标记（Map<npcId, day>），不进入存档。

const NPC_DAILY_LINES: Record<string, DialogueLine[]> = {
  elder: [
    { speaker: '村长', color: '#c8b898', text: '你爷爷以前每天傍晚都会来我这儿坐坐。' },
    { speaker: '村长', color: '#c8b898', text: '这座岛啊，安静太久了。有人回来，挺好的。' },
    { speaker: '村长', color: '#c8b898', text: '星星的事……你慢慢来，别着急。' },
    { speaker: '村长', color: '#c8b898', text: '今天的天气，适合看星星。' },
  ],
  shopkeeper: [
    { speaker: '商店老板', color: '#8ac8a0', text: '今天有批新货到了，来看看？' },
    { speaker: '商店老板', color: '#8ac8a0', text: '最近买种子的人多了，看来大家都开始种地了。' },
    { speaker: '商店老板', color: '#8ac8a0', text: '镇上好久没这么热闹了。你来了之后，感觉不一样了。' },
    { speaker: '商店老板', color: '#8ac8a0', text: '我年轻的时候也种过地，后来……算了，不提了。' },
  ],
  miner: [
    { speaker: '矿工老张', color: '#d8a050', text: '今天风不错，适合晒木材。' },
    { speaker: '矿工老张', color: '#d8a050', text: '今年雨水比去年多，地倒是好挖了。' },
    { speaker: '矿工老张', color: '#d8a050', text: '昨晚听见林子里有动静，估计又是野猪。' },
    { speaker: '矿工老张', color: '#d8a050', text: '矿洞里头凉快，来坐坐？' },
  ],
  gardener: [
    { speaker: '花匠小梅', color: '#a0d888', text: '今天这花开得比昨天好。' },
    { speaker: '花匠小梅', color: '#a0d888', text: '听说庄园里种出了新作物？' },
    { speaker: '花匠小梅', color: '#a0d888', text: '我的水壶漏了，正愁呢。' },
    { speaker: '花匠小梅', color: '#a0d888', text: '这株花啊，是我爷爷种的。' },
  ],
  adventurer: [
    { speaker: '冒险家阿风', color: '#88b8e8', text: '森林最近有奇怪的声音，我可没说谎。' },
    { speaker: '冒险家阿风', color: '#88b8e8', text: '我今天又发现一个没人去过的地方。' },
    { speaker: '冒险家阿风', color: '#88b8e8', text: '明天想去北边看看，你去不？' },
    { speaker: '冒险家阿风', color: '#88b8e8', text: '听说老张昨晚又喝多了，哈哈。' },
  ],
};

/** 简单字符串 hash（用于 seed，避免依赖天数之外的状态） */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 获取某 NPC 当天的一句随机生活台词（无状态，seed = day + npcId hash）
 * @param npcId NPC id（miner/gardener/adventurer）
 * @param day 当天天数
 * @returns 台词数组（1 条）；该 NPC 没有随机池时返回 null
 */
export function getDailyNpcLine(npcId: string, day: number): DialogueLine[] | null {
  const pool = NPC_DAILY_LINES[npcId];
  if (!pool || pool.length === 0) return null;
  const idx = (hashCode(npcId) + day) % pool.length;
  return [pool[idx]];
}

/** 六个 NPC（贴图已独立，不再复用） */
const npcs: NPC[] = [
  new NPC('elder', '村长', '#d9c8a0', 'npc_elder', ELDER_DIALOGUES, buildSchedule('elder')),
  new NPC('shopkeeper', '商店老板', '#e0b060', 'npc_merchant', SHOPKEEPER_DIALOGUES, buildSchedule('shopkeeper')),
  new NPC('mystery', '神秘少女', '#c8a0e8', 'npc_girl', MYSTERY_DIALOGUES, buildSchedule('mystery')),
  new NPC('miner', '矿工老张', '#d8a050', 'npc_miner', MINER_DIALOGUES, buildSchedule('miner')),
  new NPC('gardener', '花匠小梅', '#a0d888', 'npc_gardener', GARDENER_DIALOGUES, buildSchedule('gardener')),
  new NPC('adventurer', '冒险家阿风', '#88b8e8', 'npc_adventurer', ADVENTURER_DIALOGUES, buildSchedule('adventurer')),
];

/** 读取全部 NPC（只读列表） */
export function getAllNPCs(): readonly NPC[] {
  return npcs;
}

/** v0.5.3 剧情密度 E6：观星夜后少女追加台词（只读） */
export function getMysteryAfterObservatory(): DialogueLine[] {
  return MYSTERY_AFTER_OBSERVATORY_DIALOGUE;
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
