# 任务卡：岛屿的第一声回应（day2 清晨剧情）

> 状态：✅ 已完成（Trae 2026-08-07）
> 立项：制作人 2026-08-07（完整剧情文案见 §一，**制作人定稿，Agent 不得自行扩写/改写**）
> 拍板范围（AskUserQuestion）：
> 1. **标准版**：睡醒演出（窗外阳光/鸟叫/风）+ 夏雅门口对白 + 新目标；**不做手机消息**（第一章收尾已有 EndingPanel 归星记录）
> 2. **day2 专用对白**：day2 清晨自动触发新对白；day3+ 保留现有 XIYA_DAWN_DIALOGUE 闲聊
> 3. **复用引导任务**：「让农场重新运转起来」用现有每日引导任务机制（收获/种植/清理有交付判定）

---

## 一、剧情文案（制作人定稿 2026-08-07）

> 核心：第一天睡觉之后不是简单"进入第二天"，而是玩家第一次完成完整循环（来到岛屿→学会种田→努力→睡觉→第二天发现"这里真的开始变化了"）。
> 承担三个功能：① 强化留下来的理由 ② 给第二天目标 ③ 让夏雅/岛屿与玩家建立联系。
> 时长 ≤2 分钟。结构：睡醒 → 环境变化展示(10s) → 夏雅对话(1min) → 新目标(30s)。

**场景**：主角睡醒。镜头：老屋窗户透进阳光。外面：鸟叫、风吹树叶（海浪声为候选，当前 ambience 无海声，暂用鸟叫/风）。林澈走到门口。夏雅出现（站在老屋门口，看着农田）。

```
夏雅：「早上好，林澈。」「昨晚睡得还好吗？」
林澈：「还行……只是感觉这里安静得有点过头了。」
夏雅：「以前不是这样的。」「爷爷还在的时候，这里每天早上都会有人起来种田、修路、聊天。」「后来大家慢慢离开了。」
夏雅：「但是昨天，我看到田里的变化了。」「虽然只种了一点东西……」 「可是归星岛，好像又重新呼吸了一次。」
（新目标：「让农场重新运转起来」→ 收获成熟作物 / 种下新的作物 / 清理农场杂物）
夏雅：「你看。」「植物比人更诚实。」「只要有人愿意照顾它，它就会回应。」
```

**埋点（本卡不实现，仅记录方向）**：星之碎片 / 岛屿系统 / 复兴等级——「岛屿会记住帮助它的人」与爷爷人设（"用土法让机器记住土地"）严丝合缝，后续手机消息【归星记录】可扩展。

**剧情权限核对**（顶层设计 > 剧情规划 > 实现需求，全部通过）：
- 夏雅人物圣经 v1.3：台词符合（陪伴者非导师；"大家慢慢离开了"= 她的内层孤独"害怕岛越来越冷清"）
- 爷爷人物圣经 v1.2："用土法让机器记住土地"支持"岛屿会记住"意象
- 星之碎片叙事方向 v0.1："岛屿生命/苏醒"是跨章节主线悬念，埋点一致
- 归星岛复兴循环 v0.10（制作人拍板）："你的行为改变了这个世界"是核心循环，此剧情为其第一次正面回答
- 台词风格禁令核对：夏雅台词无"星辰之力/岛屿历史记载"等禁语 ✅

## 二、实现方案

### 触发链（MapScene.ts）
1. `trySleep()` 睡觉 → `timeNextDay()` 到次日 06:00（day2 清晨）
2. day2+ 清晨首次进入 farm 场景（或睡醒后仍留在 farm）→ `tryFirstMorningSequence()`：
   - 条件：`mapKey==='farm'` + `day>=2` + 教程完成 + `triggerOnce('first_morning_response')` 未触发
   - 顺序：① 睡醒演出（`showMemoryMoment` 旁白 + ambience 鸟叫/风自动已播）② 夏雅自动出现在老屋门口看农田（`dawnXiya` 框架扩展或独立精灵）③ 自动播放 `FIRST_MORNING_RESPONSE_DIALOGUE` ④ 对白结束后 `injectRevivalQuests()` + HUD 目标文案「让农场重新运转起来」+ 存档
   - 判重：`EventManager.triggerOnce`（随存档持久化，刷新/重进不重复）
