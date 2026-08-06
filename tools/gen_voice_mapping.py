#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 docs/design/语音文件映射清单.md —— 单一数据源 = gen_mainline_voice.py 的 T 清单 / ROLES，
F0 终值从 tools/f0_*.log（check_f0.py 输出）解析，重跑后的文件值用 OVERRIDE 修正。

用法：
  python tools/gen_voice_mapping.py            # 生成映射清单到 docs/design/语音文件映射清单.md
  python tools/gen_voice_mapping.py --stdout   # 打印不写文件
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import gen_mainline_voice as g

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
OUT_DOC = ROOT / "docs" / "design" / "语音文件映射清单.md"

# F0 日志文件 → (角色, 性别判定)（check_f0.py 目录模式下按 --role 判定）
F0_LOGS = [
    ("f0_male_log.txt", "linche"),
    ("f0_elder_log.txt", "elder"),
    ("f0_grandpa_log.txt", "grandpa"),
    ("f0_system_log.txt", "hr"),  # system 目录即 hr 角色产物（ROLE_DIRS={"hr":"system"}）
    ("f0_xiya_log.txt", "xiya"),
    ("f0_girl_log.txt", "girl"),
]

# 复核后重跑/待人工的修正值（branchC_02 重跑达标 275.9Hz；evening_01 漂移 333.3Hz 待人工；
# shard_07 生成晚于复核日志，取生成时自检值 97.6Hz）
F0_OVERRIDE = {
    ("xiya", "branchC_02"): (275.9, True),
    ("xiya", "evening_01"): (333.3, False),
    ("elder", "shard_07"): (97.6, True),
}


def load_f0() -> dict[tuple[str, str], float]:
    f0: dict[tuple[str, str], float] = {}
    for log_name, role in F0_LOGS:
        log = TOOLS / log_name
        if not log.exists():
            continue
        txt = log.read_text(encoding="utf-8-sig", errors="replace")
        for line in txt.splitlines():
            m = re.search(r"([\w-]+\.wav): ([\d.]+)Hz", line)
            if m:
                f0[(role, m.group(1)[:-4])] = float(m.group(2))
    return f0


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="生成语音文件映射清单")
    p.add_argument("--stdout", action="store_true", help="打印不写文件")
    args = p.parse_args(argv)

    f0map = load_f0()
    lines: list[str] = []
    lines.append("# 语音文件映射清单")
    lines.append("")
    lines.append("> 自动生成：`tools/gen_voice_mapping.py`（数据源 = `tools/gen_mainline_voice.py` T 清单 / ROLES）")
    lines.append("> 生成时间：%s" % __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    lines.append("> 角色目录：linche / xiya / elder（村长）/ grandpa（爷爷信·笔记·纸条）/ girl（神秘少女）/ system（HR）")
    lines.append("> 参数规则：超短句（≤4 字）cfg 2.6 / steps 20；普通句 cfg 2.4 / steps 16；夏雅 atempo 1.1，爷爷/少女 0.95")
    lines.append("")
    lines.append("## 逐条映射")
    lines.append("")
    lines.append("| 文件路径 | 台词文档编号 | 台词原文 | cfg | steps | atempo | F0 终值 | 备注 |")
    lines.append("|---|---|---|---|---|---|---|---|")

    for role, tid, text in g.T:
        rc = g.ROLES[role]
        short = len(text) <= 4
        cfg = 2.6 if short else rc["cfg"]
        steps = 20 if short else rc["steps"]
        atempo = rc["atempo"]
        path = g.output_path(role, tid)
        rel = path.as_posix()
        spk = g.story_speaker(role, tid)
        speaker_disp = spk or ("少女" if role == "girl" else "HR/纸条" if role in ("hr",) else "纸条")

        if (role, tid) in F0_OVERRIDE:
            f0v, ok = F0_OVERRIDE[(role, tid)]
            note = "✅ 达标" if ok else "⚠️ 漂移待人工"
            f0s = f"{f0v:.1f}Hz {note}"
        else:
            f0v = f0map.get((role, tid))
            if f0v is None:
                f0s = "—（未复核）"
            else:
                ok = (70 <= f0v <= 180) if rc["sex"] == "male" else (170 <= f0v <= 320)
                f0s = f"{f0v:.1f}Hz " + ("✅ 达标" if ok else "⚠️ 漂移")
        atempo_s = f"{atempo:g}" if abs(atempo - 1.0) >= 1e-6 else "原速"
        lines.append(f"| `{rel}` | {tid} | {text} | {cfg:g} | {steps} | {atempo_s} | {f0s} | {speaker_disp} |")

    total = len(g.T)
    ok_count = sum(1 for role, tid, _ in g.T
                   if ((role, tid) in F0_OVERRIDE and F0_OVERRIDE[(role, tid)][1])
                   or ((role, tid) not in F0_OVERRIDE and (f0v := f0map.get((role, tid))) and
                       ((70 <= f0v <= 180) if g.ROLES[role]["sex"] == "male" else (170 <= f0v <= 320))))
    drift = sum(1 for role, tid, _ in g.T
                if ((role, tid) in F0_OVERRIDE and not F0_OVERRIDE[(role, tid)][1])
                or ((role, tid) not in F0_OVERRIDE and (f0v := f0map.get((role, tid))) is not None and
                    not ((70 <= f0v <= 180) if g.ROLES[role]["sex"] == "male" else (170 <= f0v <= 320))))

    lines.append("")
    lines.append("## 统计")
    lines.append("")
    lines.append(f"- 映射总数：{total} 条")
    lines.append(f"- F0 达标：{ok_count} 条；漂移待人工：{drift} 条（详见上表 ⚠️）")
    lines.append(f"- 漂移清单：xiya/evening_01（“累吗？”，中位 F0 333.3Hz，女声上限 320Hz，重试 >3 次）")
    lines.append("")
    lines.append("## 说明")
    lines.append("")
    lines.append("- 旁白/舞台指示/系统提示（42 行空 speaker）不配音，不在此清单。")
    lines.append("- 少女/HR/纸条通过 speaker 通配 + 归一化文本匹配（见 `src/audio/VoiceBank.ts`）。")
    lines.append("- 台词原文与 `src/systems/StorySystem.ts` 精确一致（剥除（笑）等语气标注后匹配）。")
    lines.append("- “嗯。”（harvest_02）生成物 25,644 bytes 曾因 30KB 阈值误判“产物无效”，人工复核 F0 156.9Hz 达标，产物有效。")
    lines.append("- 参考音频：林澈=林澈新B青年清澈、夏雅=夏雅A治愈、村长=村长亲切、爷爷=老人A（v2 换角定案）、少女=少女空灵B；ref_text 见选角表。")

    content = "\n".join(lines) + "\n"
    if args.stdout:
        print(content)
        return
    OUT_DOC.parent.mkdir(parents=True, exist_ok=True)
    OUT_DOC.write_text(content, encoding="utf-8")
    print(f"✅ 已生成：{OUT_DOC}（{total} 条，达标 {ok_count}，漂移 {drift}）")


if __name__ == "__main__":
    main()
