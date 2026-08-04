#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
归星物语 · MIDI 音乐生成工具（纯 Python 标准库，零第三方依赖）

风格目标：星露谷物语（温暖田园民谣）+ 原神（抒情管弦/五声音阶点缀）
输出：标准 .mid 文件 + 同音符数据合成的 WAV 预览（简单乐器模拟）

用法：
  python tools/gen_music.py                 # 生成全部曲目到 tmp/music/
  python tools/gen_music.py --piece title   # 只生成指定曲目

曲目：
  title          主题曲（主界面）：温暖田园 + 抒情
  farm_day       农场白天：轻快民谣
  stargaze_night 夜晚观星：静谧弦乐+竖琴，五声调式
"""

import argparse
import math
import struct
import wave
from pathlib import Path

# ---------------------------------------------------------------- MIDI 基础

NOTE = {
    'C': 0, 'Cs': 1, 'Db': 1, 'D': 2, 'Ds': 3, 'Eb': 3, 'E': 4, 'F': 5,
    'Fs': 6, 'Gb': 6, 'G': 7, 'Gs': 8, 'Ab': 8, 'A': 9, 'As': 10, 'Bb': 10, 'B': 11,
}

def n(name: str, octave: int) -> int:
    """音符名 → MIDI 编号（C4=60）"""
    return 12 * (octave + 1) + NOTE[name]

def vlq(value: int) -> bytes:
    """MIDI 变长数值"""
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))

class MidiWriter:
    """极简 MIDI 写器（format 1，单拍速，N 轨）"""
    def __init__(self, division: int = 480):
        self.division = division
        self.tracks: list[list[tuple[int, bytes]]] = [[] for _ in range(16)]

    def _delta(self, track: int, ticks: int):
        self.tracks[track].append((ticks, b''))

    def program(self, track: int, program: int):
        self.tracks[track].append((0, bytes([0xC0 | track, program])))

    def note(self, track: int, midi_note: int, start_tick: int, dur_tick: int, vel: int = 90):
        self.tracks[track].append((start_tick, bytes([0x90 | track, midi_note, vel])))
        self.tracks[track].append((dur_tick, bytes([0x80 | track, midi_note, 0])))

    def save(self, path: Path, tempo_us: int, bpm: float, time_sig=(4, 4)):
        # Track 0：拍速/拍号
        tr0 = b'\x00\xff\x51\x03' + struct.pack('>I', tempo_us)[1:] + \
              b'\x00\xff\x58\x04' + bytes([time_sig[0], 2 ** (int(math.log2(time_sig[1]))), 24, 8]) + \
              b'\x00\xff\x2f\x00'
        chunks = [tr0]
        for tr in self.tracks:
            if not tr:
                continue
            tr.sort(key=lambda e: e[0])
            data = bytearray()
            last = 0
            for tick, ev in tr:
                data += vlq(tick - last)
                data += ev
                last = tick
            data += b'\x00\xff\x2f\x00'
            chunks.append(bytes(data))
        with open(path, 'wb') as f:
            f.write(b'MThd' + struct.pack('>IHHH', 6, 1, len(chunks), self.division))
            for ch in chunks:
                f.write(b'MTrk' + struct.pack('>I', len(ch)) + ch)

# ---------------------------------------------------------------- 乐曲数据

class Track:
    """一条音轨：instrument(program) + notes[(start_beat, dur_beat, midi, vel)]"""
    def __init__(self, program: int):
        self.program = program
        self.notes: list[tuple[float, float, int, int]] = []

    def add(self, start: float, dur: float, midi: int, vel: int = 90):
        self.notes.append((start, dur, midi, vel))

GM = {
    'guitar': 24,      # Acoustic Guitar (nylon)
    'flute': 73,       # Flute
    'recorder': 74,    # Recorder
    'strings': 48,     # String Ensemble 1
    'harp': 46,        # Orchestral Harp
    'celesta': 8,      # Celesta
    'bass': 32,        # Acoustic Bass
    'oboe': 68,        # Oboe
    'vibes': 11,       # Vibraphone
}

def build_title() -> dict:
    """主题曲：G 大调 4/4，ABA 结构（起承转合），温暖民谣 + 叙事感旋律"""
    gtr = Track(GM['guitar'])
    fl = Track(GM['flute'])
    pad = Track(GM['strings'])
    hp = Track(GM['harp'])
    # 和弦进行（每 2 小节）A 段：G Em C D | B 段：C G Am D
    prog = [
        (n('G', 3), n('B', 3), n('D', 4)), (n('G', 3), n('B', 3), n('D', 4)),
        (n('E', 3), n('G', 3), n('B', 3)), (n('E', 3), n('G', 3), n('B', 3)),
        (n('C', 3), n('E', 3), n('G', 3)), (n('C', 3), n('E', 3), n('G', 3)),
        (n('D', 3), n('Fs', 3), n('A', 3)), (n('D', 3), n('Fs', 3), n('A', 3)),
        # B 段
        (n('C', 3), n('E', 3), n('G', 3)), (n('C', 3), n('E', 3), n('G', 3)),
        (n('G', 3), n('B', 3), n('D', 4)), (n('G', 3), n('B', 3), n('D', 4)),
        (n('A', 3), n('C', 4), n('E', 4)), (n('A', 3), n('C', 4), n('E', 4)),
        (n('D', 3), n('Fs', 3), n('A', 3)), (n('D', 3), n('Fs', 3), n('A', 3)),
    ] * 2
    for bar, (r, t, f) in enumerate(prog):
        b = bar * 2.0
        # 吉他分解（八分音符，流动感）
        for i in range(8):
            note_ = [r, f, t, f, r, t, f, t][i]
            gtr.add(b + i * 0.25, 0.24, note_, 66)
        # 竖琴点缀（仅 B 段，轻柔）
        if bar >= 8:
            hp.add(b + 1.0, 0.7, t + 12, 48)
            hp.add(b + 1.6, 0.9, f + 12, 42)
        # 弦乐长音
        pad.add(b, 2.0, r + 12, 38)
        pad.add(b, 2.0, f + 12, 36)
    # 旋律（长笛，ABA：起承转合，叙事感）
    melody = [
        # A 段（起）：G Em C D
        (0, 1.5, n('D', 5)), (1.5, 0.5, n('E', 5)),
        (2, 1.5, n('G', 5)), (3.5, 0.5, n('B', 5)),
        (4, 2.0, n('A', 5)), (6, 1.0, n('G', 5)), (7, 1.0, n('E', 5)),
        (8, 1.5, n('D', 5)), (9.5, 0.5, n('Fs', 5)),
        (10, 2.0, n('G', 5)),
        # B 段（承/转）：C G Am D，情绪抬升
        (12, 1.0, n('E', 5)), (13, 0.5, n('G', 5)), (13.5, 0.5, n('A', 5)),
        (14, 1.5, n('C', 6)), (15.5, 0.5, n('B', 5)),
        (16, 1.5, n('G', 5)), (17.5, 0.5, n('D', 5)),
        (18, 1.0, n('E', 5)), (19, 0.5, n('Fs', 5)), (19.5, 0.5, n('G', 5)),
        (20, 2.0, n('A', 5)), (22, 1.0, n('G', 5)), (23, 1.0, n('E', 5)),
        # A 段再现（合）→ 收束
        (24, 1.5, n('D', 5)), (25.5, 0.5, n('E', 5)),
        (26, 1.5, n('G', 5)), (27.5, 0.5, n('B', 5)),
        (28, 2.0, n('A', 5)), (30, 1.0, n('G', 5)), (31, 1.0, n('E', 5)),
        (32, 3.0, n('D', 5)), (35, 1.0, n('G', 5)),
    ]
    for s, d, m in melody:
        fl.add(s, d, m, 88)
    return {'name': 'title', 'bpm': 78, 'time_sig': (4, 4), 'tracks': [gtr, fl, pad, hp]}

def build_farm_day() -> dict:
    """农场白天：C 大调 4/4 悠闲，C - Am - F - G，木管+吉他+贝斯（叙事短语）"""
    fl = Track(GM['recorder'])
    gtr = Track(GM['guitar'])
    bass = Track(GM['bass'])
    prog = [
        (n('C', 2), n('E', 3), n('G', 3)), (n('C', 2), n('E', 3), n('G', 3)),
        (n('A', 2), n('C', 3), n('E', 4)), (n('A', 2), n('C', 3), n('E', 4)),
        (n('F', 2), n('A', 3), n('C', 4)), (n('F', 2), n('A', 3), n('C', 4)),
        (n('G', 2), n('B', 3), n('D', 4)), (n('G', 2), n('B', 3), n('D', 4)),
    ] * 2
    for bar, (r, t, f) in enumerate(prog):
        b = bar * 2.0
        bass.add(b, 1.7, r, 72)
        for i in range(8):
            note_ = [r + 12, f, t, f, r + 12, t, f, t][i]
            gtr.add(b + i * 0.25, 0.22, note_, 62)
    mel = [
        (0, 1.0, n('E', 5)), (1, 0.5, n('G', 5)), (1.5, 0.5, n('A', 5)),
        (2, 1.5, n('G', 5)), (3.5, 0.5, n('E', 5)),
        (4, 1.0, n('C', 5)), (5, 0.5, n('D', 5)), (5.5, 0.5, n('E', 5)),
        (6, 2.0, n('G', 5)),
        (8, 1.0, n('A', 5)), (9, 0.5, n('G', 5)), (9.5, 0.5, n('E', 5)),
        (10, 1.5, n('G', 5)), (11.5, 0.5, n('D', 5)),
        (12, 1.0, n('C', 5)), (13, 0.5, n('B', 4)), (13.5, 0.5, n('A', 4)),
        (14, 2.0, n('C', 5)),
    ]
    for s, d, m in mel:
        fl.add(s, d, m, 85)
    return {'name': 'farm_day', 'bpm': 104, 'time_sig': (4, 4), 'tracks': [fl, gtr, bass]}

def build_stargaze_night() -> dict:
    """夜晚观星：A 小调五声（A C D E G），慢板，竖琴+弦乐+长笛（温暖不诡异）"""
    hp = Track(GM['harp'])
    pad = Track(GM['strings'])
    fl = Track(GM['flute'])
    # Am - F - C - G（2 小节一组，温暖）
    prog = [
        (n('A', 2), n('C', 3), n('E', 3)), (n('A', 2), n('C', 3), n('E', 3)),
        (n('F', 2), n('A', 3), n('C', 4)), (n('F', 2), n('A', 3), n('C', 4)),
        (n('C', 2), n('E', 3), n('G', 3)), (n('C', 2), n('E', 3), n('G', 3)),
        (n('G', 2), n('B', 3), n('D', 4)), (n('G', 2), n('B', 3), n('D', 4)),
    ] * 2
    for bar, (r, t, f) in enumerate(prog):
        b = bar * 2.0
        pad.add(b, 2.0, r + 12, 40)
        pad.add(b, 2.0, f + 12, 38)
        for i in range(8):
            note_ = [r + 12, f, t, f, r + 12, t, f, t][i]
            hp.add(b + i * 0.25, 0.55, note_, 52)
    # 五声旋律（A 宫羽调式感）
    mel = [
        (0, 2.0, n('E', 5)), (2, 1.0, n('D', 5)), (3, 1.0, n('C', 5)),
        (4, 2.0, n('A', 4)), (6, 1.0, n('C', 5)), (7, 1.0, n('E', 5)),
        (8, 2.0, n('G', 5)), (10, 1.0, n('E', 5)), (11, 1.0, n('D', 5)),
        (12, 2.0, n('C', 5)), (14, 1.5, n('A', 4)), (15.5, 0.5, n('G', 4)),
        (16, 3.0, n('A', 4)), (19, 1.0, n('E', 5)),
    ]
    for s, d, m in mel:
        fl.add(s, d, m, 82)
    return {'name': 'stargaze_night', 'bpm': 64, 'time_sig': (4, 4), 'tracks': [hp, pad, fl]}

PIECES = {
    'title': build_title,
    'farm_day': build_farm_day,
    'stargaze_night': build_stargaze_night,
}

# ---------------------------------------------------------------- WAV 合成

SAMPLE_RATE = 44100

def synth_note(midi: int, dur: float, kind: str, vel: float = 0.8) -> list[float]:
    """简单乐器模拟（温暖化）：pluck(吉他/竖琴) / flute / pad(弦乐) / bass"""
    freq = 440.0 * 2 ** ((midi - 69) / 12)
    n_samples = int(SAMPLE_RATE * dur)
    out = [0.0] * n_samples
    amp = vel
    if kind == 'pluck':
        for i in range(n_samples):
            t = i / SAMPLE_RATE
            env = min(1.0, t / 0.012) * math.exp(-3.2 * t / dur)
            out[i] = amp * env * (math.sin(2 * math.pi * freq * t) + 0.28 * math.sin(2 * math.pi * freq * 2 * t) + 0.08 * math.sin(2 * math.pi * freq * 3 * t))
    elif kind == 'flute':
        for i in range(n_samples):
            t = i / SAMPLE_RATE
            env = min(1.0, t / 0.09) * math.exp(-1.6 * t / dur)
            vib = 1.0 + 0.004 * math.sin(2 * math.pi * 4.8 * t)
            out[i] = amp * env * math.sin(2 * math.pi * freq * vib * t)
    elif kind == 'pad':
        for i in range(n_samples):
            t = i / SAMPLE_RATE
            env = min(1.0, t / 0.55) * max(0.0, 1.0 - t / dur)
            out[i] = amp * env * (math.sin(2 * math.pi * freq * t) + 0.12 * math.sin(2 * math.pi * freq * 2 * t))
    else:  # bass
        for i in range(n_samples):
            t = i / SAMPLE_RATE
            env = min(1.0, t / 0.02) * math.exp(-3.0 * t / dur)
            out[i] = amp * env * math.sin(2 * math.pi * freq * t)
    return out

def render_wav(piece: dict, out_path: Path):
    """按音轨乐器类型合成混音（最多支持 16 轨）"""
    kind_map = {
        GM['guitar']: 'pluck', GM['harp']: 'pluck', GM['celesta']: 'pluck',
        GM['flute']: 'flute', GM['recorder']: 'flute', GM['oboe']: 'flute',
        GM['strings']: 'pad', GM['bass']: 'bass', GM['vibes']: 'pluck',
    }
    bpm = piece['bpm']
    beat = 60.0 / bpm
    total_beats = 0
    for tr in piece['tracks']:
        for s, d, _, _ in tr.notes:
            total_beats = max(total_beats, s + d)
    total = int(SAMPLE_RATE * total_beats * beat) + SAMPLE_RATE // 2
    mix = [0.0] * total
    for tr in piece['tracks']:
        kind = kind_map.get(tr.program, 'pluck')
        for s, d, m, vel in tr.notes:
            buf = synth_note(m, d * beat * 0.92, kind, vel / 127.0)
            start = int(SAMPLE_RATE * s * beat)
            for i, v in enumerate(buf):
                if start + i < total:
                    mix[start + i] += v * 0.55
    # 归一化 + 防削波
    peak = max(1e-6, max(abs(v) for v in mix))
    gain = min(1.0, 0.85 / peak)
    # 结尾淡出（叙事收束）
    fade = int(SAMPLE_RATE * 2.0)
    for i in range(min(fade, total)):
        mix[total - 1 - i] *= i / fade
    with wave.open(str(out_path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for v in mix:
            s = int(max(-1.0, min(1.0, v * gain)) * 32767)
            frames += struct.pack('<h', s)
        w.writeframes(bytes(frames))

# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--piece', choices=list(PIECES) + ['all'], default='all')
    ap.add_argument('--out', default='tmp/music')
    args = ap.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    names = list(PIECES) if args.piece == 'all' else [args.piece]
    for name in names:
        piece = PIECES[name]()
        mw = MidiWriter()
        for idx, tr in enumerate(piece['tracks']):
            mw.program(idx, tr.program)
            for s, d, m, vel in tr.notes:
                mw.note(idx, m, int(s * 480), int(d * 480), vel)
        midi_path = out_dir / f'{name}.mid'
        mw.save(midi_path, int(60_000_000 / piece['bpm']), piece['bpm'], piece['time_sig'])
        wav_path = out_dir / f'{name}.wav'
        render_wav(piece, wav_path)
        print(f'[OK] {name}: {midi_path} + {wav_path}（{piece["bpm"]} BPM, {piece["time_sig"][0]}/{piece["time_sig"][1]}）')

if __name__ == '__main__':
    main()
