"""临时粗筛：全量语音 wav 时长 vs 文本字数比值异常检测（排查生成串词类 P0）"""
import re, subprocess, sys, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VB = ROOT / 'src/audio/voicebank.data.ts'
VOICE = ROOT / 'public/audio/voice'

entries = []
for m in re.finditer(r"file: '([^']+)',\s*speaker: '([^']*)',\s*text: '((?:[^'\\]|\\.)*)'", VB.read_text(encoding='utf-8')):
    f, sp, tx = m.group(1), m.group(2), m.group(3)
    entries.append((f, sp, tx))

def dur(p):
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                              '-of', 'default=noprint_wrappers=1:nokey=1', str(p)],
                             capture_output=True, text=True, timeout=15)
        return float(out.stdout.strip())
    except Exception:
        return None

def chars(tx):
    return len(re.sub(r'[。，！？……、（）「」《》—·：；\s,]', '', tx))

rows = []
missing = []
for f, sp, tx in entries:
    p = VOICE / f
    if not p.exists():
        missing.append(f)
        continue
    d = dur(p)
    if d is None:
        continue
    n = chars(tx)
    if n == 0:
        continue
    rows.append((f, sp, n, d, d / n, tx))

# 按角色统计语速中位数（排除该角色自身异常值会互相污染，先粗筛）
from collections import defaultdict
speaker_rates = defaultdict(list)
for f, sp, n, d, r, tx in rows:
    speaker_rates[sp].append(r)
speaker_med = {sp: sorted(v)[len(v) // 2] for sp, v in speaker_rates.items()}

issues = []
for f, sp, n, d, r, tx in rows:
    med = speaker_med.get(sp)
    # 绝对阈值：<0.15 秒/字 物理上不可能（正常中文 TTS 朗读 >0.15）
    too_fast = r < 0.15
    # 相对阈值：偏离该角色中位数太多（<0.6× 或 >1.6×）且该角色样本足够
    off_role = med is not None and speaker_rates[sp] and len(speaker_rates[sp]) >= 3 and (r < med * 0.6 or r > med * 1.6)
    if too_fast or off_role:
        issues.append((f, sp, n, round(d, 2), round(r, 2), round(med, 2) if med else None, tx))

print(f'共解析 {len(entries)} 条，缺失文件 {len(missing)}')
for f in missing:
    print(f'  [缺失] {f}')
print(f'可疑 {len(issues)} 条（<0.15 秒/字绝对异常，或偏离角色中位数 ±60%）：')
for f, sp, n, d, r, med, tx in sorted(issues, key=lambda x: x[4]):
    flag = '绝对太快(疑似串词)' if r < 0.15 else '偏离角色语速'
    print(f'  [{flag}] {f}  {sp}  {n}字 / {d}s = {r} (角色中位 {med})  | {tx[:38]}')
print()
print('各角色语速中位参考：')
for sp, m in sorted(speaker_med.items(), key=lambda x: -x[1]):
    print(f'  {sp}: {m:.3f} 秒/字（n={len(speaker_rates[sp])}）')
