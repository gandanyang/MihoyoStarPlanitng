# 更新日志

本项目所有显著改动均记录于此文件。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [未发布]

### v0.5.2 移动端点击种田（触控重构，`55e93b8`）
- **背景**：种田在移动端操作不顺畅——需要摇杆靠近 + 点「使用工具」对准面前格，精准度要求高
- **点击种田**（`MapScene.ts`）：触屏设备在农场点击可操作农田格 → 直接执行对应操作（锄地/播种/浇水/收获）
  - 新增 `handleFarmTap()`：`pointerdown` → `cameras.main.getWorldPoint()` 换算世界坐标 → 计算格坐标 → 复用操作逻辑
  - `tryFarmInteract()` 拆出 `tryFarmInteractAt(col, row)`，面前格交互与点击格交互共用同一套判定/操作（含 `isTileActionable` 判定一致）
  - 面板/对话打开时忽略点击；非触屏设备完全忽略（桌面保留 WASD+E）
- **点击反馈**：操作后目标格短暂高亮（`tapFlashKey`，500ms），反馈"刚才操作了哪一格"
- **交互按钮防抖**（`TouchControls.ts`）：`ACTION_DEBOUNCE_MS` 500 → 150ms——原 500ms 会拖累连锄/连种手感；150ms 仍防 touchstart→mousedown 双击
- **验证**：新增 `probe-farm-tap.mjs`（移动端点击种田 E2E：点击农田格 → 锄地成功）；tsc / test-tutorial（13）/ probe-mobile-tutorial（10）/ test-ch1-story（24）全绿
- **同批含 v0.5.3 剧情密度实现代码**（NPC 每日随机一句 + 清晨夏雅偶遇 E1，随文件一起提交防覆盖）

### v0.5.2 制作人接管 + 移动端真机测试推进 + 移动端操作文案适配（BUG-011）
- **制作人接管**（顶层设计.md v0.5，`8ccc34d`）：Codex → opencode 接任顶层设计/决策/评审角色；执行原则「先稳定再打磨」
- **竖屏方案拍板**（`f3b0723`）：BUG-007 采用方案 A（竖屏横屏提示），但**实现延后**——优先移动端真机测试，拿到实测数据后再排期
- **真机测试环境就绪**：dev server `http://192.168.31.195:5173/`（局域网可访问）；新增临时调试入口 `?reset=1` 启动强制清档（`fb1419f`，仅前端 localStorage 操作，测试后移除）
- **BUG-011 移动端操作文案适配**（`35cbac4`）：4 文件（`StorySystem`/`NPCSystem`/`DailyQuestSystem`/`TitleScene`）硬编码 PC 按键提示改为 `isMobileLayout()` 双文案——移动端显示「摇杆」/「点「交互」」/「点按「背包」按钮」，替代 [E]/[B]/[R]/[WASD] 键提示
- **新增探针**：`probe-mobile-text.mjs`（移动端文案 6 项断言）
- **验证**：tsc / build / probe-mobile-text（6/6）/ test-tutorial（13）/ test-ch1-story（24）/ test-stress-switch（25）全绿
- **待办**：真机 S1-S11 测试完成后移除 `?reset=1` 入口；BUG-001/002/003/008 真机复测；竖屏方案 A 排期实现

### v0.5.2 交互加固：教程期无斧头砍树不吞交互（BUG-010）
- **根因**：`MapScene.tryChopTree()` 在玩家无斧头（`getItemCount('old_axe') <= 0`）时显示"需要斧头才能砍树！"并 `return true` 吞掉该次交互——教程期玩家若恰好站在树旁按交互，本意是锄地/播种/浇水却被砍树分支拦截
- **修复**（`MapScene.ts`）：无斧头时改为 `return false`，不弹提示、不吞交互，操作落到农田交互（或自然无响应）
- **说明**：斧头仅在教程完成时赠送且不消耗，"无斧头"仅发生在教程期；该分支属防御性加固（BUG-006 修复后触发概率≈0）
- **验证**：tsc / build / test-tutorial（13）/ test-woodcutting（19）/ probe-mobile-tutorial 全绿；临时探针确认无斧头树旁按 E 不弹提示、不砍树（树血不变），随后锄地 3 次推进到 sow_seeds

