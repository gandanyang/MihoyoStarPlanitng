/**
 * 剧情系统 — 序章：归乡
 *
 * 状态流转：
 *   station_intro → station_move → arrive_manor → xiya_talk → get_key
 *   → gate_opened → clear_land → sow_seeds → water_crops → evening_talk → done
 */

import { isMobileLayout } from '../config';

export type StoryStep =
  | 'station_intro'       // 车站开场对话
  | 'station_move'        // 移动教学：前往星黎庄园
  | 'arrive_manor'        // 到达庄园门口
  | 'xiya_talk'           // 与夏雅对话
  | 'get_key'             // 获得庄园钥匙
  | 'gate_opened'         // 大门打开，夏雅给锄头
  | 'clear_land'          // 清理3块土地
  | 'sow_seeds'           // 夏雅给种子，播种3块
  | 'water_crops'         // 夏雅给水壶，浇水
  | 'evening_talk'        // 晚间对话
  | 'done'                // 教程完成
  | 'observatory_complete'; // 观星夜收尾完成（Demo 结尾终态，复用 storyStep 模式）

/** 全部合法剧情步骤（存档边界保护白名单，SaveSystem 复用） */
export const STORY_STEPS: StoryStep[] = [
  'station_intro', 'station_move', 'arrive_manor', 'xiya_talk', 'get_key',
  'gate_opened', 'clear_land', 'sow_seeds', 'water_crops', 'evening_talk',
  'done', 'observatory_complete',
];

export interface DialogueLine {
  speaker: string;
  color: string;
  text: string;
  inner?: boolean;
  /** 选项行：显示为可点击选项（当前仅观星夜收尾使用） */
  options?: string[];
}

export const COLORS = {
  linche: '#7eb8da',
  xiya: '#f0a050',
  elder: '#c8b898',
  girl: '#b8a0e8',
  letter: '#e8d8a8',
  system: '#aaaaaa',
};

/** 操作提示文案：移动端（触屏）与桌面端（键盘）差异 */
function hint(pc: string, mob: string): string {
  return isMobileLayout() ? mob : pc;
}

// ============ 对话数据 ============

/** 车站开场 */
export const STATION_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（「嘀——」列车到站声。晨光从车窗漏进来。）' },
  { speaker: '', color: COLORS.system, text: '（手机屏幕亮起：「尊敬的林澈先生：因业务流程智能化调整，您的岗位职责将进行重新分配。感谢您五年来的付出。」）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '五年了。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '五年前，我以为走进大城市，就是走进了未来。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '五年里，我换过无数版本的工具。每一次，都告诉自己：下一次，不会被淘汰。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '可是变化真正发生的时候……原来只需要一封邮件。' },
  { speaker: '', color: COLORS.system, text: '（林澈关掉手机。）' },
  { speaker: '林澈', color: COLORS.linche, text: '算了。至少这次，不用再假装自己没事了。' },
  { speaker: '', color: COLORS.system, text: '（林澈抬起头。远处，晨雾里有一座安静的庄园。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '星黎庄园……爷爷留给我的那封信，写着这个地址。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '他说，如果有一天不知道往哪走，就回来看看。' },
  { speaker: '', color: COLORS.system, text: hint('使用 [W/A/S/D] 或方向键控制林澈移动。前往星黎庄园。', '使用屏幕左下方摇杆控制林澈移动。前往星黎庄园。') },
];

