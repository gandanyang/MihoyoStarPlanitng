# 任务卡：FEATURE-041 复兴循环 v0.11（复兴度派生 + 木匠回归 + 常驻 NPC）

> 立项：制作人 2026-08-07（AskUserQuestion 四项拍板 + 木匠设定/贴图顺序/日程简化补充拍板）｜状态：📋 待施工（贴图优先，代码后接）
> 依据：`docs/design/岛屿复兴循环系统设计方案-v0.1.md`、`docs/design/归星岛复兴循环-v0.10.md`、`docs/design/核心设计原则-世界复兴循环-v0.1.md`
> 关联：FEATURE-037（worldRestore 建设点）、FEATURE-038（居民需求板）、day2 清晨剧情（FIRST_MORNING_RESPONSE_DIALOGUE）
> 目标：让玩家第一次完整感受到「我的建设让岛上重新有了人」——复兴度作为隐藏世界状态，木匠回归作为 Lv1 的正面回答。**木匠不是功能 NPC，而是"这个岛开始有人回来工作了"的第一个具体执行者。**

---

## 〇、一句话验收标准

> 新玩家修复老屋（oldHouse）后，次日回到农场，看见岛上来了一个木匠，他说「没想到这里还有人在修」。归星记录里能看到岛屿恢复的痕迹。

---

## 一、制作人拍板（2026-08-07 AskUserQuestion）

| # | 决策点 | 拍板结果 |
|---|--------|----------|
| 1 | 施工范围 | **轻量**：复兴度隐藏变量 + 木匠回归事件 + 常驻 NPC。不做房屋升级/家具制作等新玩法 |
| 2 | 木匠贴图 | **走美术管线生成**（32×32 像素风 npc_carpenter.png，风格对齐现有 NPC 贴图） |
| 3 | 复兴度可见性 | **隐藏变量**：不显示数值条，通过木匠回归 / NPC 对话 / 归星记录体现 |
| 4 | 回归触发时机 | **oldHouse 修复完成当晚/次日进入 farm 触发**：老屋完成瞬间的对白先由村长承接；木匠回归演出放次日（睡醒后）进 farm 时 |
| 5 | 木匠设定 | 「木匠老周」保留；**不做传统老木匠爷爷模板**。定位=青禾镇留下来的手艺人，不善言辞但可靠的人；角色结构上木匠=重建行动的第一个具体执行者（非建筑功能位） |
| 6 | 贴图顺序 | **美术优先**：先生成 `npc_carpenter.png` → 确认尺寸/风格 → 再接入 NPCSystem。禁止代码先占位（避免 placeholder 导致返工） |
| 7 | 日程简化 | **Alpha 阶段木匠不做复杂日程**：farm 白天老屋附近 / town 白天村口·工作点 / 夜晚回住所；甚至固定点驻留即可。不扩复杂房屋升级玩法，仅承担「复兴循环第一次反馈」的剧情 + 常驻功能 |

---

## 二、复兴度（隐藏世界状态，不新建存档字段）

### 2.1 派生规则（纯函数，由 `worldRestore` + 主线状态派生）

设计方案 v0.1 §二 定义 Lv0-4；Codex 核对（v1.0 总纲 §2.2）复兴度可由 FEATURE-037 `worldRestore` 直接派生，**不新建存档字段**。

```ts
// src/data/FarmRestore.ts 新增
export type RevivalLevel = 0 | 1 | 2;

export function getRevivalLevel(): RevivalLevel {
  const garden = isRestored('garden');
  const oldHouse = isRestored('oldHouse');
  const forestRoad = isRestored('forestRoad');
  if (garden && oldHouse) return 1;   // Lv1 初步恢复：农场 + 房屋可住
  if (garden && oldHouse && forestRoad) return 2;  // Lv2 小型社区：多区域恢复
  return 0;                            // Lv0 荒废
}
```

> ⚠️ 优先级顺序：`garden && oldHouse` 先判定 Lv1，再判断 forestRoad 是否同时满足 → 否则三段全部满足时应返回 2 而非 1。Lv3/Lv4 预留（不实现）。
> 主线状态（第一章完成）作为可选软性前置：本卡**不依赖** `getQuestState() === 'completed'`——oldHouse 修复本身就是「第一章后半」，避免木匠回归被主线状态机卡死（红线：不与 v0.10 制作决策版冲突）。

### 2.2 复兴度用途（本卡范围）

- 木匠回归条件判定：`getRevivalLevel() >= 1`
- 归星记录体现（§四）
- 不新增 UI / 数值 / 存档字段

---

## 三、木匠 NPC 回归

### 3.1 角色定位

