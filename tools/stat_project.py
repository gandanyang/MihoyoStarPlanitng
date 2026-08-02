# -*- coding: utf-8 -*-
"""
项目规模统计：代码行（纯逻辑 / 文本字符串行）/ 注释行 / 空行 / 函数方法数。

说明：
  - "文本字符串行" = 代码中包含引号字符串的行（台词、UI 文案、资源路径等，粗粒度代理）
  - "纯逻辑行" = 非空、非注释、且不含字符串字面量的代码行
  - 注释行 = 整行注释（//、JSDoc /* */、Python #）与块注释内部行
  - 函数/方法 = function 声明 + 箭头函数 + 类方法/对象方法（正则启发式）

运行：python tools/stat_project.py
"""

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 统计范围：源码 / 测试探针 / 生成工具 / 文档 / 数据
SRC_GLOBS = ["src/**/*.ts"]
SCRIPT_GLOBS = ["test-*.mjs", "probe-*.mjs"]
TOOL_GLOBS = ["tools/*.py"]
DOC_GLOBS = ["*.md", "docs/**/*.md"] if (ROOT / "docs").exists() else ["*.md"]

FN_RE = re.compile(r"\bfunction\s+[A-Za-z_$][\w$]*")
DEF_RE = re.compile(r"^\s*def\s+[A-Za-z_$][\w$]*")
ARROW_RE = re.compile(r"\b(?:const|let)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\(")
METHOD_RE = re.compile(r"^\s{2,}(?:async\s+)?(?:get\s+|set\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{")
CTRL_WORDS = {"if", "for", "while", "switch", "catch", "function", "return", "with"}
STRING_RE = re.compile(r"['\"`]")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def count_file(path: Path):
    total = 0
    blank = 0
    comments = 0
    string_lines = 0
    logic_lines = 0
    funcs = 0
    chars = 0
    cjk = 0
    in_block = False  # /* */ 或 """ """
    block_end = "*/" if path.suffix in (".ts", ".mjs", ".js") else '"""'

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None

    for raw in text.splitlines():
        total += 1
        chars += len(raw)
        cjk += len(CJK_RE.findall(raw))
        s = raw.strip()
        if not s:
            blank += 1
            continue

        # 块注释状态
        if in_block:
            comments += 1
            if block_end in s:
                in_block = False
            continue
        if path.suffix in (".ts", ".mjs", ".js") and s.startswith("/*"):
            comments += 1
            if "*/" not in s:
                in_block = True
            continue
        if path.suffix == ".py" and s.startswith('"""'):
            comments += 1
            if s.count('"""') < 2:
                in_block = True
            continue

        # 整行注释
        if s.startswith("//") or s.startswith("#") or s.startswith("*"):
            comments += 1
            continue

        # 代码行：按是否含字符串字面量划分
        if STRING_RE.search(s):
            string_lines += 1
        else:
            logic_lines += 1

        # 函数/方法统计
        funcs += len(FN_RE.findall(s))
        funcs += len(DEF_RE.findall(s))
        funcs += len(ARROW_RE.findall(s))
        m = METHOD_RE.match(s)
        if m:
            name = s.split("(")[0].split()[-1].strip()
            if name not in CTRL_WORDS and not name.startswith("async"):
                funcs += 1

    return {
        "total": total, "blank": blank, "comments": comments,
        "string_lines": string_lines, "logic_lines": logic_lines,
        "funcs": funcs, "chars": chars,
        "cjk": cjk,
    }


def run():
    groups = [
        ("TS 源码 (src)", SRC_GLOBS),
        ("测试/探针 (mjs)", SCRIPT_GLOBS),
        ("生成工具 (py)", TOOL_GLOBS),
        ("文档 (md)", DOC_GLOBS),
    ]
    grand = {k: 0 for k in ("total", "blank", "comments", "string_lines", "logic_lines", "funcs", "chars", "cjk")}
    print(f"{'范围':<18}{'文件':>4}{'总行':>7}{'代码':>7}{'逻辑':>7}{'文本行':>7}{'注释':>7}{'空行':>6}{'函数/方法':>8}{'中文字':>7}")
    for label, globs in groups:
        files = []
        for g in globs:
            files.extend(ROOT.glob(g))
        agg = {k: 0 for k in grand}
        for f in files:
            r = count_file(f)
            if not r:
                continue
            for k in agg:
                agg[k] += r[k]
        code = agg["logic_lines"] + agg["string_lines"]
        print(f"{label:<18}{len(files):>4}{agg['total']:>7}{code:>7}{agg['logic_lines']:>7}{agg['string_lines']:>7}{agg['comments']:>7}{agg['blank']:>6}{agg['funcs']:>8}{agg['cjk']:>7}")
        for k in grand:
            grand[k] += agg[k]

    code = grand["logic_lines"] + grand["string_lines"]
    print("-" * 80)
    print(f"{'合计':<18}{'':>4}{grand['total']:>7}{code:>7}{grand['logic_lines']:>7}{grand['string_lines']:>7}{grand['comments']:>7}{grand['blank']:>6}{grand['funcs']:>8}{grand['cjk']:>7}")
    print(f"\n函数/方法占比（约）：{grand['funcs']} 个")
    print(f"总字符量（含空白）：{grand['chars']:,}")


if __name__ == "__main__":
    run()
