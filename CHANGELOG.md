# 更新日志

本项目所有显著改动均记录于此文件。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [未发布]

### FEATURE-036 自动农业机器人获取（2026-08-04）

> 任务卡：《任务-FEATURE036机器人解锁剧情.md》｜ 方案：《FEATURE-036机器人获取设计.md》路线 A（制作人确认）｜ **A 体验闭环完成**

- **获取链路**：花园恢复（M1-3 restore.garden）→ 花园左上角出现「旧机器人」（锈色视觉 + 标签）→ 靠近按 E 播放 `OLD_ROBOT_DIALOGUE` 修复对白 → 获得 `auto_farmer_robot` 入背包 → 可部署
- **设计约束遵守**：A/B 类生活事件（不扩世界观真相/不主动提及爷爷回忆）；不新增 StoryStep / 不改主线；不新增存档字段（`oldRobotFixed` 仅内存 flag，刷新后由背包持有态兜底防重复）
- **修复的交互冲突**：旧机器人初置 (33,4) 与夏雅见证位 (33,6) 相距 2 格会抢交互 → 移至 (28,3)（距 5 格）；`setupOldRobot` 需在恢复完成瞬间调用（同 `spawnGardenXiya` 模式），create 时仅处理刷新重进
- **验证**：tsc 0 错 ✅ / build ✅ / `probe-bug036-robot-acquire` 11/11 ✅ / 回归 farm-restore 25/25、automation 14/14、test-tutorial 全绿 ✅

### 一键出售功能（背包 + 商店，2026-08-04）

> 任务卡：《任务-一键出售功能.md》（制作人 2026-08-03 立项，P0 体验闭环）｜ 提交 `6d575f3`

- **数据层**（`src/data/Economy.ts`）：新增 `SELLABLE_ITEMS`（可售判定：凡有价物品均可卖）`sellAllSellable()`（批量卖出并返回总额/清单）`hasSellableItems()`；**价格复用 ShopPanel 现有价格，不新增第四价格源**（红线：价格三源未收敛前与现售同价）
- **不可售**：工具（锄头/水壶/斧头）、钥匙、auto_farmer_robot 机器人、钻石
- **UI 双入口**：背包面板「全部出售」+ 商店面板「全部出售」；新增共享 `ConfirmDialog`（`src/ui/ConfirmDialog.ts`）二次确认（"确认卖出全部可售物品？"），防误触
- **反馈**：卖出后 toast 显示获得金币总额 + 已卖物品数；无可售物品时按钮置灰+提示
- **商店联动**：商店版卖出后调 `onSellCallback(total)` 同步每日任务（卖作物类任务可正常推进）
- **存档**：无新字段（走既有 addGold / removeItem）
- **验证**：tsc 0 错 ✅ / build ✅ / `probe-sell-all` 18/18 ✅ / 回归探针（bug012-dailyquest 13/13、farm-restore 25/25、water-splash 5/5、automation 14/14）全绿 ✅

### D-01 农田视觉升级 — 四作物分品种精灵（2026-08-04）

> 任务卡：《docs/design/BatchD-01农田视觉升级验收标准.md》｜ 提交 `79912a6`

- **产出**：`public/assets/sprites/crops.png`（96×128，由 `tools/gen_crops.py` 确定性生成）——萝卜/番茄/玉米/草莓 × 发芽/生长/成熟三态
- **接线**（`MapScene.ts` / `FarmState`）：成熟地块不再显示通用绿植，改按作物品种显示对应成熟帧；生长中显示发芽/生长帧；gid 语义不变
- **验证**：tsc 0 错 ✅ / build ✅ / 验收探针 ✅

### BUG-026 种植体验专项完成（2026-08-03）

> 来源：制作人 2026-08-02 定稿（先反馈，再精度）+ 排查报告《docs/reports/BUG-026种植体验专项排查报告.md》

- **第一阶段 · 反馈层**（`ffe51dc`）：无效格红闪+低音+原因提示（替代静默 return）；播种/收获/浇水/锄地格子飘字；音效分层（收获最高存在感）+ 新增 `invalid` 拒绝音
- **第二阶段 · 流程连续性**（`2020c8d`）：无种子 → 引导去商店（不弹窗）；单种子 → 直接种（不打断）；多种子 → 飘字提示可用种子 + 引导切换；移除打断节奏的全屏种子选择器（死代码清理）
- **目标达成**："触碰 > 精度"闭环成立——点击土地 → 明确回应 → 继续操作
- **暂缓**：B1/B2（判定容差 / 双通道语义）属操作模型升级，非 bug，待实际体验数据后决策
- **验证**：tsc ✅ / build ✅ / probe-farm-tap 5/5 ✅ / test-tutorial 全绿 ✅
- **红线遵守**：未改存档 / 作物系统 / 地图数据 / 判定算法

