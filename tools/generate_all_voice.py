#!/usr/bin/env python3
"""主线剧情全台词批量语音生成（VoxCPM 本地推理）。"""
import argparse, subprocess, sys, time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
VOXCPM_PYTHON = Path(r"E:\BINGdown\VoxCPM\mwedm\python.exe")
VOXCPM_MODEL = Path(r"E:\BINGdown\VoxCPM\models\openbmb__VoxCPM-0.5B")
FFMPEG = "ffmpeg"

ROLES = {
    "linche": {
        "ref_audio": PROJECT_ROOT / "art_source/audio_generated/林澈新B青年清澈_20260804_001.mp3",
        "ref_text": "十年前的那个早晨，我依然清晰记得，你穿着白衬衫的样子，那是我第一次遇见你，至今难忘。",
        "cfg": 2.4, "steps": 16, "atempo": None,
        "output_dir": PROJECT_ROOT / "public/audio/voice/linche",
    },
    "xiya": {
        "ref_audio": PROJECT_ROOT / "art_source/audio_generated/夏雅A治愈_20260804_001.mp3",
        "ref_text": "人生就像一场闯关副本，不必急于一时分出高下，找准自己的定位，慢慢打磨实力，总有属于自己发光的时刻。",
        "cfg": 2.4, "steps": 16, "atempo": 1.1,
        "output_dir": PROJECT_ROOT / "public/audio/voice/xiya",
    },
    "grandpa": {
        "ref_audio": PROJECT_ROOT / "art_source/audio_generated/老人A_20260804_001.mp3",
        "ref_text": "占位",
        "cfg": 2.4, "steps": 16, "atempo": None,
        "output_dir": PROJECT_ROOT / "public/audio/voice/grandpa",
    },
    "elder": {
        "ref_audio": PROJECT_ROOT / "art_source/audio_generated/村长亲切_20260804_001.mp3",
        "ref_text": "老婆，今天忙不忙？家里的米好像不多了，下班顺路帮我买一袋回来吧。天气凉了，记得多穿点衣服，别感冒了。",
        "cfg": 2.4, "steps": 16, "atempo": None,
        "output_dir": PROJECT_ROOT / "public/audio/voice/elder",
    },
    "girl": {
        "ref_audio": PROJECT_ROOT / "art_source/audio_generated/少女空灵B_20260804_001.mp3",
        "ref_text": "万物化形馆没有门，但每一个迷路的灵魂，都能在需要的时候，找到它。",
        "cfg": 2.4, "steps": 16, "atempo": None,
        "output_dir": PROJECT_ROOT / "public/audio/voice/girl",
    },
}

