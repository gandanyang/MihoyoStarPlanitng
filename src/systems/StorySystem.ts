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
  miner: '#b89878',
  gardener: '#a0d888',
  adventurer: '#88b8e8',
};

/** 操作提示文案：移动端（触屏）与桌面端（键盘）差异 */
function hint(pc: string, mob: string): string {
  return isMobileLayout() ? mob : pc;
}

// ============ 对话数据 ============

/** 车站开场（v0.7 程序员克制版） */
export const STATION_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（手机屏幕还亮着。HR 的话停在最后一句：）' },
  { speaker: '', color: COLORS.system, text: '「林先生，根据评估，你完全可以加入智能生态部门。」' },
  { speaker: '', color: COLORS.system, text: '（收起手机。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '五年了。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '……换个环境，也许也不错。' },
  { speaker: '', color: COLORS.system, text: '（抬头，远处晨雾里的老院子。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '爷爷说，如果不知道往哪走，就回来看看。' },
  { speaker: '林澈', color: COLORS.linche, text: '至少这次，是我自己选的离开。' },
  { speaker: '', color: COLORS.system, text: hint('使用 [W/A/S/D] 或方向键控制林澈移动。前往星黎庄园。', '使用屏幕左下方摇杆控制林澈移动。前往星黎庄园。') },
];

