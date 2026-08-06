# FEATURE-037 归星岛复兴系统详细任务卡 v0.10

> 状态：📋 施工中（本卡为**制作决策版定稿**，替代早期任务卡）
> 制作人 2026-08-06 拍板：6 项决策（物品/数值/矿石/对白/存档/天气）+ 范围冻结
> ⚠️ 施工线注意：**决策 5（worldRestore 独立存档）变更了当前实现方向**——已按 farm.restore 扩展的部分需调整（见 §4）

---

## 〇、一句话验收标准（硬指标）

> **新玩家进入归星岛，半小时内完成一次修复，看见一个地方从荒废变得温暖，并因此认识一个居民。**

---

## 1. 数据结构

### 1.1 建设点配置（FarmRestore.ts）

```ts
export type RestoreKey = 'oldHouse' | 'garden' | 'forestRoad';

interface RestoreProject {
  id: RestoreKey;
  name: string;          // 老屋修复 / 花园恢复 / 后山道路修复
  requirements?: { wood?: number; stone?: number; gold?: number; crops?: number };
}
```

### 1.2 Demo 数值（按"3 天内可达"倒推，施工可微调）

| 建设点 | 木材 | 石头 | 金币 | 作物 | 备注 |
|---|---|---|---|---|---|
| 老屋修复 | 15 | 10 | 300 | — | 演出重点：爷爷的屋子重新亮灯 |
| 花园恢复 | 10 | — | 100 | 3 | 第二阶段（清理流之后），"少量作物"= 现有 4 作物任意 |
| 后山道路修复 | — | 20 | 200 | — | 森林区域变化 |

### 1.3 物品：作物 = 食物（v0.10 不新增食物系统）

`CropType`（radish/tomato/corn/strawberry）直接具备 `category: 'food'`：

```ts
// FarmState.ts CropDef 增加
category: 'food';
```

需求"食物×5" → 玩家提交萝卜×5 等任意作物即可。**不新增** 苹果/面包/料理/食材。

### 1.4 花种：v0.10 移除

花园恢复的重点是"让荒废的地方重新有生命"，不是种花。花种系统 v0.10 后再说。

---

## 2. 文件修改范围

| 文件 | 改动 |
|---|---|
| `src/data/FarmRestore.ts` | RESTORE_KEYS 3 个；RestoreProject 配置；**序列化改为 worldRestore**（见 §4） |
| `src/systems/SaveSystem.ts` | SaveData 新增 `worldRestore`（可选字段）；save/apply/sanitize 三处；**旧档迁移**（见 §4） |
| `src/scenes/MapScene.ts` | 建设点交互（检查/扣除/标记/视觉切换）；地图读取 worldRestore 显示恢复后状态；已开工部分按新结构调整 |
| `src/data/FarmState.ts` | CropDef 增加 `category: 'food'` |
| `src/systems/StorySystem.ts` | **统一对白批次** `environment_restore_v010`（见 §3） |
| `src/systems/AmbienceSystem.ts` | 雨天环境音（BUG-048 降级后范围） |

**不新建** IslandRestoreSystem / 新存档模块（沿用 FarmRestore + SaveSystem）。

---

## 3. 事件触发 + 统一对白批次

### 3.1 建设交互流程

```
靠近建设点 → 按 E → 检查 worldRestore[id]
  ├─ 未完成：检查背包（wood/stone/gold/crops）
  │    ├─ 足够 → 扣除 → worldRestore[id]='restored' → 存档
  │    │        → 地图视觉切换（tile/装饰替换）→ 归星记录标签 → 触发对白
  │    └─ 不足 → 提示缺什么（复用资源不足提示模式）
  └─ 已完成：显示恢复后状态/对白变体
```

### 3.2 统一对白批次 `story/environment_restore_v010`（集中一次施工）

**禁止** 037/048/038 各自往 StorySystem 塞对白。以下文案为方向稿，最终过制作人定稿：

| 建设点 | NPC | 文案方向 |
|---|---|---|
| 老屋 | 村长 | "你爷爷以前每天都会擦这里。" |
| 花园 | 小梅 | "奇怪，我以为这里再也不会开花了。" |
| 道路 | 老张 | "以前这条路通向整个岛。" |

一次持有 StorySystem（单写者制），探针同步一次。

---

## 4. 存档迁移（决策 5：独立 worldRestore）

**不塞进 farm.restore**（避免变成垃圾桶；未来住宅/道路/花园/矿洞都是世界状态）。

### 新结构

```ts
// SaveData 顶层新增（可选字段）
worldRestore: {
  oldHouse?: 'restored';
  garden?: 'restored';      // 沿用现有 garden key（与 M1-3 一致，避免语义混乱）
  forestRoad?: 'restored';
}
```

### 迁移规则（旧档兼容）

1. 读取时：`worldRestore` 存在 → 优先使用
2. 旧档仅有 `farm.restore`（M1-3 garden）→ **迁移**：`worldRestore.garden = farm.restore.garden` 同值写入（一次性），并保留 farm.restore 不回退
3. 两者都无 → 全部未恢复
4. **版本号不递增**（沿用可选字段惯例）

### ⚠️ 施工线调整点

- 已实现的 `RESTORE_KEYS` 扩展保留（key 命名不变）
- **序列化方向调整**：从 `SaveData.farm.restore` 扩展改为顶层 `SaveData.worldRestore` + 迁移逻辑
- probe-restore-037 同步改为验证 worldRestore + 旧档迁移

---

## 5. 验收 probe（probe-restore-037 按此更新）

- [ ] **worldRestore 持久化**：完成建设 → 存档 → 重进保留
- [ ] **旧档迁移**：仅有 farm.restore.garden 的旧档 → worldRestore.garden 迁移成功，花园状态保留
- [ ] **三建设点**：交互/扣除/完成/地图视觉切换正确
- [ ] **数值可达**：模拟 3 游戏日内可完成 ≥1 个建设点（硬指标）
- [ ] **物品 food**：4 作物 category=food，需求"食物"可用任意作物交付
- [ ] **对白批次**：3 条各触发一次，不重复
- [ ] **FEATURE-036 回归**：花园恢复 → 旧机器人获取链不破坏
- [ ] tsc 0 错

---

## 6. 关联范围冻结（v0.10 制作决策版）

### 必做

- ✅ FEATURE-037（老屋/花园/道路）
- ✅ SAVE-01 存档兼容（覆盖 worldRestore 迁移）
- ✅ 观星夜（序章情绪收束，在途）
- ✅ E-09 消磨时间（晚上等待建设材料不空）
- ✅ BUG-048 **降级版**：雨天覆盖层 + 雨天音效（不做复杂季节/植物生长变化）

### 延后（v0.10 不做）

❌ 完整天气季节 ｜ ❌ 需求板复杂系统 ｜ ❌ 矿石建设（v0.15+ 星辉矿/观星设备）｜ ❌ 花种 ｜ ❌ 食物系统 ｜ ❌ 制作系统 ｜ ❌ 家具

### 矿石定位（决策 3）

v0.10 矿石 = **经济出口**（保持现状）；稀有矿/星辉矿 v0.15+ 再引入。