DIALOGUES = {
    "linche": [
        ("station", 1, "五年了。"),
        ("station", 2, "……换个环境，也许也不错。"),
        ("station", 3, "爷爷说，如果不知道往哪走，就回来看看。"),
        ("station", 4, "至少这次，是我自己选的离开。"),
        ("xiya", 1, "你认识我？"),
        ("xiya", 2, "我也没想到自己会回来。本来只是想看看爷爷留下的地方。"),
        ("gate", 1, "……比我以为的还要荒。"),
        ("gate", 2, "爷爷一个人打理这么大的地方？"),
        ("gate", 3, "他从来没跟我说过这些。"),
        ("dawn", 1, "你每天都起这么早？"),
        ("dawn", 2, "……我以前，都是被闹钟叫醒的。"),
        ("harvest", 1, "嗯。"),
        ("harvest", 2, "比想象中重。"),
        ("evening", 1, "挺累的。"),
        ("evening", 2, "嗯。"),
        ("water", 1, "卖掉？"),
        ("evening2", 1, "以前总觉得，只要不断追赶时代，就不会被淘汰。"),
        ("evening2", 2, "可是现在……也许慢下来，也不是坏事。"),
        ("evening2", 3, "……爷爷连种地都要记笔记。"),
        ("town", 1, "这就是青禾镇……爷爷信里提起过的地方。"),
        ("elder", 1, "您好，您是……"),
        ("elder", 2, "……他真的喜欢看星星？"),
        ("elder", 3, "去做什么？"),
        ("elder", 4, "……那我去看看吧。"),
        ("shard", 1, "镇长，星之碎片……我拿到了。"),
        ("shard", 2, "……我其实没做什么。它就在那儿，我只是走过去拿起来而已。"),
        ("forest", 1, "不是没有反应。"),
        ("forest", 2, "更像一个长期没有维护的系统。"),
        ("forest", 3, "它在等待一个条件。没有回应，是因为条件还没满足。"),
        ("forest", 4, "职业习惯。"),
        ("woodcut", 1, "……爷爷留下的庄园，要修的地方还不少。"),
        ("woodcut", 2, "你倒是把什么都想好了。"),
        ("woodcut", 3, "以前只会删代码，现在倒要学着砍树了。"),
        ("mine", 1, "那些发光的矿石……"),
        ("mine", 2, "（点点头）那我挖一点回去试试。"),
        ("mine", 3, "以前加班熬到半夜，也没人跟我说累了就歇着。"),
        ("robot", 1, "这是……农业机器人？很旧的样子。"),
        ("robot", 2, "修一修，说不定还能用。"),
        ("robot", 3, "……它能帮我看顾农田。"),
        ("ending", 1, "他也喜欢看星星？"),
        ("ending", 2, "城市里，很久没见过这样的星星了。"),
        ("branchA", 1, "这些年换了几个城市，没有哪个地方让我觉得……是应该留下的。"),
        ("branchB", 1, "他为什么来这里？他一个人在这里住了多久？"),
        ("branchB", 2, "……我好像从来没问过他这些。"),
        ("branchC", 1, "……说实话，我连明天会怎样都不知道。"),
    ],
    "xiya": [
        ("xiya", 1, "你就是林澈？"),
        ("xiya", 2, "林爷爷以前提过你。……大家都以为，不会有人回来了。"),
        ("xiya", 3, "那就先从这扇门开始吧。"),
        ("gate", 1, "这里以前不是这样的。"),
        ("gate", 2, "嗯。他说，只要还有人愿意住下来，这里就不会荒废。"),
        ("gate", 3, "旧了点，但还能用。你爷爷当年就是用这把锄头，把这片地一锄一锄开出来的。"),
        ("gate", 4, "有些事，要等你自己回来了，才会知道。"),
        ("dawn", 1, "这么早？我睡不着，就过来看看这些地。"),
        ("dawn", 2, "岛上的人都这样。太阳一出来，就想醒着。"),
        ("harvest", 1, "第一次自己种出来？"),
        ("harvest", 2, "感觉怎么样？"),
        ("evening", 1, "累吗？"),
        ("evening", 2, "以前你也是这样？"),
        ("evening", 3, "那以后记得早点休息。"),
        ("sow", 1, "先开三块地。地要翻过，种子才肯住下。"),
        ("water", 1, "种下去，就得天天来看它。你爷爷说，庄稼最怕被忘记。"),
        ("water", 2, "种下去了，接下来就等它长大。"),
        ("water", 3, "庄园还有不少地方需要修，等收成以后，可以拿去镇上的店换些钱。"),
        ("water", 4, "嗯。留下需要的，换成需要的东西，这里才能慢慢恢复起来。"),
        ("forest", 1, "我们试过很多办法，可它一直没有反应。"),
        ("forest", 2, "什么？"),
        ("forest", 3, "……你又在说奇怪的话了。"),
        ("woodcut", 1, "这些树正好用得上。砍下来的木材，能卖钱，也能修房子。"),
        ("woodcut", 2, "在岛上住久了，自然就懂这些了。"),
        ("mine", 1, "老张年轻时候就在矿洞里讨生活，说那些石头、铜矿都能卖钱。"),
        ("mine", 2, "别逞强，你爷爷以前也是，忙起来连饭都忘了吃。"),
        ("garden", 1, "这里以前也是爷爷最喜欢来的地方。"),
        ("garden", 2, "小时候我经常看到他坐在这里，一坐就是很久。"),
        ("garden", 3, "他说，院子有人照顾，就不会冷清。"),
        ("garden", 4, "奇怪……爷爷以前说，这里的花总是比别的地方开得早。"),
        ("ending", 1, "你爷爷以前每天都会坐在这里。"),
        ("ending", 2, "他走以后，岛上的人还是会偶尔来看这里。"),
        ("ending", 3, "大家都觉得，总有一天，会有人重新打开这扇门。"),
        ("ending", 4, "嗯。他说，总有一天，会有人回来继续看。"),
        ("branchA", 1, "那就别走了。"),
        ("branchC", 1, "不需要知道。"),
        ("branchC", 2, "你在这里，就足够了。"),
        ("finale", 1, "已经很久了，这片地没有这么热闹过。"),
        ("finale", 2, "青禾镇，欢迎你。"),
    ],
    "grandpa": [
        ("notes", 1, "今天又捡到一片。星星……是不是也想回家？"),
        ("notes", 2, "我数了数，还差一些。等它们都回来了，也许就能问清楚了。"),
        ("notes", 3, "那些发光的碎片，醒来时像在看我。是我多心了吧。"),
        ("notes", 4, "今晚的星星很亮，花比往年开得早。不知道是不是这座岛在回应什么。"),
        ("letter", 1, "如果看到这封信，说明你终于回来了。"),
        ("letter", 2, "小澈，你小时候总问我，为什么每天都要给花浇水。"),
        ("letter", 3, "爷爷想了很久。后来发现，人做很多事情，不一定都是为了结果。"),
        ("letter", 4, "如果有一天机器比我们更聪明，你觉得人还需要留下些什么？"),
    ],
    "elder": [
        ("elder", 1, "你就是林澈吧？星黎庄园的新主人。"),
        ("elder", 2, "我是青禾镇的镇长。你爷爷啊，年轻时候就喜欢晚上坐在那块石头上看天。"),
        ("elder", 3, "喜欢。他以前也经常往森林跑。"),
        ("elder", 4, "他说那里有些东西，值得看看。"),
        ("shard", 1, "这光泽……没错，就是星之碎片。你爷爷当年捡到第一片的时候，也是这样的光。"),
        ("shard", 2, "他跟我说过，这座岛上的碎片，只有真正想留下来的人才能拿起来。"),
        ("shard", 3, "你能把它带回来，说明这座岛……已经认你了。"),
        ("shard", 4, "那就够了。有时候，不是人找到东西，是东西找到人。"),
    ],
    "girl": [
        ("forest", 1, "……它沉睡太久了。"),
    ],
}

