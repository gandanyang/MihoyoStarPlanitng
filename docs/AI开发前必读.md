# AI 开发前必读（门禁）

每个任务开始前，先读完下面 3 份再动手：

1. `AGENTS.md`（项目规则）
2. `docs/AI开发前必读.md`（本文件）
3. `docs/开发约束与架构入口.md`（架构入口 + 检查清单）

核心规则（违反了就是返工）：

- **不重复造系统**：动手前先查 `src/systems/`、`src/data/`、`docs/tasks/` 有没有类似的。
- **持久状态只进 `SaveSystem`**（SaveData），禁止 localStorage / scene / global 散落。
- **一次性事件**（剧情 / NPC 事件 / 相簿解锁 / 记忆卡 / 彩蛋 / 支线）一律 `EventManager.triggerOnce`。
- **新增文件前**先输出"已有系统检查：复用方案 / 新增文件 / 修改文件"，确认再写代码。
- **行为不变的重构默认不做**；稳定优先。

已有可直接用的：`SaveSystem` / `EventManager` / `StorySystem` / `QuestSystem` / `DailyQuestSystem` / `PhotoAlbum` / `NPCSystem` / `AmbienceSystem`。
