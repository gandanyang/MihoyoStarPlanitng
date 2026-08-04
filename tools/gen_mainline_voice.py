#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
归星物语主线剧情语音批量生成脚本（任务-主线剧情语音生成与接入）。

- 入口：E:\\BINGdown\\VoxCPM\\mwedm\\python.exe -m voxcpm.cli（禁止 voxcpm.exe shim）
- 参数：--cfg-value 2.4（超短句 ≤4 字 2.6）--inference-timesteps 16（超短句 20）
       --no-denoiser --local-files-only
- 台词格式：标点连排、不用换行（避免长停顿）
- 生成后立即 F0 自检（男 70-180Hz / 女 170-320Hz），漂移重跑 ≤3 次
- 夏雅 atempo 1.1；爷爷/少女 atempo 0.95（稍慢）；HR 电话感 EQ
- 输出：public/audio/voice/<角色>/<场景>_<序号>.wav

用法：
  python tools/gen_mainline_voice.py --dry-run     # 打印任务清单不执行
  python tools/gen_mainline_voice.py --limit 3     # 只跑前 3 条（样本验证）
  python tools/gen_mainline_voice.py               # 全量（已存在文件跳过）
  python tools/gen_mainline_voice.py --force       # 覆盖已存在文件
  python tools/gen_mainline_voice.py --skip-f0     # 跳过 F0 自检（调试用）
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ========================= 环境常量 =========================
VOX_PY = r"E:\BINGdown\VoxCPM\mwedm\python.exe"
MODEL_PATH = r"E:\BINGdown\VoxCPM\models\openbmb__VoxCPM-0.5B"
FFMPEG = r"E:\BINGdown\VoxCPM\src\ffmpeg\bin\ffmpeg.exe"
OUT_ROOT = Path("public") / "audio" / "voice"
MIN_BYTES = 30 * 1024
MAX_RETRY = 3

# 角色参考（ref_text 为空 → 不传 --prompt-text，让 VoxCPM 自动转写）
ROLES = {
    "linche": dict(
        ref=r"public\assets\audio\generated\林澈新B青年清澈_20260804_001.mp3",
        ref_text="十年前的那个早晨，我依然清晰记得，你穿着白衬衫的样子，那是我第一次遇见你，至今难忘。",
        cfg=2.4, steps=16, atempo=1.0, sex="male",
    ),
    "xiya": dict(
        ref=r"public\assets\audio\generated\夏雅A治愈_20260804_001.mp3",
        ref_text="人生就像一场闯关副本，不必急于一时分出高下，找准自己的定位，慢慢打磨实力，总有属于自己发光的时刻。",
        cfg=2.4, steps=16, atempo=1.1, sex="female",
    ),
    "elder": dict(
        ref=r"public\assets\audio\generated\村长亲切_20260804_001.mp3",
        ref_text="老婆，今天忙不忙？家里的米好像不多了，下班顺路帮我买一袋回来吧。天气凉了，记得多穿点衣服，别感冒了。",
        cfg=2.4, steps=16, atempo=1.0, sex="male",
    ),
    "grandpa": dict(  # v2 换角定案：老人（Character Voice）8bc02ac9
        ref=r"public\assets\audio\generated\老人A_20260804_001.mp3",
        ref_text="孩子啊，做人要懂得知足常乐。我们那个年代，虽然物质条件差，但是人心都很热。现在生活好了，可不要忘记最重要的是保持一颗善良的心。记住，家和万事兴。",
        cfg=2.4, steps=16, atempo=0.95, sex="male",
    ),
    "girl": dict(
        ref=r"public\assets\audio\generated\少女空灵B_20260804_001.mp3",
        ref_text="万物化形馆没有门，但每一个迷路的灵魂，都能在需要的时候，找到它。我携带的数据里，藏着无数等待被发现的秘密，以及那些未曾言说的故事。",
        cfg=2.4, steps=16, atempo=0.95, sex="female",
    ),
    "hr": dict(  # HR 手机通知：林澈声线 + 电话感 EQ
        ref=r"public\assets\audio\generated\林澈新B青年清澈_20260804_001.mp3",
        ref_text="十年前的那个早晨，我依然清晰记得，你穿着白衬衫的样子，那是我第一次遇见你，至今难忘。",
        cfg=2.4, steps=16, atempo=1.0, sex="male", phone_eq=True,
    ),
}

ROLE_DIRS = {"hr": "system"}