3. 与现有 dawnXiya 关系：day2 清晨先播本卡对白（自动）；day2 之后 06-08 时 dawnXiya 闲聊照常（主动靠近触发）。两者判重隔离。

### 对白（StorySystem.ts 新增 `FIRST_MORNING_RESPONSE_DIALOGUE`）
按制作人文案切分为 DialogueLine（speaker 标记：夏雅 / 林澈 / 旁白），色板沿用 COLORS（xiya / linche / system）。**文案逐句保留制作人定稿，不增删。**

### 新目标（DailyQuestSystem.ts 新增 `injectRevivalQuests`）
复用现有 QUEST_POOL 任务组合注入（面板保持 ≤4）：
- 收获：`harvest_any_5`（大丰收）
- 种植：`plant_2`（播种希望）
- 清理：`woodcut_2`（伐木初体验——农场"清理杂物"用砍树映射，池内无 clean 类型）
注入时机：day2 清晨对白结束后调用；已存在不重复。

### 睡醒演出（标准版）
- 视觉：窗外阳光光斑（复用 farm ambience 暖光斑模式）或不做；旁白文本经 `showMemoryMoment`（睡前内心独白同款 UI）
- 音效：farm 白天 ambience 已含 birds + wind（自动播放，醒来即闻鸟叫/风）；海声候选不实现
- 时长：演出 10s + 对白 ~1min，总 ≤2min ✓

## 三、影响范围
- 新增：`StorySystem.ts` 对白常量；`DailyQuestSystem.ts` injectRevivalQuests；`MapScene.ts` tryFirstMorningSequence + 接线；任务卡本文件
- 不修改：存档结构（triggerOnce 用现有一致性事件字段）、farm.json/tileset、碰撞/出口/NPC 站位、教程流程
- 配音：本卡不含（语音映射需独立批次 + 试听流程）

## 四、验收
1. day2 清晨首次进 farm：自动播夏雅对白（无需靠近），文案与定稿一致
2. 对白结束：任务面板出现「让农场重新运转起来」组合任务（收获/种植/砍树）
3. 一次性：刷新/重进/同天多次不重复触发；day3+ 清晨 dawnXiya 闲聊照常
4. day1（未睡觉）不触发；非 farm 场景不触发
5. probe-day2-morning 全绿 + tsc 0 错 + 相关回归

## 五、待后续（本卡不做）
- 手机消息【归星记录】轻量版（"复兴指数+1"）——与 EndingPanel 完整版的关系待拍板
- 海浪声 ambience 增强（farm 海边）
- 新对白配音 + 语音映射
- 「清理农场杂物」专用 clean 任务类型（当前用砍树映射）

## 六、验证记录（2026-08-07）
- `probe-day2-morning.mjs`：**18/18 通过**（自动触发 / 定稿文案 A5-A7 / 任务注入 B1-B3 / 一次性 C1-C2 / day1 不触发 D1-D2 / day3 dawnXiya 回归 E1-E2 / 无错误 F1）
- `tsc --noEmit`：0 错
- 回归：probe-farm-restore 26/26 ✅、probe-sleep-realpath ✅、probe-daily-event 6/6 ✅、probe-guide-dialogue ✅
- 探针实现细节：定稿句校验读 `storyDialogue.lines`（打字机 DOM 检测不可靠）；任务断言读 `save.world.dailyQuest.quests`
- 修改文件：`src/systems/StorySystem.ts`（新增 FIRST_MORNING_RESPONSE_DIALOGUE）/ `src/systems/DailyQuestSystem.ts`（新增 injectRevivalQuests）/ `src/scenes/MapScene.ts`（新增 tryFirstMorningSequence + 双挂钩点）/ `tests/probes/probe-day2-morning.mjs` / 本任务卡
- **不影响存档结构**（triggerOnce 复用现有一致性事件字段），**不影响 farm.json/tileset/碰撞/教程流程**