### v0.5.2 睡觉交互加固 + 移动端教程全流程验证 + 问题追踪
- **睡觉判定放宽**（`MapScene.ts`）：站在床格相邻 1 格内即可触发睡觉（无需精确面向，适配触屏精度）
- **教程提前睡觉保护**：教程中未到 `evening_talk` 时在床前按交互**不跨天**并提示——修复"浇水前睡觉 → 次日作物已熟/无种子 → 教程永久卡死"（P0）
- **验证**：新增 `probe-mobile-tutorial.mjs`（移动端真实教程全流程，触屏交互键驱动，10/10）+ `probe-mobile-sleep.mjs`；tsc / tutorial / ch1-story 通过
- **文档**：新增《问题追踪.md》（9 项问题 + 观察项 + 复测指引）

### v0.5.2 任务系统分类：引导任务教程期不投放（"按E无法推进任务"根因修复）
- **根因**：引导任务（`mine_1` 挖矿 / `woodcut_2` 砍树）混入每日任务池，在教程未完成（storyStep ≠ done）时就已投放——此时玩家没有斧头（睡觉完成才赠送）、未解锁矿洞，按 E 被"需要斧头才能砍树！"拦截 → 任务永远无法推进
- **修复**（`DailyQuestSystem.ts` / `MapScene.ts`）：
  - 首次初始化每日任务时用 `isTutorialDone()` 判断：教程未完成 → 不投放引导任务（面板只出普通随机任务）；教程完成 → 固定投放引导任务
  - 新增 `injectGuideQuests()`：`tryTutorialSleep` 睡觉完成（→ storyStep=done、赠送旧斧头）后调用，将挖矿/砍树引导任务注入面板前位；已存在的（含已领奖）不重复添加，面板总数保持 4（超限裁尾部随机任务）
  - 未领奖引导任务跨天保留（过夜不丢失奖励），领奖后消失
- **验证**：tsc / build / test-tutorial（13）/ test-ch1-story（24）/ test-woodcutting（19）全绿

### v0.5.2 移动端 UX 修复（第二轮反馈：横屏背包按钮消失）
- **根因**：背包按钮可见性用 `isMobileLayout()`（`window.innerWidth < 800`）判断，手机横屏宽度 ≥800（如 844pt）时被误判为桌面 → 按钮隐藏
- **修复**（`TouchControls.ts`）：改为**触屏能力判断**（`navigator.maxTouchPoints > 0 || 'ontouchstart' in window`）——竖屏/横屏/平板都显示背包按钮，无触屏桌面保持隐藏
- **验证**：`probe-mobile-ux.mjs` 新增横屏（844×390）用例，9/9 全绿；tsc / build / tutorial / ch1-story 通过

### v0.5.2 代码审阅 + 美术任务核对 + 移动端表现分析（opencode 审阅会话）
- **P0 美术任务核对**（`任务-美术P0风格统一重绘.md`）：6 张 v2 像素风贴图（tree1/tree2/stump/old_axe/wood/npc_xiya）经像素级程序分析确认全部达标并已随 `8cd9df2` 接线，任务卡状态更新为 ✅ 已完成（DoD 7 项勾选 + §9 验收记录表）；物品图标已通过 `Inventory.itemIconHtml()` 接入背包/商店
- **代码审阅**：移动端 UX 改动（`TouchControls.ts` 背包按钮 / `StationScene.ts` 跳过按钮隐藏 / `MapScene.ts` 睡觉判定+提示文案 / `vite.config.ts` host）——tsc 通过、图层数据核对一致、探针全绿、回归无破坏
- **移动端表现分析**：实测竖屏（375×812）画布仅显示 375×281（FIT 缩放）、上下黑边占 65%，且 DOM UI（对话框/HUD）与画布坐标错位（对话框 y=672 vs 画布 y=265-546 不重叠）——已登记为 `任务-移动端竖屏适配.md`（P1，推荐方案 A：竖屏横屏提示）
- **回归验证**：test-tutorial / test-ch1-story（24）/ test-stress-switch（25）/ probe-mobile-ux（8）/ probe-sleep-realpath（4）全绿；`npx tsc --noEmit` 通过
- **文档**：新增 `任务-移动端竖屏适配.md`；`任务-美术P0风格统一重绘.md` 状态已更新并提交（`2e81199`）

