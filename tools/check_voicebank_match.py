#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
校验 StorySystem.ts 台词与 VoiceBank 映射数据（voicebank.data.ts）完全对齐。

- 解析 StorySystem.ts 的所有 DialogueLine（speaker/color/inner/text）
- 归一化：剥开头（…）标注 + 剥首尾「」
- 与 voicebank.data.ts 的 VOICE_ENTRIES 匹配（speaker 相等或 '' 通配 + 文本相等）
- 输出：speaker 非空但未匹配 → 错误；speaker 为空（系统/少女/HR/纸条）未匹配 → 提示
- 孤儿映射（ENTRIES 有但 StorySystem 无对应行）→ 提示

用法：python tools/check_voicebank_match.py
退出码：0=全部角色台词匹配；1=存在未匹配角色台词
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STORY_FILES = [
    ROOT / "src" / "systems" / "StorySystem.ts",
    ROOT / "src" / "systems" / "NPCSystem.ts",
]
DATA_TS = ROOT / "src" / "audio" / "voicebank.data.ts"

# DialogueLine 行：{ speaker: 'X', color: COLORS.y | '#hex', [inner: true,] text: 'T' }
LINE_RE = re.compile(
    r"\{\s*speaker:\s*'([^']*)',\s*color:\s*(?:COLORS\.\w+|'#[0-9a-fA-F]{6}'),\s*"
    r"(?:inner:\s*true,\s*)?text:\s*'([^']*)'\s*\}"
)


def normalize(text: str) -> str:
    t = re.sub(r"^（[^）]*）", "", text)
    t = re.sub(r"^「", "", t)
    t = re.sub(r"」$", "", t)
    t = t.strip()
    if t == "":
        m = re.search(r"「([^」]+)」", text)
        if m:
            t = m.group(1).strip()
    return t


def load_story_lines() -> list[tuple[str, str]]:
    src = "\n".join(p.read_text(encoding="utf-8") for p in STORY_FILES)
    lines: list[tuple[str, str]] = []
    for m in LINE_RE.finditer(src):
        spk, text = m.group(1), m.group(2)
        if text == "":
            continue  # 选项行
        lines.append((spk, text))
    return lines


def load_entries() -> list[tuple[str, str, str]]:
    src = DATA_TS.read_text(encoding="utf-8")
    out: list[tuple[str, str, str]] = []
    for m in re.finditer(r"\{\s*file:\s*'([^']+)',\s*speaker:\s*'([^']*)',\s*text:\s*'([^']*)'\s*\}",
                         src):
        out.append((m.group(1), m.group(2), m.group(3)))
    return out


def main() -> int:
    story = load_story_lines()
    entries = load_entries()
    print(f"StorySystem.ts 台词行（含空 speaker）：{len(story)} 条")
    print(f"voicebank.data.ts 映射：{len(entries)} 条")

    # 建查找表：norm text → entries（与运行时 VoiceBank.find 一致：双侧 normalize）
    from collections import defaultdict
    by_norm: dict[str, list[tuple[str, str]]] = defaultdict(list)  # norm → [(speaker,file)]
    for file, spk, text in entries:
        by_norm[normalize(text)].append((spk, file))

    def find(spk: str, text: str):
        norm = normalize(text)
        for e_spk, e_file in by_norm.get(norm, []):
            if e_spk == "" or e_spk == spk:
                return e_file
        return None

    missing_role: list[tuple[str, str]] = []   # speaker 非空未匹配
    missing_sys: list[tuple[str, str]] = []    # speaker 为空未匹配（系统/特殊行）
    matched: list[str] = []
    for spk, text in story:
        f = find(spk, text)
        if f:
            matched.append(f)
        elif spk == "":
            missing_sys.append((spk, text))
        else:
            missing_role.append((spk, text))

    print("\n=== 角色台词（speaker 非空）匹配情况 ===")
    if missing_role:
        print(f"❌ {len(missing_role)} 条未匹配（问题！）")
        for spk, text in missing_role:
            print(f"  · {spk}: {text}")
    else:
        print(f"✅ 全部 {len([1 for s, _ in story if s])} 条角色台词均匹配")

    print("\n=== 空 speaker 行（系统旁白/少女/HR/纸条）===")
    if missing_sys:
        print(f"⚠️  {len(missing_sys)} 条未匹配（预期为旁白/系统提示；若为少女/HR/纸条则需检查）")
        for spk, text in missing_sys:
            print(f"  · {text[:42]}")
    else:
        print("✅ 空 speaker 行全部匹配（或不存在）")

    # 孤儿映射检查：entry 的归一化文本在 StorySystem 归一化文本集合中存在即可（含「嗯。」轮换场景）
    story_norms = {normalize(t) for _, t in story}
    used = {f for f, _, t in entries if normalize(t) in story_norms}
    orphans = [f for f, _, _ in entries if f not in used]
    print("\n=== 孤儿映射（ENTRIES 有、StorySystem 无对应行）===")
    if orphans:
        print(f"⚠️  {len(orphans)} 条：{orphans}")
    else:
        print("✅ 无孤儿映射")

    sys.exit(1 if missing_role else 0)


if __name__ == "__main__":
    main()
