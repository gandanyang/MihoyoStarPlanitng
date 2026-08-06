# Skill 体系设计聊天暂存

> 来源：2026-08-02 制作人 vs ChatGPT 关于 Skill 文件体系设计讨论
> 用途：暂存完整 Skill 设计讨论记录，供生成 .skills/ 目录下文件时参考
> 状态：⏳ 进行中（00~11 已设计完成，12-game-design 建议下一步做）

---

## 一、Skill 是什么

Skill（.skill 文件）= 给 AI 写的"项目说明书"。

每次开新对话，AI 都会先读这些文件，所以不用一遍遍解释项目是什么、用什么技术栈、有哪些规范。

- 普通 AI 的问题：每次开新对话都要重新解释项目
- 有了 Skill 后：AI 自动知道

---

## 二、Skill 体系结构（共 13 个，按编号）

```
.skills/
├── 00-project.skill              # 项目总介绍
├── 01-architecture.skill       # 架构分层
├── 02-coding-standard.skill   # 代码规范
├── 03-phaser.skill          # Phaser 开发注意事项
├── 04-farm-system.skill     # 农田系统
├── 05-inventory-economy.skill  # 背包经济
├── 06-save-system.skill    # 存档系统
├── 07-story-system.skill    # 剧情系统
├── 08-npc-quest.skill     # NPC 任务系统
├── 09-ui-mobile.skill       # UI 移动端
├── 10-art-direction.skill  # 美术方向
├── 11-testing.skill         # 测试规范
├── 12-ai-development.workflow.skill  # AI 协作开发流程
└── 12-game-design.skill（建议补充）   # 游戏策划规范
```

---

## 三、每个 Skill 的完整设计原文（从对话中提取）

### 00-project.skill

```
归星物语 Project Skill

项目名称
归星物语（MihoyoStarPlanting / Stellaris-Requiem）

项目定位
一款类星露谷物语 + 二次元剧情体验的 Web 农场生活 RPG。

核心体验：
种田 → 经营 → 探索 → 剧情 → 成长

技术栈
Phaser 3.80
TypeScript
Vite
Tiled 地图
Web 浏览器运行

开发目标
打造轻量级二游版农场 RPG。

重点：
剧情体验
角色互动
世界探索
养成循环

当前版本
v0.5 Alpha

已完成：
场景系统
玩家移动
农田系统
作物成长
背包系统
商店系统
NPC
第一章剧情
存档系统
移动端控制

AI开发原则
AI 修改代码时：
优先理解已有架构
不破坏已有系统
不随意重构
新功能优先模块化
保持 TypeScript 类型安全
```

### 01-architecture.skill

```
项目架构 Skill

总体架构
项目采用 Phaser Scene + System + Data 分层结构。

Scene层
负责：
场景加载
生命周期
游戏显示

主要：
TitleScene
StationScene
MapScene

不要在 Scene 中堆积业务逻辑。

Entity层
负责游戏对象。

例如：
Player
NPC

规则：
Entity负责表现和交互。
复杂逻辑放入 System。

Data层
负责状态数据。

包括：
FarmState
Inventory
Economy
TimeSystem

原则：
数据状态必须可保存。

System层
负责核心玩法逻辑。

例如：
SaveSystem
StorySystem
QuestSystem
NPCSystem

新增大型功能：
优先创建 System。

UI层
UI只负责：
显示
输入
调用系统

不要直接修改核心数据。
```

### 02-coding-standard.skill

```
TypeScript 编码规范

修改原则
修改已有功能：

先阅读：
数据来源
调用关系
存档影响

禁止：
删除未知代码
大范围重构
改变公共接口

新功能开发流程
设计数据结构
创建 System
接入 SaveSystem
添加 UI
添加测试

类型要求
必须：
明确 interface
避免 any
保持类型检查通过

测试：
npx tsc --noEmit

AI代码要求
生成代码时：

解释：
修改原因
影响文件
是否影响存档
是否需要测试
```

### 03-save-system.skill

