# Stellaris Requiem - DEV_CONTEXT

> 项目开发上下文
> 用于 AI 协作交接，不替代设计文档

更新时间：
2026-08-03

当前版本：
v0.5.4 → v0.6 准备阶段（收尾中）


---

# 1. 项目简介

Stellaris Requiem 是一款：
- Phaser 3 + TypeScript 开发
- 移动端优先
- 类星露谷玩法
- 二次元剧情表现方向

核心目标：

创造一个"生活在岛上的感觉"，而不是单纯完成任务。


---

# 2. 技术栈

## 前端

- Phaser 3
- TypeScript
- Vite

## 地图

- Tiled Editor
- JSON Map

## 存档

SaveSystem

当前存储：
- 玩家位置
- 作物状态
- 背包
- 世界状态


## 平台

目标：
- PC浏览器
- Android浏览器
- iOS Safari


---

# 3. 当前完成状态


## 已完成

### 基础玩法

✅ 玩家移动
✅ 场景切换
✅ 农场系统
✅ 作物成长
✅ 收获
✅ 背包
✅ 商店
✅ NPC系统


### 剧情

✅ 第一章教程

包含：

- 林澈来到归星岛
- 夏雅引导
- 庄园修复
- 观星事件


### v0.5.3 剧情密度增强

✅ E1 夏雅清晨事件
✅ E2 第一次收获反馈
✅ E3 林澈个人线
✅ E4 NPC每日生活对白
✅ E5 爷爷笔记
✅ E6 神秘少女追加

### v0.5.4 移动端体验修复

✅ BUG-021~025 全部修复（commit `7971122`）
✅ BUG-026 种植体验反馈增强（commit `ffe51dc`）
✅ BUG-027 标题界面冗余头像移除（commit `3b6bc90`）
✅ F1 forest tileset gid 9-12 越界修复（commit `66a42f2`）

### v0.6 准备阶段（本会话）

✅ AI 协作上下文文档 DEV_CONTEXT.md（`629ef02`）
✅ 地图资产管线规范 v0.6（`7510777`）
✅ v0.6 地图扩展前置检查报告（`7510777`）
✅ M1 farm 升级设计文档（`3b6bc90`）
✅ v0.6 准备阶段工作进度总结（`837e72f`）

### v0.6 美术第一批（美术线）

✅ 3.1 UI 套件像素风统一（`41a0c02`）
✅ 3.2 林澈头像裁切+接线（`2a5fadf`）→ 后因 BUG-027 移除标题界面接线
✅ 3.3 夏雅立绘+sprite 验收（`7245e90`）
✅ 3.4 村长立绘绘制+接线（`9042061`，probe 5/5）

测试：

- tsc ✅
- tutorial test ✅
- story test ✅


---

# 4. 当前最高优先级


## v0.6 地图扩展


原因：

当前最大问题：

> 可探索内容不足


目标：

提高：
- 地图规模
- 探索价值
- 村庄生活感


计划：

新增：

- 海岸
- 深林
- 观测站


升级：

- farm（设计文档已就绪，待实施）
- town


---

# 5. 各 AI 协作进度（2026-08-03 快照）


## trae（地图/资产维护线）

✅ `629ef02` DEV_CONTEXT.md 建立
✅ `7510777` 地图资产管线规范 + 前置检查报告
✅ `76577fc` v0.5.4 阶段1 NPC日程错峰重构
✅ `3b6bc90` BUG-027 修复 + M1 farm 升级设计文档
✅ `837e72f` v0.6 准备阶段工作进度总结

⏳ **下一步**：等待制作人确认 M1 farm 设计方案后实施
- 编写 `tools/gen_farm_tileset.py`（同时解决 R1 风险）
- 运行脚本生成新 `farm_tileset.png`（8→13 格）
- 修改 `farm.json` 应用 5 区布局
- 视觉探针 `probe-farm-visual-v0.6.mjs` 验证


## 其他 trae 实例（forest 修复 / QA 监督线）

✅ `66a42f2` F1 forest_tileset 补齐 gid 9-12 树瓦片
✅ `c9f7a0f` DEV_CONTEXT 更新——F1 完成状态 + QA 监督验收标准

⏳ **待命**：M1-1 提交后独立 QA 验收
- Git 变更审查
- Tiled 数据检查
- Runtime probe
- 存档检查


## opencode（Bug 修复 / 种植体验）

✅ `7971122` 安卓真机反馈修复 BUG-021~025
✅ `6b13c44` Android 物理返回键 + Release 签名打包
✅ `ffe51dc` BUG-026 种植体验反馈增强
  - 无效格红闪+低音提示
  - 播种/收获/浇水/锄地飘字
  - 音效分层
⏳ `docs/reports/BUG-026种植体验专项排查报告.md`（未提交，仍在工作区）

⏳ **下一步**：种植手感探针 + 真机复测操作分回升


## 美术线（v0.6 美术第一批）

✅ `41a0c02` 3.1 UI 套件像素风统一（HUD/背包/商店/任务面板）
✅ `2a5fadf` 3.2 林澈头像裁切 + 标题界面主角头像角标接线
  ⚠️ 后因 BUG-027 由 trae 移除标题界面接线（`3b6bc90`），头像文件保留待复用
✅ `7245e90` 3.3 夏雅立绘+sprite 验收
✅ `9042061` 3.4 村长立绘绘制+接线（elder.png 512×768 RGBA / PORTRAIT_MAP / probe 5/5）

🎉 **v0.6 美术第一批全部完成**


## 制作人