# ========================= 台词任务清单（文本与 StorySystem.ts 精确一致） =========================
# id = 输出文件名（<场景>_<序号>.wav）；text 去掉语气标注（（笑）等），接入映射用原文 key
T = [
    # ---- 林澈（linche）----
    ("linche", "station_01", "五年了。"),
    ("linche", "station_02", "……换个环境，也许也不错。"),
    ("linche", "station_03", "爷爷说，如果不知道往哪走，就回来看看。"),
    ("linche", "station_04", "至少这次，是我自己选的离开。"),
    ("linche", "xiya_02", "你认识我？"),
    ("linche", "xiya_04", "我也没想到自己会回来。本来只是想看看爷爷留下的地方。"),
    ("linche", "gate_01", "……比我以为的还要荒。"),
    ("linche", "gate_03", "爷爷一个人打理这么大的地方？"),
    ("linche", "gate_06", "他从来没跟我说过这些。"),
    ("linche", "dawn_02", "你每天都起这么早？"),
    ("linche", "dawn_04", "……我以前，都是被闹钟叫醒的。"),
    ("linche", "harvest_02", "嗯。"),
    ("linche", "harvest_04", "比想象中重。"),
    ("linche", "evening_02", "挺累的。"),
    ("linche", "evening_04", "嗯。"),
    ("linche", "water_04", "卖掉？"),
    ("linche", "evening_talk_01", "以前总觉得，只要不断追赶时代，就不会被淘汰。"),
    ("linche", "evening_talk_02", "可是现在……也许慢下来，也不是坏事。"),
    ("linche", "evening_talk_03", "……爷爷连种地都要记笔记。"),
    ("linche", "town_01", "这就是青禾镇……爷爷信里提起过的地方。"),
    ("linche", "elder_02", "您好，您是……"),
    ("linche", "elder_04", "……他真的喜欢看星星？"),
    ("linche", "elder_06", "去做什么？"),
    ("linche", "elder_08", "……那我去看看吧。"),
    ("linche", "shard_01", "镇长，星之碎片……我拿到了。"),
    ("linche", "shard_05", "……我其实没做什么。它就在那儿，我只是走过去拿起来而已。"),
    ("linche", "forest_02", "不是没有反应。"),
    ("linche", "forest_03", "更像一个长期没有维护的系统。"),
    ("linche", "forest_05", "它在等待一个条件。没有回应，是因为条件还没满足。"),
    ("linche", "forest_07", "职业习惯。"),
    ("linche", "woodcut_01", "……爷爷留下的庄园，要修的地方还不少。"),
    ("linche", "woodcut_03", "你倒是把什么都想好了。"),
    ("linche", "woodcut_05", "以前只会删代码，现在倒要学着砍树了。"),
    ("linche", "mine_01", "那些发光的矿石……"),
    ("linche", "mine_03", "那我挖一点回去试试。"),
    ("linche", "mine_05", '以前加班熬到半夜，也没人跟我说"累了就歇着"。'),
    ("linche", "robot_01", "这是……农业机器人？很旧的样子。"),
    ("linche", "robot_02", "修一修，说不定还能用。"),
    ("linche", "robot_03", "……它能帮我看顾农田。"),
    ("linche", "ending_04", "他也喜欢看星星？"),
    ("linche", "ending_10", "城市里，很久没见过这样的星星了。"),
    ("linche", "branchA_01", "这些年换了几个城市，没有哪个地方让我觉得……是应该留下的。"),
    ("linche", "branchB_01", "他为什么来这里？他一个人在这里住了多久？"),
    ("linche", "branchB_02", "……我好像从来没问过他这些。"),
    ("linche", "branchC_01", "……说实话，我连明天会怎样都不知道。"),

    # ---- 夏雅（xiya）----
    ("xiya", "xiya_01", "你就是林澈？"),
    ("xiya", "xiya_03", "林爷爷以前提过你。……大家都以为，不会有人回来了。"),
    ("xiya", "xiya_05", "那就先从这扇门开始吧。"),
    ("xiya", "gate_02", "这里以前不是这样的。"),
    ("xiya", "gate_04", "嗯。他说，只要还有人愿意住下来，这里就不会荒废。"),
    ("xiya", "gate_05", "旧了点，但还能用。你爷爷当年就是用这把锄头，把这片地一锄一锄开出来的。"),
    ("xiya", "gate_07", "有些事，要等你自己回来了，才会知道。"),
    ("xiya", "dawn_01", "这么早？我睡不着，就过来看看这些地。"),
    ("xiya", "dawn_03", "岛上的人都这样。太阳一出来，就想醒着。"),
    ("xiya", "harvest_01", "第一次自己种出来？"),
    ("xiya", "harvest_03", "感觉怎么样？"),
    ("xiya", "evening_01", "累吗？"),
    ("xiya", "evening_03", "以前你也是这样？"),
    ("xiya", "evening_05", "那以后记得早点休息。"),
    ("xiya", "sow_01", "先开三块地。地要翻过，种子才肯住下。"),
    ("xiya", "water_01", "种下去，就得天天来看它。你爷爷说，庄稼最怕被忘记。"),
    ("xiya", "water_02", "种下去了，接下来就等它长大。"),
    ("xiya", "water_03", "庄园还有不少地方需要修，等收成以后，可以拿去镇上的店换些钱。"),
    ("xiya", "water_05", "嗯。留下需要的，换成需要的东西，这里才能慢慢恢复起来。"),
    ("xiya", "forest_01", "我们试过很多办法，可它一直没有反应。"),
    ("xiya", "forest_04", "什么？"),
    ("xiya", "forest_06", "……你又在说奇怪的话了。"),
    ("xiya", "woodcut_02", "这些树正好用得上。砍下来的木材，能卖钱，也能修房子。"),
    ("xiya", "woodcut_04", "在岛上住久了，自然就懂这些了。"),
    ("xiya", "mine_02", "老张年轻时候就在矿洞里讨生活，说那些石头、铜矿都能卖钱。"),
    ("xiya", "mine_04", "别逞强，你爷爷以前也是，忙起来连饭都忘了吃。"),
    ("xiya", "garden_01", "这里以前也是爷爷最喜欢来的地方。"),
    ("xiya", "garden_02", "小时候我经常看到他坐在这里，一坐就是很久。"),
    ("xiya", "garden_03", "他说，院子有人照顾，就不会冷清。"),
    ("xiya", "garden_04", "奇怪……爷爷以前说，这里的花总是比别的地方开得早。"),
    ("xiya", "ending_01", "你爷爷以前每天都会坐在这里。"),
    ("xiya", "ending_02", "他走以后，岛上的人还是会偶尔来看这里。"),
    ("xiya", "ending_03", "大家都觉得，总有一天，会有人重新打开这扇门。"),
    ("xiya", "ending_05", "嗯。他说，总有一天，会有人回来继续看。"),
    ("xiya", "branchA_02", "那就别走了。"),
    ("xiya", "branchC_02", "不需要知道。"),
    ("xiya", "branchC_03", "你在这里，就足够了。"),
    ("xiya", "finale_01", "已经很久了，这片地没有这么热闹过。"),
    ("xiya", "finale_02", "青禾镇，欢迎你。"),

    # ---- 村长（elder）----
    ("elder", "elder_01", "你就是林澈吧？星黎庄园的新主人。"),
    ("elder", "elder_03", "我是青禾镇的镇长。你爷爷啊，年轻时候就喜欢晚上坐在那块石头上看天。"),
    ("elder", "elder_05", "喜欢。他以前也经常往森林跑。"),
    ("elder", "elder_07", "他说那里有些东西，值得看看。"),
    ("elder", "shard_02", "这光泽……没错，就是星之碎片。你爷爷当年捡到第一片的时候，也是这样的光。"),
    ("elder", "shard_03", '他跟我说过，这座岛上的碎片，只有真正"想留下来"的人才能拿起来。'),
    ("elder", "shard_04", "你能把它带回来，说明这座岛……已经认你了。"),
    ("elder", "shard_06", "那就够了。有时候，不是人找到东西，是东西找到人。"),
    ("elder", "shard_07", "你爷爷以前啊，总喜欢在晚上去农田后面的地方坐一会儿。他说，那里的星星很亮。"),

    # ---- 爷爷（grandpa：笔记/信/纸条）----
    ("grandpa", "notes_01", "今天又捡到一片。星星……是不是也想回家？"),
    ("grandpa", "notes_02", "我数了数，还差一些。等它们都回来了，也许就能问清楚了。"),
    ("grandpa", "notes_03", "那些发光的碎片，醒来时像在看我。是我多心了吧。"),
    ("grandpa", "notes_04", "今晚的星星很亮，花比往年开得早。不知道是不是这座岛在回应什么。"),
    ("grandpa", "ending_06", "如果看到这封信，说明你终于回来了。"),
    ("grandpa", "ending_07", "小澈，你小时候总问我，为什么每天都要给花浇水。"),
    ("grandpa", "ending_08", "爷爷想了很久。后来发现，人做很多事情，不一定都是为了结果。"),
    ("grandpa", "ending_09", "如果有一天机器比我们更聪明，你觉得人还需要留下些什么？"),
    ("grandpa", "evening_note", "今年番茄长得很好。植物似乎会记住照顾它的人。"),

    # ---- 神秘少女（girl）----
    ("girl", "forest_08", "……它沉睡太久了。"),

    # ---- HR 手机通知（system，林澈声线 + 电话感 EQ）----
    ("hr", "hr_station_02", "林先生，根据评估，你完全可以加入智能生态部门。"),
]


