# 任务卡：FEATURE-037 归星岛初级复兴循环（v0.10）

> 状态：✅ 已实施（2026-08-06）｜ P0，v0.10 主梁
> 立项：制作人 2026-08-06 拍板（模式切换：资源驱动的归星岛复兴）｜ 方案：[归星岛复兴循环-v0.10.md](design/归星岛复兴循环-v0.10.md)

---

## 一、目标

让玩家在 Demo 内体验一次完整闭环：

> **砍树/挖矿/攒金币 → 修复一个地方 → 这个岛真的变好了。**

## 二、实施内容（必须）

### 1. 建设点（扩展 FarmRestore，不新建系统）

`src/data/FarmRestore.ts` 扩展 `RESTORE_KEYS`：

```ts
export const RESTORE_KEYS = ['garden', 'oldHouse', 'forestRoad'] as const;
```

新增建设需求配置（提案值，施工时按日收入量级平衡）：

| key | 名称 | 需求 |
|---|---|---|
| oldHouse | 老屋修复 | 木材×30 + 石头×20 + 金币×100 |
| forestRoad | 后山道路修复 | 石头×50 + 金币×200 |

（`garden` 已有，延续现有清理三阶段；如需资源交付阶段，合并到 garden 流程，不产生第二套状态）

### 2. 建设交互 + 消耗

- 建设点位置交互 → 检查背包资源 → 扣除 → 标记 restored → 存档
- 资源不足时提示缺什么（复用现有未解锁/资源不足提示模式）

### 3. 地图状态变化

- oldHouse 完成：老宅外观变化（视觉/装饰替换，不换 Tilemap）
- forestRoad 完成：森林区域变化（参照 garden 恢复模式）
- 读取 `farm.restore` 状态显示恢复后装饰

### 4. 存档

- 扩展 `farm.restore`（加新 key），可选字段兼容旧档，**版本号不递增**
- 验证：旧档无新 key → 视为未恢复，正常运行

## 三、可选（P1）

- [ ] NPC 反馈对白：老屋完成→爷爷相关/村长；花园延续→小梅；后山道路→阿风
- [ ] 今日推荐种子联动（商店，纯引导）

## 四、不做（红线）

❌ 制作系统 ｜ 家具系统 ｜ 料理系统 ｜ 材料加工链 ｜ 自由装修
❌ 不新建 IslandRestoreSystem（复用 FarmRestore）
❌ 不动主线 QuestSystem 状态机（建设点事件独立于星之碎片主线）

## 五、验收标准

- ✅ tsc 0 错（`npx tsc --noEmit` 通过）
- ✅ 三个建设点可交互、资源扣除正确、完成后地图变化
- ✅ 资源不足提示明确（缺木头/石头/金币）
- ✅ 存档：完成状态持久化，重开保留；旧档兼容
- ✅ 不破坏现有花园恢复（garden）流程与旧机器人获取（FEATURE-036 回归）

## 五·一、验证记录（2026-08-06）

探针 [probe-restore-037.mjs](../../tests/probes/probe-restore-037.mjs) 运行时验证 **38/38 全绿**：

| 步骤 | 验证点 | 结果 |
|---|---|---|
| A1 | oldHouse 初始未恢复、破旧装饰 3 组、资源不足提示缺木头/石头/金币、不扣除不存档 | ✅ |
| A2 | 交付后恢复、装饰销毁、wood 40→10 / stone 30→10 / coins 300→200、存档 restore.oldHouse=true | ✅ |
| A3 | 刷新重进恢复态持久 | ✅ |
| B1-B3 | forestRoad 初始乱土 gid 2、不足提示缺石头、交付后石板路 gid 7 + 花丛 gid 8、stone 70→20 / coins 200→0、存档 restore.forestRoad=true | ✅ |
| B4 | 刷新重进小路/花丛持久 | ✅ |
| C | garden 回归（stage 仍 0、debris 3）+ 老屋恢复态共存 | ✅ |
| D | 无运行时错误 | ✅ |

截图：`tests/probes/test-screenshots/restore037-*.png`（oldhouse / forestroad / farm-all-restored）

### 实施过程要点

- `src/data/FarmRestore.ts`：RESTORE_KEYS 扩展 garden/oldHouse/forestRoad；新增 `requirements` 配置与 `getProjectShortfall()`
- `src/scenes/MapScene.ts`：新增 8 个方法（两套 setup/build/tryInteract）+ tryInteract 两分支；交互成功后补 `g.restored = true` 防重复提示
- 存档零改动自动兼容：`farm.restore` 可选字段，旧档无新 key 视为未恢复
- 探针调试记录：游戏内自动保存会在写档与 reload 之间覆盖 localStorage → 场景切换类断言改用 `gotoScene`（先卸载旧实例再注入存档）；title 进入改用轮询重试 Enter

## 六、关联

- BUG-048 环境循环（独立施工，可共存）
- FEATURE-036 旧机器人（花园恢复触发链，防回归）
- FarmRestore.ts 既有指令"不做多恢复点系统"——**已由制作人 2026-08-06 拍板扩展**（顶层设计 v0.6.6 登记）
