# 更新日志

本项目所有显著改动均记录于此文件。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [未发布]

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
