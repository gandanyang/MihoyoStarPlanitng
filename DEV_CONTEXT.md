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
✅ `172aa6e` M1-1 farm 五区布局升级（森林入口/花园/农田过渡/住宅/水塘，probe 21/21）
✅ `6db66f0` 地图资产健康检查（6 图无黑瓦片、14/14 出口正常、报告 v0.6.1）
✅ `e9be9da` M1-2 farm 动态氛围（水塘涟漪3 + 花草摆动6 + 暖色光斑1，零资源纯代码，制作人已验收）
✅ `ef5b63b` R1 风险消除：补 4 个 tileset 生成脚本（farm/gate/town/mine）
✅ `60f132b` NPC2a 视觉 idle 动作（7 种 NPC Tween 动画）+ BUG-028 gate 夏雅 sprite 修复
✅ tools 线：APK 一键打包脚本路径修正（Gradle 原生目录 android/app/build/outputs/apk/<debug|release>/）+ 安装脚本候选顺序同步 + 操作手册同步

🔴 **新 P0（2026-08-03 制作人安卓试玩反馈）**：BUG-032 木屋旁仍存在早期测试睡点（BUG-001 残留）——玩家靠近木屋外侧误触睡觉跨天打断探索
  - 接手：trae（睡觉判定属于地图/场景逻辑）
  - 要点：MapScene.ts 搜 `trySleep/tryTutorialSleep/bed` 全部硬编码坐标 → 只保留 house 场景内床 + farm 场景屋内/床相邻格两条合法路径
  - 必须回归探针：`probe-mobile-sleep.mjs` + `probe-mobile-tutorial.mjs`（防 BUG-001 回退）

⚠️ **在途半实现**：M1-3 环境恢复试点代码骨架已写入工作区（FarmRestore.ts 新文件 + SaveSystem.restore 可选字段 + MapScene.gardenRestore 字段/调用点），但 `setupGardenRestore()` + `tryGardenRestoreInteract()` 两个方法体未完成 → 当前 tsc 报错 3 条，会挡其他 AI 编译检查。建议 M1-3 先补完方法体再做其他，或先 git stash 骨架不挡路。

⏳ **下一步**：优先级 1) 先清 tsc（补 M1-3 两个方法体 or stash）；2) BUG-032 木屋误触睡觉 P0；3) M1-3 设计文档等制作人确认后实施；Q2 tileset 扩展（gid 9-13）按制作人指示**暂缓**


## 其他 trae 实例（forest 修复 / QA 监督线）

✅ `66a42f2` F1 forest_tileset 补齐 gid 9-12 树瓦片
✅ `c9f7a0f` DEV_CONTEXT 更新——F1 完成状态 + QA 监督验收标准

⏳ **待命**：M1-1 提交后独立 QA 验收
- Git 变更审查
- Tiled 数据检查
- Runtime probe
- 存档检查


## opencode（Bug 修复 / 种植体验 / 移动端 UI & 适配）

✅ `7971122` 安卓真机反馈修复 BUG-021~025
✅ `6b13c44` Android 物理返回键 + Release 签名打包
✅ `ffe51dc` BUG-026 种植体验反馈增强
  - 无效格红闪+低音提示
  - 播种/收获/浇水/锄地飘字
  - 音效分层
✅ `2020c8d` BUG-026 Commit3 种子不足体验（无种子引导商店 / 多种子飘字提示 / 移除全屏选择器）
✅ `0dc2cfd` BUG-026 阶段完成归档 + 转主线路 M1-1（trae）
✅ `6a7920c` P0 横屏触控布局加固——容器尺寸多信号同步（补回历史重排丢失的修复；**但制作人真机复测不通过，登记为 BUG-034**）
⏳ `docs/reports/BUG-026种植体验专项排查报告.md`（未提交，仍在工作区）

🔴 **新 P0 × 3 + P1 × 1 + P2 × 1（2026-08-03 制作人安卓试玩反馈.md 第 2 轮登记，详见 问题追踪.md BUG-030~034）**：
- **BUG-034**（P0·触控）：横屏按钮位置仍错——`6a7920c` 提交了但真机仍压画面/落黑边，需加固 + resize/orientationchange 重算
- **BUG-033**（P0·适配）：横屏画面占比太小（<60%），四周大片黑边——需允许 FIT 放大撑满短边（目标 ≥85%）
- **BUG-031**（P1·UI）：安卓任务面板贴顶——应在左上角偏下，留出状态栏/挖孔屏安全区
- **BUG-030**（P2·UI）：PC 端网页右侧残留颜色选择调试按钮——需在生产构建移除
- （BUG-032·P0·睡觉误触 → 已分配 trae 地图线，不在本条）