✅ `10216a0` 综合评估与三线并行计划
✅ `9c0b10f` 定稿 v0.5.4→v0.6 过渡优先级
  - BUG-026 P0 最高优先
  - 地图 farm 优先
  - 音效 WebAudio
  - 先反馈再精度
✅ `1258d4d` 神秘少女月之少女气质方向（方案 A）

⏳ **待决策**：
- M1 farm 升级设计方案确认（5 区划分 + tileset 扩展 13 格）
- 神秘少女立绘是否补入 v0.6


---

# 6. 当前技术注意事项


## 地图

⚠️ 不允许随意修改 gid 编号

原因：

存档和地图数据存在关联。


规则：

可以换图片

不要改变：

- gid 语义
- 碰撞编号


规范文档：[地图资产管线规范-v0.6.md](docs/reports/地图资产管线规范-v0.6.md)


---

## 存档

新增功能：

默认不要增加存档字段。

优先：

- 内存状态
- 派生状态


---

## NPC

NPC 位置：

由日程计算。

不进入存档。


---

# 7. 当前未完成事项


## 地图升级

待：
- ✅ M1 farm 升级设计文档已就绪
- ⏳ 等待制作人确认后实施
- ⏳ R1 风险：4 个独立 tileset 无生成脚本（待补）


## 移动端

待：
- iOS 真机测试
- safe-area 优化
- BUG-026 真机复测操作分


## NPC

已规划：
- ✅ 日程错峰重构（已完成 `76577fc`）
- ⏳ 视觉生活动作（阶段 2a，方案已出待实施）


## 地图扩展

待：
- farm 升级实施
- 海岸开发
- 深林开发


---

# 8. 禁止当前 AI 做的事情


❌ 不允许：

- 重构整个项目架构
- 更换引擎
- 新增抽卡系统
- 新增战斗系统
- 修改主线剧情
- 自行创造核心角色


除非制作人明确批准。


---

# 9. 开发原则


优先级：

稳定性
>
内容密度
>
视觉表现
>
新系统


判断标准：

如果一个功能不能增加：

- 玩家体验
- 世界真实感
- 长期扩展能力

不要开发。


---

# 10. 当前建议下一步


推荐顺序：

1. ✅ 修复 forest tileset（已完成 `66a42f2`）
2. ✅ BUG-026 种植体验反馈增强（已完成 `ffe51dc`）
3. ✅ v0.6 美术第一批（已完成 `9042061`）
4. ⏳ M1 farm 升级实施（设计文档已就绪，待制作人确认）
5. ⏳ 补 4 个 tileset 生成脚本（消除 R1 风险）
6. ⏳ NPC 视觉生活动作阶段 2a
7. ⏳ C1 海岸地图原型


---

# 11. AI 协作分工（制作人定稿 `9c0b10f`）


制作人
|-- opencode（实现）：BUG-026 种植体验（✅ 反馈增强已交付）+ 音效评估
|-- trae（地图/资产）：地图管线 + M1 farm 升级 + M2 氛围 + C1/C2
|-- 美术线：v0.6 美术第一批（✅ 全部完成）
|-- QA 监督（其他 trae 实例）：地图变更后独立验证 + 架构红线 + 质量控制


## 领地避让（开工前 git status）

| 文件/目录 | 当前归属 |
|----------|---------|
| `src/scenes/MapScene.ts`（farm 逻辑） | opencode BUG-026 |
| `src/systems/FarmState.ts` | opencode BUG-026 |
| `src/systems/AudioSystem.ts` | opencode 音效评估 |
| `src/ui/StoryDialogue.ts` | 美术线 |
| `tools/gen_portrait_*.py` | 美术线 |
| `public/assets/portraits/*` | 美术线 |
| `public/assets/tiles/forest_tileset.png` | 其他 trae 实例（已完成） |
| `tools/fix_forest_tileset.py` | 其他 trae 实例（已完成） |
| `docs/reports/BUG-026种植体验专项排查报告.md` | opencode（未提交） |
| `public/assets/maps/*.json` | trae（M1 实施时） |
| `public/assets/tiles/{farm,gate,town,mine}_tileset.png` | trae（M1 实施时） |


---

# 12. 最近提交记录


最新：

`837e72f`

内容：

docs(report): 输出v0.6准备阶段工作进度总结报告

近 10 条：

- `837e72f` docs(report): 输出v0.6准备阶段工作进度总结报告
- `9042061` art(v0.6): 3.4 村长立绘绘制+接线（elder.png 512×768 RGBA / PORTRAIT_MAP / probe 5/5 全绿）
- `3b6bc90` fix(ui): 移除标题画面主角头像(BUG-027) + M1 farm升级设计文档
- `ffe51dc` feat(planting): BUG-026 种植体验反馈增强（无效格红闪+低音提示、播种/收获/浇水/锄地飘字、音效分层）
- `1258d4d` docs(producer): 神秘少女月之少女气质方向（方案A：月=气质补充，不推翻星轨守护者定稿）
- `c9f7a0f` docs(context): DEV_CONTEXT 更新——F1 完成状态 + QA 监督验收标准 + 协作分工
- `66a42f2` fix(forest): F1 修复 forest_tileset 补齐 gid 9-12 树瓦片 + 地图扩展技术评估报告入库
- `7510777` docs(map): v0.6 地图资产管线规范 + 前置检查报告
- `629ef02` docs(context): 建立AI协作上下文交接文档 DEV_CONTEXT.md
- `9c0b10f` docs(producer): 制作人定稿 v0.5.4→v0.6 过渡优先级
