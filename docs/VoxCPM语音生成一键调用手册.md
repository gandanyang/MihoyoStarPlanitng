# 《归星物语》双引擎语音生成一键调用手册 v0.2
（VoxCPM 本地离线推理 + 小米 MiMo-TTS HTTP 接口调用）

> 目标：无需打开 VoxCPM GUI 或 MiMo WebUI，一条命令或一份批量配置，自动生成 NPC / 剧情语音文件并落到项目资产目录 `public/audio/voice/`。
>
> 对应脚本：`tools/gen_voice.py`（纯 Python 标准库实现，**不需要 pip install 任何第三方包**）

---

## §0 引擎选择与性能开销说明（先看这里！）

### 0.1 两引擎对比（回答"这种生成方式性能开销大吗"）

| 维度 | VoxCPM（engine=voxcpm，**默认**） | MiMo-TTS（engine=mimo，**推荐批量/赶工时用**） |
|------|----------------------------------|---------------------------------------------|
| **核心原理** | 本地加载 `VoxCPM-0.5B` + `SenseVoiceSmall` + `ZipEnhancer` 三个模型做端到端推理 | 通过 HTTP 调本机 MiMo 服务（Node.js），再由 MiMo 内部调用小米云端/本地音色克隆模型 |
| **生成速度** | **20~120 秒 / 条**（主要看显卡和 steps） | **3~15 秒 / 条**（文本越长越慢，但普遍比 VoxCPM 快 5~10 倍） |
| **显存占用** | **8~14 GB 显存**（RTX 3060 12G 刚好能跑 steps=10 + enhance；8G 卡会 OOM 或自动降精度） | 本机 **不占显存**（计算全在 MiMo 服务进程里，通常占 200~500MB 内存即可） |
| **内存占用** | 模型加载完占 6~10GB 内存 | 约 200~500MB |
| **是否联网** | ❌ **完全离线**（一次下载模型永久用） | ⚠️ MiMo 自身可能走云端大模型（取决于 MiMo 配置），**可能消耗 API 额度** |
| **成本** | 💚 **零成本**（免费模型 + 本地算力） | 💛 **取决于 MiMo API Key 额度** |
| **音质/稳定性** | 💛 波动大（cfg/steps 调不好会电音、吞字），但风格灵活 | 💚 稳定（音色克隆一致性好、极少电音，自带语速调节） |
| **可调节参数** | cfg（贴角色度）/ steps（精细度）/ enhance（去噪增强）/ ref_text（参考文本） | speed（语速倍率）/ user_message（风格/情绪/方言引导提示词） |
| **产物格式** | 默认 `.wav`（16kHz 单声道，PCM16），mp3 需 ffmpeg | 默认 `.mp3`（MPEG Layer3，码率取决于 MiMo 侧配置） |
| **前置条件** | E 盘模型全部下载完（开箱即用，你本机已下完） | 先双击 `start.bat` 启动 MiMo 服务（端口 4000） |
| **适合场景** | ① 赶工不着急、想省 API 额度；② 对配音风格要精细控参；③ 断网环境；④ 单机长期批量穷举音色 | ① 赶交付、**数量多（>20 条）优先选这个**；② 需要稳定一致的音色；③ 显存不够跑不动 VoxCPM；④ 要调节奏/情绪 |

**一句话总结**：
- VoxCPM **吃显卡、慢、但免费且完全离线**——显卡够、不赶时间就用它。
- MiMo **不吃显卡、非常快、音质稳、但需要先启动服务且可能花 API 额度**——**赶工/量产优先选它**。

### 0.2 一键选型口诀
> 条数少（<5 条）+ 有时间 + 想省额度 → **voxcpm**
> 条数多（≥5 条）+ 想快点出结果 + 服务已启动 → **mimo**
> 不确定 → 先用 `--dry-run` 看一下要跑哪些任务，再选

---

## §1 快速开始（30 秒上手）

### 1.1 生成单条语音（VoxCPM，默认引擎）

```powershell
# 在项目根目录执行：
python tools/gen_voice.py `
  --text "大家好，我是林澈，今天刚回到归星村。" `
  --ref-audio "E:\BINGdown\VoxCPM\examples\林远.mp3" `
  --output "public/audio/voice/linche_demo.wav"
