# 任务卡：核心场景美术升级（gate 庄园大门 · 第一弹）

> 状态：✅ **已完成**（Trae 2026-08-07，probe-gate-visual 16/16 + 相关探针回归全绿 + tsc 0 错）
> 立项：制作人 2026-08-07（「先做开大门的那个场景的升级 简单升级一下」）
> 一句话：庄园大门场景从「纯色矩形门 + emoji 装饰」升级为「像素风双扇木门 + 生活杂物 + 小动物 + 夜间门灯」，全部零资源代码叠加，教程物理门墙零触碰。
>
> **补丁（同日追加）**：Alpha 玩家流程审查 P0 #1/#2 确认 gate 10 个 emoji 装饰与 town 🏠 未随升级移除 → 已全部像素替换，详见 §九。

---

## 一、背景

gate（庄园大门）是新手教程第二场景（车站 → 大门 → 农场）。原大门只是一块纯色物理矩形 + 🔒 emoji，装饰物全为 emoji 文本（🏠🪵🌾🏮📮🪣），无像素风视觉、无场景氛围层，是「简单升级」的合理靶点。方向见 [视觉升级方案-v0.10-生活感方向.md](../design/视觉升级方案-v0.10-生活感方向.md)（Overlay 增强：地图 JSON 不动，代码层叠加）。

---

## 二、现状（施工前复核）

- `MapScene.setupGateTutorial()`（`src/scenes/MapScene.ts`）：gateWall 物理矩形（gateX=240, gateY=144, 32×32）+ 🔒 + 夏雅 NPC。
- `createGateInteractables()`：13 处 emoji 交互物（12,10 / 13,9 / 17,9 / 13,12 / 17,12 / 14,13 / 14,8 / 16,8 / 16,12 等）——装饰须避开。
- gate.json：30×20 瓦片（16px）；Ground gid 1 草地 / 6 木地板 / 7 路径 / 8 花；Walls gid 3 石墙；出口（cols14-15, rows0-2 路径）。
- 依赖探针：`probe-gate-skip`（断言 `!!g.gateWall` / `!!g.xiyaSprite`）、`probe-bug035-gate-skip`、`probe-locked-tools`、`probe-mobile-tutorial`——**gateWall 销毁链不可破坏**。
- 复用模板：`setupTownDecorations()`（Graphics 纯绘制 + 小鸟 tween + `__WHITE` 粒子 + 统计对象）、town 窗灯模式（`gateLampGlows`）。

---

## 三、实施内容

### Task 1：像素风双扇木门视觉（P0）

新增 `createGateDoorVisual(gateX, gateY): Container`，叠加在物理墙上方（depth 4）：

- 门框（深棕外框，嵌入门柱间）→ 左右双扇门板（木色）+ 中缝深色线
- 门板横纹（木板拼缝）×3/扇、门环（金色圆环，左右扇各一）、门楣（横梁）
- **随 gateWall 一起销毁**：`useManorKey()` 销毁链中加入 `gateDoorVisual.destroy()`（不触碰 gateWall 物理销毁顺序）
- 纯视觉：不参与物理碰撞

### Task 2：生活杂物层（P1）

新增 `setupGateDecorations()`（create() 中 `mapKey === 'gate'` 分支调用），纯 Graphics 深度 3：

- 花盆 ×2（10,10 / 18,10）、木柴堆（20,12）、石凳（3,12）、水桶（25,9）、木箱（20,10）
- 路边石 ×3（2,12 / 23,9 / 27,12）、草丛 ×4（9,13 / 19,13 / 18,14 / 5,10）
- 坐标已用脚本核对 gate Ground/Walls 层：ground==1 草地、walls==0 无碰撞、避开路径 gid 7/6、避开全部 13 处 emoji 交互点与夏雅站位

### Task 3：小动物 + 夜间门灯（P1）

- 小鸟 ×1（18,6），固定小范围往返（复用 town 模式，depth 4）
- 夜间门柱暖光（≥18 时 / <6 时）：`gateLampGlows` 椭圆 ×2（14,8 / 16,8，与现有 🏮 重叠），复用 town 窗灯呼吸 tween，depth 2，白天零创建
- 统计：`public gateLife = { decor, wildlife, lamp }` 供探针读取（纯统计无逻辑）

