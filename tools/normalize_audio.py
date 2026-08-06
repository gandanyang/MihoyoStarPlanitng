#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
音频响度标准化工具

用法：
  python tools/normalize_audio.py --input public/audio/voice --output public/audio/voice_normalized

功能：
  1. 扫描输入目录的 .wav 文件
  2. 使用 ffmpeg 计算每个文件的响度（LUFS）
  3. 调整到目标响度（默认 -16 LUFS）
  4. 输出到目标目录
  5. 生成处理报告

依赖：
  - ffmpeg（需要在 PATH 中）
  - Python 3.8+

目标响度说明：
  - -16 LUFS：适合移动端游戏（推荐）
  - -14 LUFS：适合网页游戏
  - -23 LUFS：适合电视/电影（EBU R128 标准）
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

# 目标响度（LUFS）
DEFAULT_TARGET_LUFS = -16.0
# 响度容差（±1 LUFS）
TOLERANCE = 1.0
# True Peak 限制（dBTP）
TRUE_PEAK_LIMIT = -1.5


def check_ffmpeg() -> bool:
    """检查 ffmpeg 是否可用"""
    try:
        subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            check=True
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def get_audio_loudness(file_path: str) -> Optional[float]:
    """
    使用 ffmpeg 计算音频文件的响度（LUFS）
    
    使用 loudnorm 滤镜的 print_format=json 输出获取精确响度值
    """
    cmd = [
        'ffmpeg',
        '-i', file_path,
        '-af', f'loudnorm=I={DEFAULT_TARGET_LUFS}:TP={TRUE_PEAK_LIMIT}:LRA=11:print_format=json',
        '-f', 'null',
        '-'
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        # 从 stderr 中解析 JSON 输出
        stderr = result.stderr
        
        # 查找 JSON 块（在 "Parsed_loudnorm" 之后）
        json_match = re.search(r'\{[^}]*"input_i"[^}]*\}', stderr, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return float(data.get('input_i', 0))
        
        # 备用方法：查找 "Input Integrated" 行
        for line in stderr.split('\n'):
            if 'Input Integrated' in line and 'LUFS' in line:
                # 提取数字
                match = re.search(r'([-\d.]+)\s*LUFS', line)
                if match:
                    return float(match.group(1))
        
        return None
        
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError) as e:
        print(f'  警告：无法计算 {file_path} 的响度: {e}')
        return None


def normalize_audio_file(
    input_path: str,
    output_path: str,
    target_lufs: float = DEFAULT_TARGET_LUFS
) -> bool:
    """
    使用 ffmpeg normalize 滤镜标准化音频文件
    
    参数：
        input_path: 输入文件路径
        output_path: 输出文件路径
        target_lufs: 目标响度（LUFS）
    """
    cmd = [
        'ffmpeg',
        '-i', input_path,
        '-af', f'loudnorm=I={target_lufs}:TP={TRUE_PEAK_LIMIT}:LRA=11',
        '-ar', '44100',  # 采样率
        '-ac', '2',      # 声道数
        '-y',            # 覆盖输出文件
        output_path
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        print(f'  错误：处理 {input_path} 超时')
        return False


def process_directory(
    input_dir: str,
    output_dir: str,
    target_lufs: float = DEFAULT_TARGET_LUFS
) -> list[dict]:
    """
    批量处理目录中的音频文件
    
    返回处理报告列表
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    # 创建输出目录
    output_path.mkdir(parents=True, exist_ok=True)
    
    # 扫描 wav 文件（递归搜索子目录）
    wav_files = sorted(input_path.rglob('*.wav'))
    
    if not wav_files:
        print(f'警告：在 {input_dir} 中未找到 .wav 文件')
        return []
    
    print(f'找到 {len(wav_files)} 个 .wav 文件')
    print(f'目标响度: {target_lufs} LUFS')
    print('-' * 60)
    
    report = []
    
    for i, wav in enumerate(wav_files, 1):
        # 保持子目录结构
        relative_path = wav.relative_to(input_path)
        print(f'[{i}/{len(wav_files)}] 处理: {relative_path}')
        
        # 计算原始响度
        original_loudness = get_audio_loudness(str(wav))
        
        # 标准化文件（保持子目录结构）
        output_file = output_path / relative_path
        output_file.parent.mkdir(parents=True, exist_ok=True)
        success = normalize_audio_file(str(wav), str(output_file), target_lufs)
        
        if success:
            # 计算新响度
            new_loudness = get_audio_loudness(str(output_file))
            
            adjustment = 0.0
            if original_loudness is not None and new_loudness is not None:
                adjustment = new_loudness - original_loudness
            
            report.append({
                'file': wav.name,
                'original_loudness': original_loudness,
                'normalized_loudness': new_loudness,
                'adjustment': adjustment,
                'status': 'success'
            })
            
            if original_loudness is not None and new_loudness is not None:
                print(f'  原始: {original_loudness:.1f} LUFS → 标准化: {new_loudness:.1f} LUFS (调整: {adjustment:+.1f})')
            else:
                print(f'  已处理（响度值未知）')
        else:
            report.append({
                'file': wav.name,
                'original_loudness': original_loudness,
                'normalized_loudness': None,
                'adjustment': None,
                'status': 'failed'
            })
            print(f'  处理失败')
    
    return report


def print_report(report: list[dict], output_dir: str):
    """打印处理报告"""
    print('\n' + '=' * 60)
    print('处理报告')
    print('=' * 60)
    
    success_count = sum(1 for r in report if r['status'] == 'success')
    failed_count = sum(1 for r in report if r['status'] == 'failed')
    
    print(f'总计: {len(report)} 个文件')
    print(f'成功: {success_count} 个')
    print(f'失败: {failed_count} 个')
    
    if success_count > 0:
        adjustments = [r['adjustment'] for r in report if r['adjustment'] is not None]
        if adjustments:
            print(f'\n响度调整统计:')
            print(f'  最大增益: {max(adjustments):+.1f} LUFS')
            print(f'  最大衰减: {min(adjustments):+.1f} LUFS')
            print(f'  平均调整: {sum(adjustments)/len(adjustments):+.1f} LUFS')
    
    # 保存 JSON 报告
    report_path = os.path.join(output_dir, 'normalization_report.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f'\n详细报告已保存到: {report_path}')


def main():
    parser = argparse.ArgumentParser(
        description='音频响度标准化工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  # 标准化语音文件
  python tools/normalize_audio.py --input public/audio/voice --output public/audio/voice_normalized
  
  # 使用自定义目标响度
  python tools/normalize_audio.py --input public/audio/voice --output public/audio/voice_normalized --target -14
        """
    )
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='输入目录（包含 .wav 文件）'
    )
    parser.add_argument(
        '--output', '-o',
        required=True,
        help='输出目录（标准化后的文件）'
    )
    parser.add_argument(
        '--target', '-t',
        type=float,
        default=DEFAULT_TARGET_LUFS,
        help=f'目标响度 (LUFS，默认 {DEFAULT_TARGET_LUFS})'
    )
    
    args = parser.parse_args()
    
    # 检查 ffmpeg
    if not check_ffmpeg():
        print('错误：未找到 ffmpeg，请先安装 ffmpeg')
        print('  Windows: https://ffmpeg.org/download.html')
        print('  macOS: brew install ffmpeg')
        print('  Linux: sudo apt install ffmpeg')
        sys.exit(1)
    
    # 检查输入目录
    if not os.path.isdir(args.input):
        print(f'错误：输入目录不存在: {args.input}')
        sys.exit(1)
    
    # 处理文件
    report = process_directory(args.input, args.output, args.target)
    
    # 打印报告
    print_report(report, args.output)
    
    print('\n完成！')


if __name__ == '__main__':
    main()
