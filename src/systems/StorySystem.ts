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
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '五年里，我换过无数版本的工具。每一次，都告诉自己：跑得快就不会被追上。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '可是收到邮件的时候，我其实松了一口气。' },
  { speaker: '', color: COLORS.system, text: '（林澈关掉手机。）' },
  { speaker: '林澈', color: COLORS.linche, text: '算了。至少这次，是我自己选的离开。' },
  { speaker: '', color: COLORS.system, text: '（林澈抬起头。远处，晨雾里有一座安静的庄园。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '星黎庄园……爷爷留给我的那封信，写着这个地址。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '他说，如果有一天不知道往哪走，就回来看看。' },
  { speaker: '', color: COLORS.system, text: hint('使用 [W/A/S/D] 或方向键控制林澈移动。前往星黎庄园。', '使用屏幕左下方摇杆控制林澈移动。前往星黎庄园。') },
];

/** 初遇夏雅 */
export const XIYA_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（庄园大门前，一个年轻女孩正在清理门口的杂草。她看到林澈后停下动作。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你就是林澈吧？终于来了。' },
  { speaker: '林澈', color: COLORS.linche, text: '（愣了一下）你认识我？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '当然。你爷爷走得太突然了，镇上的人都在猜……还会不会有人回来。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你的家人离开之后，这里已经荒废好多年了。大家都以为……不会有人再回来了。' },
  { speaker: '林澈', color: COLORS.linche, text: '我也没想到自己会回来。本来只是想处理一下庄园。然后……看看以后怎么办。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你刚才在门口站了很久。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '是在想爷爷的事吗？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '如果现在还不想说，也没关系。' },
  { speaker: '林澈', color: COLORS.linche, text: '只是有点想知道，爷爷最后看到的，会不会也是这样的天空。' },
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
  { speaker: '林澈', color: COLORS.linche, text: '以前我每天面对的是屏幕。现在突然让我面对一块地……感觉屏幕外的东西，确实不太一样，有点不习惯。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '放心。很多事情都是从第一次开始的。' },
  { speaker: '', color: COLORS.system, text: hint('获得物品：【旧锄头】  对着农田区域按 [E] 键锄地，清理 3 块土地。', '获得物品：【旧锄头】  对着农田区域点「交互」锄地，清理 3 块土地。') },
];

/** v0.5.3 剧情密度 E1：夏雅清晨偶遇（教程完成后，清晨 06-08 时进入农场触发） */
export const XIYA_DAWN_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（清晨的庄园很安静。夏雅蹲在田边，正看着昨夜露水下的土地。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这么早？我睡不着，就过来看看这些地。' },
  { speaker: '林澈', color: COLORS.linche, text: '你每天都起这么早？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '（笑）岛上的人都这样。太阳一出来，就想醒着。' },
  { speaker: '林澈', color: COLORS.linche, text: '……我以前，都是被闹钟叫醒的。' },
];

/** v0.5.3 剧情密度 E5：爷爷的笔记（庄园角落可读物件，多条轮换、不解释） */
export const GRANDPA_NOTES: DialogueLine[] = [
  { speaker: '爷爷的笔记', color: COLORS.letter, text: '今天又捡到一片。星星……是不是也想回家？' },
  { speaker: '爷爷的笔记', color: COLORS.letter, text: '我数了数，还差一些。等它们都回来了，也许就能问清楚了。' },
  { speaker: '爷爷的笔记', color: COLORS.letter, text: '那些发光的碎片，醒来时像在看我。是我多心了吧。' },
  { speaker: '爷爷的笔记', color: COLORS.letter, text: '最近发现，岛上的生态变化似乎和星辰周期有关。' },
];

/** v0.5.3 剧情密度 E2：第一次收获反馈（一次性，夏雅口头肯定，非系统弹窗） */
export const FIRST_HARVEST_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（夏雅不知什么时候走了过来，看着你手里的收获。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这就是你种出来的东西。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '比屏幕里的，要实在一点吧。' },
  { speaker: '林澈', color: COLORS.linche, text: '（低头看了看手里的萝卜）……确实。' },
];