/** 初遇夏雅（v0.7 减少等待感） */
export const XIYA_DIALOGUE: DialogueLine[] = [
  { speaker: '夏雅', color: COLORS.xiya, text: '你就是林澈？' },
  { speaker: '林澈', color: COLORS.linche, text: '你认识我？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '林爷爷以前提过你。……大家都以为，不会有人回来了。' },
  { speaker: '林澈', color: COLORS.linche, text: '我也没想到自己会回来。本来只是想看看爷爷留下的地方。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '那就先从这扇门开始吧。' },
  { speaker: '', color: COLORS.system, text: '（夏雅递出钥匙。）' },
  { speaker: '', color: COLORS.system, text: hint('获得物品：【庄园钥匙】  按 [B] 键打开背包，使用钥匙打开大门。', '获得物品：【庄园钥匙】  点按右下角「背包」按钮，使用钥匙打开大门。') },
];

/** 开门后 → 整理庄园（v0.7 旧锄头+祖孙情感；E-07 现实动机+情感动机叠加） */
export const GATE_OPENED_DIALOGUE: DialogueLine[] = [
  { speaker: '林澈', color: COLORS.linche, text: '……比我以为的还要荒。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这里以前不是这样的。' },
  { speaker: '林澈', color: COLORS.linche, text: '爷爷一个人打理这么大的地方？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '嗯。他说，只要还有人愿意住下来，这里就不会荒废。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '旧了点，但还能用。你爷爷当年就是用这把锄头，把这片地一锄一锄开出来的。' },
  { speaker: '林澈', color: COLORS.linche, text: '他从来没跟我说过这些。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '有些事，要等你自己回来了，才会知道。' },
  { speaker: '', color: COLORS.system, text: '（夏雅拿出一把旧锄头。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '先开三块地。地要翻过，种子才肯住下。' },
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

/**
 * 岛屿的第一声回应（day2 清晨自动触发，制作人定稿 2026-08-07，Agent 不得扩写/改写）
 * 关键剧情节点：第一天睡觉后，玩家第一次"完整循环"的回报——岛屿开始回应玩家的努力。
 * 触发：day2 清晨首次进 farm（EventManager triggerOnce 判重，见 MapScene.tryFirstMorningSequence）。
 * day3+ 清晨仍走 XIYA_DAWN_DIALOGUE 闲聊（两条并存）。
 */
export const FIRST_MORNING_RESPONSE_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（清晨。阳光从老屋的窗户透进来，外面传来鸟叫和风吹树叶的声音。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '……天亮了。' },
  { speaker: '', color: COLORS.system, text: '（林澈走到门口。夏雅已经站在老屋门口，正看着农田。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '早上好，林澈。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '昨晚睡得还好吗？' },
  { speaker: '林澈', color: COLORS.linche, text: '还行……只是感觉这里安静得有点过头了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '以前不是这样的。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '爷爷还在的时候，这里每天早上都会有人起来种田、修路、聊天。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '后来大家慢慢离开了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '但是昨天，我看到田里的变化了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '虽然只种了一点东西……' },
  { speaker: '夏雅', color: COLORS.xiya, text: '可是归星岛，好像又重新呼吸了一次。' },
  { speaker: '', color: COLORS.system, text: '（新目标：让农场重新运转起来——收获成熟作物 / 种下新的作物 / 清理农场杂物）' },
  { speaker: '', color: COLORS.system, text: '（田里，昨天种下的萝卜苗，有一株已经悄悄长高了一点。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你看。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '植物比人更诚实。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '只要有人愿意照顾它，它就会回应。' },
];

/** v0.5.3 剧情密度 E5：爷爷的笔记（庄园角落可读物件，多条轮换、不解释） */
export const GRANDPA_NOTES: DialogueLine[] = [
  { speaker: '爷爷的笔记', color: COLORS.letter, text: '今年番茄长得很好，比去年早熟了几天。' },
  { speaker: '爷爷的笔记', color: COLORS.letter, text: '后山的竹子又长高了，看来春天比往年来得早。' },
  { speaker: '爷爷的笔记', color: COLORS.letter, text: '村口老周家的孩子回来了一趟，带了不少城里的东西。' },
  { speaker: '爷爷的笔记', color: COLORS.letter, text: '今晚的星星，比往年亮。' },
];

/** v0.5.3 剧情密度 E2：第一次收获反馈（v0.8 生活化） */
export const FIRST_HARVEST_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（夏雅不知什么时候走了过来，看着你手里的收获。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '第一次自己种出来？' },
  { speaker: '林澈', color: COLORS.linche, text: '嗯。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '感觉怎么样？' },
  { speaker: '林澈', color: COLORS.linche, text: '比想象中重。' },
];

/** v0.5.3 剧情密度 E9：夏雅傍晚简单关心（v0.8 删 KPI/周报） */
export const XIYA_EVENING_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（傍晚的庄园染上一层金色。夏雅坐在栅栏边，看着远处的海。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '累吗？' },
  { speaker: '林澈', color: COLORS.linche, text: '挺累的。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '以前你也是这样？' },
  { speaker: '林澈', color: COLORS.linche, text: '嗯。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '那以后记得早点休息。' },
];

/**
 * L3「点灯人」观察台词（灯意象，制作人拍板 2026-08-05：缺陷保持 v1.3，只加侧面表现）
 * 首次傍晚与夏雅对话时追加（MapScene 内存标记 lampFlashbackDone 控制，一次性，不入档）
 * 内容：林澈发现村里人都依赖夏雅，却没人问过她累不累——缺陷的侧面表现。
 */
export const XIYA_EVENING_OBS_DIALOGUE: DialogueLine[] = [
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '村里人有什么难处，第一个想到的都是夏雅。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '可好像，从没人问过她，累不累。' },
];

/** 清理完成 → 播种（v0.7 生活化引导） */
export const SOW_SEEDS_DIALOGUE: DialogueLine[] = [
  { speaker: '夏雅', color: COLORS.xiya, text: '地翻好了。把萝卜种子撒下去，浇水后就会发芽。' },
  { speaker: '', color: COLORS.system, text: '获得物品：【萝卜种子】×3' },
  { speaker: '', color: COLORS.system, text: hint('按 [R] 键切换到萝卜种子，然后对着锄过的土地按 [E] 播种。播种 3 块土地。', '对着锄过的土地点「交互」播种萝卜（默认种子）。播种 3 块土地。') },
];

/** 播种完成 → 浇水（v0.7 生活化引导；E-08 金币循环意义：卖钱→修庄园） */
export const WATER_CROPS_DIALOGUE: DialogueLine[] = [
  { speaker: '夏雅', color: COLORS.xiya, text: '种下去，就得天天来看它。你爷爷说，庄稼最怕被忘记。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '种下去了，接下来就等它长大。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '庄园还有不少地方需要修，等收成以后，可以拿去镇上的店换些钱。' },
  { speaker: '林澈', color: COLORS.linche, text: '卖掉？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '嗯。留下需要的，换成需要的东西，这里才能慢慢恢复起来。' },
  { speaker: '', color: COLORS.system, text: '获得物品：【旧水壶】' },
  { speaker: '', color: COLORS.system, text: hint('对已播种的土地按 [E] 键浇水。为所有作物浇水。', '对已播种的土地点「交互」浇水。为所有作物浇水。') },
];

/** 晚间结尾（v0.7 第一夜·睡前+旧笔记本） */
export const EVENING_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（夜晚，林澈坐在庄园门口，看着重新整理过的土地。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '以前总觉得，只要不断追赶时代，就不会被淘汰。' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '可是现在……也许慢下来，也不是坏事。' },
  { speaker: '', color: COLORS.system, text: '（回到屋里，翻到一本旧笔记本。）' },
  { speaker: '', color: COLORS.system, text: '（笔记本里夹着一张纸条：「今年番茄长得很好。植物似乎会记住照顾它的人。」）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '……爷爷连种地都要记笔记。' },
  { speaker: '', color: COLORS.system, text: '回到床上睡觉，结束第一天。' },
];

// ============ 第一章：小镇的居民 ============

/** 首次进入小镇 */
export const TOWN_INTRO_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（清晨，林澈穿过庄园外的石桥，第一次踏上青禾镇的街道。）' },
  { speaker: '林澈', color: COLORS.linche, inner: true, text: '这就是青禾镇……爷爷信里提起过的地方。' },
  { speaker: '', color: COLORS.system, text: '（街道两旁是低矮的木屋，商店门口已经支起了摊子。一个老人正在清扫门前的台阶。）' },
  { speaker: '', color: COLORS.system, text: '（镇长早就听说庄园来了一位新主人。他放下扫帚，朝林澈招了招手。）' },
  { speaker: '', color: COLORS.system, text: hint('（靠近镇长、商人或居民，按 [E] 键与他们对话。镇长看起来有话想说。）', '（靠近镇长、商人或居民，点「交互」与他们对话。镇长看起来有话想说。）') },
];

/** 村长委托星之碎片任务（第一章主线开启，v0.8 拆信息+老人化） */
export const ELDER_QUEST_DIALOGUE: DialogueLine[] = [
  { speaker: '村长', color: COLORS.elder, text: '你就是小林吧？林爷爷家的孙子。' },
  { speaker: '林澈', color: COLORS.linche, text: '您好，您是……' },
  { speaker: '村长', color: COLORS.elder, text: '我是青禾镇的镇长。你爷爷啊，年轻时候就喜欢晚上坐在那块石头上看天。' },
  { speaker: '林澈', color: COLORS.linche, text: '……他真的喜欢看星星？' },
  { speaker: '村长', color: COLORS.elder, text: '喜欢。他以前也经常往后山跑。' },
  { speaker: '林澈', color: COLORS.linche, text: '去做什么？' },
  { speaker: '村长', color: COLORS.elder, text: '（笑了笑）他说那里有些东西，值得看看。' },
  { speaker: '', color: COLORS.system, text: '（村长看向远处的后山，没有再说下去。）' },
  { speaker: '林澈', color: COLORS.linche, text: '……那我去看看吧。' },
  { speaker: '', color: COLORS.system, text: '主线任务已接受：去爷爷以前常去的后山看看。' },
];

/** f7（2026-08-07 制作人拍板）：第一天村长「暂时有事」——主线委托推迟到第二天，顺带赠送启动物资 */
export const ELDER_BUSY_DIALOGUE: DialogueLine[] = [
  { speaker: '村长', color: COLORS.elder, text: '你就是小林吧？林爷爷家的孙子。' },
  { speaker: '林澈', color: COLORS.linche, text: '您好，您是……' },
  { speaker: '村长', color: COLORS.elder, text: '我是青禾镇的镇长。本想跟你好好聊聊你爷爷的事——' },
  { speaker: '', color: COLORS.system, text: '（村长叹了口气，指了指身后正在修缮的公告栏。）' },
  { speaker: '村长', color: COLORS.elder, text: '镇上这几天忙着修缮，我实在抽不开身。明天吧，明天你来镇长家找我，咱们详谈。' },
  { speaker: '村长', color: COLORS.elder, text: '这些是给你准备的启动物资：种子、工具，还有一点金币、木材和石头。你先在农场安顿下来。' },
  { speaker: '', color: COLORS.system, text: hint('（获得村长赠送的启动物资。镇长说：明天再来详谈。）', '（获得村长赠送的启动物资。镇长说：明天再来详谈。）') },
];

/** f7：第一天再次对话（礼物已给）——村长简短提醒，不重复长篇 */
export const ELDER_BUSY_SHORT_DIALOGUE: DialogueLine[] = [
  { speaker: '村长', color: COLORS.elder, text: '这几天镇上忙着修缮。你先在农场安顿，明天来镇长家找我详谈你爷爷的事。' },
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
  { speaker: '村长', color: COLORS.elder, text: '你爷爷以前啊，总喜欢在晚上去农田后面的地方坐一会儿。他说，那里的星星很亮。' },
  { speaker: '', color: COLORS.system, text: '夜晚，也许可以去看看爷爷曾经看过的天空。' },
  { speaker: '', color: COLORS.system, text: '主线任务完成：星之碎片（1/…）。' },
];

// ============ Demo 结尾：观星 ============

// ============ 第一章：森林碎片（程序员能力展示） ============

/** 森林采集对话（首次交互播放，结束后自动采集） */
export const FOREST_SHARD_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（后山深处，一块泛着幽蓝光芒的碎片静静躺在树根旁。）' },
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

/** 挖矿引导（第一次进入矿洞触发；v0.8 减解释+爷爷线） */
export const MINE_TIP_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（矿洞深处，岩壁上隐约有光芒闪烁。）' },
  { speaker: '林澈', color: COLORS.linche, text: '那些发光的矿石……' },
  { speaker: '夏雅', color: COLORS.xiya, text: '老张年轻时候就在矿洞里讨生活，说那些石头、铜矿都能卖钱。' },
  { speaker: '林澈', color: COLORS.linche, text: '（点点头）那我挖一点回去试试。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '别逞强，你爷爷以前也是，忙起来连饭都忘了吃。' },
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
  { speaker: '夏雅', color: COLORS.xiya, text: '他说，院子有人照顾，就不会冷清。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '奇怪……爷爷以前说，这里的花总是比别的地方开得早。' },
  // L1 旧灯对话（灯意象，制作人拍板 2026-08-05：灯=工具包修出的旧物；追加于花园见证一次性对话）
  { speaker: '林澈', color: COLORS.linche, text: '你总背着这个旧工具包。……里面那盏灯，还用着？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '嗯。因为它还能亮。' },
  { speaker: '林澈', color: COLORS.linche, text: '坏了换一个不是更方便？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '可是它陪了我很多年。' },
];

/** FEATURE-037 统一对白批次 environment_restore_v010：老屋修复完成 → 村长（制作人 2026-08-06 定稿）
 *  范围限定：A/B 类生活对白；花园恢复沿用既有 GARDEN_RESTORED_XIYA_DIALOGUE（制作人拍板，不新增小梅） */
export const OLD_HOUSE_RESTORED_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（老屋修好的第二天，村长路过，在门口站了一会儿。）' },
  { speaker: '村长', color: COLORS.elder, text: '你爷爷以前每天都会擦这里。' },
  { speaker: '林澈', color: COLORS.linche, text: '……擦门吗？' },
  { speaker: '村长', color: COLORS.elder, text: '擦整座屋子。他说，人走了不要紧，屋子不能没人擦。' },
];

/** FEATURE-037 统一对白批次 environment_restore_v010：后山道路修复完成 → 老张（制作人 2026-08-06 定稿） */
export const FOREST_ROAD_RESTORED_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（矿场的老张扛着镐子路过，踩着新铺的石板路，愣了一下。）' },
  { speaker: '老张', color: COLORS.miner, text: '以前这条路通向整个岛。' },
  { speaker: '林澈', color: COLORS.linche, text: '现在也能了。' },
  { speaker: '老张', color: COLORS.miner, text: '（咧嘴一笑）好小子。' },
];

/** FEATURE-041 复兴循环 v0.11：木匠回归演出对白（老屋修复完成后，次日进入 farm 自动触发）
 *  方向稿，待制作人定稿（剧情权限：Agent 不自行扩写）。
 *  角色定位：青禾镇留下来的手艺人，不善言辞但可靠；重建行动的第一个具体执行者。 */
export const CARPENTER_RETURN_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（老屋修好的第二天清晨，一个背着工具箱的人站在门口，正打量新补好的屋瓦。）' },
  { speaker: '林澈', color: COLORS.linche, text: '……你是？' },
  { speaker: '木匠老周', color: '#c89860', text: '（没有回头，只抬手敲了敲窗框）……青禾镇的。我叫老周。' },
  { speaker: '木匠老周', color: '#c89860', text: '听说岛上又有人修房子了。' },
  { speaker: '林澈', color: COLORS.linche, text: '嗯。这屋子是我爷爷留下的。' },
  { speaker: '木匠老周', color: '#c89860', text: '……你爷爷的房子，是他自己一砖一瓦搭起来的。' },
  { speaker: '木匠老周', color: '#c89860', text: '（背起工具箱，往农场里走了两步）门轴、窗栓、田边的栅栏……有不顺手的地方，喊我。' },
  { speaker: '林澈', color: COLORS.linche, text: '你是说，你要留下？' },
  { speaker: '木匠老周', color: '#c89860', text: '（回头看了一眼，语气很平）有人开始修，就有人愿意留下。' },
  { speaker: '', color: COLORS.system, text: '（归星岛，多了一个会修东西的人。）' },
];

// ============ T2 改动 2：关键对白（制作人 2026-08-06 定稿） ============
/** 村长「为什么种田」：星之碎片交付完成后追加（T2 改动 2，制作人定稿台词） */
export const ELDER_WHY_FARM_DIALOGUE: DialogueLine[] = [
  { speaker: '村长', color: COLORS.elder, text: '现在买东西方便了，想吃什么，去店里就能买到。' },
  { speaker: '村长', color: COLORS.elder, text: '可有时候，人容易忘了一件事。' },
  { speaker: '村长', color: COLORS.elder, text: '这些东西啊，也不是一开始就在货架上的。' },
  { speaker: '村长', color: COLORS.elder, text: '一粒种子，要有人种下去，有人照看它，才能变成餐桌上的东西。' },
  { speaker: '村长', color: COLORS.elder, text: '现在什么都能买到，菜市场有菜，商店有粮。' },
  { speaker: '村长', color: COLORS.elder, text: '可自己种出来的东西，吃的时候心里踏实。' },
  { speaker: '村长', color: COLORS.elder, text: '你知道它什么时候种下去，什么时候长出来，也知道这一口是怎么来的。' },
];

/** 夏雅「为什么小事会改变这里」：花园恢复见证对白（GARDEN_RESTORED_XIYA_DIALOGUE）后追加
 *  制作人 2026-08-06 定稿第一版（价值观但不演讲；不否定大事，只肯定小事价值；与玩家行为直接对应） */
export const XIYA_SMALL_THINGS_DIALOGUE: DialogueLine[] = [
  { speaker: '夏雅', color: COLORS.xiya, text: '你有没有发现，最近青禾镇好像比以前热闹了一点？' },
  { speaker: '夏雅', color: COLORS.xiya, text: '其实也没发生什么特别大的事情。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '就是有人把院子收拾了一下，有人种了些花，田里的菜也慢慢长起来了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '以前我总觉得，要让这里变回来，得做一件很厉害的事情。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '后来才发现，好像不是这样。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这些小事情多起来了，这里也就慢慢有了人生活的感觉。' },
];

// ============ T3 NPC 生活事件（制作人 2026-08-07 定稿微调） ============
// 三条：夏雅「整理旧照片」（过去有人生活过）/ 老张「矿灯」（曾经有人努力过）/ 小梅「小梅花」（未来还会继续生长）。
// 夏雅：老屋修复完成后，老屋门口互动 → 无实物交付 → 相簿新照片 + 记忆卡。
// 老张：矿洞独立点灯点，交付铜矿×2 → 点亮矿灯；无记忆卡（避免记忆卡变成任务奖励，制作人拍板）。
// 小梅：小镇花圃互动 → 种下梅花 → 花圃长出梅花（环境变化）；无实物交付。

/** T3 夏雅「整理旧照片」：老屋修复后，老屋门口入口对白 */
export const XIYA_PHOTO_ENTRY_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（老屋修好后，夏雅站在门口，怀里抱着一个落灰的木盒。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '这些照片，是爷爷以前留下的。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '我整理东西的时候才发现，已经落灰这么久了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '要是不嫌弃……陪我一起整理整理？' },
  { speaker: '林澈', color: COLORS.linche, text: '（点头）好。' },
];

/** T3 夏雅「整理旧照片」：整理完成对白（解锁相簿 + 记忆卡） */
export const XIYA_PHOTO_DONE_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（两个人把照片一张张擦干净、摆开。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你看这张，是你爷爷年轻的时候，站在这片田里。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '原来以前的青禾镇，是这个样子的啊……' },
  { speaker: '夏雅', color: COLORS.xiya, text: '感觉离我们好近。' },
  { speaker: '林澈', color: COLORS.linche, text: '（看了看手里的照片，没说话）' },
];