### v0.5.2 移动端 UX 修复（人工测试反馈）
- **P0：移动端缺少背包按钮**（`TouchControls.ts` / `MapScene.ts`）：新增「背包」按钮（右下角，仅移动端显示，桌面仍用 B 键），点击打开背包面板（对话/面板打开期间不响应）；教程提示文案按移动端适配（「点按「交互」/「背包」按钮」替代 [E]/[B]）
- **P2：车站跳过开场按钮在剧情对话结束后未隐藏**（`StationScene.ts`）：对话播放完自动移除 `intro-skip-btn`
- **移动端可访问**（`vite.config.ts`）：`server.host: true`，局域网手机可访问 `http://<电脑IP>:5173`（此前仅监听 127.0.0.1）
- **新增**：《移动端人工测试方案.md》（S1-S11 流程 + 触屏/布局/存档观察点）；`probe-mobile-ux.mjs`（背包按钮/跳过按钮/提示文案 8 项验证）
- **验证**：tsc / build / tutorial / stress（25）/ woodcutting / ch1-story（24）/ probe-mobile-ux（8）全绿

### v0.5.2 P0 修复：睡觉交互改为真实床铺（"回到床上睡觉"无法完成教程 bug）
- **根因**：农场旧睡觉判定区（cols 2-4, rows 12-14）与床的实际位置脱节——床只在屋内（house cols 2-3, rows 2-3），玩家在可见木屋处按 E 无反应，教程无法推进
- **修复**（`MapScene.ts`）：
  - 删除/废弃农场旧睡觉硬编码区域（rows 12-14, cols 2-4）
  - 睡觉判定改为屋内真实床铺：自动扫描 Ground 层 gid 9（扫描失败回退已知床格）
  - 支持站在床格上按 E，或站在床相邻格且面向床按 E
  - 不新增存档字段、不改 storyStep
- **测试更新**：test-tutorial 第 11 步改为"进门 → 床边按 E 完成教程 → 床上按 E 跨天"；test-woodcutting W7 改为真实床铺睡觉路径；新增 probe-sleep 排查探针
- **验证**：tsc / build / tutorial / stress（25）/ woodcutting / ch1-story（24）全绿

### v0.5.2 P0 稳定底线（存档可靠性 + 第一章 E2E）
- **存档可靠性补强**（`SaveSystem.ts` / `MapScene.ts`）：
  - `pagehide` 兜底自动保存（移动端 `beforeunload` 不可靠）
  - 里程碑保存：碎片采集后、主线交付后立即入档（睡觉/观星完成已有）
  - `apply()` 边界保护：剧情步骤/任务状态白名单校验，数值字段非有限数降级默认，防坏档崩溃（不新增字段 / 版本号 / 迁移结构）
- **第一章 E2E 正式化**：新增 `test-ch1-story.mjs`（24 项断言）——序章辞退邮件 → 第一章任务链 → 观星三选项 → 结算 → save/reload/apply 恢复校验；车站手机通知文案对齐定稿公文版（`StationScene.ts`）
- **验证**：tsc / build / tutorial / stress（25）/ woodcutting 全绿；test-ch1-story 24/24

