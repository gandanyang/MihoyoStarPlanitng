# 关系记录系统 Phase 1 实施方案（v0.7 立项）

> 作者：Codex ｜ 日期：2026-08-04 ｜ 状态：📋 方案（待 OpenCode 施工）
> 依据：docs/design/NPC好感系统规划-v0.1.md（定稿方向）+ 顶层设计 §D4
> 目标：**先做"人与人的连接"，不做"养角色"**——最小闭环：数据 + 存档 + 每日聊天 + 阶段 + 一个夏雅测试事件

---

## 1. 数据层

### 1.1 NPCRelation 结构

```ts
interface NPCRelation {
  npcId: string;
  affinity: number;        // 内部数值 0~100，不展示
  stage: number;           // 0 相识 / 1 熟悉 / 2 理解 / 3 羁绊（由 affinity 派生或显式）
  lastTalkDay: number;     // 上次聊天天数（每日 +1 上限用）
  memories: string[];      // 已解锁记忆（真正的奖励）
  unlockedEvents: string[]; // 已触发个人事件
}
```

### 1.2 存档（SaveSystem 新增可选字段）

```ts
// save/apply/sanitize 三处
relations?: Record<string, NPCRelation>;  // 可选字段，旧档无此字段正常运行
```

- 旧档兼容：无 `relations` → 默认空记录（或按 NPC 列表初始化相识）
- 边界保护：sanitize 数值范围钳制（affinity 0~100，stage 0~3）

## 2. 增长规则

| 来源 | 规则 | 定位 |
|---|---|---|
| 每日首次聊天 | affinity +1，**上限 1/天**（用 `lastTalkDay` 防刷） | 维持关系 |
| 事件/共同经历 | 解锁 **memories**（奖励=记忆）+ 可选 affinity 上调（内部） | 最高价值 |

- **不做**礼物系统 / 每日签到感（连续聊天不额外增长）

## 3. 阶段与展示

- 阶段阈值：0-29 相识 / 30-59 熟悉 / 60-89 理解 / 90+ 羁绊
- **玩家只看到阶段名 + 记忆，不显示数值**
- 展示文案示例：
  - 熟悉："她开始愿意和你聊起小时候的事情。"
  - 理解："她愿意带你去一些只有她知道的地方。"
  - 羁绊："你们已经是可以一起看星空的人了。"（≠恋爱，全 NPC 通用）

## 4. 对白分支挂点

- 在 NPCSystem / 现有对话入口按 `getRelation(npcId).stage` 选择对白变体：

```ts
const r = getRelation(npcId);
const dialogue = r.stage >= 2 ? getStageDialogue(npcId, r.stage) : getBaseDialogue(npcId);
```

- 不新建重复对话系统：复用 StoryDialogue / NPCSystem 现有对白数据，按阶段追加变体
- 触发聊天 +1 的挂点：现有 NPC 对话（tryInteract NPC 分支）

## 5. 夏雅测试事件（Phase 1 验收锚点）

**「夏雅小时候来过这里」记忆解锁**

- 触发：夏雅 stage ≥ 1（熟悉，affinity ≥ 30）+ 傍晚时段（18-20 时）+ 农场靠近夏雅
- 对白（与夏雅圣经 v1.3 关系曲线 30 节点一致）：

```
夏雅：其实……我小时候也来过这里。
林澈：你认识爷爷的时候？
夏雅：嗯。那时候庄园还没荒。……总觉得有一天会有人回来，重新让它亮起来。
```

- 解锁：`memories: ['xiya_childhood']`
- 一次性（unlockedEvents 防重复）

## 6. 探针与验证

- 新增 `probe-relation-phase1.mjs`：
  1. 存档持久化：聊天后 relations 写入，刷新重进保留
  2. 旧档兼容：无 relations 字段存档正常加载
  3. 每日上限：同日多次聊天只 +1
  4. 阶段派生：affinity 30 → stage=1
  5. 夏雅事件：触发一次、记忆解锁、防重复
- 回归：tsc + test-tutorial + probe-mobile-tutorial（对话入口改动）

## 7. 实施文件

- `src/systems/RelationSystem.ts`（新增，模块级单例 + getRelation/addAffinity/unlockMemory）
- `src/systems/SaveSystem.ts`（relations 可选字段三处）
- `src/systems/NPCSystem.ts` / `src/scenes/MapScene.ts`（对话挂点 + 每日 +1）
- `src/systems/StorySystem.ts`（夏雅测试事件对白）
- `tests/probes/probe-relation-phase1.mjs`

## 8. 红线

- ❌ 不加入：礼物系统 / 恋爱 / 结婚 / NPC 自由 AI / 多 NPC 关系网
- ✅ 存档仅新增可选 `relations` 字段（制作人已拍板）
- ✅ 旧档兼容、不改变现有对话流程（阶段变体为追加非替换）