/** T3 老张「矿灯」：矿洞入口对白（交付铜矿×2） */
export const MINER_LAMP_ENTRY_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（矿洞深处的墙上，挂着一盏锈迹斑斑的旧矿灯。）' },
  { speaker: '矿工老张', color: COLORS.miner, text: '这盏灯，我年轻时点过。' },
  { speaker: '矿工老张', color: COLORS.miner, text: '灯芯还能用，就差两块铜矿修一修灯座。' },
];

/** T3 老张「矿灯」：铜矿不足提示（可重复触发） */
export const MINER_LAMP_NEED_DIALOGUE: DialogueLine[] = [
  { speaker: '矿工老张', color: COLORS.miner, text: '灯座还缺两块铜矿。你挖矿的时候帮我留意着点。' },
];

/** T3 老张「矿灯」：铜矿×2 交付，点亮矿灯 */
export const MINER_LAMP_DONE_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（你递过铜矿。老张拾掇一阵，"啪"的一声，灯亮了起来。）' },
  { speaker: '矿工老张', color: COLORS.miner, text: '这灯还能亮，就说明这地方还没废。' },
  { speaker: '矿工老张', color: COLORS.miner, text: '以前我们就是靠它干活的。' },
  { speaker: '矿工老张', color: COLORS.miner, text: '（拍拍你的肩）谢了，小子。' },
];