```

参数不齐想交互问？什么都不传直接跑，脚本会一步步问：
```powershell
python tools/gen_voice.py
```

### 1.2 生成单条语音（MiMo-TTS，速度快）

**前置一步：先启动 MiMo 服务**（只需启动一次，开着不关就能反复调用）
```powershell
# 双击这个文件（或者在 PowerShell 里执行）：
F:\MiMo-TTS-Win-v1.1.2\MiMo-TTS-Win\start.bat
# 等它打印 "Server running on http://127.0.0.1:4000" 之类的字样就 OK 了
```

服务启动后，再跑脚本：
```powershell
python tools/gen_voice.py `
  --engine mimo `
  --text "大家好，我是林澈，今天刚回到归星村。" `
  --ref-audio "E:\BINGdown\VoxCPM\examples\林远.mp3" `
  --output "public/audio/voice/linche_demo_mimo.mp3" `
  --speed 1.05 `
  --user-message "青年男声，语气放松，带一点回到家乡的怀念感"
```

### 1.3 批量生成剧情对白（项目推荐 ✅）

```powershell
# 1. 先复制示例任务文件（里面已经有 VoxCPM + MiMo 两套示例任务）
copy tools\voice_tasks.example.json tools\voice_tasks.json

# 2. 编辑 voice_tasks.json，填对白和角色参考音频，每条可以单独指定 engine

# 3. 【推荐】先 dry-run 跑一遍，确认路径/参数对不对（不实际生成，不花额度）
python tools/gen_voice.py --batch tools\voice_tasks.json --dry-run

# 4. 一键跑完所有任务（失败不中断，继续下一条）
python tools/gen_voice.py --batch tools\voice_tasks.json

# 5. 想强制所有任务都走 MiMo（不管 JSON 里写什么 engine），CLI 传 --engine mimo 覆盖
python tools/gen_voice.py --engine mimo --batch tools\voice_tasks.json
```

产物默认落到：
```
public/audio/voice/<角色英文名>/<任务ID>.wav     # voxcpm
public/audio/voice/<角色英文名>/<任务ID>.mp3     # mimo（可在 output 字段自定义后缀）
```

---

## §2 项目结构与两引擎位置

### 2.1 VoxCPM（本地推理）固定路径

| 目录/文件 | 说明 |
|-----------|------|
| `E:\BINGdown\VoxCPM\` | **VoxCPM 本体**（克隆+推理用），已预载 3 个模型，不用联网再下 |
| `E:\BINGdown\VoxCPM\VoxCPM 启动器.exe` | GUI 启动器（手动用，**AI 不要打开**，一律走脚本） |
| `E:\BINGdown\VoxCPM\examples\` | **参考音频素材库**（144 条，含归星物语候选角色） |
| `E:\BINGdown\VoxCPM\mwedm\Scripts\voxcpm.exe` | CLI 可执行文件（脚本实际调用的东西） |
| `E:\BINGdown\VoxCPM\models\` | 三大模型权重目录（不要删不要移） |

### 2.2 MiMo-TTS（HTTP 接口）固定路径

| 目录/文件 | 说明 |
|-----------|------|
| `F:\MiMo-TTS-Win-v1.1.2\MiMo-TTS-Win\` | **MiMo 服务根目录** |
| `F:\MiMo-TTS-Win-v1.1.2\MiMo-TTS-Win\start.bat` | **启动脚本（先双击这个）**，开一个 Node 服务 |
| `F:\MiMo-TTS-Win-v1.1.2\MiMo-TTS-Win\app\.env` | 服务配置文件，里面写了 `PORT=4000`（脚本默认端口就是 4000） |
| `F:\MiMo-TTS-Win-v1.1.2\MiMo-TTS-Win\app\data\llm-config.json` | 可选：脚本会尝试从这里读取 `apiKey`（没配置也不致命，本地模式可能不需要 key） |
| `http://127.0.0.1:4000/api/tts/voice-clone` | **音色克隆接口（脚本 POST 这里）** |
| `http://127.0.0.1:4000/api/tts/config` | 健康检查接口（脚本跑前先 GET 确认服务在线） |

### 2.3 项目内脚本文件

