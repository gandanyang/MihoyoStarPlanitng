# 《归星物语》类星露谷 二游 — Web 小游戏 Demo

Phaser 3 + TypeScript + Vite 像素风农场生活 RPG 浏览器游戏。

## 版本

**v0.10 Alpha** — 稳定阶段：第一章小镇剧情 + 观星夜 + 记忆碎片 + 语音系统 + 稳定性修复。目标为 15~30 分钟完整体验 Demo。

> 开发纪律见 `AGENTS.md`；测试规范见 `TEST_RULES.md`；近期改动见 `CHANGELOG.md`。

## 快速开始

```bash
npm install
npm run dev      # 开发服务器（默认 http://localhost:5173）
npm run build    # 生产构建 → dist/
npm run preview  # 本地预览构建产物
```

## 玩法

```
种田 → 浇水 → 收获 → 卖钱 → 买种子 → 再种
          ↓
  完成任务 → 获得经验 → 升级
          ↓
  探索(小镇/森林/矿洞) → 挖矿/砍树/采集 → 每日任务
          ↓
  星之碎片 → 记忆闪回 → 人物羁绊 → 观星夜结局
```

| 操作 | 键位 (PC) | 触屏 (移动端) |
|---|---|---|
| 移动 | WASD / 方向键 | 虚拟摇杆 |
| 交互 | E / 空格 / 回车 | 交互按钮 |
| 砍树 | 靠近树木按 E | 靠近树木点交互按钮 |
| 挖矿 | 靠近矿脉按 E | 靠近矿脉点交互按钮 |
| 背包 | B | 背包按钮 |
| 商店 | 靠近商人按 E | 靠近商人点交互按钮 |
| 切换种子 | R | 切换按钮 |
| 系统菜单 | Esc | Android 物理返回键 |

## 技术栈

| 层 | 技术 |
|---|---|
| 游戏引擎 | Phaser 3.80 |
| 语言 | TypeScript |
| 构建 | Vite |
| 美术 | 程序化像素生成 + AI 立绘 |
| 音频 | Web Audio（BGM/环境音合成 + 语音） |
| 移动端 | Capacitor 8（Android APK 打包） |

## 目录结构

```
src/
├── main.ts                  # 游戏启动入口（注册 9 个场景 + Debug API）
├── config.ts                # 配置
├── scenes/
│   ├── TitleScene.ts        # 标题画面
│   ├── StationScene.ts      # 车站开场（序章）
│   └── MapScene.ts          # 通用地图场景（gate/farm/town/forest/mine/house/elder_house 共用）
├── entities/
│   ├── Player.ts            # 玩家实体
│   └── NPC.ts               # NPC 实体
├── data/
│   ├── FarmState.ts         # 农田状态 + 作物定义
│   ├── FarmPlot.ts          # 农田地块
│   ├── FarmProgress.ts      # 等级经验
│   ├── Economy.ts           # 金币经济
│   ├── Inventory.ts         # 背包
│   ├── TimeSystem.ts        # 时间系统
│   ├── Stamina.ts           # 体力系统
│   ├── MineState.ts         # 矿洞矿脉
│   ├── MemoryFlashbacks.ts  # 星之碎片记忆闪回数据
│   ├── PhotoAlbum.ts        # 相册数据
│   └── exits.ts             # 场景出口
├── systems/
│   ├── SaveSystem.ts        # 存档系统
│   ├── StorySystem.ts       # 剧情系统（序章 + 第一章）
│   ├── QuestSystem.ts       # 主线任务
│   ├── DailyQuestSystem.ts  # 每日任务
│   ├── NPCSystem.ts         # NPC 管理
│   ├── AudioSystem.ts       # 音效系统
│   ├── MusicSystem.ts       # BGM 播放（Web Audio）
│   ├── AmbienceSystem.ts    # 环境音效（场景氛围）
│   ├── WeatherSystem.ts     # 天气系统
│   ├── AutomationSystem.ts  # 庄园机器人自动化
│   ├── DailyEventSystem.ts  # 日常事件
│   ├── IslandReportSystem.ts# 归星岛复兴报告
│   ├── DialogueHistoryManager.ts # 对话历史
│   ├── AndroidBackHandler.ts# Android 物理返回键
│   ├── InputManager.ts      # 键盘输入
│   └── TouchControls.ts     # 触屏控件
├── audio/
│   ├── VoiceBank.ts         # 剧情语音播放（fetch+decodeAudioData）
│   ├── voicebank.data.ts    # 语音映射（脚本生成，勿手改）
│   └── MusicSystem.ts       # BGM 播放
└── ui/
    ├── ShopPanel.ts         # 商店面板
    ├── BackpackPanel.ts     # 背包面板
    ├── QuestPanel.ts        # 任务面板（主线/支线/日常/好感）
    ├── SmartSellPreviewPanel.ts # 智能出售预览
    ├── StoryDialogue.ts     # 全屏剧情对话
    ├── MemoryFlashback.ts   # 记忆闪回沉浸式演出
    ├── MemoryMoment.ts      # 轻量记忆浮层
    ├── DialogueHistoryPanel.ts # 对话历史面板
    ├── EndingPanel.ts       # 结局面板
    ├── PhotoAlbumPanel.ts   # 相册面板
    ├── ConfirmDialog.ts     # 确认弹窗
    ├── WaitPanel.ts         # 消磨时间面板
    └── dom-anim.ts          # DOM 动画辅助

public/assets/              # 素材（地图/瓦片/精灵/立绘/音频）
```

## 语音系统

- 生成：主线语音经 `tools/gen_mainline_voice.py`；夏雅等角色经 MiniMax 管线（`tools/gen_xiya_minimax.py`，详见 `docs/MiniMax语音生成工具手册.md`）
- 播放：`VoiceBank.ts` 按 (speaker, 归一化文本) 映射 `public/audio/voice_normalized/` 下 wav，找不到音频静默跳过不阻塞对话
- 语音映射数据 `voicebank.data.ts` 由生成脚本 `--emit-voicebank` 自动产出，勿手改

## 测试

```bash
npx tsc --noEmit             # TypeScript 类型检查
npm run build                # 生产构建
node tests/probes/<probe>.mjs  # 单探针（需 dev server 运行在 5173）
```

测试规范详见 `TEST_RULES.md`：按修改影响范围分级（Level 0-3），禁止默认运行全部测试。79 个探针位于 `tests/probes/`，覆盖教程流程 / 切图稳定性 / 砍树 / 第一章主线 / 语音链路 / 环境音等。