/** T3 小梅「小梅花」：小镇花圃入口对白 */
export const GARDENER_PLUM_ENTRY_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（小镇花圃边，小梅正对着一小块空地发愁。）' },
  { speaker: '花匠小梅', color: COLORS.gardener, text: '花圃东边那块地，我留了好久。' },
  { speaker: '花匠小梅', color: COLORS.gardener, text: '一直没想好种什么……你能帮我种一株梅花吗？' },
  { speaker: '林澈', color: COLORS.linche, text: '种梅花？' },
  { speaker: '花匠小梅', color: COLORS.gardener, text: '嗯。等它开花的时候，冬天也不会那么冷清了。' },
];

/** T3 小梅「小梅花」：种下完成对白（花圃长出梅花，环境变化） */
export const GARDENER_PLUM_DONE_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（花种入土。小梅小心地覆上土，又浇了一点水。）' },
  { speaker: '花匠小梅', color: COLORS.gardener, text: '你看，只要有人照顾，它还是会开花的。' },
  { speaker: '花匠小梅', color: COLORS.gardener, text: '到时候你来看，它会长得很好的。' },
];

// ============ 支线试点（2026-08-06 制作人拍板方案 A） ============
// 夏雅「院子有人照顾」：花园恢复后，旧藤架修复事件（交付木材×3 → 记忆卡收尾）
/** 支线入口：夏雅请林澈一起修旧藤架 */
export const XIYA_GARDEN_TRELLIS_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（花田边的旧藤架，风一吹就吱呀作响。夏雅正蹲在一旁看着。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '你来得正好。这架藤蔓，爷爷走后就没人管了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '要是能修一修，明年花开的时候，还能靠着它看一会儿。' },
  { speaker: '林澈', color: COLORS.linche, text: '（检查了一下）需要几根木材。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '我去找工具。……等你凑齐了木材，我们再一起把它立起来。' },
];