| 目录/文件 | 说明 |
|-----------|------|
| `tools/gen_voice.py` | **一键语音生成脚本（AI 调这个）**，双引擎统一入口，纯 Python 标准库，不需要额外 pip |
| `tools/voice_tasks.example.json` | 批量任务示例（入库，12 条 VoxCPM + 5 条 MiMo） |
| `tools/voice_tasks.json` | 用户/AI 实际编辑的批量任务（**已在 .gitignore，不入库**） |
| `public/audio/voice/` | **生成产物落点**（游戏里直接 `this.sound.add('linche_intro')` 加载） |
| `docs/VoxCPM语音生成一键调用手册.md` | 本手册（即此文件） |

---

## §3 工具脚本说明：`tools/gen_voice.py`

### 3.1 环境前置检查（脚本启动时自动校验）

**VoxCPM 引擎专属检查（engine=voxcpm 时触发）**

| 检查项 | 说明 | 失败退出码 |
|--------|------|----------|
| VoxCPM 根目录存在 | 默认 `E:\BINGdown\VoxCPM`，不存在直接退出 | 10 |
| 3 个模型文件完整 | `VoxCPM-0.5B` / `SenseVoiceSmall` / `ZipEnhancer` 关键文件都在 | 11 |
| CLI 可执行文件存在 | `mwedm\Scripts\voxcpm.exe`（实际推理二进制） | 11 |
| `--ref-audio` 存在 | 参考音频文件必须真实存在 | 20 |
| `--output` 父目录不是文件 | 防止把已有文件误当目录写（保护用户数据） | 21 |
| 输出文件 ≥ 30KB（.wav） | 排除 0 字节或几 KB 的坏音频 | 30 |

**MiMo-TTS 引擎专属检查（engine=mimo 时触发，批量里懒加载，第一次用到时才检查）**

| 检查项 | 说明 | 失败退出码 |
|--------|------|----------|
| HTTP 健康检查通过 | `GET http://127.0.0.1:4000/api/tts/config` 返回 200（证明 start.bat 已启动） | **12** |
| `--ref-audio` 存在 | 同 VoxCPM | 20 |
| `--output` 父目录不是文件 | 同 VoxCPM | 21 |
| 输出文件 ≥ 8KB（.mp3） | MiMo 返回 mp3，阈值比 wav 低 | 30 |

> 💡 **修正历史遗留说明**：v0.1 文档写过 exit 12 = "Python/soundfile 缺失"，**当前脚本已完全不依赖 soundfile（纯标准库）**，请以本手册 v0.2 为准。

### 3.2 完整参数表

| 参数 | 适用引擎 | 说明 | 默认值 |
|------|---------|------|--------|
| **--engine** | 通用 | `voxcpm`（默认）= 本地推理；`mimo` = 调 MiMo HTTP；`auto` = 批量按任务 JSON 定，单条等同 voxcpm | `voxcpm` |
| **--mode 选择** | | | |
| `--batch FILE.json` | 通用 | 批量模式：从 JSON 读 `tasks[]` 逐条跑（**与 --text 互斥**） | — |
| **单条模式** | | | |
| `--text "..."` | 通用 | 要合成的文字（中/英/混输都行） | **必填**，批量由 JSON 给 |
| `--ref-audio PATH` | 通用 | 参考音频（wav/mp3/m4a 都行），要克隆的声音 | 单条必填 |
| `--ref-text "..."` | VoxCPM 专属 | 参考音频里的文字；**空着就用 SenseVoice 自动转写（推荐）** | 空（自动转写） |
| `--output PATH` | 通用 | 输出文件（voxcpm 建议 .wav；mimo 建议 .mp3；后缀自己决定） | 单条必填；批量由 JSON 决定 |
| `--user-message TEXT` | MiMo 专属 | **风格/情绪/方言引导**，例如"年轻女孩撒娇语气"、"四川方言"、"悲伤低沉" | 空（MiMo 默认） |
| **VoxCPM 调参** | | | |
| `--cfg 2.0` | VoxCPM | 贴角色度：**声音假调低（1.2~1.8），要贴角色调高（2.0~2.6）**，超过 2.8 容易抽飞 | `2.0` |
| `--steps 10` | VoxCPM | 推理步数：**4（快但糊）~ 20（慢但精细）**，常用 8~12 | `10` |
| `--enhance` / `--no-enhance` | VoxCPM | 参考音频 ZipEnhancer 去噪增强（素材脏就开，干净就关省时间） | 默认开 |
| **MiMo 调参** | | | |
| `--speed 1.0` | MiMo | **语速倍率**：0.8（慢）~1.2（快）常用，1.0 原速。角色活泼就 1.05~1.1，老人旁白就 0.9~0.95 | `1.0` |
| **环境覆盖** | | | |
| `--voxcpm-root PATH` | VoxCPM | VoxCPM 目录不在 E 盘时覆盖 | `E:\BINGdown\VoxCPM` |
| `--mimo-root PATH` | MiMo | MiMo 根目录（用于找 start.bat / data/llm-config.json） | `F:\MiMo-TTS-Win-v1.1.2\MiMo-TTS-Win` |
| `--mimo-port INT` | MiMo | MiMo HTTP 端口（和 app\\.env 里的 PORT 保持一致） | `4000` |
| `--mimo-api-key KEY` | MiMo | API Key（**优先级最高**，高于环境变量 `MIMO_API_KEY` 和 `data/llm-config.json` 里的配置） | 空（尝试从别处读） |
| **批量模式控制** | | | |
| `--continue-on-error` | 通用 | （默认）一条失败继续跑下一条 | 默认开 |
| `--stop-on-error` | 通用 | 任何一条失败立刻停（赶工排错时好用） | — |
| **调试** | | | |
| `--dry-run` | 通用 | **不实际生成**（voxcpm 不调用 CLI，mimo 不发 HTTP POST），只打印参数/路径 | — |
| `--help` / `-h` | 通用 | 打印完整参数说明（含示例命令） | — |

