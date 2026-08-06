# MiniMax（海螺）语音管线手册 v1.0

> 状态：**当前唯一推荐的配音管线（2026-08-06 制作人拍板）**
> 优先级：**后续所有角色 / 剧情配音优先使用本管线（MiniMax T2A v2）**；VoxCPM / MiMo 仅作为离线、断网或本地穷举音色时的备选。
> 用途：夏雅等角色主线语音的云端合成管线，替代 VoxCPM 本地管线。
> 背景：VoxCPM 存在 prompt 回显问题（需前导裁剪）且音色不稳定；Fish Audio 接口性价比过低；MiniMax T2A v2 无回显、音质稳定，定为当前正式管线。

---

## 一、配置（密钥不入库）

优先级：环境变量 > `tools/.env` > 加密保险箱 `tools/.secrets.enc`。

### 方式 A：加密保险箱（推荐）

```powershell
# 剪贴板已复制 Key 时（自动模式，无交互）：
powershell -NoProfile -ExecutionPolicy Bypass -File tools\set_minimax_key.ps1 -FromClipboard [-GroupId xxxx]

# 手动交互模式：剪贴板优先（需确认 Y），否则隐藏输入
powershell -NoProfile -ExecutionPolicy Bypass -File tools\set_minimax_key.ps1
```

### 方式 B：tools/.env（gitignored）

```text
MINIMAX_API_KEY=sk-xxxx
# 可选：国内站 api.minimaxi.com 通常需要；实测当前账号无需亦可调用
MINIMAX_GROUP_ID=xxxx
MINIMAX_VOICE_MAP={"夏雅":"female-shaonv-jingpin"}
```

> 说明：`tools/set_minimax_key.ps1` 必须保持纯 ASCII（PowerShell 5.1 按 ANSI 读取无 BOM UTF-8 会解析失败）。

---

## 二、单条合成

```powershell
# 列出音色（303+ 个；可 --search 过滤）
npm run minimax -- --list-voices [--search 少女]

# 单条合成（默认 speech-2.8-turbo；品质优先可 --model speech-2.8-hd）
npm run minimax -- --character 夏雅 --voice-id female-shaonv-jingpin --text "那就别走了。" [--output 路径.mp3]
```

接口：`POST https://api.minimaxi.com/v1/t2a_v2`（国际站 `api.minimax.io`），`output_format=hex` 返回 hex 音频。

---

## 三、夏雅批量重配（41 条主线）

```powershell
# 全量（自动断点续跑：成功一条记录一条到 .minimax_done）
python tools/gen_xiya_minimax.py [--force] [--model speech-2.8-turbo] [--voice-id female-shaonv-jingpin]

# 先试跑 1 条冒烟
python tools/gen_xiya_minimax.py --limit 1
```

行为：
- 台词清单直接 import `tools/gen_mainline_voice.py` 的 `T` 列表（与 StorySystem 映射同源），只处理 `xiya` 角色；
- 产物：`public/audio/voice/xiya/<tid>.wav`（16k 单声道 PCM s16le）+ `<tid>.wav.txt` 来源 sidecar；
- 每条约 10 秒，41 条约 7 分钟；超时被中断后重跑会自动跳过已完成条目；
- MiniMax 无 VoxCPM 的 prompt 回显，**不需要前导裁剪**。

---

## 四、标准化与验证（必跑）

```powershell
# 1) 清空目标目录（避免覆盖残留，历史教训）
Get-ChildItem public/audio/voice_normalized/xiya -Filter *.wav | Remove-Item -Force

# 2) 标准化到 -16 LUFS
python tools/normalize_audio.py --input public/audio/voice/xiya --output public/audio/voice_normalized/xiya

# 3) 验证（不能只看"脚本说成功"）
#    文件数 41=41、voice 与 normalized 时长差 <0.15s、sidecar 与 voicebank 文本一致
python tools/check_voicebank_match.py   # 需 PYTHONIOENCODING=utf-8（GBK 控制台打印 Unicode 会崩）
```

注意：控制台编码问题——运行带 Unicode 输出的 Python 脚本前设置 `$env:PYTHONIOENCODING='utf-8'`。

---

## 五、夏雅声线定案

| 项目 | 值 |
| --- | --- |
| voice_id | `female-shaonv-jingpin`（少女音色-beta） |
| model | `speech-2.8-turbo`（性价比档） |
| speed / vol / pitch | 1.0 / 1.0 / 0 |
| 试听记录 | `public/audio/audition/xiya_minimax/`（A 甜美女声 / B 温暖少女 / C 温暖闺蜜 / D 少女 beta，制作人选 D） |
| 状态 | 2026-08-06 制作人确认"凑合用"，后续可按需重配 |

---

## 六、成本与切换

- `speech-2.8-turbo`：性价比档，日常批量使用；
- `speech-2.8-hd`：品质档，关键情绪句可单独升；
- 换声线：改 `--voice-id` 后跑 `python tools/gen_xiya_minimax.py --force`，再执行第四节标准化与验证。