/** 初遇夏雅 */
export const XIYA_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（庄园大门前，一个年轻女孩正在清理门口的杂草。她看到林澈后停下动作。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你就是林澈吧？终于来了。' },
  { speaker: '林澈', color: COLORS.linche, text: '你认识我？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '当然。这座庄园的事情，小镇上的人都知道。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你的家人离开之后，这里已经荒废好多年了。大家都以为……不会有人再回来了。' },
  { speaker: '林澈', color: COLORS.linche, text: '我也没想到自己会回来。本来只是想处理一下庄园。然后……看看以后怎么办。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '那就从这里开始吧。房子虽然旧了，田地虽然荒了。但是只要有人愿意重新照顾它，总会慢慢恢复的。' },
  { speaker: '', color: COLORS.system, text: '（夏雅递出钥匙。）' },
  { speaker: '', color: COLORS.system, text: hint('获得物品：【庄园钥匙】  按 [B] 键打开背包，使用钥匙打开大门。', '获得物品：【庄园钥匙】  点按右下角「背包」按钮，使用钥匙打开大门。') },
];

/** 开门后 → 整理庄园 */
export const GATE_OPENED_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（大门伴随着沉重的「吱呀」声被推开，院子里长满杂草，土地已经多年无人打理。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这里以前可是镇上最漂亮的庄园。现在嘛……可能需要一点时间。' },
  { speaker: '', color: COLORS.system, text: '（夏雅拿出一把旧锄头。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这个应该还能用。虽然旧了点。' },
  { speaker: '林澈', color: COLORS.linche, text: '以前我每天面对的是电脑。现在突然让我种地……感觉跨度有点大。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '放心。很多事情都是从第一次开始的。' },
  { speaker: '', color: COLORS.system, text: hint('获得物品：【旧锄头】  对着农田区域按 [E] 键锄地，清理 3 块土地。', '获得物品：【旧锄头】  对着农田区域点「交互」锄地，清理 3 块土地。') },
];

/** 清理完成 → 播种 */
export const SOW_SEEDS_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（土地整理完成，阳光洒在新翻开的土地上。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '不错。至少这片土地已经重新醒过来了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这里还有一些种子。试试看吧。' },
  { speaker: '', color: COLORS.system, text: '获得物品：【萝卜种子】×3' },
  { speaker: '林澈', color: COLORS.linche, text: '种下一颗种子。然后等待它成长……这种感觉，好像和写代码完全不一样。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '但是它们都有一点相同。需要时间。也需要耐心。' },
  { speaker: '', color: COLORS.system, text: hint('按 [R] 键切换到萝卜种子，然后对着锄过的土地按 [E] 播种。播种 3 块土地。', '对着锄过的土地点「交互」播种萝卜（默认种子）。播种 3 块土地。') },
];

/** 播种完成 → 浇水 */
export const WATER_CROPS_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（井边。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '每天照顾它们。它们才会回应你的努力。' },
  { speaker: '', color: COLORS.system, text: '获得物品：【旧水壶】' },
  { speaker: '', color: COLORS.system, text: hint('对已播种的土地按 [E] 键浇水。为所有作物浇水。', '对已播种的土地点「交互」浇水。为所有作物浇水。') },
];

/** 晚间结尾 */
export const EVENING_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（夜晚，林澈坐在庄园门口，看着重新整理过的土地。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '以前总觉得，只要不断追赶时代，就不会被淘汰。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '可是现在……也许慢下来，也不是坏事。' },
  { speaker: '', color: COLORS.system, text: '（手机亮起，是一条城市新闻：「AI技术持续改变就业市场……」）' },
  { speaker: '', color: COLORS.system, text: '（林澈看了一眼，然后关掉手机。）' },
  { speaker: '林澈', color: COLORS.linche, text: '明天还有很多事情要做。' },
  { speaker: '', color: COLORS.system, text: '回到床上睡觉，结束第一天。' },
];

// ============ 第一章：小镇的居民 ============

/** 首次进入小镇 */
export const TOWN_INTRO_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（清晨，林澈穿过庄园外的石桥，第一次踏上星火镇的街道。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '这就是星火镇……爷爷信里提起过的地方。' },
  { speaker: '', color: COLORS.system, text: '（街道两旁是低矮的木屋，商店门口已经支起了摊子。一个老人正在清扫门前的台阶。）' },
  { speaker: '', color: COLORS.system, text: '（镇长早就听说庄园来了一位新主人。他放下扫帚，朝林澈招了招手。）' },
  { speaker: '', color: COLORS.system, text: hint('（靠近镇长、商人或居民，按 [E] 键与他们对话。镇长看起来有话想说。）', '（靠近镇长、商人或居民，点「交互」与他们对话。镇长看起来有话想说。）') },
];