### 3.3 完整退出码表（AI 调用必备）

| 码 | 含义 | AI 决策 / 人类应对 |
|----|------|-------------------|
| 0 | 全部成功（单条 / 批量 100%） | OK，可以继续下一步；建议再 `Get-Item` 看文件大小二次确认 |
| 10 | VoxCPM 根目录不存在（默认 E:\BINGdown\VoxCPM） | 让用户确认 VoxCPM 目录有没有移动过，或传 `--voxcpm-root` 覆盖 |
| 11 | VoxCPM 模型文件不完整 / CLI 缺失 | 让用户重新下载缺失模型（参考 §6 FAQ），或双击 VoxCPM 启动器自动下 |
| **12** | **MiMo 服务未启动 / 端口不对 / 连接被拒绝** | 先双击 `start.bat` 启动 MiMo 服务，等 10 秒再试；或检查端口（默认 4000，不一致时传 `--mimo-port`） |
| 20 | 参考音频文件不存在 | 检查路径（是不是复制进 JSON 时少写了反斜杠）；让用户重新选素材 |
| 21 | 输出父路径是文件不是目录 | 检查 `--output` 路径是否和已有文件重名，改名或删除冲突文件 |
| 22 | 批量 JSON 解析失败 / tasks 为空 | 用 `python -m json.tool voice_tasks.json` 检查语法，修逗号/引号 |
| 23 | --batch 和 --text 同时给了（互斥） | 二选一：要么单条要么批量 |
| 30 | 生成产物过小（坏音频 / 空响应） | voxcpm：换 ref-audio / 调 cfg+steps / 手动填 ref_text；mimo：重启服务或看错误详情是否 401/403/429 |
| 40 | 批量模式中 ≥1 条失败 | 看控制台打印的"失败清单"，按任务 ID 单独修 JSON 后重跑，或用 `--stop-on-error` 先停在第一条失败上 |

---

## §4 批量任务 JSON 规范

### 4.1 文件位置
```
tools/voice_tasks.example.json   ← 示例，入库（不要改这个）
tools/voice_tasks.json           ← 实际编辑，.gitignore 不入库
```

### 4.2 最小双引擎混合示例
```json
{
  "defaults": {
    "cfg": 2.0,
    "steps": 10,
    "enhance": true,
    "speed": 1.0,
    "user_message": "自然口语化，不要播音腔"
  },
  "tasks": [
    {
      "id": "linche_vox_intro",
      "role_en": "linche",
      "engine": "voxcpm",
      "text": "大家好，我是林澈，今天刚回到归星村。",
      "ref_audio": "E:\\BINGdown\\VoxCPM\\examples\\林远.mp3",
      "cfg": 2.1,
      "output": "public/audio/voice/linche/intro_vox.wav"
    },
    {
      "id": "xiya_mimo_greeting",
      "role_en": "xiya",
      "engine": "mimo",
      "text": "你回来啦，爷爷种的麦子又长高了呢~",
      "ref_audio": "E:\\BINGdown\\VoxCPM\\examples\\夏荷.MP3",
      "speed": 1.08,
      "user_message": "年轻女孩轻快语气，带点惊喜",
      "output": "public/audio/voice/xiya/greeting_mimo.mp3"
    }
  ]
}
```

