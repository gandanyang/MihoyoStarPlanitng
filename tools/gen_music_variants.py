#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""归星物语 · 音乐变体生成（试听用）——复用 gen_music 的旋律与合成器，换乐器/节奏出多版。
   产出：tmp/music/variants/<名>.mid + .wav，供制作人试听选版。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_music import (  # noqa: E402
    GM, MidiWriter, Track, build_title, build_stargaze_night, render_wav,
)

OUT = Path(__file__).resolve().parent.parent / 'tmp' / 'music' / 'variants'


def clone(piece, lead_program=None, drop_pad=False, drop_lead=False, pad_vel=None, bpm=None):
    """按基础曲换乐器/去垫底/调速，返回新 piece。"""
    tracks = []
    for tr in piece['tracks']:
        prog = tr.program
        if drop_pad and prog == GM['strings']:
            continue
        if drop_lead and prog in (GM['flute'], GM['recorder'], GM['celesta']):
            continue
        if lead_program is not None and prog in (GM['flute'], GM['recorder'], GM['oboe']):
            prog = lead_program
        nt = Track(prog)
        for s, d, m, v in tr.notes:
            vv = v
            if prog == GM['strings'] and pad_vel is not None:
                vv = pad_vel
            nt.add(s, d, m, vv)
        tracks.append(nt)
    out = {**piece, 'tracks': tracks}
    if bpm:
        out['bpm'] = bpm
    return out


VARIANTS = {
    # —— 主题曲变体 ——
    'title_v2': lambda: clone(build_title(), lead_program=GM['celesta'], pad_vel=28, bpm=80),
    'title_v3': lambda: clone(build_title(), lead_program=GM['recorder'], drop_pad=True, bpm=88),
    'title_v4': lambda: clone(build_title(), lead_program=GM['flute'], pad_vel=30, bpm=84),
    # —— 观星夜变体 ——
    'stargaze_v2': lambda: clone(build_stargaze_night(), lead_program=GM['celesta'], drop_pad=True, bpm=66),
    'stargaze_v3': lambda: clone(build_stargaze_night(), drop_pad=True, drop_lead=True, bpm=60),
    'stargaze_v4': lambda: clone(build_stargaze_night(), lead_program=GM['flute'], pad_vel=26, bpm=70),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, build in VARIANTS.items():
        piece = build()
        mw = MidiWriter()
        for idx, tr in enumerate(piece['tracks']):
            mw.program(idx, tr.program)
            for s, d, m, vel in tr.notes:
                mw.note(idx, m, int(s * 480), int(d * 480), vel)
        mw.save(OUT / f'{name}.mid', int(60_000_000 / piece['bpm']), piece['bpm'], piece['time_sig'])
        render_wav(piece, OUT / f'{name}.wav')
        print(f'[OK] {name}  {piece["bpm"]}BPM  tracks={len(piece["tracks"])}')


if __name__ == '__main__':
    main()