⏳ **下一步**：按优先级 BUG-034 → BUG-033 → BUG-031 → BUG-030 依次修；每个修完用 tsc + 对应探针回归（BUG-034/033 需加横屏 844×390 断言探针）


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

## Phaser 3.80 Texture API 注意事项（M1-2 踩坑沉淀）

### ⚠️ addTilesetImage 不生成 tileset 纹理

`tilemap.addTilesetImage('placeholder', 'tiles')` 只是**引用** image 纹理（'tiles' 仍为 image texture，frames=0），
无法用 frame index 创建 sprite。需要动态花/小动物/装饰 sprite 时，必须手动切 spritesheet。

### ⚠️ addSpriteSheet 的 source 传 Texture 对象 = 静默失败（关键坑）

Phaser 3.80 `textures.addSpriteSheet(key, source, config)` 源码（TextureManager.js L1092）：

```js
if (source instanceof Texture) {
    key = source.key;   // ← key 被覆盖为源纹理的 key
    texture = source;   // ← 直接返回源纹理，不创建新纹理！
}
else if (this.checkKey(key)) {
    texture = this.create(key, source);
}
```

- 传 `textures.get('tiles')`（Texture 对象）→ **不会创建 'tiles_fs'**，且会把源纹理 'tiles' 就地切帧
  （返回值构造函数名显示为 "Texture2"，textures.list 长度不变，exists 返回 false，无警告、无异常）
- **正确写法**：传 HTMLImageElement 走 create 分支：

```typescript
if (!this.textures.exists('tiles_fs')) {
  const img = this.textures.get('tiles').getSourceImage() as HTMLImageElement;
  this.textures.addSpriteSheet('tiles_fs', img, { frameWidth: 16, frameHeight: 16 });
}
// 之后 this.add.sprite(x, y, 'tiles_fs', frameIdx)   // frameIdx = gid - 1（0-indexed）
```

- 复现 commit：`e9be9da`（M1-2 花精灵修正）；参考实现：[MapScene.ts](src/scenes/MapScene.ts) `setupFarmAmbience()`
- 后续做花草 / 小动物 / 动态装饰 / NPC 动作时复用此模式


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
- ✅ M1-1 布局升级（`172aa6e`）
- ✅ M1-2 动态氛围（`e9be9da`，制作人已验收）
- ⏳ M1-3 环境恢复试点：设计文档 `M1-3环境恢复试点设计方案.md` 已出，**待制作人确认试点 A「爷爷的旧花园」**后实施
  - 代码骨架已落工作区（`src/data/FarmRestore.ts` + SaveSystem.restore 可选字段），但 MapScene 两个方法体未完成 → 当前 tsc 报错 3 条，需要先处理
- ✅ R1 风险消除：4 个 tileset 生成脚本（farm/gate/town/mine）已补（`ef5b63b`）
- ⏸ Q2 tileset 扩展 gid 9-13：按制作人指令暂缓


## 移动端（2026-08-03 制作人安卓试玩反馈 第 2 轮 · 紧急 4 条）

待：
- iOS 真机测试
- safe-area 优化（状态栏/挖孔屏）
- BUG-026 真机复测操作分
- 🔴 **BUG-034（P0 · opencode）**：横屏按钮位置仍错——`6a7920c` 提交了但真机仍压画面/落黑边，需加 resize/orientationchange 重算；验收：横屏 844×390 摇杆 x<25% 画布宽、交互按钮 x>75% 画布宽
- 🔴 **BUG-033（P0 · opencode）**：横屏画面占比太小（<60%），四周大片黑边；验收：短边占屏 ≥85%
- 🟠 **BUG-031（P1 · opencode）**：安卓任务面板贴顶遮挡状态栏，应在左上角偏下留出安全区
- 🟡 **BUG-030（P2 · opencode/任意）**：PC 端网页右侧残留颜色选择调试按钮未隐藏


## NPC

已规划：
- ✅ 日程错峰重构（已完成 `76577fc`）
- ✅ 视觉生活动作阶段 2a（已完成 `60f132b`，7 种 NPC idle Tween）
- ⏳ 真机观察动画节奏（颜色 tween 是否晃眼，移动 NPC label 同步是否正常）


## 地图扩展

待：
- farm 升级 M1-3 试点（等制作人确认）
- 海岸开发（C1 原型，优先级在 M1 之后）
- 深林开发（C2 原型）
- 🔴 **BUG-032（P0 · trae）**：农场木屋门外残留早期测试睡点——玩家靠近误触跨天，BUG-001 残留未清干净；必须回归 probe-mobile-sleep + probe-mobile-tutorial


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