---

## 四、涉及文件

- `src/scenes/MapScene.ts`：字段（gateDoorVisual / gateLampGlows / gateLife）、create() gate 分支、setupGateTutorial 门墙后挂视觉、useManorKey 销毁链、新增 `createGateDoorVisual` / `setupGateDecorations`
- `tests/probes/probe-gate-visual.mjs`（新增）：白天/夜间/gateLife 统计/开门销毁链/无页面错误 + 截图 ×3
- 探针回归修复（开场动画「音量提示」需点击、locked-tools 测试构造）：
  - `tests/probes/probe-gate-skip.mjs`
  - `tests/probes/probe-bug035-gate-skip.mjs`
  - `tests/probes/probe-locked-tools.mjs`
- **不修改**：`public/assets/maps/gate.json`、`gate_tileset.png`、存档/剧情/碰撞、教程逻辑

---

## 五、验收标准

- ✅ 大门可见像素风双扇木门（非纯色矩形），开门时随物理墙同步销毁
- ✅ 生活杂物 ≥13 类、小鸟 1 只、夜间门灯 2 盏（白天 0）
- ✅ 所有装饰避开交互点 / 夏雅站位 / 出口 / 碰撞
- ✅ 教程流程零破坏：probe-gate-skip 9/9、bug035 6/6、locked-tools 5/5、mobile-tutorial 全流程绿
- ✅ `tsc` 0 错 + probe-gate-visual 12/12 + 无页面错误/无 404
- ✅ 存档/剧情/碰撞零改动

---

## 六、不做（红线）

❌ 换 TileSet / 改 gate.json / 重做地图
❌ 触碰 gateWall 物理创建/销毁顺序、夏雅 NPC、教程步骤
❌ 新增玩法系统 / 新地图 / 大规模新素材
❌ 修改存档结构、剧情文本

---

## 八、给施工 AI 的一句话

> 在 gate 场景叠加纯视觉 Overlay：`createGateDoorVisual` 双扇木门（随 gateWall 销毁）+ `setupGateDecorations` 生活杂物/小鸟/夜间门灯（零资源 Graphics，坐标已核对避开交互点）。gateWall 物理与教程逻辑一行不改；补 probe-gate-visual 探针并回归 4 个既有教程探针（修复其开场「音量提示」交互推进与时序）。

---

## 九、补丁：gate/town 剩余 emoji 像素化（Alpha 审查 P0 #1/#2，同日完成）

**背景**：Alpha 玩家流程审查（2026-08-07）确认 gate 场景仍有 10 个可见 emoji 装饰（🏠🪵×2🌾×3🏮×2📮🪣）+ 🔒 门锁 + town 1 个 🏠，判定 P0 出戏点——本次升级只叠加像素装饰、未移除旧 emoji，出现「像素努力 + emoji 露馅」混搭。

**处置（制作人拍板：像素替换）**：

- `createGateInteractables()`：10 个 emoji → Graphics 像素绘制（坐标/深度/文案不变）：
  - 🏠 → 像素木牌（保留「星黎庄园」文字）
  - 🪵×2 → 像素栅栏（横栏+竖桩）
  - 🌾×3 → 像素枯草簇
  - 🏮×2 → 像素红灯笼（夜间光晕由 setupGateDecorations 叠加）
  - 📮 → 像素信封（红封条）
  - 🪣 → 像素陶水壶
- 🔒 门锁 → 金色挂锁（锁体+锁梁+锁孔），画入门视觉 `createGateDoorVisual`，随门一起销毁（原 emoji 无引用、开门后残留问题一并解决）
- town `setupElderHouseHint()`：🏠 → Container（像素木牌 + 小房子图标），**保留引导功能**（elderHouseHint.sprite 字段类型 Text→Container，tryElderHouseHintInteract / clearElderHouseHint 零改动；呼吸动画作用于 Container）
- 不改变 `gateLife` 计数（探针 decor=13 断言不变）

**验收**：probe-gate-visual 新增 A7（gate 无可见 emoji）+ E1-E3（town 无可见 emoji + 村长家引导物仍在），16/16 全绿；gate-skip 9/9、bug035 6/6、locked-tools 5/5、resident-board 25/25、farm-life 19/19 回归全绿；tsc 0 错。