/** 村长委托星之碎片任务（第一章主线开启） */
export const ELDER_QUEST_DIALOGUE: DialogueLine[] = [
  { speaker: '村长', color: COLORS.elder, text: '你就是林澈吧？星黎庄园的新主人。' },
  { speaker: '林澈', color: COLORS.linche, text: '您好，您是……' },
  { speaker: '村长', color: COLORS.elder, text: '我是星火镇的镇长。你的爷爷，是这座岛上看星星看得最久的人。' },
  { speaker: '村长', color: COLORS.elder, text: '他年轻时发现了这片土地的秘密——森林深处藏着一种会发光的「星之碎片」。' },
  { speaker: '村长', color: COLORS.elder, text: '传说当所有碎片归位，这座岛会重新苏醒。可这些年，碎片散落各处，森林里那一块……我老了，走不动了。' },
  { speaker: '村长', color: COLORS.elder, text: '年轻人，能帮我取回森林里的星之碎片吗？' },
  { speaker: '林澈', color: COLORS.linche, text: '星之碎片……听起来像是爷爷留给我的一道题。好，我去看看。' },
  { speaker: '', color: COLORS.system, text: '主线任务已接受：前往森林采集星之碎片。' },
];

/** 交付星之碎片（第一章完成） */
export const SHARD_DELIVER_DIALOGUE: DialogueLine[] = [
  { speaker: '林澈', color: COLORS.linche, text: '镇长，星之碎片……我拿到了。' },
  { speaker: '', color: COLORS.system, text: '（林澈摊开手掌，一枚泛着幽蓝光芒的碎片静静躺在掌心。）' },
  { speaker: '村长', color: COLORS.elder, text: '这光泽……没错，就是星之碎片。你已经能让它认主了。' },
  { speaker: '村长', color: COLORS.elder, text: '岛屿在呼应你，林澈。你爷爷选择让这座庄园回到你手里，不是没有道理的。' },
  { speaker: '村长', color: COLORS.elder, text: '把碎片收好吧。等集齐更多碎片，星辰岛真正苏醒的那一天，你会明白这一切。' },
  { speaker: '', color: COLORS.system, text: '主线任务完成：星之碎片（1/…）。岛屿的秘密，才刚刚开始。' },
];

// ============ Demo 结尾：观星 ============

// ============ 第一章：森林碎片（程序员能力展示） ============

/** 森林采集对话（首次交互播放，结束后自动采集） */
export const FOREST_SHARD_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（森林深处，一块泛着幽蓝光芒的碎片静静躺在树根旁。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '我们试过很多办法，可它一直没有反应。' },
  { speaker: '林澈', color: COLORS.linche, text: '不是没有反应。' },
  { speaker: '林澈', color: COLORS.linche, text: '它像是在等待一个条件。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你怎么看出来的？' },
  { speaker: '林澈', color: COLORS.linche, text: '以前调程序的时候，经常遇到类似的问题。' },
  { speaker: '', color: COLORS.girl, text: '……它沉睡太久了。' },
];

// ============ Demo 结尾：观星夜（定稿版 v0.3） ============