def log(title: str, msg: str = "") -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] ╔══ {title}" + (f"\n{msg}" if msg else ""))


def err(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ {msg}", file=sys.stderr)


def warn(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️  {msg}")


def output_path(role: str, tid: str) -> Path:
    d = OUT_ROOT / ROLE_DIRS.get(role, role)
    return d / f"{tid}.wav"


def story_speaker(role: str, tid: str) -> str:
    """T 清单 role → StorySystem.ts 的 DialogueLine.speaker 名称。
    grandpa 分三类：笔记/信/纸条；girl/hr 在 StorySystem 中 speaker 为空 → 用 '' 通配匹配。"""
    if role == "linche":
        return "林澈"
    if role == "xiya":
        return "夏雅"
    if role == "elder":
        return "村长"
    if role == "grandpa":
        if tid.startswith("ending"):
            return "信"
        if tid == "evening_note":
            return ""  # 纸条：StorySystem 原文带（…）包裹，按文本匹配
        return "爷爷的笔记"
    if role in ("girl", "hr"):
        return ""
    return ""


def emit_voicebank_ts(out_file: str) -> None:
    """生成 src/audio/VoiceBank.ts 的 ENTRIES 数据段（单一数据源=T 清单，避免手抄错误）。"""
    lines = [
        "/* eslint-disable */",
        "// ══════════════════════════════════════════════════════════════════",
        "// 语音映射数据 —— 由 tools/gen_mainline_voice.py --emit-voicebank 自动生成，勿手改",
        "// 生成时间：%s" % datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "// 说明：speaker='' 表示通配（少女/HR/纸条），text 为归一化后原文（已剥（笑）等标注）",
        "// ══════════════════════════════════════════════════════════════════",
        "export interface VoiceEntry { file: string; speaker: string; text: string }",
        "",
        "export const VOICE_ENTRIES: VoiceEntry[] = [",
    ]
    for role, tid, text in T:
        out = output_path(role, tid)
        rel = out.relative_to(OUT_ROOT).as_posix()
        spk = story_speaker(role, tid)
        lines.append(f"  {{ file: {rel!r}, speaker: {spk!r}, text: {text!r} }},")
    lines.append("];")
    Path(out_file).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✅ 已生成 VoiceBank 数据：{out_file}（{len(T)} 条）")


def run_cmd(cmd: list[str]) -> tuple[int, str]:
    """运行命令，返回 (returncode, stdout+stderr 尾部)。"""
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        tail = (proc.stdout or "")[-300:] + (proc.stderr or "")[-500:]
        return proc.returncode, tail
    except FileNotFoundError as e:
        return -1, f"找不到可执行文件：{e}"


def f0_median(path: Path, sex: str):
    """复用 check_f0.py 的检测逻辑，返回 (中位F0 or None, 达标bool, 描述)。"""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        from check_f0 import compute_median_f0, classify
        f0 = compute_median_f0(path, FFMPEG)
        if f0 is None:
            return None, False, "未检测到 F0"
        ok, desc = classify(f0, sex)
        return f0, ok, desc
    except ImportError:
        warn("check_f0.py 导入失败，跳过 F0 自检")
        return None, True, "F0 检查不可用（跳过）"


def post_process(path: Path, atempo: float, phone_eq: bool) -> bool:
    """atempo / 电话感 EQ 后处理，成功返回 True。"""
    if abs(atempo - 1.0) < 1e-6 and not phone_eq:
        return True
    filters = []
    if abs(atempo - 1.0) >= 1e-6:
        filters.append(f"atempo={atempo:.2f}")
    if phone_eq:
        filters.append("lowpass=f=3400,highpass=f=300")
    af = ",".join(filters)
    tmp = path.with_suffix(".tmp.wav")
    rc, tail = run_cmd([FFMPEG, "-y", "-i", str(path), "-af", af, str(tmp)])
    if rc != 0 or not tmp.exists() or tmp.stat().st_size < MIN_BYTES:
        warn(f"后处理失败（{path.name}）：{tail[-300:]}")
        tmp.unlink(missing_ok=True)
        return False
    path.unlink(missing_ok=True)
    tmp.rename(path)
    return True


def gen_one(role: str, tid: str, text: str, args: argparse.Namespace) -> tuple[bool, str]:
    rc_cfg = ROLES[role]
    out = output_path(role, tid)
    if out.exists() and not args.force:
        return True, f"已存在，跳过（{out.name}）"

    short = len(text) <= 4
    cfg = rc_cfg["cfg"] if not short else 2.6
    steps = rc_cfg["steps"] if not short else 20

    out.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        VOX_PY, "-m", "voxcpm.cli",
        "--text", text,
        "--prompt-audio", rc_cfg["ref"],
        "--output", str(out),
        "--cfg-value", f"{cfg:.1f}",
        "--inference-timesteps", str(steps),
        "--no-denoiser", "--local-files-only",
        "--model-path", MODEL_PATH,
    ]
    if rc_cfg["ref_text"]:
        cmd += ["--prompt-text", rc_cfg["ref_text"]]

    log(f"生成 [{role}/{tid}]", f"文本: {text}（{'超短' if short else ''} cfg={cfg} steps={steps}）")

    if args.dry_run:
        return True, "dry-run"

    # 生成（漂移最多重跑 3 次）
    for attempt in range(1, MAX_RETRY + 1):
        rc, tail = run_cmd(cmd)
        if rc != 0:
            warn(f"生成失败（第 {attempt} 次）：{tail[-400:]}")
            continue
        if not out.exists() or out.stat().st_size < MIN_BYTES:
            warn(f"产物缺失/过小（第 {attempt} 次）：{out.name}")
            continue

        # F0 自检
        if args.skip_f0:
            break
        f0, ok, desc = f0_median(out, rc_cfg["sex"])
        if ok:
            log(f"F0 达标 [{role}/{tid}]", f"尝试 {attempt}：{desc}")
            break
        warn(f"F0 漂移（第 {attempt} 次，{out.name}）：{desc} → 重跑")
        if attempt >= MAX_RETRY:
            return False, f"F0 漂移超过 {MAX_RETRY} 次：{desc}（标记待人工处理）"
    else:
        return False, "生成失败/产物无效（已重试 3 次）"

    # 后处理（atempo / phone EQ）
    if not post_process(out, rc_cfg["atempo"], bool(rc_cfg.get("phone_eq"))):
        return False, "后处理失败"

    return True, f"成功 → {out.name}（{out.stat().st_size:,} bytes）"


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="主线剧情语音批量生成")
    p.add_argument("--dry-run", action="store_true", help="只打印任务清单")
    p.add_argument("--limit", type=int, default=0, help="只跑前 N 条")
    p.add_argument("--force", action="store_true", help="覆盖已存在文件")
    p.add_argument("--skip-f0", action="store_true", help="跳过 F0 自检")
    p.add_argument("--emit-voicebank", metavar="OUT_TS", default="",
                   help="只生成 VoiceBank 映射数据 TS 文件（不跑生成）")
    args = p.parse_args(argv)

    if args.emit_voicebank:
        emit_voicebank_ts(args.emit_voicebank)
        return

    tasks = T[:args.limit] if args.limit > 0 else T
    log(f"批量生成启动：共 {len(tasks)} 条", f"dry-run={args.dry_run} force={args.force} skip-f0={args.skip_f0}")

    ok_count = 0
    failed: list[tuple[str, str]] = []
    for role, tid, text in tasks:
        ok, note = gen_one(role, tid, text, args)
        if ok:
            ok_count += 1
            if args.dry_run:
                print(f"  · [{role}/{tid}] {text[:36]}")
        else:
            failed.append((f"{role}/{tid}", note))
            err(f"[{role}/{tid}] {note}")

    log("批量结束", f"成功 {ok_count} / {len(tasks)}，失败 {len(failed)}")
    for tid, note in failed:
        print(f"  ❌ [{tid}] {note}")
    if failed and not args.dry_run:
        sys.exit(40)


if __name__ == "__main__":
    main()
