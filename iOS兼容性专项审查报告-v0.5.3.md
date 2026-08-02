# 《归星物语》iOS 兼容性专项审查报告

**版本**：v0.5.3
**日期**：2026-08-02
**审查范围**：全部 7 个场景、输入/音频/存档/UI 系统、Phaser 配置、资源清单
**方式**：只读静态分析（未改代码）

---

## A. 已确认兼容项 ✅

| 领域 | 结论 | 依据 |
|------|------|------|
| 视口配置 | ✅ viewport 含 `user-scalable=no`，iOS 不再有 300ms 点击延迟 | index.html:5 |
| 虚拟摇杆 | ✅ touchstart/move/end 三件套 + mousedown 兜底，手指移出元素仍持续跟踪 | TouchControls.ts:74-98 |
| 交互按钮 | ✅ pointerdown+touchstart+mousedown+click 四重绑定 + 150ms 防抖 | TouchControls.ts:129-132 |
| 页面关闭存档 | ✅ `pagehide` 兜底（iOS 移动端推荐事件）+ beforeunload 双保险 | MapScene.ts:511-526 |
| localStorage | ✅ 所有 setItem 均有 try-catch 包裹（无痕模式 QuotaExceeded 安全） | SaveSystem.ts:143-155 |
| Web Audio | ✅ 标准 AudioContext + suspended→resume 恢复逻辑 | AudioSystem.ts:15-24 |
| 触屏反馈 | ✅ `navigator.vibrate` 包在 try-catch 中（iOS 不支持也不会崩） | MapScene.ts:2082 |
| 双击缩放/橡皮筋 | ✅ html/body `touch-action:none; overscroll-behavior:none` | index.html:16-17 |
| 资源体积 | ✅ 最大立绘 625KB，总资源 <2MB，无内存压力 | 资源清单 |
| 引擎配置 | ✅ Phaser FIT+居中缩放，800×600 低分辨率，iOS 自动 WebGL→Canvas 回退 | main.ts:37-40 |
| 存档体积 | ✅ 农场格子/作物/树木序列化仅数 KB，远低于 5MB 上限 | SaveSystem 结构 |

---

## B. iOS 高风险问题（按优先级）

### P1（影响操作/可用性）

**B1. Home Indicator 遮挡右下角交互按钮 + 左下摇杆**
- 位置：TouchControls.ts:63（摇杆 `bottom:30px`）、:109（交互 `bottom:24px`）、:137/:158（背包/任务 `bottom:108/172px`）
- 问题：iPhone 横屏时 Home Indicator 占据底部约 21px 安全区，`bottom:24px` 的交互按钮会与 Home Indicator 重叠，触感区域被系统手势抢占（Home 手势从屏幕底部边缘滑动会打断按钮触摸）。
- 对话层 `bottom:20px`（StoryDialogue.ts:62）同理。

**B2. 缺少 safe-area-inset 适配**
- 位置：全项目无 `viewport-fit=cover` + 无 `env(safe-area-inset-*)`。
- 影响：刘海屏竖屏时状态栏区域可能重叠 HUD 顶部（HUD top:4px）；横屏时底部按钮被遮挡（同 B1）。
- 修复方向（未实施）：`index.html` 加 `viewport-fit=cover`，TouchControls 按钮用 `bottom: calc(24px + env(safe-area-inset-bottom))`。

### P2（兼容性缺口/体验降级）

**B3. `inset: 0` CSS 简写在旧 iOS（<14.5）不生效**
- 位置：TouchControls.ts:58、QuestPanel/BackpackPanel/EndingPanel/ShopPanel 全部用 `position:fixed;inset:0`
- 影响：iOS 14.5 以下（iPhone 6s/7/8 若未升级）面板容器定位失效，全屏遮罩可能只覆盖左上角 0×0。
- 修复方向：改为显式 `top:0;right:0;bottom:0;left:0`（几乎零成本）。

**B4. `backdrop-filter` 缺 `-webkit-` 前缀**
- 位置：MapScene.ts:2255（每日任务面板 `backdrop-filter:blur(4px)`）
- 影响：iOS 上毛玻璃不生效（仅视觉降级，无功能影响）。需 `-webkit-backdrop-filter`。

**B5. AudioContext 缺 `webkitAudioContext` 回退**
- 位置：AudioSystem.ts:17 `new AudioContext()`
- 影响：iOS 12 及更早 Safari 无全局 `AudioContext`，音效初始化抛错。现代 iOS（14+）无问题。建议 `const AC = window.AudioContext || (window as any).webkitAudioContext`。

**B6. `navigator.vibrate` 在 iOS 全部无效**
- 位置：MapScene.ts:2082
- 影响：iOS 不支持 vibrate API，点击反馈静默缺失（已 try-catch 不会崩，但 Android 玩家有振动、iOS 玩家没有的体验落差）。可接受，或后续用视觉反馈替代。

### P0（阻断级）

**无。** 核心流程（移动/交互/对话/存档）在 iOS 上均有标准兼容实现，无阻断问题。

---

## C. 建议增加的测试流程

1. **横屏 Home Indicator 测试**：iPhone 横屏 → 检查交互按钮是否可点、Home 手势是否干扰摇杆拖动（每次拖动先看是否触发 App Switcher）。
2. **无痕模式存档测试**：Safari 无痕 → 睡觉保存 → 刷新 → 确认无崩溃、有降级提示。
3. **低版本 iOS 测试**：至少测 iOS 14.5（`inset` 边界）与 iOS 15+（主流）两个档位。
4. **双击连点测试**：快速连点交互按钮 10 次 → 确认防抖生效、不重复触发锄地/播种。
5. **地址栏伸缩测试**：滚动/切换标签页 → 确认 Phaser FIT 重算后 canvas 无错位、无黑边。
6. **后台恢复测试**：切到其他 App 5 分钟再回来 → 确认时间未异常跳跃、对话打字机未卡死、音频状态正常（AudioContext suspended→resume）。
7. **WebGL 内存测试**：老设备（iPhone SE/6s）连续切换 7 个场景 × 10 次 → 用 Memory 面板观察是否有纹理累积。

---

## D. 需要真机验证的项目（无法静态确认）

| # | 项目 | 原因 |
|---|------|------|
| D1 | Phaser WebGL 在 iPhone 上的 `devicePixelRatio` 渲染清晰度 | 需真机目测是否模糊/锯齿 |
| D2 | iOS Safari 地址栏收起时 Phaser FIT 重算是否闪烁 | 静态无法模拟视口动画 |
| D3 | Home Indicator 手势与摇杆拖动手势的冲突程度 | 依赖真机手势行为 |
| D4 | 立绘 `object-fit:cover` 裁切效果（96px 移动端尺寸） | 需目测头像裁切是否合适 |
| D5 | 长按对话/按钮是否弹出 iOS 系统菜单 | 无 `-webkit-touch-callout:none`，需真机长按验证 |
| D6 | 7 个场景各持有 1 个 StoryDialogue DOM（共 7 个隐藏节点）对低端机的性能影响 | 静态估算低风险，需真机验证 |

---

## 总结

**iOS 风险等级：低**。核心玩法无 P0 阻断，仅 2 个 P1（Home Indicator 遮挡 + safe-area）值得优先修复，其余为 P2 兼容性缺口（`inset`、`backdrop-filter` 前缀、AudioContext 回退）。项目资源轻量、存档机制稳健、输入系统已做多事件兜底，整体对 iOS 友好。
