# 任务卡：BUG-047 BGM 播放机制改造（方案 A：Web Audio 播放）

> 状态：✅ **已完成**
> 来源：制作人 2026-08-06 拍板方案 A（绕过 IDM 媒体嗅探）
> 关联：BUG-047（问题追踪）
> 施工线：src/audio/ 语音线持有——开工前 `git status` 确认 + 登记单写者

---

## 一、需求

PC Web 端播放 BGM 时，IDM 等下载管理器会嗅探裸 .mp3 请求并弹出"下载文件"提示，打断游戏体验。

方案 A：BGM 播放机制从 **HTMLAudioElement** 改为 **fetch + AudioContext.decodeAudioData + AudioBufferSourceNode**，绕开下载管理器的 HTML 媒体嗅探。

## 二、现状（已核实）

- [MusicSystem.ts](src/audio/MusicSystem.ts)：`new Audio(url)` + `loop` 播放，4 首 BGM（title/farm_day/stargaze_night/stargaze_final，各 3.5~5.3MB）
- 已有自动播放补播机制（pending + pointerdown/keydown 一次性补播）——新实现必须保留
- 场景切换由各场景 SHUTDOWN 调 `MusicSystem.stop()` 防叠播

## 三、实施方案

### 涉及文件（仅限）

- `src/audio/MusicSystem.ts`（内部改造，不新建重复系统）

### 核心设计

1. **加载**：`fetch(url)` → `arrayBuffer()` → `audioContext.decodeAudioData(buf)` → 得到 `AudioBuffer`
2. **播放**：`AudioBufferSourceNode` + `GainNode`，`source.loop = true`；音量沿用现有 `setVolume`（GainNode.gain）
3. **缓存（必须）**：`Map<key, AudioBuffer>` 缓存已解码音频，避免场景切换重复下载 5MB 文件；
   **内存上限**：最多保留 2 首（LRU 或切曲时释放非当前曲目），防止 4 首全缓存内存膨胀
4. **自动播放**：沿用 pending 补播机制——AudioContext 被浏览器挂起（suspended）时记录 pending，首次用户交互（pointerdown/keydown）后 `ctx.resume()` + 补播
5. **停止**：`source.stop()` + `disconnect()` + 清空引用（含 pending），防叠播
6. **失败降级**：fetch 失败 / decode 失败 → `console.warn` + 静默跳过，绝不影响游戏流程
7. **复用 AudioSystem 的 AudioContext**：若 `getCtx()` 已存在则复用同一 context（避免多 context 冲突），保持全局单一

### 不做什么

- ❌ 不改 VoiceBank / StoryDialogue（语音系统不动）
- ❌ 不新增存档字段
- ❌ 不改音乐文件本身（mp3 资源不动）

## 四、验收标准

- ✅ `tsc` 0 错
- ✅ 浏览器手动验证（桌面）：
  - 标题页 BGM 播放正常；点击开始后进农场切为农场曲；夜晚/观星切换正确；无叠播
  - 网络面板确认：场景来回切换不重复下载（缓存命中）；停止后切回可恢复播放
  - 自动播放拦截场景：无交互进标题页无报错，首次点击后音乐响起
- ✅ **装 IDM 的桌面浏览器实测：进入游戏（标题页加载 BGM）不再弹出下载提示**（制作人执行）
- ✅ 移动端：构建后 WebView 回归（BGM 播放/切场景），无回归

## 五、红线

- ❌ 不触碰 src/audio/ 其他文件（VoiceBank/voicebank.data/StoryDialogue）
- ❌ 不改存档 / 场景拓扑 / 音乐资源
- ❌ 不新建音频系统（改 MusicSystem 内部实现）
