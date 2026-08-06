# 会话交接（2026-08-07 03:24 重开对话框）

> 用途：新会话直接读本文件即可接上当前工作，不用重翻历史。

---

## 一、正在做的事（最高优先级，等你拍板）

**任务：用 gpt-image 接口为《归星物语》生成农场 tileset**（OGA 素材方案已放弃——Cozy Farm 要 $4.99、Grassy 下到的是预览缩略图、itch.io 有 Cloudflare 反爬下载不了）。

**已完成**：
1. gpt-image-2（走 `tools/.env` 里的 09api 中转站，Key 明文）单次出 1024×768 的 8 段 tileset（草/土/石墙/水/农田/木地板/石路/花丛），**$0.11/张**
2. ffmpeg 裁 8 个 16×16 区域 + **自写 `tools/concat_tiles.mjs`**（零依赖 PNG 拼合器，可复用）拼合为 128×16 tileset
3. 已替换 `public/assets/tiles/farm_tileset.png`（旧版备份在 `farm_tileset_orig.png`），横屏截图验证：**流程跑通**，地面已换 GPT 出图，NPC/UI 完好

**问题**：AI 渲染时每个 32×32 块内像素不均匀，裁中心 16×16 出来的瓦片有"渐变感"、不够纯净（理想是每瓦片一色为主）。

### ⏳ 待你拍板（三选一，我建议 A→B）
- **A**：精细化——重做 concat_tiles 工具，从 32×32 块内**主色取样**生成纯净瓦片，重新截图对比（约 5 分钟）
- **B**：直接推进——用同样流程跑 town/forest/mine/gate/house 5 个场景，全套升级（$0.66 全包）
- **C**：回退——`cp public/assets/tiles/farm_tileset_orig.png public/assets/tiles/farm_tileset.png` 恢复占位

---

## 二、项目关键事实（新会话必读）

- **平台：横屏优先，暂不碰竖屏**（2026-08-07 制作人澄清；之前按竖屏评估全错）
- 游戏：Phaser 3 + TS，16×16 像素网格（Tiled，Ground/Walls 双层），手机横屏，温暖治愈类星露谷+米哈游
- **配音一律优先 MiniMax**（制作人拍板，VoxCPM 仅离线备选）；夏雅声线 female-shaonv-jingpin 已定案
- **执行顺序**：T2（E-07/E-08 体验债务）→ T3（夏雅/老张/小梅 3 情感事件）→ T3.5（商店老板）→ T4（Demo 回归）
- **冻结**：好感系统/新地图/战斗/大型农业扩展
- **Git 红线**：提交统一由 opencode 或制作人执行，其余 agent 只改代码不 git add/commit；不 `git add -A`
- 详见 `AGENTS.md` + `.workbuddy/memory/MEMORY.md`（轮子清单）

## 三、可复用工具（本轮新增）

| 工具 | 用途 |
|---|---|
| `tools/gpt-bridge.mjs` | 网页版 ChatGPT 传话（决策顾问），`--ask-file xxx` 发长文，自动带上轮回复上下文；登录态在 `.gpt-bridge-profile/`（Chrome） |
| `tools/gpt_image_gen.mjs` | gpt-image 出图（带批准门禁），Key 在 `tools/.env`，走 09api 中转站 |
| `tools/concat_tiles.mjs` | 零依赖 PNG 拼合（tileset 拼接用） |
| `tools/gen_farm_tileset.py` 等 | 程序化占位 tileset 生成（可回退基线） |

## 四、本轮审查/分析结论（供参考）

- **美术资源审查**（docs/reports/美术资源审查报告-2026-08-07.md）：最大短板=林澈精灵仍是旧形象（任务卡未完成）+ AI 立绘与像素世界割裂
- **OGA 素材采购**（docs/tasks/OGA素材淘货清单.md v0.2）：CC0 优先、LPC 降级原型参考；Cozy Farm 需付费已放弃
- **GPT 顾问意见**（已存 tmp/gpt-reply-*）：CC-BY-SA 不进商业核心；先做 16×16 视觉样板场景；接入三坑=视觉密度/GID 映射/颜色体系

## 五、交接后首个动作

等你拍板 A/B/C → 若 A：升级 concat_tiles.mjs 为主色取样 → 重截图对比 → 确认后 B 批量套 6 场景 → 探针回归（probe-farm-restore / probe-town-life / tsc）→ 提交（由制作人/opencode 执行）。