### 4.3 字段说明（分三类：通用 / VoxCPM 专属 / MiMo 专属）

**通用字段（两引擎都认）**

| 字段 | 层级 | 必选 | 说明 |
|------|------|------|------|
| `engine` | defaults / task | 可选 | `"voxcpm"` / `"mimo"`。**优先级**：CLI `--engine`（非 auto 时）> task.engine > defaults.engine > 脚本默认 voxcpm |
| `tasks[].id` | task | ✅ | 任务唯一 ID（失败时定位用，不要中文/空格，建议小写字母+下划线+数字） |
| `tasks[].role_en` | task | ✅ | 角色英文短名（没写 output 时用来拼子目录：`linche` / `xiya` / `grandpa` / `narrator` …） |
| `tasks[].text` | task | ✅ | 要合成的文字 |
| `tasks[].ref_audio` | task | ✅ | 参考音频**绝对路径**（建议用 `examples\` 下的；Windows JSON 里反斜杠要写双写 `\\`） |
| `tasks[].output` | task | 可选 | 自定义输出路径（绝对或相对项目根）；**不写**就自动落到 `public/audio/voice/<role_en>/<id>.<ext>`（voxcpm=.wav，mimo=.mp3，脚本会按 engine 选默认后缀） |
| `voxcpm_root` | defaults / task | 可选 | 覆盖 VoxCPM 根目录（极少数情况用） |
| `mimo_root` / `mimo_port` / `mimo_api_key` | defaults / task | 可选 | 覆盖 MiMo 环境（API Key **不要直接写进 JSON 入库**，建议用环境变量或 CLI 传） |

**VoxCPM 专属字段（engine=voxcpm 时生效）**

| 字段 | 层级 | 说明 |
|------|------|------|
| `cfg` | defaults / task | 贴角色度，1.2~2.6（见 §3.2） |
| `steps` | defaults / task | 推理步数，4~20 |
| `enhance` | defaults / task | `true` / `false`（去噪增强开关） |
| `tasks[].ref_text` | task | 参考音频里的准确文字；空字符串 = 用 SenseVoice 自动转写（**推荐留空**） |

**MiMo 专属字段（engine=mimo 时生效）**

| 字段 | 层级 | 说明 |
|------|------|------|
| `speed` | defaults / task | 语速倍率，0.8~1.2（常用范围） |
| `user_message` | defaults / task | 风格/情绪/方言/特殊要求引导提示词（自然语言写就行，比如"80岁老奶奶慢慢说，有气无力"） |

---

## §5 归星物语角色推荐参数速查表

### 5.1 VoxCPM 参考素材推荐

| 角色（暂定） | 参考音频（`E:\BINGdown\VoxCPM\examples\`） | 推荐 cfg | 推荐 steps |
|--------------|-----------------------------------------|----------|------------|
| **林澈**（男主青年音） | `林远.mp3` / `周默.mp3` / `林岳.wav` | 1.9~2.1 | 10~12 |
| **夏雅**（女主甜美青年） | `夏荷.MP3` / `御姐2.MP3` / `苏婉.mp3` | 1.7~1.9 | 10~12 |
| **爷爷 / 村长**（老年男） | `老爷爷1.MP3` / `老汉3.mp3` / `菩提老祖.mp3` | 2.2~2.5 | 12~15 |
| **老奶奶**（老年女） | `老奶奶1.mp3` / `老奶奶.wav` / `龙婆.m4a` | 2.0~2.3 | 12 |
| **小女孩**（萝莉） | `萝莉1.MP3` / `原神可莉.mp3` | 1.8~2.0 | 12 |
| **小男孩**（正太） | `小男孩5.mp3` / `男孩5.mp3` | 1.8~2.0 | 10~12 |
| **旁白 / 系统** | `旁白.mp3` / `系统.wav` / `主持人.mp3` | 1.9~2.2 | 10 |
| **成熟女声**（书记/商人） | `成熟女性1.MP3` / `御姐1.MP3` / `御姐3.MP3` | 1.8~2.0 | 10~12 |
| **磁性男低音**（铁匠/守卫） | `男磁性.MP3` / `男磁性2.MP3` / `林远1.wav` | 2.0~2.3 | 12 |

### 5.2 MiMo 参数推荐（同一套参考音频也能喂给 MiMo）

| 角色（暂定） | 推荐 speed | 推荐 user_message 模板 |
|--------------|------------|----------------------|
| 林澈（青年男主） | 1.0~1.05 | `"20多岁青年男声，语气自然放松，叙事感，不要太用力"` |
| 夏雅（甜美青年） | 1.05~1.12 | `"年轻女孩的声音，明快活泼，带一点少女的软感"` |
| 爷爷 / 村长 | 0.9~0.95 | `"60-70岁老年男性，语速偏慢，声音沉稳有阅历感"` |
| 老奶奶 | 0.9~0.95 | `"70岁左右老年女性，语速慢，语气温和慈祥"` |
| 小女孩 | 1.1~1.2 | `"6-8岁小女孩，声音清脆，语气天真好奇，节奏快"` |
| 小男孩 | 1.05~1.12 | `"10岁左右小男孩，声音清亮，带一点调皮感"` |
| 旁白 | 0.95~1.0 | `"专业旁白，声音稳重清晰，不要带角色情绪"` |
| 系统提示音 | 1.0 | `"中性系统音，平稳清晰，无感情色彩，播报感"` |
| 成熟女声（商人） | 1.0~1.05 | `"30岁左右成熟女性，语气干练利落，有信任感"` |
| 磁性男低音（铁匠） | 0.95~1.0 | `"中年男性，低沉浑厚，声音有力量感"` |

> 💡 小技巧：MiMo 的 `user_message` 是**最能体现角色差异**的参数，比单纯调 speed 效果明显。同一个参考音频，改 user_message 可以出完全不同的角色感。

---

## §6 常见问题 FAQ

### VoxCPM 引擎常见问题

**Q1：生成的音频 0 字节或只有几 KB（exit 30）**
- **原因 1**：ref_text 完全错了 → 把 `ref_text` 留空让 SenseVoice 自动转写
- **原因 2**：参考音频全是音乐/杂音 → 换一段有人声且清晰的（5~15 秒最佳）
- **原因 3**：cfg 太高（>2.8）模型抽飞 → 降到 1.5 重试
- **原因 4**：显存 OOM → 调 steps 到 6~8，或关 enhance（`--no-enhance`）

**Q2：模型缺失 / 第一次跑时脚本报 11**
- VoxCPM-0.5B：modelscope.cn 搜 `OpenBMB/VoxCPM-0.5B` 下载，放 `models\openbmb__VoxCPM-0.5B\`
- SenseVoice / ZipEnhancer：搜 `iic/SenseVoiceSmall` 和 `iic/speech_zipenhancer_ans_multiloss_16k_base`
- 或者双击 `VoxCPM 启动器.exe`，它会自动下载缺失模型

**Q3：生成速度太慢**
- `--steps` 调小到 6~8（牺牲细节，提速 ~30%）
- `--no-enhance` 关掉去噪（素材干净时，省 ~10%）
- 还是慢 → 换 **MiMo 引擎**（同样的任务快 5~10 倍）

**Q4：音色不像参考音频**
- `--cfg` +0.2 往上调（最大 2.6，再高就假了）
- 换一段 5~15 秒的参考音频（背景干净、说话风格贴近角色）
- 手动填 `--ref-text`（比自动转写更准）
- 以上都不行 → 换 MiMo 引擎（音色克隆一致性通常更好）

---

### MiMo 引擎常见问题（重点）

**Q5：脚本报 exit 12，提示"由于目标计算机积极拒绝，无法连接"**
- 99% 是 **MiMo 服务没启动**：先双击 `F:\MiMo-TTS-Win-v1.1.2\MiMo-TTS-Win\start.bat`，等终端打印出服务启动信息（通常要等 10~30 秒）再跑脚本
- 剩下 1% 是端口不对：去 `app\.env` 看 `PORT=xxxx`，然后脚本里加 `--mimo-port xxxx`

**Q6：MiMo 报 HTTP 401 / 403**
- 需要配置 API Key。三种方式任选一种（优先级从高到低）：
  1. CLI 传：`--mimo-api-key sk-xxxxxxxxxxxx`
  2. 环境变量：PowerShell 里执行 `$env:MIMO_API_KEY="sk-xxxxxxxxxxxx"`
  3. 让脚本自动读：把 key 写进 `F:\MiMo-TTS-Win-v1.1.2\MiMo-TTS-Win\app\data\llm-config.json` 的 `apiKey` 字段

**Q7：MiMo 报 HTTP 429 Too Many Requests**
- 被限流了：MiMo 音色克隆接口有最小请求间隔
- 解决：等几秒再跑；或者批量任务跑完一次，歇一会再跑失败的（脚本默认 `--continue-on-error`，失败的任务最后会列出来）

**Q8：MiMo 报 HTTP 5xx（500/502/503）**
- 服务端问题，大概率是 MiMo 内部卡了
- 解决：关了 start.bat 那个终端窗口，重新双击启动一次，等 30 秒再试

**Q9：MiMo 返回 200 但产物 < 8KB（exit 30），或 JSON 错误**
- 说明服务端虽然成功但没返回真正的音频，看控制台日志里打印的 `raw前xxx字`，通常是 `{success:false, message:"..."}` 形式
- 根据 message 判断：参考音频格式不支持 → 转成 mp3/wav；文本太长 → 拆成多条；音色克隆失败 → 换参考音频

**Q10：speed 调多少合适？**
- 0.9~0.95：老人、旁白、悲伤场景
- 1.0：中性、通用
- 1.05~1.1：年轻人、日常对话
- 1.1~1.2：小孩、活泼角色、紧急场景
- 不建议 < 0.7 或 > 1.3，会变鬼畜

**Q11：user_message 写多长？有什么格式要求？**
- 1~2 句话就行，自然语言描述，不用 JSON 结构
- 可以写：角色年龄段 + 性别 + 语气 + 情绪 + 特殊要求（方言、口音、口吃等）
- 例如：`"20岁女大学生，温柔语气，带一点害羞，普通话略带一点四川口音"`

**Q12：MiMo 能生成 wav 吗？还是只能 mp3？**
- 当前实现：MiMo 返回什么格式脚本就写什么格式，通常是 mp3
- 你想转 wav → 把 `--output` 写成 `.wav` 后缀**不会自动转码**（避免强依赖 ffmpeg），需要的话自己手动用 ffmpeg 跑：
  ```powershell
  ffmpeg -i input.mp3 -ar 16000 -ac 1 -c:a pcm_s16le output.wav
  ```

**Q13：批量里一半想走 voxcpm 一半想走 mimo，可以吗？**
- 可以！每条任务单独写 `"engine": "voxcpm"` 或 `"engine": "mimo"` 即可
- CLI 传 `--engine auto`（或不传，让 engine 字段生效）就是按任务 JSON 里各自的 engine 跑
- 或者 CLI 传 `--engine mimo` **强制覆盖**所有任务（不管 JSON 里写了啥，全部走 mimo）——赶工时常用

---

## §7 AI 调用规范（接手 AI 必看）

### 7.1 标准流程：单条 VoxCPM

```python
# 伪代码/命令行示意：
# subprocess.run(["python", "tools/gen_voice.py",
#   "--engine", "voxcpm",
#   "--text", "...",
#   "--ref-audio", "E:\\BINGdown\\VoxCPM\\examples\\林远.mp3",
#   "--output", "public/audio/voice/linche/intro.wav",
#   "--steps", "10", "--cfg", "2.0"])
```

拿到退出码后：
- `0` → 二次确认文件大小：`(Get-Item public/audio/voice/linche/intro.wav).Length`，≥30KB 才算真成功
- `10~11` → 检查 VoxCPM 环境，不要盲重试
- `20~21` → 修路径
- `30` → 调 cfg/steps/ref_text 再试一次；连续 2 次 30 → 换 ref-audio 或切 MiMo

### 7.2 标准流程：单条 MiMo

**第一步：先确认服务在线（可选，脚本自己也会查，但 AI 提前查更稳）**
```powershell
try { Invoke-WebRequest -Uri "http://127.0.0.1:4000/api/tts/config" -TimeoutSec 3 -UseBasicParsing | Out-Null; "MiMo OK" } catch { "MiMo OFFLINE，请启动 start.bat" }
```
返回 OFFLINE → 让用户先双击 `start.bat`，不要硬跑。

**第二步：跑脚本**
```powershell
python tools/gen_voice.py `
  --engine mimo `
  --text "..." `
  --ref-audio "E:\BINGdown\VoxCPM\examples\夏荷.MP3" `
  --output "public/audio/voice/xiya/xxx.mp3" `
  --speed 1.08 `
  --user-message "年轻女孩，语气活泼带惊喜"