```
SaveSystem Skill

系统定位
SaveSystem 是游戏持久化核心。

负责：
保存玩家进度
恢复游戏状态
管理版本兼容

当前版本：
v0.5 分组存档结构。

存档原则
所有长期存在的数据必须进入 SaveSystem。

包括：
玩家位置
当前场景
背包
金币
农田状态
作物成长
NPC关系
剧情进度
任务状态

禁止行为
不要：
在其他 System 中直接 localStorage
创建新的存档入口
随意改变字段名称

原因：
存档改变会导致玩家数据丢失。

新系统接入流程
新增系统：
创建数据结构
定义默认值
添加 save()
添加 load()
测试旧存档兼容

数据设计原则
优先：
interface XxxState {
}
而不是：
any

修改存档必须检查
影响：
旧玩家能否读取
默认值是否存在
是否需要版本迁移
```

### 04-farm-system.skill

```
Farm System Skill

系统定位
农田系统是游戏核心循环。

核心：
播种 → 浇水 → 生长 → 收获 → 经济循环

当前功能
已支持：
土地状态
播种
浇水
跨天成长
收获

设计原则
农田数据必须与地图显示分离。

正确：
FarmState 保存数据
MapScene 负责显示。

作物设计
未来扩展：
不要写死：
错误：
if(seed=="萝卜")
推荐：
CropConfig
{
 id,
 growDays,
 sellPrice,
 sprite
}

新增作物流程
添加 CropConfig
添加种子物品
添加成长规则
添加收获奖励
测试跨天

平衡原则
农场循环：
投入：
时间
体力
金币

产出：
金币
经验
剧情推进

避免：
单一赚钱方式破坏经济。
```

### 05-story-system.skill

```
StorySystem Skill

系统定位
剧情系统负责《归星物语》的核心二游体验。

目标：
让玩家感受到：
角色
+
世界
+
情绪
而不是简单任务列表。

剧情结构
当前：
序章：
城市失业
↓
收到通知
↓
返回庄园

第一章：
小镇
↓
NPC相遇
↓
观星夜
↓
主线推进

剧情设计原则
剧情必须服务：
世界观
人物塑造
玩家目标

禁止：
为了发任务而写剧情。

对话系统
StoryDialogue负责：
展示文本
控制推进

不要：
在UI里写剧情逻辑。

新剧情流程
StoryStep设计
Dialogue数据
触发条件
奖励
存档记录

AI生成剧情要求
保持：
林澈的人设
小镇氛围
二游节奏

避免：
流水账NPC对话。
```

### 06-phaser.skill

```
Phaser开发 Skill

引擎
Phaser 3.80

Scene原则
Scene负责：
生命周期
加载资源
显示对象

不要：
把全部游戏逻辑写进 Scene。

Entity原则
Player/NPC：
负责：
移动
动画
交互

不负责：
经济
剧情
存档

输入系统
InputManager负责键盘。
TouchControls负责移动端。

新增输入：
必须考虑：
PC
+
移动端

地图系统
当前：
MapScene复用多个地图。

地图：
farm
town
forest
mine
house

新增地图：
保持统一出口系统。

性能要求
避免：
每帧创建对象
大量重复查找
无意义update计算
```

### 07-mobile-ui.skill

```
移动端与UI Skill

目标
游戏必须支持：
PC浏览器
手机浏览器

UI原则
UI必须：
自适应屏幕
支持触摸
不遮挡游戏区域

操作映射
PC：
WASD
E
B
R

移动：
虚拟摇杆
交互按钮
背包按钮
切换按钮

新功能要求
任何交互：
必须同时设计：
键盘方案
触屏方案

UI开发
UI只负责：
显示

调用：
System

禁止：
直接修改核心数据。
```

### 08-npc-quest.skill