/** v0.5.3 剧情密度 E9：夏雅傍晚关心（教程完成后，傍晚 18-20 时进入农场触发） */
export const XIYA_EVENING_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（傍晚的庄园染上一层金色。夏雅坐在栅栏边，看着远处的海。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '今天过得怎么样？' },
  { speaker: '林澈', color: COLORS.linche, text: '……挺累的。但是和以前那种累不一样。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '（笑了笑）这里没有KPI，没有周报。你做的事情，土地都会记得。' },
  { speaker: '林澈', color: COLORS.linche, text: '（沉默片刻）……谢谢。' },
];

/** 清理完成 → 播种 */
export const SOW_SEEDS_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（土地整理完成，阳光洒在新翻开的土地上。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '不错。开了个好头，这片土地已经重新醒过来了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这里还有一些种子。你试试看吧。' },
  { speaker: '', color: COLORS.system, text: '获得物品：【萝卜种子】×3' },
  { speaker: '林澈', color: COLORS.linche, text: '种下一颗种子。然后等待它成长……这种感觉，好像和写代码完全不一样。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '但是它们都有一点相同。需要时间。也需要耐心。' },
  { speaker: '', color: COLORS.system, text: hint('按 [R] 键切换到萝卜种子，然后对着锄过的土地按 [E] 播种。播种 3 块土地。', '对着锄过的土地点「交互」播种萝卜（默认种子）。播种 3 块土地。') },
];

/** 播种完成 → 浇水 */
export const WATER_CROPS_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（井边。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '每天照顾它们。它们才会回应你的努力。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '不用着急。土地不会催你，它只会等着。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '在这里，慢一点也没关系。' },
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
  { speaker: '', color: COLORS.system, text: '（村长停顿了一下，看向远处的森林。）' },
  { speaker: '村长', color: COLORS.elder, text: '他以前每天晚上都坐在观星台上。他跟我说，那些碎片……是星星留在这座岛上的东西。' },
  { speaker: '村长', color: COLORS.elder, text: '他说，总有一天会有人回来，替他把碎片找齐。' },
  { speaker: '', color: COLORS.system, text: '（村长转过头，看着林澈。）' },
  { speaker: '村长', color: COLORS.elder, text: '看来...那个人……应该就是你了。' },
  { speaker: '林澈', color: COLORS.linche, text: '……我试试看。' },
  { speaker: '', color: COLORS.system, text: '主线任务已接受：前往森林采集星之碎片。' },
];

/** 交付星之碎片（第一章完成） */
export const SHARD_DELIVER_DIALOGUE: DialogueLine[] = [
  { speaker: '林澈', color: COLORS.linche, text: '镇长，星之碎片……我拿到了。' },
  { speaker: '', color: COLORS.system, text: '（林澈摊开手掌，一枚泛着幽蓝光芒的碎片静静躺在掌心。）' },
  { speaker: '村长', color: COLORS.elder, text: '这光泽……没错，就是星之碎片。你爷爷当年捡到第一片的时候，也是这样的光。' },
  { speaker: '村长', color: COLORS.elder, text: '他跟我说过，这座岛上的碎片，只有真正"想留下来"的人才能拿起来。' },
  { speaker: '村长', color: COLORS.elder, text: '你能把它带回来，说明这座岛……已经认你了。' },
  { speaker: '林澈', color: COLORS.linche, text: '……我其实没做什么。它就在那儿，我只是走过去拿起来而已。' },
  { speaker: '村长', color: COLORS.elder, text: '（笑）那就够了。有时候，不是人找到东西，是东西找到人。' },
  { speaker: '', color: COLORS.system, text: '主线任务完成：星之碎片（1/…）。' },
];

// ============ Demo 结尾：观星 ============