### v0.5.2 对话立绘（§8.5 方案 A 落地）
- **立绘选型**（制作人 2026-08-02）：林澈 = `linchen_s777001_cfg2`，夏雅 = `xiya`
- **后处理管线**（`tools/gen_portrait_final.py`）：选型图缩放至 512×768 RGBA，输出 `public/assets/portraits/linchen.png` / `xiya.png`；**保留原背景圆角卡片展示**（v0.4.3 修订：去背会损伤发丝/肩部边缘）
- **接线**（`StoryDialogue.ts`）：`PORTRAIT_MAP` 按说话人映射立绘，头像区升级为桌面 128×128 / 移动端 96×96（`isMobileLayout()`），`object-fit: cover` + `object-position: 50% 18%` 半身裁切；无立绘角色回退首字色块占位
- **验证**：tsc / build 通过；`probe-stargaze.mjs` 新增"夏雅立绘头像显示"断言，13/13 全绿

### v0.5.x 剧情定稿返工：观星夜收尾（编剧审查 v0.3）
- **观星夜收尾重写**（`StorySystem.ts`）：废弃旧版"守星人揭底"版 `STARGAZE_DIALOGUE`，改为定稿版 `DEMO_ENDING_DIALOGUE`——夏雅 + 爷爷的信 + 静默镜头（虫鸣/星光/没有说话）+ 三选项（试着留下 / 不知道答案 / 至少今晚）→ 分支独白（`DEMO_ENDING_BRANCHES`）→ 次日清晨（`DEMO_ENDING_FINALE`："归星镇，欢迎你"）
- **对话选项支持**（`StoryDialogue.ts`）：`DialogueLine.options` 选项行渲染（鼠标/触屏点击 + 键盘 1/2/3），选择后回调分支
- **状态标记返工**：移除 `demoEndingDone` 存档字段，改用 `storyStep = 'observatory_complete'` 持久化判重；`endingChoice` 仅内存暂存（第三章再定）；`isTutorialDone()` 兼容新终态
- **第一章程序员能力展示**：森林采集首次交互播放 6 句对话（"它像是在等待一个条件"/"以前调程序的时候……"），结束后自动采集
- **序章对白修订**：辞退邮件改公文口吻（弱化 AI 反派感）、独白压缩（"换过无数版本的工具"）、去"最后的信"剧透
- **NPC 台词**：神秘少女改"异常点"版（不揭底）、老张/小梅/阿风各一句话、商店老板补一句；冒险家改名统一为"阿风"
- **验证**：tsc / build / tutorial E2E（11 项）/ stress（25 项）/ woodcutting 全绿；新增 `probe-stargaze.mjs`（观星夜链路 12 项断言）

### v0.5 第一章小镇剧情 + 稳定化重构（v0.5）
- **Demo 结尾（观星之夜）**：
  - 第一章主线完成后，每晚 20:00 起农场右下空地出现观星点（`MapScene.ts` `STARGAZE_POS`，双层光圈呼吸闪烁）
  - 靠近按 E 触发观星收尾剧情（`STARGAZE_DIALOGUE` 9 行：林澈独白 + 守星人登场消失），随后弹出「✦ 归星物语 · Demo 结局 ✦」结算面板（`EndingPanel.ts`：游玩天数/等级/金币/钻石/星之碎片/收获/矿石/木材）
  - 点击「继续自由游玩」关闭面板恢复游玩；存档新增 `story.demoEndingDone`（可选字段，v0.5 不升版本），只触发一次
- **修复存档恢复不生效**（`StationScene.ts`）：判断"教程是否已过车站"改为读存档内 `saveData.story.storyStep`。原实现读模块级 `getStoryStep()`，reload 后永远返回初始值 `'station_intro'`，导致玩家每次刷新都重开序章
- **存档系统升级**：`SAVE_VERSION` 0.3 → 0.5，存档结构重构为分组格式 `{ version, player, world, farm, story }`（`SaveSystem.ts`）
  - 加载时 `version !== SAVE_VERSION` → 走 `migrate()` 迁移；当前策略清空旧存档，防止旧格式污染新结构
  - 存档 key：`return_star_save`
