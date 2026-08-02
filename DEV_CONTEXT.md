# Stellaris Requiem - DEV_CONTEXT

> 项目开发上下文
> 用于 AI 协作交接，不替代设计文档

更新时间：
2026-08-03

当前版本：
v0.5.3 → v0.6 准备阶段


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

已完成：

E1 夏雅清晨事件

E2 第一次收获反馈

E3 林澈个人线

E4 NPC每日生活对白

E5 爷爷笔记

E6 神秘少女追加


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

- farm
- town


---

# 5. 当前正在处理


## F1 forest tileset ✅ 已完成（提交 66a42f2）


问题：

forest.json 使用 gid 9-12 树瓦片

但是：

forest_tileset.png 只有8格


修复：

forest_tileset.png 扩展至 12 格（192×16）

追加 gid 9-12 树瓦片

未改 gid 编号 / 未改 JSON 引用 / 未改碰撞语义


验证：

- 数据级 PIL 合成 47/47 树瓦片像素断言 ✅
- 运行时探针 probe-forest-visual.mjs 3/3 ✅
- tsc + vite build ✅


产物：

- public/assets/tiles/forest_tileset.png（8→12 格）
- tools/fix_forest_tileset.py
- tests/probes/probe-forest-visual.mjs
- 地图扩展技术评估报告-v0.6.md


## 当前状态：地图线等待 M1-1 产出


地图升级双轨（M1 farm / C1 海岸 / C2 深林）已转交地图线开发。

地图线已提交：

- 629ef02 DEV_CONTEXT.md
- 7510777 地图资产管线规范 + 前置检查报告


QA 监督（本 AI 角色）待命：

- ❌ 不验收（M1-1 无 commit）
- ❌ 不提前评审方案（避免干扰设计）
- ❌ 不补文档（规范已够）
- ❌ 不改地图代码


---

# 6. 当前技术注意事项


## 地图

⚠️ 不允许随意修改 gid 编号

原因：

存档和地图数据存在关联。


规则：

可以换图片

不要改变：

- gid语义
- 碰撞编号


---

## 存档

新增功能：

默认不要增加存档字段。

优先：

- 内存状态
- 派生状态


---

## NPC

NPC位置：

由日程计算。

不进入存档。

---

# 7. 当前未完成事项


## 移动端

待：

- iOS真机测试
- safe-area优化


## NPC

已规划：

- 日程重构
- 新NPC


## 地图

待：

- farm升级
- 海岸开发


---

# 8. 禁止当前AI做的事情


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

1.
✅ 修复 forest tileset（已完成 66a42f2）

2.
等待地图线 M1-1 farm 升级产出

3.
M1-1 产出后：独立 QA 验收（Git 变更审查 → Tiled 数据检查 → Runtime probe → 存档检查）

4.
NPC日程重构

5.
海岸地图原型


# 11. AI 协作分工（制作人定稿 9c0b10f）


制作人
|-- opencode（实现）：BUG-026 种植体验（P0）+ 音效评估
|-- 地图线（trae 转交）：地图管线 + M1 farm 升级 + M2 氛围 + C1/C2
|-- 美术线：村长立绘收尾（P2，in-flight）
|-- QA 监督（本 AI）：地图变更后独立验证 + 架构红线 + 质量控制


## QA 监督验收标准（M1-1 提交后按序执行）


① Git 变更审查

允许：map json / tileset 资源 / 地图配置 / probe 脚本

警惕：SaveSystem / Player 系统 / NPC 核心逻辑 / 全局配置


② Tiled 数据检查

- 最大 gid ≤ tileset 实际格数（防 F1 重演）
- layer 无无意义变化（防 ground/collision/objects 改名导致 Phaser 读取异常）
- 碰撞语义稳定：墙 / 水域 / 不可进入区域 / 出口


③ Runtime probe

复用 probe-forest-visual.mjs 模板

新增 probe-farm-visual.mjs（或 probe-m1-farm.mjs）

断言：scene 存在 / player 存在 / collision 存在 / 关键 object 存在


④ 存档检查

不改变：farm tile 状态 / crop 位置 / object id

重点防 Tiled 重存导致 layer / object id / collision 变化


# 12. 最近提交记录


最新：

66a42f2

内容：

fix(forest): F1 修复 forest_tileset 补齐 gid 9-12 树瓦片 + 地图扩展技术评估报告入库

近 5 条：

- 66a42f2 fix(forest): F1 修复 forest_tileset 补齐 gid 9-12 树瓦片 + 地图扩展技术评估报告入库
- 7510777 docs(map): v0.6 地图资产管线规范 + 前置检查报告
- 629ef02 docs(context): 建立AI协作上下文交接文档 DEV_CONTEXT.md
- 9c0b10f docs(producer): 制作人定稿 v0.5.4→v0.6 过渡优先级（BUG-026 P0/地图farm优先/音效WebAudio/先反馈再精度）
- 10216a0 docs(producer): 制作人综合评估与三线并行计划（BUG-026升级/音效立项/美术冻结）