def build_args(text, role_cfg, output):
    return [
        str(VOXCPM_PYTHON), "-m", "voxcpm.cli",
        "--text", text,
        "--prompt-audio", str(role_cfg["ref_audio"]),
        "--prompt-text", role_cfg["ref_text"],
        "--output", str(output),
        "--model-path", str(VOXCPM_MODEL),
        "--cfg-value", f'{role_cfg["cfg"]:.2f}',
        "--inference-timesteps", str(role_cfg["steps"]),
        "--no-denoiser",
    ]

def apply_atempo(wav_path, atempo):
    tmp = wav_path.with_suffix(".tmp.wav")
    subprocess.run([FFMPEG, "-y", "-i", str(wav_path), "-filter:a", f"atempo={atempo}", str(tmp)], capture_output=True, check=True)
    tmp.replace(wav_path)

def generate_line(role, scene, idx, text, role_cfg, output_dir, dry_run):
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f"{scene}_{idx:02d}.wav"
    args = build_args(text, role_cfg, output)
    if dry_run:
        print(f"  [DRY] {role}/{scene}_{idx:02d}.wav  <-  {text[:30]}...")
        return True
    print(f"  [{role}] {scene}_{idx:02d}.wav  <-  {text[:40]}...", end=" ", flush=True)
    t0 = time.time()
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=300)
        elapsed = time.time() - t0
        if result.returncode != 0:
            print(f"FAIL ({elapsed:.1f}s) rc={result.returncode}")
            if result.stderr:
                for line in result.stderr.strip().split("\n")[-3:]:
                    print(f"    {line}")
            return False
        if not output.exists() or output.stat().st_size < 1000:
            print(f"FAIL ({elapsed:.1f}s) output too small")
            return False
        if role_cfg["atempo"]:
            apply_atempo(output, role_cfg["atempo"])
        print(f"OK ({elapsed:.1f}s, {output.stat().st_size} bytes)")
        return True
    except subprocess.TimeoutExpired:
        print("TIMEOUT")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="主线剧情批量语音生成")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--role", choices=list(ROLES.keys()), help="只生成指定角色")
    args = parser.parse_args()
    total, success, failed = 0, 0, []
    for role, lines in DIALOGUES.items():
        if args.role and role != args.role:
            continue
        cfg = ROLES[role]
        print(f"\n=== {role} ({len(lines)} lines) ===")
        for scene, idx, text in lines:
            total += 1
            ok = generate_line(role, scene, idx, text, cfg, cfg["output_dir"], args.dry_run)
            if ok: success += 1
            else: failed.append(f"{role}/{scene}_{idx:02d}")
    print(f"\n{'='*50}")
    print(f"Total: {total}  Success: {success}  Failed: {len(failed)}")
    if failed:
        print("Failed items:")
        for f in failed: print(f"  - {f}")

if __name__ == "__main__":
    main()