| 项 | 内容 |
|----|------|
| id | `carpenter` |
| 名字 | 木匠老周 |
| 贴图 | `npc_carpenter.png`（32×32，美术管线生成，风格对齐 npc_miner/npc_gardener） |
| 名字色 | 木质暖色 `#c89860`（候选，与 miner #d8a050 区分） |
| 定位 | **青禾镇留下来的手艺人，不善言辞但可靠的人**。不是功能按钮、不是老木匠爷爷模板 |
| 角色结构 | 林澈=回归者/寻找归属；夏雅=记忆守护者；村长=社区秩序；**木匠=重建行动的第一个具体执行者**——"这个岛开始有人回来工作了" |
| 视觉方向（制作人拍板） | 40~50 岁男性；深棕短发/略有白发；棕色工作围裙；工具腰包；木屑痕迹；温和但沉默。**不要**白胡子老人 / 大斧头伐木工 / 欧美木匠形象。关键词："乡镇手艺人，不是冒险家" |

### 3.2 回归机制（核心）

```
oldHouse 修复完成（当日）
  ↓ tryOldHouseRestoreInteract() 完成时
  ↓ triggerTag('restore_oldhouse')  → 归星记录标签
  ↓ 村长老屋对白照常（已有 OLD_HOUSE_RESTORED_DIALOGUE，不打断）
  ↓
次日/当晚进入 farm（睡醒后 tryFirstMorningSequence 同框架）
  ↓ 判定：getRevivalLevel() >= 1 && triggerOnce('carpenter_returned') 未触发
  ↓ 木匠回归演出：木匠出现在老屋旁（farm 场景），自动播放 CARPENTER_RETURN_DIALOGUE
  ↓ 对白结束 → 木匠成为常驻 NPC（此后按 NPCSystem 日程出现在各场景）
  ↓ 存档（含 triggerOnce 状态）
```

**关键判定隔离**：
- `triggerOnce('carpenter_returned')`（EventManager，随存档持久化）→ 刷新/重进/跨天不重复
- 木匠**未回归前**不参与 NPCSystem 常驻渲染（§3.3）——只有回归后才是"有这个人"
- 与 day2 清晨剧情（`tryFirstMorningSequence`）互不干扰：两者判重隔离，可先后触发

### 3.3 常驻 NPC 注册（NPCSystem.ts）

现有 `npcs` 数组为固定 6 人 + 固定日程。木匠需**条件性注册**：

```ts
// NPCSystem.ts
// 木匠：回归前不渲染（isNpcFindable 返回 false / getNPCsForScene 不包含）
export function isCarpenterReturned(): boolean {
  return getRevivalLevel() >= 1 && EventManager.hasTriggered('carpenter_returned');
}
```

接入点（保持最小改动）：
- `getNPCsForScene(sceneKey)`：木匠加入过滤——`if (npc.id === 'carpenter' && !isCarpenterReturned()) return false;`
- `isNpcFindable('carpenter')`：未回归 → false
- SPOTS：farm/town/forest/mine/elder_house 各加 `carpenter` 站位（避开碰撞/既有站位）
- **buildSchedule('carpenter')（Alpha 简化版，制作人拍板）**：
  - `06:00 家（home，不渲染）→ 08:00 farm（老屋附近，action 'sort_wood' 复用整理动作）→ 18:00 家`
  - 可选加法：`14:00 town（村口/工作点）→ 18:00 家`——若想体现"白天在镇上干活"再启用，不强制
  - 不引入复杂多时段作息，避免为"完整 NPC 系统"提前扩大范围
- 贴图加载：MapScene preload 加 `if (!this.textures.exists('npc_carpenter')) this.load.image('npc_carpenter', 'assets/sprites/npc_carpenter.png');`

> ⚠️ 既有 6 NPC 的日程/站位**全部不动**；仅新增一个条件性 NPC，避免影响现有 npc-schedule 探针。

### 3.4 对话

- **回归对白** `CARPENTER_RETURN_DIALOGUE`（StorySystem.ts）：方向稿见下，**待制作人定稿**（剧情权限：Agent 不自行扩写）
- **常驻对白** `CARPENTER_DIALOGUES`（NPCSystem.ts）：靠近 E 播放；每日随机句池 `NPC_DAILY_LINES.carpenter`

> 配音：本卡不含（回归事件配音需独立批次 + 试听流程，AGENTS 语音交付规则）。

---

## 四、归星记录体现

- `GuiXingTag` 新增 `'restore_oldhouse'`（老屋修复完成时 triggerTag）——归星记录叙事使用
- 复兴度在 `generateGuiXingRecord()` 中作为**隐藏影响因子**（不显示数值，仅当玩家完成建设时，通过既有 restore_garden 等标签叙事体现"岛在恢复"）
- 木匠回归本身不额外加标签（避免记录过于碎片）