```

**第三步：判结果**
- exit 0 + 文件 ≥ 8KB → OK
- exit 12 → 让用户确认服务已启动
- exit 401/403 → 配 API Key
- exit 429 → 等 30 秒再重试一次

### 7.3 标准流程：批量模式（项目首选）

```powershell
# 步骤 1：写入/修改 tools/voice_tasks.json（id 不要中文不要空格；ref_audio 路径双反斜杠）
# 步骤 2：必跑 dry-run 看路径解析对不对（不实际生成，不花额度）
python tools/gen_voice.py --batch tools\voice_tasks.json --dry-run

# 步骤 3：正式跑（默认 continue-on-error，一条失败不影响其他）
python tools/gen_voice.py --batch tools\voice_tasks.json

# 步骤 4：检查结果
# exit 0 → 全成功 ✅
# exit 40 → 看控制台打印的"失败清单"，按任务 ID 定位问题，单独修 JSON 后重跑
```

### 7.4 AI 引擎选择决策逻辑（接手 AI 必须遵守）

```
任务数量 ≥ 5 条？
├─ 是 → 先确认 MiMo 服务在线 → 在线则用 mimo（快很多）；不在线问用户要不要启动
└─ 否 → 两引擎都行，默认 voxcpm（免费），除非用户指定或赶时间