// ============ 第一章：森林碎片（程序员能力展示） ============

/** 森林采集对话（首次交互播放，结束后自动采集） */
export const FOREST_SHARD_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（森林深处，一块泛着幽蓝光芒的碎片静静躺在树根旁。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '我们试过很多办法，可它一直没有反应。' },
  { speaker: '林澈', color: COLORS.linche, text: '不是没有反应。' },
  { speaker: '林澈', color: COLORS.linche, text: '更像一个长期没有维护的系统。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '什么？' },
  { speaker: '林澈', color: COLORS.linche, text: '它在等待一个条件。没有回应，是因为条件还没满足。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '……你又在说奇怪的话了。' },
  { speaker: '林澈', color: COLORS.linche, text: '职业习惯。' },
  { speaker: '', color: COLORS.girl, text: '……它沉睡太久了。' },
];

// ============ 引导对话：砍树 + 挖矿 ============

/** 砍树引导（教程完成后第一次砍树触发；夏雅引导版） */
export const WOODCUT_TIP_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（林澈握着旧斧头，站在庄园的老树下。）' },
  { speaker: '林澈', color: COLORS.linche, text: '……爷爷留下的庄园，要修的地方还不少。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这些树正好用得上。砍下来的木材，能卖钱，也能修房子。' },
  { speaker: '林澈', color: COLORS.linche, text: '你倒是把什么都想好了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '（笑）在岛上住久了，自然就懂这些了。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '以前只会删代码，现在倒要学着砍树了。' },
  { speaker: '', color: COLORS.system, text: hint('靠近树，按 [E] 键用斧头砍伐。木材可以卖钱或修建设施。', '靠近树，点「交互」用斧头砍伐。木材可以卖钱或修建设施。') },
];

/** 挖矿引导（第一次进入矿洞触发；夏雅引导版） */
export const MINE_TIP_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（矿洞深处，岩壁上隐约有光芒闪烁。）' },
  { speaker: '林澈', color: COLORS.linche, text: '那些发光的矿石……' },
  { speaker: '夏雅', color: COLORS.xiya, text: '老张说，矿洞里的石头、铜矿、铁矿，都能卖钱。' },
  { speaker: '林澈', color: COLORS.linche, text: '（点点头）那我挖一点回去试试。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '小心点。挖矿很费体力，累了就回去歇着。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '以前加班熬到半夜，也没人跟我说"累了就歇着"。' },
  { speaker: '', color: COLORS.system, text: hint('靠近发光的矿脉，按 [E] 键开采。矿石可以卖给商店老板。', '靠近发光的矿脉，点「交互」开采。矿石可以卖给商店老板。') },
];

/** M1-3 爷爷的旧花园：夏雅见证对白（花园恢复完成后，夏雅在花园旁出现，靠近触发）
 *  制作人确认文案（2026-08-03）：生活记忆型——不解释主题，只补充一个生活片段。
 *  范围限定：A/B 类生活对白，无剧情节点/任务/StoryStep/存档字段。 */
export const GARDEN_RESTORED_XIYA_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（夏雅不知什么时候站在了花园边，看着重新种上的花。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这里以前也是爷爷最喜欢来的地方。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '小时候我经常看到他坐在这里，一坐就是很久。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '他说，花开的时候，这里就像又有了新的开始。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '奇怪……爷爷以前说，这里的花总是比别的地方开得早。' },
];

// ============ Demo 结尾：观星夜（定稿版 v0.3） ============