/** 支线交付：木材不足提示（可重复触发） */
export const XIYA_GARDEN_TRELLIS_NEED_DIALOGUE: DialogueLine[] = [
  { speaker: '夏雅', color: COLORS.xiya, text: '藤架还差几根木材。你要是有空，从庄园里砍几根来？' },
];

/** 支线交付：木材×3 交付完成 */
export const XIYA_GARDEN_TRELLIS_DONE_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（你递过木材。两个人一起把旧藤架重新立了起来。）' },
  { speaker: '夏雅', color: COLORS.xiya, text: '好了……以后每年花开，都有地方靠了。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '他说，院子有人照顾，就不会冷清。' },
];

// 村长「看星星的地方」：观星夜完成后，村长委托 → 夜晚去农田边空地 → 记忆卡收尾
/** 支线入口：村长委托（挂在观星夜完成后的村长后续对话） */
export const ELDER_TEA_QUEST_DIALOGUE: DialogueLine[] = [
  { speaker: '村长', color: COLORS.elder, text: '对了——你爷爷以前啊，忙完一天的活，总喜欢去农田边坐一会儿。' },
  { speaker: '村长', color: COLORS.elder, text: '他说，那里安静，能看见很远的星星。' },
  { speaker: '村长', color: COLORS.elder, text: '你要是晚上有空，带壶茶去那儿坐坐，就当替他看看。' },
  { speaker: '林澈', color: COLORS.linche, text: '……好。' },
];