> 归星记录叙事文案 = 制作人定稿，Agent 不得自行扩写（GuiXingRecordSystem 约束）。

---

## 五、文件修改范围（最小改动）

| 文件 | 改动 |
|------|------|
| `src/data/FarmRestore.ts` | 新增 `RevivalLevel` + `getRevivalLevel()`（纯函数） |
| `src/systems/NPCSystem.ts` | 木匠 NPC 注册（条件性）+ SPOTS 站位 + buildSchedule + 常驻对白 + 每日随机句 |
| `src/scenes/MapScene.ts` | preload 木匠贴图；oldHouse 完成处 `triggerTag('restore_oldhouse')`；次日 farm 回归演出（`tryCarpenterReturn` 参照 day2 清晨框架） |
| `src/systems/StorySystem.ts` | 新增 `CARPENTER_RETURN_DIALOGUE`（方向稿，待定稿） |
| `src/systems/GuiXingRecordSystem.ts` | `GuiXingTag` 新增 `'restore_oldhouse'`（仅类型 + 若叙事引用） |
| `public/assets/sprites/npc_carpenter.png` | 美术管线生成 |
| `tests/probes/probe-revival-v011.mjs` | 新增验收探针 |
| 本任务卡 | — |

**不新建**：复兴度存档字段（复用 worldRestore）、复兴度系统文件（并入 FarmRestore）、新玩法系统（房屋升级/家具）。

---

## 六、验收探针（probe-revival-v011.mjs）

- [ ] **复兴度派生**：garden+oldHouse 已恢复 → Lv1；三建设点全恢复 → Lv2；全未恢复 → Lv0
- [ ] **无新存档字段**：save 顶层无 revival 字段，worldRestore 结构不变
- [ ] **木匠未回归**：getNPCsForScene 不含 carpenter；isNpcFindable('carpenter')=false
- [ ] **回归触发**：oldHouse 修复 → 次日进 farm → 自动播 CARPENTER_RETURN_DIALOGUE（文案与定稿一致）
- [ ] **一次性**：刷新/重进/跨天不重复触发（triggerOnce）
- [ ] **回归后常驻**：此后 getNPCsForScene 按日程含 carpenter，靠近可交互，每日随机句正常
- [ ] **既有回归**：probe-farm-restore、probe-npc-schedule、probe-day2-morning、probe-daily-event 不破坏
- [ ] tsc 0 错

---

## 七、红线

- ❌ 不新增存档字段（复兴度由 worldRestore 派生）
- ❌ 不做房屋升级/家具制作/新玩法系统（本卡只做「回归 + 常驻」）
- ❌ 不新增大量 NPC（木匠 = v0.11 唯一新增）
- ❌ 不改动既有 6 NPC 的日程/站位
- ❌ 回归对白与归星记录叙事文案**不得自行扩写**，等制作人定稿
- ❌ 木匠配音不在本卡范围（走独立语音流程 + 试听门禁）
- ❌ 不与 v0.10 制作决策版冲突（FEATURE-037/038 已提交内容不触碰）

---

## 八、施工顺序（制作人拍板：美术优先）

### Step 1 美术（前置门禁）
产出 `public/assets/sprites/npc_carpenter.png`：
- 16px 像素风、四方向（对齐现有 NPC 贴图规格）
- 棕色/暖色系，可识别木匠身份
- 先出图确认角色方向（尺寸/风格一致）→ 再进入 Step 2

### Step 2 代码接入（顺序）
```
oldHouse 修复完成
  → GuiXingRecord tag（restore_oldhouse）
  → 次日 farm 触发回归演出
  → 播放回归对白 CARPENTER_RETURN_DIALOGUE
  → NPCSystem 注册 carpenter（条件性）
  → 日常 schedule 启用（Alpha 简化版）
```

### 已拍板确认（制作人 2026-08-07 原文摘要）
> 木匠设定认可，采用「木匠老周」。定位为青禾镇留下来的手艺人，不做传统冒险木匠，视觉方向为中年乡镇工匠、暖色木工元素。
> 贴图顺序采用"美术优先"：先生成 npc_carpenter.png 并确认尺寸/风格一致，再接入 NPCSystem，避免占位导致返工。
> 补充：Alpha 阶段木匠不扩展复杂房屋升级玩法，仅承担"复兴循环第一次反馈"的剧情与常驻 NPC 功能。

> 待确认（施工前）：回归对白 / 常驻对白 / 每日随机句方向稿定稿（本卡 §三 3.4）。
