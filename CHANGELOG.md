# 更新日志

本项目所有显著改动均记录于此文件。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [未发布]

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