/** 观星夜收尾（第一章完成 + 夜晚，靠近观星点触发；含静默镜头与选项） */
export const DEMO_ENDING_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（夜幕降临。庄园外，今天的星空格外明亮。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你爷爷以前每天都会坐在这里。' },
  { speaker: '林澈', color: COLORS.linche, text: '他也喜欢看星星？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '嗯。他说，总有一天，会有人回来继续看。' },
  { speaker: '', color: COLORS.system, text: '（夏雅看向石头边。那里压着一封信，被月光晒得发白。）' },
  { speaker: '信', color: COLORS.letter, text: '如果看到这封信，说明你终于回来了。' },
  { speaker: '信', color: COLORS.letter, text: '我不知道你为什么回来。可能是累了，可能是迷茫了。' },
  { speaker: '信', color: COLORS.letter, text: '但这里，永远有一个属于你的地方。' },
  { speaker: '', color: COLORS.system, text: '（林澈握着信，抬头看向星空。）' },
  { speaker: '', color: COLORS.system, text: '（他没有说话。）' },
  { speaker: '', color: COLORS.system, text: '（远处传来虫鸣。星光落在庄园旧墙上。）' },
  { speaker: '', color: COLORS.system, text: '', options: ['爷爷，我会试着留下。', '我还不知道答案。', '至少今晚，我想待在这里。'] },
];

/** 观星夜三选项分支独白（选择后播放，随后汇聚到结局） */
export const DEMO_ENDING_BRANCHES: Record<'try_stay' | 'unknown' | 'tonight', DialogueLine[]> = {
  try_stay: [
    { speaker: '', color: COLORS.system, text: '（林澈把信收好。也许这一次，可以试试看。）' },
  ],
  unknown: [
    { speaker: '', color: COLORS.system, text: '（林澈把信收好。有些答案，也许要在这里住很久才能找到。）' },
  ],
  tonight: [
    { speaker: '', color: COLORS.system, text: '（林澈把信收好。至少今晚，他想待在这里。）' },
  ],
};

/** 观星夜收尾：选择后的汇聚结尾（次日清晨，自由模式） */
export const DEMO_ENDING_FINALE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（那一夜，他没有再说话。只有风穿过田野。）' },
  { speaker: '', color: COLORS.system, text: '第二天清晨，新的早晨开始了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '归星镇，欢迎你。' },
  { speaker: '', color: COLORS.system, text: '已存档。现在开始，这座岛都是你的了。' },
];

// ============ 状态管理 ============

let currentStep: StoryStep = 'station_intro';

/** 第一章：是否已触发过「首次进入小镇」剧情 */
let ch1TownIntroDone = false;

/** 第一章：是否已触发过小镇剧情 */
export function isCh1TownIntroDone(): boolean {
  return ch1TownIntroDone;
}

/** 标记小镇剧情已触发 */
export function markCh1TownIntroDone(): void {
  ch1TownIntroDone = true;
}

/** Demo 结尾：观星夜是否已完成（复用 storyStep，不新增存档字段） */
export function isObservatoryComplete(): boolean {
  return currentStep === 'observatory_complete';
}

/** 标记观星夜收尾完成（进入终态；isTutorialDone 兼容此终态） */
export function markObservatoryComplete(): void {
  currentStep = 'observatory_complete';
}

/** 观星夜选择类型（第三章多结局预留，仅内存暂存） */
export type EndingChoice = 'try_stay' | 'unknown' | 'tonight';
let endingChoice: EndingChoice | null = null;

/** 读取观星夜选择 */
export function getEndingChoice(): EndingChoice | null {
  return endingChoice;
}

/** 记录观星夜选择（暂不入档，第三章再定） */
export function setEndingChoice(choice: EndingChoice | null): void {
  endingChoice = choice;
}

export function getStoryStep(): StoryStep {
  return currentStep;
}

export function setStoryStep(step: StoryStep): void {
  currentStep = step;
}

export function isTutorialDone(): boolean {
  return currentStep === 'done' || currentStep === 'observatory_complete';
}

export function advanceStory(): void {
  const order: StoryStep[] = [
    'station_intro', 'station_move', 'arrive_manor', 'xiya_talk',
    'get_key', 'gate_opened', 'clear_land', 'sow_seeds',
    'water_crops', 'evening_talk', 'done',
  ];
  const idx = order.indexOf(currentStep);
  if (idx >= 0 && idx < order.length - 1) {
    currentStep = order[idx + 1];
  }
}