### 制作人综合评估与三线并行计划（2026-08-02）

> 来源：《制作人项目评估与开发计划.md》+ 顶层设计 §10.7；制作人接管后首份综合评估

- **评估**：真机评分操作 1/5（BUG-026 种植体验）与音效 1/5 为最高体验短板；画面 3/5 由地图升级 M1/M2 主攻
- **拍板**：① BUG-026 升级为高优先专项（与地图升级并列）② 音效独立低资源立项（先报告方案）③ 美术线冻结（3.1-3.3 已交付，3.4 in-flight 收尾）④ 30 分钟撑满靠内容密度（C1 海岸 + NPC 生活事件）
- **分工**：地图升级双轨（trae）｜种植体验专项 + 音效评估（opencode）｜美术线冻结

### 制作人定稿：v0.5.4 → v0.6 过渡优先级（2026-08-02）

> 来源：《制作人项目评估与开发计划.md》v0.2 + 顶层设计 §10.8

- **核心判断**：前 10 分钟沉浸感不足；手机游戏**触碰 > 看见**（操作是最高频接触面）
- **优先级**：P0 BUG-026 种植体验 → 操作稳定 → P1 地图扩张（M1 farm 升级优先 → C1 海岸先地点后剧情）→ P2 美术 → P2 音效（WebAudio 反馈不做 OST）
- **三个开放问题已拍板**：① BUG-026 先反馈再精度 ② 音效纯 WebAudio 合成 ③ C1 海岸暂不进入剧情开发（只做地图+氛围点）
- **任务分配**：BUG-026 + 音效评估 → opencode；地图资产管线 + M1 farm 升级 → trae；村长立绘收尾 → 美术线
- **红线**：新剧情角色 / 新大型系统 / 战斗 / 抽卡

### 安卓真机反馈修复（v0.5.4-B，`7971122`）

> 来源：制作人安卓真机体验（《安卓体验测试反馈收集 copy.md》）；对应问题追踪 BUG-021~025

- **P0 剧情被跳过 + 任务卡死不让睡觉**（连锁）：物理返回键不再跳过剧情对话（仅消费）；场景回退仅限教程完成后；坏档自愈（scene=farm 但 storyStep 卡门阶段 → 恢复推进到 clear_land 补锄头）
- **P1 跳过按钮没功能**：`pointerdown` 立即响应 + click 兜底（StoryDialogue / StationScene 跳过开场）
- **P1 删档按钮**：标题界面居中 + 二次点击确认（防误删）
- **P1 横屏 UI 偏移**：game-container 尺寸=画布显示尺寸 + position:relative；TouchControls 改挂画布容器（FIT 黑边不再使摇杆/按钮偏移）
- **回归**：tsc ✅；tutorial 18/18、bug012 13/13、density 9/9、mobile-sleep 5/5、clear-save 6/6、坏档自愈 ✅
- 产出新 APK：`app-release.apk`（19.66MB）/ `app-debug.apk`（20.88MB），待真机复测

---

### v0.6 视觉升级 — 3.1 UI 套件像素风统一

> 任务卡：《任务-美术v0.6视觉升级.md》§3.1（优先级 1）

**HUD 图标像素化**（`41a0c02`）：
- HUD 钻石/体力/种子/金币 emoji → 16×16 像素图标（`itemIconHtml`），数字文本保留
- 新增 `gen_item_icons.py` 体力（闪电）/金币（硬币）图标，共 20 个物品图标

**面板视觉统一**（`41a0c02`）：
- 背包/商店/任务面板统一色板（背景 `#3d3226` / 边框 `#8a6a45` / 金色标题）
- 背包/商店金币显示换 `coin` 像素图标；结算面板钻石换 `diamond` 像素图标
- 对话框底色对齐色板（背景 `rgba(25,20,15,.95)` / 深棕描边），位置与移动端硬约束未动

**移动端硬约束**：对话框位置 / HUD 信息分级 / `isMobileLayout()` 均未改动。

### v0.6 视觉升级 — 3.2 林澈头像

> 任务卡：《任务-美术v0.6视觉升级.md》§3.2（优先级 2 — 二游第一印象）

**产出**：
- `public/assets/portraits/linchen_avatar.png`：512×512 RGBA，从源图 `linchen_s777001_cfg2.png`（1024×1536）c_wider 位裁切半身（制作人拍板"裁切带背景"，符合 v0.4.3 保留背景管线决策）
- 接线 `TitleScene`：标题界面右侧新增主角头像角标（桌面 128×128 / 移动端 96×96，`isMobileLayout()`），圆角遮罩 + 主题色描边，与 StoryDialogue 立绘卡片风格一致；不遮挡标题/副标题/开始提示

