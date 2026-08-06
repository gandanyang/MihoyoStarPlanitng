# 《归星物语》项目长期记忆

> 用途：跨会话持久的工作约定与"轮子清单"。每次开工先看这里 + `docs/AI开发前必读.md` + `docs/开发约束与架构入口.md`。

## 核心工作规范（用户明确要求：避免反复造轮子）

**任何新需求动手前，必须先做"已有系统检查"，确认复用方案后再编码。**
门禁三件套（每次任务开始必读）：
1. `docs/AI开发前必读.md`（门禁）
2. `docs/开发约束与架构入口.md`（架构入口 + 新增系统检查清单）
3. 对应任务卡（`docs/tasks/…`）

**禁止事项（重复造轮子的红线）**：
- 禁止新建第二个 SaveManager / EventManager / QuestTrigger
- 禁止 Scene 里直接 localStorage/global 存永久状态（一律收口 SaveSystem）
- 禁止为单个 NPC 建独立管理器
- 禁止无任务要求的行为不变重构
- 禁止只判断条件不记录"已触发"（必须 `EventManager.triggerOnce(id, fn)`）

## 轮子清单（已有资产，直接复用不要重造）

### 系统层（src/systems 与 data）
| 能力 | 入口 | 说明 |
|---|---|---|
| 存档 | `SaveSystem.ts` | 唯一持久状态入口（player/world/farm/story/mapFlags/album/gameState） |
| 一次性事件 | `EventManager.ts` | triggerOnce/hasTriggered/存档恢复——剧情/相簿解锁/记忆卡/彩蛋/支线必用它 |
| 剧情 | `StorySystem.ts` | 主线步骤 + 对白数据（**冻结区：单写者制，只读导入**） |
| 主线任务 | `QuestSystem.ts` | 星之碎片状态机 |
| 每日任务 | `DailyQuestSystem.ts` | 随机任务池 + 红点 |
| 相簿解锁 | `data/PhotoAlbum.ts` | unlockPhoto 幂等 + album 存档（v0.1 已含 5 张：花园/矿灯/后山/夏雅院/村长星空） |
| 世界恢复 | `data/FarmRestore.ts` | 花园/老屋/道路恢复状态 |
| NPC | `NPCSystem.ts` | NPC 作息/站位/每日台词池 |
| 环境音 | `AmbienceSystem.ts` | 昼夜/雨天环境音 |
| 音乐 | `audio/MusicSystem.ts` | BGM（title/farm_day/stargaze，Web Audio + antiIDM） |
| 语音 | `audio/VoiceBank.ts` | 台词→voice_normalized/ 映射（无回退） |
| Debug | `main.ts` 的 `window.debug` | 测试钩子（探针驱动状态用，**绕过 Vite dev 双模块问题**） |

### UI 层（src/ui）
- 面板模式统一：模块级单例 + `panelFadeIn/panelFadeOut`（dom-anim.ts）——Backpack/Shop/Quest/Ending/PhotoAlbum/DialogueHistory 同模式
- 对白：`StoryDialogue.ts`（打字机/立绘/选项/skip/剧情回顾冻结）
- 记忆闪回：`MemoryFlashback.ts`（overlay）+ `data/MemoryFlashbacks.ts`（数据）
- 记忆卡飘字：`MemoryMoment.ts`

### 工具脚本（tools/，50+ 个，先查再写）
- 语音：`gen_voice.py`/`gen_mainline_voice.py`/`gen_xiya_minimax.py`/`minimax_tts.ts`/`fish_tts.ts`/`normalize_audio.py`/`trim_voice_leads.py`/`check_voicebank_match.py`
- 出图：`gen_portrait_comfy.py`/`gpt_image_gen.mjs`（gpt-image）/`_tmp_comfyui.mjs`（ComfyUI 文生图）
- 音频处理：`compress_audio.py`/`check_f0.py`
- 地图/资源生成：`gen_*_tileset.py`/`gen_map_assets.py`/`gen_crops.py` 等
- 打包：`build_apk.py`/`install_apk.py`
- **GPT 请示桥**：`tools/gpt-bridge.mjs`（网页版 ChatGPT 传话，制作人决策顾问；用法见 `docs/工具-GPT请示桥.md`；登录态复用 Chrome 独立 profile `.gpt-bridge-profile/`）
- 手册：`docs/APK一键打包操作手册.md`/`MiniMax语音生成工具手册.md`/`VoxCPM语音生成一键调用手册.md`

### 探针（tests/probes/，每个功能有验收探针，先查再写）
- 主线：probe-ch1-walkthrough / probe-stargaze / probe-prologue-walkthrough
- 相簿：probe-photo-album（**数据驱动 + window.debug 挂钩**）
- 对话：probe-dialogue-history / probe-bug039-voice-sync / probe-voice / probe-skip-debounce
- 系统：probe-sell-all / probe-farm-restore / probe-daily-event / probe-npc-* / probe-music-restore / probe-weather-048

## 项目协作约定
- 多 AI 会话并发（WorkBuddy/TRAE/Codex）：**同仓库 git 写操作注意协调**；发现对象损坏立即停手报告，不自行 gc（见 docs/incidents/事故记录-git对象库损坏与并发操作-2026-08-06.md）
- 工作区他人改动（支线试点/语音线等）不擅自提交，提交前确认归属
- 宣发图输出 `public/assets/images/promo/`；相簿图 `public/assets/photos/album/`（webp ≤1280）

## 制作人拍板（2026-08-06 晚）

- **配音规则（最高优先级）**：以后所有角色/剧情配音**一律优先走 MiniMax 管线**（T2A v2），VoxCPM 仅作离线备选。当前仅夏雅有定案 voice_id（female-shaonv-jingpin）；其他角色用 MiniMax 前需先选音色定案。新台词接入：加 gen_mainline_voice.py 的 T 列表 → 夏雅走 gen_xiya_minimax.py，**其他角色后续也切 MiniMax**（音色定案后）。
- **执行顺序**：T2（E-07/E-08 体验债务）→ T3（夏雅整理旧照片/老张矿灯/小梅花，3 个情感事件，商店老板放 T3.5）→ T3.5（商店老板"镇子热闹了"）→ T4（完整 Demo 回归）
- **T2 红线**：只做 Day1 引导链（清理→播种→成长→收获→出售→资源→修复）+ 村长/夏雅两个关键对白 + 出售反馈世界化；❌ 禁新货币/新建筑/新任务链/新UI/新经济公式，全部复用。
- **冻结**：好感系统、新地图、战斗、大型农业扩展。
- **T2 开工门禁**：先输出「现有种田流程涉及文件清单 + 修改计划」，禁止直接开写。
- **Demo 验收标准**：首次玩家 30 分钟内应获得——一次星空体验、一次农业循环、一次 NPC 情感反馈、一次世界变化。
- **EventManager**：不再扩接口，新内容只做消费方。

## 项目平台事实（2026-08-07 制作人澄清）
- **横屏优先，暂不碰竖屏**：标题画面有"请旋转设备横屏游玩"提示，iOS 横屏 Home Indicator 安全区已适配；竖屏适配（BUG-007）明确延后到横屏稳定后。所有截图/验证用横屏视口（1024×768 级别）。
