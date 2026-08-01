# 归星物语

Phaser 3 + TypeScript + Vite 像素风农场生活 RPG 浏览器游戏。

## 版本

**v0.4** — 序章剧情 + 新手教程 + 砍树系统

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
```

| 操作 | 键位 (PC) | 触屏 (移动端) |
|---|---|---|
| 移动 | WASD / 方向键 | 虚拟摇杆 |
| 交互 | E / 空格 / 回车 | 交互按钮 |
| 砍树 | 靠近树木按 E | 靠近树木点交互按钮 |
| 背包 | B | 背包按钮 |
| 商店 | 靠近商人按 E | 靠近商人点交互按钮 |
| 切换种子 | R | 切换按钮 |

## 技术栈

| 层 | 技术 |
|---|---|
| 游戏引擎 | Phaser 3 |
| 语言 | TypeScript |
| 构建 | Vite |
| 美术 | 程序化像素生成 |

## 目录结构

```
src/
├── main.ts                  # 游戏启动入口
├── config.ts                # 配置
├── scenes/
│   ├── TitleScene.ts        # 标题画面
│   ├── StationScene.ts      # 车站开场
│   └── MapScene.ts          # 通用地图场景
├── entities/
│   ├── Player.ts            # 玩家实体
│   └── NPC.ts               # NPC 实体
├── data/
│   ├── FarmState.ts         # 农田状态
│   ├── Inventory.ts         # 背包
│   ├── TimeSystem.ts        # 时间系统
│   ├── Stamina.ts           # 体力系统
│   ├── exits.ts             # 场景出口
│   └── ...
├── systems/
│   ├── SaveSystem.ts        # 存档系统
│   ├── StorySystem.ts       # 剧情系统
│   ├── AudioSystem.ts       # 音效系统
│   └── ...
├── ui/
│   └── ...
└── assets/
    ├── maps/                # Tiled 地图 JSON
    ├── tiles/               # 瓦片图
    ├── sprites/             # 角色和物品精灵图
    └── images/              # 封面等图片
```