```
NPC 与任务系统 Skill

系统定位
NPCSystem 和 QuestSystem 负责：
小镇居民
日常互动
主线推进
玩家目标引导

NPC设计原则
NPC不是任务发布机器。

每个NPC应该拥有：
身份
性格
日程
目标
与主角关系变化

NPC结构
推荐：
interface NPCData {
id:string;
name:string;
schedule:Schedule[];
dialogue:Dialogue[];
}

日程系统
NPC行为由时间驱动。

例如：
上午：
农场
下午：
小镇
晚上：
家中

不要：
直接写：
if(time==12)
应该：
数据化。

Quest设计
任务分为：
主线任务
推动：
世界观
剧情
新功能解锁

支线任务
提供：
奖励
NPC塑造

每日任务
提供：
日常循环
活跃度

新任务开发流程
创建Quest数据
设置触发条件
设置奖励
添加剧情
加入存档
添加测试

禁止
不要：
让QuestSystem直接控制UI。

流程：
QuestSystem
↓
UI显示
而不是：
QuestSystem修改按钮文本。
```

### 09-testing.skill

```
游戏测试 Skill

系统定位
保证游戏长期迭代稳定。

当前使用：
Puppeteer E2E测试。

测试目标
测试真实玩家流程：
启动游戏
↓
移动
↓
交互
↓
完成任务
↓
保存
↓
重新加载

已有测试
包括：
教程流程测试
切图压力测试
砍树测试
第一章剧情测试

新功能必须测试
任何新增系统：
至少包含：
基础测试
功能能否运行

边界测试
异常情况：
重复点击
重复领取
切场景
刷新页面

存档测试
退出后：
数据是否恢复

AI修改代码后流程
必须执行：
npx tsc --noEmit
npm run build
必要时：
运行对应E2E。

测试原则
不要只测试：
"能不能用"
还要测试：
"玩家乱操作会不会坏"
```

### 10-art-direction.skill

```
美术方向 Skill

项目定位
《归星物语》不是传统像素农场。

目标：
像素玩法
二次元角色体验

核心风格
参考方向：
米哈游角色设计
温暖幻想
青春冒险

避免：
纯欧美农场风。

角色设计
角色重点：
脸部表现
服装层次
角色辨识度

关键词：
年轻
清爽
幻想
生活感

场景设计
庄园：
关键词：
旧
温暖
可成长

小镇：
关键词：
生活
人与人连接

森林：
关键词：
探索
未知

矿洞：
关键词：
危险
资源

AI绘图规则
生成角色：
必须包含：
角色身份
年龄感
性格
服装
场景

不要：
只写：
"漂亮女孩"

素材一致性
所有素材保持：
比例统一
色彩统一
世界观统一

禁止：
单独生成导致风格割裂。
```

### 11-ai-workflow.skill

```
AI协作开发 Skill

AI角色定位
AI不是独立程序员。
AI是：
项目成员。

工作前必须读取
project.skill
architecture.skill
对应功能Skill

修改流程
第一步：分析
先回答：
当前代码在哪里
修改影响什么
是否影响存档

第二步：设计
提出：
文件修改列表。

例如：
修改:
FarmState.ts
新增:
CropConfig.ts
测试:
test-farm.mjs

第三步：实现
要求：
小步修改。

禁止：
一次重写大量文件。

代码修改规则
优先：
新增

其次：
局部修改

最后：
重构

每次提交说明
必须包含：
修改内容
修改原因
测试结果
后续建议

AI禁止行为
禁止：
删除未知代码
修改无关文件
改变项目架构
引入大型依赖

新功能评价标准
不是：
代码能跑。

而是：
是否符合长期游戏开发。
```

### 12-game-design.skill（建议补充）

```
建议下一步做：游戏策划 Skill

因为项目现在已经有：
种田
探索
剧情
NPC
经济
养成

后面做矿洞、战斗、角色养成时，没有这个容易变成「功能堆积」。

建议做成一份类似米哈游内部策划案的 AI 规范。
```

---

## 四、补充建议（对话末尾 ChatGPT 建议）

1. 05-inventory-economy.skill — 对话里提了编号但未展开内容，建议补上
2. 12-game-design.skill — 对话末尾强烈建议，下一步做
3. 所有 skill 文件编号要统一格式（编号 + 主题），方便 AI 按顺序读