/** 支线触发：夜晚在农田边空地 */
export const ELDER_STAR_SITE_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（夜晚。农田边的空地安静极了，远处传来虫鸣。）' },
  { speaker: '', color: COLORS.system, text: '（你坐下，把茶壶放在脚边，抬头看向星星。）' },
  { speaker: '林澈', color: COLORS.linche, text: '……爷爷以前，就坐在这里吗？' },
  { speaker: '', color: COLORS.system, text: '（风穿过田野。星光落在空地上。）' },
];

/** FEATURE-036 旧农业机器人修复对白（花园恢复后，花园旁发现旧设备 → 修复）
 *  制作人方向（2026-08-03）：路线 A「爷爷留下的旧农业机器人 + 修复」。
 *  范围限定：A/B 类生活事件，不扩世界观真相、不主动提及爷爷具体回忆（任务卡红线），
 *  无新剧情节点/任务/StoryStep/存档字段。 */
export const OLD_ROBOT_DIALOGUE: DialogueLine[] = [
  { speaker: '', color: COLORS.system, text: '（花园旁的土里，半埋着一台旧机器。外壳锈迹斑斑，结构却还算完整。）' },
  { speaker: '林澈', color: COLORS.linche, text: '这是……农业机器人？很旧的样子。' },
  { speaker: '林澈', color: COLORS.linche, text: '修一修，说不定还能用。' },
  { speaker: '', color: COLORS.system, text: '（你清理了锈蚀和灰尘，重新接上电源。）' },
  { speaker: '', color: COLORS.system, text: '（指示灯亮了起来。老机器轻轻嗡鸣，重新运转。）' },
  { speaker: '林澈', color: COLORS.linche, text: '……它能帮我看顾农田。' },
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
  { speaker: '信', color: COLORS.letter, text: '小澈，你小时候总问我，为什么每天都要给花浇水。' },
  { speaker: '信', color: COLORS.letter, text: '爷爷想了很久。后来发现，人做很多事情，不一定都是为了结果。' },
  { speaker: '信', color: COLORS.letter, text: '如果有一天机器比我们更聪明，你觉得人还需要留下些什么？' },
  { speaker: '', color: COLORS.system, text: '（林澈握着信，抬头看向星空。）' },
  { speaker: '林澈', color: COLORS.linche, text: '城市里，很久没见过这样的星星了。' },
  { speaker: '', color: COLORS.system, text: '（他没有说话。）' },
  { speaker: '', color: COLORS.system, text: '（远处传来虫鸣。星光落在庄园旧墙上。）' },
  { speaker: '', color: COLORS.system, text: '', options: ['至少现在，我想留下来看看。', '我想先弄清楚爷爷到底在这里经历了什么。', '我只是……还没想好怎么回那个城市。'] },
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
  { speaker: '夏雅', color: COLORS.xiya, text: '已经很久了，这片地没有这么热闹过。' },
  { speaker: '夏雅', color: COLORS.xiya, text: '青禾镇，欢迎你。' },
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
