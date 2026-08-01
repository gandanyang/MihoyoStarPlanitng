/**
 * 剧情系统 — 序章：归乡
 *
 * 状态流转：
 *   station_intro → station_move → arrive_manor → xiya_talk → get_key
 *   → gate_opened → clear_land → sow_seeds → water_crops → evening_talk → done
 */

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
  | 'done';               // 教程完成

export interface DialogueLine {
  speaker: string;
  color: string;
  text: string;
  inner?: boolean;
}

export const COLORS = {
  linche: '#7eb8da',
  xiya: '#f0a050',
  elder: '#c8b898',
  system: '#aaaaaa',
};

// ============ 对话数据 ============

/** 车站开场 */
export const STATION_DIALOGUE: DialogueLine[] = [
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '又一次。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '五年前，我觉得进入大城市，就是进入了未来。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '每天面对电脑，写代码、改方案、追赶新的技术。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '可是当变化真正发生的时候……' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '好像只需要一封邮件，就能结束一个人的几年努力。' },
  { speaker: '', color: COLORS.system, text: '（林澈关闭手机。）' },
  { speaker: '林澈', color: COLORS.linche, text: '算了。至少这次，不用再假装自己没事了。' },
  { speaker: '', color: COLORS.system, text: '（林澈看向远处，那里有一座老旧庄园。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '星黎庄园……没想到最后，我还是回到了这里。' },
  { speaker: '', color: COLORS.system, text: '使用 [W/A/S/D] 或方向键控制林澈移动。前往星黎庄园。' },
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
  { speaker: '', color: COLORS.system, text: '获得物品：【庄园钥匙】  按 [B] 键打开背包，使用钥匙打开大门。' },
];

/** 开门后 → 整理庄园 */
export const GATE_OPENED_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（大门伴随着沉重的「吱呀」声被推开，院子里长满杂草，土地已经多年无人打理。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这里以前可是镇上最漂亮的庄园。现在嘛……可能需要一点时间。' },
  { speaker: '', color: COLORS.system, text: '（夏雅拿出一把旧锄头。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这个应该还能用。虽然旧了点。' },
  { speaker: '林澈', color: COLORS.linche, text: '以前我每天面对的是电脑。现在突然让我种地……感觉跨度有点大。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '放心。很多事情都是从第一次开始的。' },
  { speaker: '', color: COLORS.system, text: '获得物品：【旧锄头】  对着农田区域按 [E] 键锄地，清理 3 块土地。' },
];

/** 清理完成 → 播种 */
export const SOW_SEEDS_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（土地整理完成，阳光洒在新翻开的土地上。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '不错。至少这片土地已经重新醒过来了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这里还有一些种子。试试看吧。' },
  { speaker: '', color: COLORS.system, text: '获得物品：【萝卜种子】×3' },
  { speaker: '林澈', color: COLORS.linche, text: '种下一颗种子。然后等待它成长……这种感觉，好像和写代码完全不一样。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '但是它们都有一点相同。需要时间。也需要耐心。' },
  { speaker: '', color: COLORS.system, text: '按 [R] 键切换到萝卜种子，然后对着锄过的土地按 [E] 播种。播种 3 块土地。' },
];

/** 播种完成 → 浇水 */
export const WATER_CROPS_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（井边。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '每天照顾它们。它们才会回应你的努力。' },
  { speaker: '', color: COLORS.system, text: '获得物品：【旧水壶】' },
  { speaker: '', color: COLORS.system, text: '对已播种的土地按 [E] 键浇水。为所有作物浇水。' },
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
  { speaker: '', color: COLORS.system, text: '（靠近镇长、商人或居民，按 [E] 键与他们对话。镇长看起来有话想说。）' },
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

export function getStoryStep(): StoryStep {
  return currentStep;
}

export function setStoryStep(step: StoryStep): void {
  currentStep = step;
}

export function isTutorialDone(): boolean {
  return currentStep === 'done';
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