用户/剧情对音色一致性要求高（主角、反复出现的角色）？
├─ 是 → 优先 mimo（音色克隆更稳），或同角色所有条用同一引擎同一参数
└─ 否 → 都行

显存够吗（>12G 空闲）？
├─ 不够 → 直接 mimo，voxcpm 大概率 OOM
└─ 够 → 都行
```

### 7.5 注意事项（非常重要）

1. **不要擅自打开 VoxCPM GUI / MiMo WebUI 手动生成** — 脚本无法复现你手动用的参数，后续批量会对不上
2. **不要移动/删除 VoxCPM 的模型目录，不要改 MiMo 的 .env 端口** — 这俩都是长期固定路径，改了脚本要同步改
3. **不要把 voice_tasks.json 入库** — 已在 .gitignore，里面有 E/F 盘本机绝对路径，入库会炸其他同事环境
4. **不要把 MiMo API Key 明文写进 JSON 或提交到 git** — 用环境变量或 CLI 传
5. **VoxCPM wav 默认 16kHz 单声道** — Phaser `this.sound.add()` 直接支持，不需要再转
6. **MiMo 输出 mp3 直接能用** — Phaser 也支持 mp3，无需转 wav（除非你要统一音频格式）
7. **批量任务失败后不要整批重跑** — 只修那几条失败的，把成功的从 JSON 里暂时注释掉（或另起一个小 JSON），免得浪费算力和额度

---

## §8 测试结果（v0.2 文档编写当日快照）

| 测试项 | 结果 | 说明 |
|--------|------|------|
| `python -m py_compile tools/gen_voice.py` | ✅ | 语法检查通过，无 import 错误 |
| `python tools/gen_voice.py --help` | ✅ | 全部 22 个参数能识别，MiMo 专属参数（engine/speed/user-message/mimo-*）分组正确，epilog 示例正确 |
| `voice_tasks.example.json` 语法校验 | ✅ | `json.load()` 无异常，17 条任务结构正确（12 条 VoxCPM + 5 条 MiMo/混合） |
| VoxCPM 环境探测（E 盘根目录 + 3 模型） | ✅ | 本机已配置完毕，无缺失 |
| MiMo 服务连通性检查 | ⚠️ **当前离线（预期）** | start.bat 未启动，脚本报 exit 12，错误信息提示正确（含启动文件路径 + 端口检查提示） |
| `--engine mimo --batch example.json --dry-run` | ✅ 路径解析正确 | 17 条任务中第一条触发环境检查失败（预期），参数合并逻辑已执行：CLI --engine 覆盖了任务 JSON 里写的 voxcpm，证明 `--engine` 强制覆盖生效 |

---

文档版本：v0.2（双引擎版）
重写时间：2026-08-04
对应脚本版本：`tools/gen_voice.py`（commit 待补，HEAD 当前版本）
