#!/usr/bin/env python3
"""
音频资产压缩工具 — 归星物语
规则：
  - 普通 BGM（title/farm_day/stargaze_night）：128kbps ogg，目标单曲 <3MB
  - 重要剧情音乐（stargaze_final）：160kbps ogg
  - 备用曲（stargaze_v3_spare）：保持原样（已低码率）
  - 保留原 mp3 作为 fallback
  - 不改变音高、速度、循环完整性
"""

import os
import subprocess
import json
from pathlib import Path

# ── 配置 ──
MUSIC_DIR = Path(__file__).parent.parent / 'public' / 'assets' / 'audio' / 'music'
OUTPUT_DIR = MUSIC_DIR  # 直接输出到同目录，ogg 与 mp3 并存

# 压缩规则：文件名 → 目标 ogg 码率 (kbps)
RULES = {
    'title.mp3': 128,           # BGM
    'farm_day.mp3': 128,        # 环境音乐
    'stargaze_night.mp3': 128,  # 环境音乐
    'stargaze_final.mp3': 160,  # 重要剧情音乐
    # stargaze_v3_spare.mp3 不压缩（已低码率，备用）
}

def get_audio_info(filepath: Path) -> dict:
    """用 ffprobe 获取音频信息"""
    cmd = [
        'ffprobe', '-v', 'quiet',
        '-print_format', 'json',
        '-show_format', '-show_streams',
        str(filepath)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(result.stdout)
        fmt = data.get('format', {})
        stream = data.get('streams', [{}])[0]
        return {
            'size_bytes': int(fmt.get('size', 0)),
            'bitrate': int(fmt.get('bit_rate', 0)),
            'duration': float(fmt.get('duration', 0)),
            'codec': stream.get('codec_name', ''),
            'sample_rate': int(stream.get('sample_rate', 0)),
            'channels': int(stream.get('channels', 0)),
        }
    except Exception:
        return {'size_bytes': filepath.stat().st_size, 'bitrate': 0, 'duration': 0}

def compress_to_ogg(input_mp3: Path, output_ogg: Path, bitrate: int) -> bool:
    """用 ffmpeg 将 mp3 转为 ogg（libvorbis），保持原始采样率和声道"""
    cmd = [
        'ffmpeg', '-y',
        '-i', str(input_mp3),
        '-codec:a', 'libvorbis',
        '-b:a', f'{bitrate}k',
        '-ar', '44100',  # 保持 44.1kHz
        '-ac', '2',       # 保持立体声（单声道输入会自动上混）
        '-application', 'audio',
        str(output_ogg)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0

def format_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes < 1024:
        return f'{size_bytes} B'
    elif size_bytes < 1024 * 1024:
        return f'{size_bytes / 1024:.1f} KB'
    else:
        return f'{size_bytes / (1024 * 1024):.2f} MB'

def main():
    print('=' * 70)
    print('  归星物语 — 音频资产压缩工具')
    print('=' * 70)
    print(f'  音乐目录: {MUSIC_DIR}')
    print(f'  输出目录: {OUTPUT_DIR}')
    print()

    results = []

    for mp3_name, target_bitrate in RULES.items():
        input_path = MUSIC_DIR / mp3_name
        ogg_name = mp3_name.replace('.mp3', '.ogg')
        output_path = OUTPUT_DIR / ogg_name

        if not input_path.exists():
            print(f'  ⚠ 文件不存在: {mp3_name}')
            continue

        # 获取原始信息
        orig_info = get_audio_info(input_path)
        orig_size = orig_info['size_bytes']

        print(f'  压缩: {mp3_name} ({format_size(orig_size)}, {orig_info["bitrate"]//1000}kbps)')
        print(f'        → {ogg_name} (目标 {target_bitrate}kbps)')

        # 执行压缩
        success = compress_to_ogg(input_path, output_path, target_bitrate)

        if success and output_path.exists():
            new_info = get_audio_info(output_path)
            new_size = new_info['size_bytes']
            ratio = (1 - new_size / orig_size) * 100 if orig_size > 0 else 0

            results.append({
                'input': mp3_name,
                'output': ogg_name,
                'orig_size': orig_size,
                'new_size': new_size,
                'orig_bitrate': orig_info['bitrate'] // 1000,
                'target_bitrate': target_bitrate,
                'actual_bitrate': new_info['bitrate'] // 1000,
                'ratio': ratio,
                'status': '✅',
            })

            print(f'        完成: {format_size(new_size)} (节省 {ratio:.1f}%)')
        else:
            results.append({
                'input': mp3_name,
                'output': ogg_name,
                'orig_size': orig_size,
                'new_size': 0,
                'orig_bitrate': orig_info['bitrate'] // 1000,
                'target_bitrate': target_bitrate,
                'actual_bitrate': 0,
                'ratio': 0,
                'status': '❌',
            })
            print(f'        失败!')
        print()

    # ── 生成报告 ──
    print('=' * 70)
    print('  压缩报告')
    print('=' * 70)
    print(f'  {"文件":<25} {"原始":<12} {"压缩后":<12} {"节省":<10} {"码率":<10}')
    print(f'  {"-"*25} {"-"*12} {"-"*12} {"-"*10} {"-"*10}')

    total_orig = 0
    total_new = 0
    for r in results:
        if r['status'] == '✅':
            total_orig += r['orig_size']
            total_new += r['new_size']
            print(f'  {r["input"]:<25} {format_size(r["orig_size"]):<12} {format_size(r["new_size"]):<12} {r["ratio"]:.1f}%{"":<5} {r["target_bitrate"]}kbps')

    print(f'  {"-"*25} {"-"*12} {"-"*12} {"-"*10}')
    total_ratio = (1 - total_new / total_orig) * 100 if total_orig > 0 else 0
    print(f'  {"合计":<25} {format_size(total_orig):<12} {format_size(total_new):<12} {total_ratio:.1f}%')
    print()

    # 保存报告到文件
    report_path = OUTPUT_DIR / 'compress_report.json'
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump({
            'results': results,
            'summary': {
                'total_orig_bytes': total_orig,
                'total_new_bytes': total_new,
                'total_saved_ratio': total_ratio,
            }
        }, f, ensure_ascii=False, indent=2)
    print(f'  报告已保存: {report_path}')
    print()

    # 提醒保留 mp3 fallback
    print('  ℹ️  原始 MP3 文件已保留作为 fallback')
    print('  ℹ️  游戏代码需更新为优先加载 OGG，MP3 作为后备')
    print()

if __name__ == '__main__':
    main()