- **第一章小镇剧情**（`StorySystem.ts` 新增）：
  - `TOWN_INTRO_DIALOGUE`（首次进小镇开场）、`ELDER_QUEST_DIALOGUE`（村长委托星之碎片）、`SHARD_DELIVER_DIALOGUE`（交付碎片收尾）
  - 存档新增 `story.ch1TownIntroDone` 标记，防止第一章过场重复触发
- **NPC 对话升级**：6 个 NPC 全部改为完整剧本（`dialogue: string` → `dialogues: DialogueLine[]`，`NPCSystem.ts`），由 `StoryDialogue` 全屏打字机播放
- **砍树系统**：`old_axe` 旧斧头 + 木材 `wood`（售价 8G）；每棵树 3 击砍倒，每击消耗 5 体力
- **稳定性修复（P0 防黑屏）**：
  - 地图切换：tileset 加载失败用程序生成占位瓦片兜底，避免整场景黑屏
  - 切图过渡：`camera.fadeOut(250ms)` + `fadeIn(300ms)` + 1500ms 强制切换兜底
  - `create()` 整体 try/catch：异常显示错误遮罩而非永久黑屏
  - 挖矿：开采后矿脉从列表移除，防止同一矿脉重复开采
- **出口修复**：gate/forest 返回农场的出生点下移（y=96），修复农场↔森林 33ms 循环瞬移（出生点踩在出口区域边界导致）
- **封面替换**：新封面图（图片已含游戏名），移除 TitleScene 代码叠加的游戏标题
- **测试**：
  - `test-tutorial.mjs` 重写：新玩家完整流程（启动→title→enter→station→完成教程→farm），15 项断言
  - 新增 `test-stress-switch.mjs`：连续 16 次真实出口切图 + 4 次挖矿压力测试，验证无黑屏（RUNNING=1、摄像机无卡淡出），25 项断言
- **清理**：删除临时诊断脚本 `diag-exit.mjs` / `full-flow-test.mjs`、已弃用 `BootScene.ts`
- **项目规则**：新增 `AGENTS.md`（Alpha 阶段开发指南：稳定 > 新功能，禁止战斗/抽卡/大地图/后端等）

### 0.4 序章剧情 + 新手教程（v0.4-rc1）
- **新增 `src/systems/StorySystem.ts`**：11 步序章状态机（`station_intro → station_move → arrive_manor → xiya_talk → get_key → gate_opened → clear_land → sow_seeds → water_crops → evening_talk → done`）
- **新增车站场景 `StationScene.ts`**：纯 Phaser 图形场景（1120×600），三层视差远山+列车+晨雾粒子+手机通知动画+内心独白
- **新增大门地图 `gate.json`**（30×20 Tiled）：庄园大门物理墙+夏雅 NPC，一次性教程地图，连接车站→农场
- **新增剧情对话 UI `StoryDialogue.ts`**：全屏打字机效果（35ms/字），角色名+颜色，内心独白斜体灰，Skip 跳过按钮
- **新增物品**：`manor_key`（庄园钥匙，背包「使用」按钮）、`old_hoe`（旧锄头）、`old_watering_can`（旧水壶）
- **农场地图扩大**：30×20 → 40×25 瓦片，可耕区域 8×5=40 格 → 17×9=153 格（约 4 倍）
- **大门/夏雅/钥匙逻辑**从农场移入独立大门地图，农场不再被门墙割裂
- 车站出口根据教程进度分流：未完成→大门地图，已完成→农场
- 开场 30 秒安全超时兜底，防止对话卡死
- 教程锄地/播种/浇水各阶段自动给物品+推进剧情
- 晚间睡觉结束第一天，自动存档