**验证**：tsc ✅；build ✅；`probe-title-avatar` 7/7 全绿（纹理加载 / 头像创建 / 遮罩 / 尺寸 / 无 404）；`probe-mobile-layout` 10/11（1 项为预存失败，与本改动无关）

### v0.6 视觉升级 — 3.3 夏雅 sprite/立绘验收

> 任务卡：《任务-美术v0.6视觉升级.md》§3.3（制作人确认仅验收，无需增量优化）

**验收结论**（`8cd9df2` 已含全部产出）：
- sprite `npc_xiya` 已 v2 像素风（橙金短发 + 工装背带裤 + 工具腰带，符合 20 岁镇长助理/机械维修师人设），三处使用点共用单一纹理形象一致
- 立绘 `xiya.png` 512×768 RGBA 已接入 `PORTRAIT_MAP`
- farm 教程无夏雅 sprite 记为实现设计差异（非缺陷），后续如需要教程陪伴演出作为剧情/演出任务单独规划

### v0.6 视觉升级 — 3.4 村长立绘

> 任务卡：《任务-美术v0.6视觉升级.md》§3.4（美术线收尾项）

**产出**：
- `public/assets/portraits/elder.png`：512×768 RGBA 米黄长者风立绘（制作人选 `elder_s202608021.png`，经 `gen_portrait_final.py` 统一裁剪缩放管线）
- `gen_portrait_comfy.py` / `gen_portrait_final.py` 扩展村长 prompt + 任务（可重复生成）

**接线**：
- `PORTRAIT_MAP` 新增 `村长: 'assets/portraits/elder.png'`（`StoryDialogue.ts`）；运行时村长对话显示立绘，图片加载失败自动回退首字占位（既有兜底逻辑，无空白头像框风险）

**验证**：tsc ✅；build ✅；`probe-elder-portrait` 5/5 全绿（纹理系统 / HTTP 200 / 运行时立绘 img src / 512×768 / 无加载失败）；`probe-mobile-tutorial` 全流程回归通过



> iOS 审查报告：《iOS兼容性专项审查报告-v0.5.3.md》（§E 修复记录）| APK 方案：《APK打包可行性方案.md》（§8 实施记录）
> 目标：补齐 iPhone 兼容缺口 + 打通 Android APK 出包链路

**iOS 兼容性修复**（`54fb1c1`，审查 B1-B5 + D5 全落地）：
- safe-area：`viewport-fit=cover` + 摇杆/交互/背包/任务按钮 `env(safe-area-inset-bottom)`（Home Indicator 不再遮挡）
- `inset:0` → 显式 `top/right/bottom/left` 共 8 处（旧 iOS <14.5 兼容）
- `AudioContext` 补 `webkitAudioContext` 回退（iOS 12- Safari）
- `-webkit-backdrop-filter` + `-webkit-touch-callout:none` + `apple-mobile-web-app-capable`

**APK 打包落地**（`36f9680`，Capacitor 8.5）：
- 环境：JDK 17（Gradle 引导）+ JDK 21（Capacitor 8 编译要求）+ Android SDK 34 纯命令行安装
- 产出：`app-debug.apk`（19.5MB，Debug 未签名，包名 `com.starvalley.returntostar`）
- 坑：Gradle 下载不走系统代理 → `GRADLE_OPTS` 显式传 `127.0.0.1:7897`
- `.gitignore` 覆盖 android 构建产物 + 临时探针；`local.properties` 不入库
- 遗留：物理返回键拦截 / Release 签名 / 真机冒烟（见方案 §8.5）

**APK 遗留补齐**（`6b13c44`，v0.6 前置 D5）：
- 物理返回键层级：@capacitor/app `backButton` → 关对话（skip 推进剧情）→ 关种子选择器 → 关面板 → 回退场景（子区域回农场，mine 回 forest）→ 退出 App；新增 `src/systems/AndroidBackHandler.ts` + `MapScene.handleBackButton()`
- Release 签名：keystore（`C:\Users\Gdy\.android\guixing-release.keystore`，不入库）+ `android/keystore.properties`（gitignore）+ build.gradle 条件签名；产出 `app-release.apk` 19.29MB，apksigner 验证通过
- 注意：该 commit 的 MapScene.ts 含并行 AI 在途 HUD 像素图标改动（同文件混改，自洽可编译）

**回归**：tsc ✅；`probe-bug012`（13/13）、`probe-density-v053`（9/9）、`test-tutorial`（18/18）全绿

---

### v0.5.3 剧情密度增强（E1-E6 六事件 + 引导剧情 + 四要素规范）