/** 观星夜收尾（第一章完成 + 夜晚，靠近观星点触发；含静默镜头与选项） */
export const DEMO_ENDING_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（夜幕降临。庄园外，今天的星空格外明亮。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你爷爷以前每天都会坐在这里。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '他走以后，岛上的人还是会偶尔来看这里。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '大家都觉得，总有一天，会有人重新打开这扇门。' },
  { speaker: '林澈', color: COLORS.linche, text: '他也喜欢看星星？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '嗯。他说，总有一天，会有人回来继续看。' },
  { speaker: '', color: COLORS.system, text: '（夏雅看了看林澈，没有继续说下去。）' },
  { speaker: '', color: COLORS.system, text: '（夏雅看向石头边。那里压着一封信，被月光晒得发白。）' },
  { speaker: '信', color: COLORS.letter, text: '如果看到这封信，说明你终于回来了。' },
  { speaker: '信', color: COLORS.letter, text: '我不知道你为什么回来。可能是累了，可能是迷茫了。' },
  { speaker: '信', color: COLORS.letter, text: '但这里，永远有一个属于你的地方。' },
  { speaker: '信', color: COLORS.letter, text: '小澈，如果有一天机器比我们更聪明，你觉得人还需要留下些什么？' },
  { speaker: '', color: COLORS.system, text: '（林澈握着信，抬头看向星空。）' },
  { speaker: '林澈', color: COLORS.linche, text: '城市里的天空，已经很久没有这么清晰了。' },
  { speaker: '林澈', color: COLORS.linche, text: '不知道为什么，这片星空……让我觉得有些熟悉。' },
  { speaker: '', color: COLORS.system, text: '（他没有说话。）' },
  { speaker: '', color: COLORS.system, text: '（远处传来虫鸣。星光落在庄园旧墙上。）' },
  { speaker: '', color: COLORS.system, text: '', options: ['我会留下的。这次我不走了。', '我想先弄清楚爷爷到底在这里经历了什么。', '我只是……还没想好怎么回那个城市。'] },
];

/** 观星夜三选项分支独白（选择后播放，随后汇聚到结局） */
export const DEMO_ENDING_BRANCHES: Record<'try_stay' | 'unknown' | 'tonight', DialogueLine[]> = {
  try_stay: [
    { speaker: '', color: COLORS.system, text: '（林澈把信收好。这一次，他不想再走了。）' },
    { speaker: '林澈', color: COLORS.linche, text: '这些年换了几个城市，没有哪个地方让我觉得……是应该留下的。' },
    { speaker: '夏雅', color: COLORS.xiya, text: '（轻轻笑了笑）那就别走了。' },
    { speaker: '', color: COLORS.system, text: '（她说话的语气，就像在说"今天天气不错"一样自然。）' },
  ],
  unknown: [
    { speaker: '', color: COLORS.system, text: '（林澈把信收好。爷爷在这里留下的东西，比一封信更多。）' },
    { speaker: '林澈', color: COLORS.linche, text: '他为什么来这里？他一个人在这里住了多久？' },
    { speaker: '林澈', color: COLORS.linche, text: '……我好像从来没问过他这些。' },
    { speaker: '', color: COLORS.system, text: '（夏雅没有说话，只是安静地站在一旁。）' },
  ],
  tonight: [
    { speaker: '', color: COLORS.system, text: '（林澈把信收好。城市还在那里，但今晚，他属于这里。）' },
    { speaker: '林澈', color: COLORS.linche, text: '……说实话，我连明天会怎样都不知道。' },
    { speaker: '夏雅', color: COLORS.xiya, text: '不需要知道。' },
    { speaker: '夏雅', color: COLORS.xiya, text: '你在这里，就足够了。' },
  ],
};

/** 观星夜收尾：选择后的汇聚结尾（次日清晨，自由模式） */
export const DEMO_ENDING_FINALE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（那一夜，他没有再说话。只有风穿过田野。）' },
  { speaker: '', color: COLORS.system, text: '第二天清晨，新的早晨开始了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '已经很久了，庄园没有这么热闹过。' },
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

/** v0.5.3 剧情密度 E5：按天取爷爷笔记一条（seed = day，无状态轮换） */
export function getGrandpaNote(day: number): DialogueLine {
  return GRANDPA_NOTES[day % GRANDPA_NOTES.length];
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
