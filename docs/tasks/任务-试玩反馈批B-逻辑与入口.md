# 任务卡：制作人试玩反馈批 B（逻辑与入口）

> 立项：制作人 2026-08-04（依据根目录《制作人试玩反馈.md》）｜状态：🔄 B1 已完成，B2/B3 待领单｜负责人：待定
> 关联：问题追踪「制作人试玩反馈登记 2026-08-04」

## B1 功能未解锁提示（浇水/其他同理）

- 问题：任务未解锁浇水前，对已播种土地按交互无"没有水壶"提示；其他功能同理
- 目标：教程各阶段前置提示统一（没水壶→"还没有水壶，先完成浇水解锁"；没斧头/没钥匙同理）
- 涉及：`MapScene.ts` 交互层、提示文案
- 验收：新玩家在解锁前操作均得到明确提示；探针覆盖 3 项（水壶/斧头/钥匙）
- **状态：✅ 已完成（2026-08-04）**
  - 锄地：`tryFarmInteractAt` 空地处补 `showDialogueText('还没有锄头，先打开庄园大门吧。')`（原先只有飘字，与浇水/斧头不一致）
  - 水壶：`tryFarmInteractAt` 已播种处已有提示（`还没有水壶，完成播种任务后才能浇水。`）
  - 斧头：`tryChopTree` 无斧头由静默 `return false` 改为明确提示 + 消费交互（BUG-010 静默为防教程期吞交互，树木均沿地图边缘远离农田，无实际冲突）
  - 钥匙：`tryInteract` 大门锁着（gateWall 存在）时按 E 提示——有钥匙引导背包使用 / 无钥匙提示需要钥匙
  - 验证：`node tests/probes/probe-locked-tools.mjs` **5/5**（钥匙无/有、锄头、水壶、斧头）+ tsc 0 错 + build ✅ + 回归 test-tutorial / test-woodcutting / probe-guide-dialogue / probe-note-vs-woodcut / probe-mobile-tutorial / probe-bug035 / probe-farm-restore 全绿
  - 影响存档：无（纯交互提示文案）

## B2 返回标题入口迁移

- 问题：返回标题不应在背包页，应在 ESC / 移动端菜单 / 返回键触发的菜单
- 目标：背包移除「返回标题」→ 新增 ESC 菜单（桌面）+ 移动端菜单入口；顺带修 `location.reload()` 清档风险（方案 A：显式 save + scene.start('title')）
- 涉及：`BackpackPanel.ts`、`MapScene.ts`、`AndroidBackHandler.ts`、菜单 UI
- 验收：背包无返回标题；桌面 ESC/移动端菜单可返回标题且存档保留；探针同步

## B3 森林场景改名「后山」

- 目标：场景显示名 森林 → 后山（scene key 兼容，不破坏存档/探针）
- 涉及：场景标题/UI 文案、HUD 提示、相关文档
- 验收：游戏内无"森林"残留（指代该场景处）；探针同步

## 红线

- 不动存档结构 / gid 语义 / 剧情文本；探针同步；改动即提交