> 设计稿：《任务-剧情密度增强设计稿-v0.5.3.md》| 任务书：《任务-剧情密度增强规划-v0.5.3.md》
> 目标：让玩家感觉「我不是在完成任务，我是在这里生活」
> 约束：纯数据追加 + 最小钩子，零新增存档字段，不改主线

**六事件实现**：

| 事件 | 方向 | 触发 | 涉及文件 | 探针 |
|------|------|------|---------|------|
| E1 夏雅清晨偶遇 | 夏雅日常 | 06:00-08:00 进农场 + `isTutorialDone()` | `StorySystem.ts` / `MapScene.ts` | `probe-density-v053` E1a-d |
| E2 第一次收获反馈 | 夏雅日常 | 首次收获作物（内存 flag 防重复） | `MapScene.ts` | `probe-density-v053-batch2` E2a-d |
| E3 林澈"以前工作的时候" | 林澈个人线 | 矿洞首次对话（追加到 `MINER_DIALOGUES`） | `StorySystem.ts` | `probe-density-v053` E3a |
| E4 NPC 每日随机一句 | 小镇生活 | 每天首次对话（seed=day+NPC hash，同天固定） | `NPCSystem.ts` / `MapScene.ts` | `probe-density-v053` E4a-d |
| E5 爷爷笔记 | 星星线索 | 庄园可读物件，按天轮换（seed=day） | `MapScene.ts` / `StorySystem.ts` | `probe-density-v053-batch2` E5a-b |
| E6 少女追加一句 | 星星线索 | `isObservatoryComplete()` 后追加 | `StorySystem.ts` | `probe-density-v053-batch2` E6a-d |

**引导剧情增强**（制作人移动端试玩反馈后）：
- 砍树/挖矿引导从 3 句扩为夏雅参与的 7 句剧情对话（`b259bc2` + `659030e`）
- 爷爷笔记位置 (1,3) → (1,6)，交互基准改椭圆实际坐标 `grandpaNotePos`（修复笔记抢占砍树引导）
- 挖矿引导改为矿脉旁 24px 才触发（修复任意位置弹引导）
- 探针：`probe-guide-dialogue`（6/6）+ `probe-note-vs-woodcut`（2/2）

**四要素规范落地**（`ff9907e`）：
- 《剧情开发规划.md》"剧情生成规则"新增**工程化四要素**：触发条件 / 场景生命周期 / 是否影响存档 / 是否影响测试节点
- "四要素未答清前，不得进入实现"——适用于所有后续剧情内容设计
- 《设计稿》§0 同步四要素汇总

**BUG-019 修复**：移动端体验不到砍树/挖矿引导剧情（P1，笔记位置+交互基准+矿脉旁触发）

**BUG-020 修复**：对话残留跨场景传递导致新场景交互被拦截（P1，`a6d61ae`）
- 根因：Phaser 场景 `start` 复用实例，`storyDialogue.display:block` 未清理
- 修复：`StoryDialogue.ts` 新增公开 `reset()`（静默关闭不触发回调），`MapScene.cleanupSceneDom`（SHUTDOWN）调用

**NPC 名字标签美化**（6 个普通 NPC + 三处夏雅统一，`a6d61ae` + `ad285fc`）：
- 6 个 NPC 各配主题色名字（老村长米黄 / 商店老板金 / 神秘少女紫 / 老张橙 / 小梅绿 / 老风蓝），与对话角色色一致
- 头顶名牌样式统一：13px 主题色 + 3px 黑描边 + 阴影 + 半透明黑底托（`rgba(0,0,0,0.45)` + padding），深/浅背景都可读
- NPC 实体新增 `nameColor` 字段（构造第 3 参），标签上移 -10 → -14 像素
- 普通 NPC / 教程夏雅 / 清晨夏雅三处样式对齐

**夏雅模型升级需求登记**（`a6d61ae`）：
- 制作人反馈：现 `npc_xiya` 形象不符人设，需重绘升级
- 覆盖 gate 开门关 + farm 教程 + E1 清晨偶遇三处形象，升级时保持一致、沿用 `tools/gen_style_unify.py` 管线
- 已登记：需求文档 §13.2 规划中 + 维护说明 P2 项（排期待制作人确认）

**验证**：`tsc --noEmit` 通过；`probe-density-v053`（9/9）、`probe-density-v053-batch2`（10/10）、`probe-density-experience-v053`（慢速体验）、`probe-guide-dialogue`（6/6）、`probe-note-vs-woodcut`（2/2）、`test-woodcutting`（18/18）、标签样式探针（6/6）全绿；回归 `test-tutorial` / `test-ch1-story` 无功能破坏

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