### 0.3 每日任务 + 室内房屋 + 挖矿系统（v0.3-mining-basic）
- **新增 `src/systems/DailyQuestSystem.ts`**：18 个任务模板池，每日随机 4 个，钻石奖励
- **新增 `src/data/Stamina.ts`**：体力上限 100，挖矿消耗，睡觉恢复
- **新增 `src/data/MineState.ts`**：6 处矿脉（石头×3/铜矿×2/铁矿×1），每日刷新
- **新增室内地图 `house.json`**：木屋内部，床边睡觉区
- **新增物品**：`stone`（石头）、`copper`（铜矿）、`iron`（铁矿）、`diamond`（钻石）
- **Economy.ts**：新增矿石售价（石头 5G/铜矿 15G/铁矿 30G）
- **MapScene.ts**：矿脉渲染+`tryMine()`+体力 HUD+睡觉重置；`tryTutorialSleep()` 教程睡觉
- **ShopPanel.ts**：矿石出售条目
- **SaveSystem.ts**：保存体力+矿脉+每日任务状态
- **main.ts**：`window.debug.nextDay` 同步重置（体力+矿脉+每日任务）
- **NPC 系统扩展**：从 3 个 NPC 扩展到 6 个（新增矿工老张、花匠小梅、冒险家阿飞）
- **FarmProgress.ts**：新增 `marketMultiplier` 市场价倍率（预留）

### 0.2 商店 + 经济系统
- **新增 `src/data/Economy.ts`**：金币系统（初始 50G），`getCoins`/`addCoins`/`spendCoins`；商品价格集中配置（种子 10G/颗、萝卜收购价 15G/个）
- **新增 `src/ui/ShopPanel.ts`**：DOM 全屏覆盖层（非独立场景，沿用 TouchControls 模块级单例模式）
  - 靠近商人按 E 打开，Esc/按钮/E 关闭
  - 买萝卜种子（扣金币）+ 卖萝卜（得金币），余额不足/无货自动置灰按钮
  - 商店打开时冻结时间/玩家移动/NPC/交互（MapScene.update 拦截）
- **FarmState.ts**：新增 `addSeeds(n)`（商店买种子调用）
- **InputManager.ts**：新增 `clearAction()`（丢弃开门瞬间已排队的 E 键，防止开门即关）
- **MapScene.ts**：HUD 增加金币显示（PC 完整行 + 移动端精简行）；商人 `shopkeeper` 交互改为打开商店面板
- **NPCSystem.ts**：商人对话更新为商店引导文案
- 经济循环：种萝卜 → 收获 → 卖钱（15G/个）→ 买种子（10G/颗）→ 净赚 5G

### 农场等级/经验系统（MVP）
- **新增 `src/data/FarmProgress.ts`**：模块级单例，经验获取 + 自动升级，5 级阈值（0/100/250/500/900）
- 经验规则：播种 +3 XP | 浇水 +1 XP | 收获萝卜 +10 XP | 完成任务 +30 XP
- `addXp(amount, source)` 保留经验来源参数（plant/water/harvest/quest），控制台输出日志
- 升级时通过 `onLevelUp` 回调触发 `showDialogueText` 气泡提示
- **MapScene.ts**：`tryFarmInteract()` 播种/浇水/收获后各调用 `addXp`；`updateHUD()` 追加 `Lv.X` 显示
- **QuestSystem.ts**：`deliverQuest()` 完成时 +30 XP
- 无技能树、无奖励、无复杂 UI，保持 MVP 范围

### 存档系统（SaveSystem）
- **新增 `src/systems/SaveSystem.ts`**：localStorage 序列化/反序列化，版本号管理
- 保存内容：时间、金币、背包、种子、农田状态、作物成长、经验等级、任务状态、玩家位置/场景/朝向
- 触发时机：睡觉时自动保存、页面关闭前保存（beforeunload）
- 加载：首次进入农场时检测存档，恢复全部数据，自动切换到上次所在场景
- **各数据模块新增 setter**：`TimeSystem.setTimeFull`、`Economy.setCoins`、`Inventory.setItemCount`、`FarmState.setSeedCount/getAllTileEntries/getAllCropEntries/clearAllTiles/restoreTileEntries/restoreCropEntries`、`FarmProgress.setLevel/setXp`、`QuestSystem.setQuestState`

