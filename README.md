# 《归星物语》类星露谷 二游 — Web 小游戏 Demo

Phaser 3 + TypeScript + Vite 像素风农场生活 RPG 浏览器游戏。

## 版本

**v0.5** — Alpha 稳定阶段：第一章小镇剧情 + 存档重构 + 稳定性修复

## 快速开始

```bash
npm install
npm run dev      # 开发服务器
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

## 技术栈

| 层 | 技术 |
|---|---|
| 游戏引擎 | Phaser 3.80 |
| 语言 | TypeScript |
| 构建 | Vite |
| 美术 | 程序化像素生成 |

## 目录结构

```
src/
├── main.ts                  # 游戏启动入口（注册 8 个场景 + Debug API）
├── config.ts                # 配置
├── scenes/
│   ├── TitleScene.ts        # 标题画面
│   ├── StationScene.ts      # 车站开场（序章）
│   └── MapScene.ts          # 通用地图场景（gate/farm/town/forest/mine/house 共用）
├── entities/
│   ├── Player.ts            # 玩家实体
│   └── NPC.ts               # NPC 实体
├── data/
│   ├── FarmState.ts         # 农田状态 + 作物定义
│   ├── FarmProgress.ts      # 等级经验
│   ├── Economy.ts           # 金币经济
│   ├── Inventory.ts         # 背包（18 种物品）
│   ├── TimeSystem.ts        # 时间系统
│   ├── Stamina.ts           # 体力系统
│   ├── MineState.ts         # 矿洞矿脉
│   └── exits.ts             # 场景出口
├── systems/
│   ├── SaveSystem.ts        # 存档系统（v0.5 分组结构）
│   ├── StorySystem.ts       # 剧情系统（序章 + 第一章）
│   ├── QuestSystem.ts       # 主线任务
│   ├── DailyQuestSystem.ts  # 每日任务
│   ├── NPCSystem.ts         # NPC 管理
│   ├── AudioSystem.ts       # 音效系统
│   ├── InputManager.ts      # 键盘输入
│   └── TouchControls.ts     # 触屏控件
├── ui/
│   ├── ShopPanel.ts         # 商店面板
│   ├── BackpackPanel.ts     # 背包面板
│   └── StoryDialogue.ts     # 全屏剧情对话
└── assets/                  # （实际在 public/assets/）
    ├── maps/                # Tiled 地图 JSON（farm/town/forest/mine/gate/house）
    ├── tiles/               # 瓦片图
    ├── sprites/             # 角色和物品精灵图
    └── images/              # 封面等图片

test-tutorial.mjs            # E2E 测试：新玩家完整流程（node test-tutorial.mjs）
test-stress-switch.mjs       # E2E 压力测试：切图/挖矿稳定性（node test-stress-switch.mjs）
test-woodcutting.mjs         # E2E 测试：砍树机制（node test-woodcutting.mjs）
```

## 测试

```bash
npx tsc --noEmit             # TypeScript 类型检查
npm run build                # 生产构建
node test-tutorial.mjs       # 教程流程 E2E（需 dev server 运行在 5173）
node test-stress-switch.mjs  # 切图/挖矿压力测试（需 dev server 运行在 5173）
node test-woodcutting.mjs    # 砍树机制 E2E（需 dev server 运行在 5173）
```