### Bug 修复
- **NPC 重叠无法触发商店**：三 NPC 站位从同一点错开（farm/town/forest 各定位），MapScene.tryInteract 改为取最近 NPC
- **按 Esc 商店不关闭**：`close()` 在模块顶层作用域意外解析为 `window.close()`（浏览器关窗口），已提取模块级 `closePanel()` 函数统一处理
- **商店状态 Bug（3 项）**：
  - 开店时物理引擎持续运行 → 玩家在商店界面背后滑动。修复：开店期间每帧 `player.setVelocity(0,0)`
  - 关店后 E 键残留导致立即重开商店。修复：关店时 `clearAction()` + 重置 `lastFrameTime`
  - 关店后时间跳跃（lastFrameTime 停在开店前）。修复：关店时 `lastFrameTime = this.time.now`
  - ShopPanel 新增 `onClose` 回调，`closePanel()` 加 `if (!open) return` 防重复关闭

### 美术资产规格升级（32×32 角色）
- **gen_sprite_assets.py**：角色单帧从 16×16 升级为 32×32，瓦片保持 16×16 不变
  - `player.png` 输出尺寸 64×64 → 128×128（4列×4行，每帧 32×32）
  - `npc_elder.png` / `npc_merchant.png` / `npc_girl.png` 全部改为 32×32 单帧
  - 修复 `px()` 函数多余右括号语法错误
  - 重新设计 32×32 像素角色：玩家亮红外套+深蓝裤、村长白胡须+金珠拐杖、商人红帽+黄围裙+钱袋、神秘少女紫长发+斗篷+发饰
  - 所有角色增加 1px 深色外轮廓描边，提高草地背景辨识度
- **MapScene.ts**：玩家 spritesheet `frameWidth/frameHeight` 16 → 32；NPC sprite `setScale(0.5)`；NPC 标签 y 偏移 -14 → -10
- **Player.ts**：构造函数新增 `setScale(0.5)`；碰撞盒 `setSize(24, 24).setOffset(4, 6)`（缩放后=12×12，脚部对齐）
- **NPC.ts**：`update()` / `snapToTarget()` 标签 y 偏移 -14 → -10
- 验证：`tsc --noEmit` + `vite build` + IDE 诊断均通过，无编译错误

---

## [0.1-mobile] - 2026-08-01

### 移动端适配（M1-M4）
- **M1 输入解耦**：新增 `InputManager` 系统，Player 和 MapScene 不再直接引用键盘
- **M2 画布适配**：Phaser Scale.FIT 模式，固定内部分辨率 800×600，禁用滚动条
- **M3 虚拟控件**：`TouchControls.ts` 摇杆+交互按钮，模块级共享状态解决场景切换冲突
- **M4 UI 适配**：`config.ts` 新增 `isMobileLayout()` 统一设备判断；HUD 分级显示；移动端对话框固定底部居中

### 美术探索（已废弃方案）
- 尝试 0x72 Dungeon Tileset II v1.7 资源包，因非标准 9×4 角色网格导致动画帧错误，已放弃
- 改用 Python + PIL 程序化生成像素美术资源（`gen_sprite_assets.py`）

### 基础功能
- 4 区域地图（农场/小镇/森林/矿洞）+ 出口切换
- 玩家 4 方向行走动画
- 3 个 NPC（村长/商人/神秘少女）+ 固定日程 + 对话
- 农田系统：锄地/播种/浇水/收获
- 任务系统：星之碎片采集
- 时间系统：日夜循环 + 睡觉跳天

---

## 维护说明
每次完成一个功能后，在 `[未发布]` 区块顶部追加改动条目，发布版本时将 `[未发布]` 改为版本号和日期，并新建空的 `[未发布]`。
