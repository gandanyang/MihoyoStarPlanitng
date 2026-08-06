#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MiniMax（海螺）T2A 批量重配夏雅主线语音。

用法:
  python tools/gen_xiya_minimax.py [--dry-run] [--limit N] [--model speech-2.8-turbo]
                                    [--voice-id female-shaonv-jingpin]

产物:
  art_source/audio/voice/xiya/<tid>.wav     （16k 单声道 PCM s16le，与旧管线一致）
  art_source/audio/voice/xiya/<tid>.wav.txt （来源文本 sidecar，供 gen_mainline_voice 校验）

配置:
  MINIMAX_API_KEY 优先级：环境变量 > tools/.env > tools/.secrets.enc（DPAPI 保险箱）

说明:
  MiniMax 无 VoxCPM 的 prompt 回显问题，无需前导裁剪；台词清单从
  gen_mainline_voice.py 的 T 列表直接导入，与 StorySystem 映射保持一致。
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
VOICE_DIR = ROOT / "art_source" / "audio" / "voice" / "xiya"
DONE_MARKER = VOICE_DIR / ".minimax_done"
FFMPEG = r"E:\BINGdown\VoxCPM\src\ffmpeg\bin\ffmpeg.exe"
BASE_URL = "https://api.minimaxi.com/v1/t2a_v2"
DEFAULT_VOICE_ID = "female-shaonv-jingpin"
DEFAULT_MODEL = "speech-2.8-turbo"
MAX_RETRY = 3


def load_xiya_tasks() -> list[tuple[str, str, str]]:
    spec = importlib.util.spec_from_file_location("gmv", str(TOOLS / "gen_mainline_voice.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return [t for t in mod.T if t[0] == "xiya"]


def read_env_file() -> dict[str, str]:
    env: dict[str, str] = {}
    p = TOOLS / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def get_api_key() -> str:
    if os.environ.get("MINIMAX_API_KEY"):
        return os.environ["MINIMAX_API_KEY"]
    env = read_env_file()
    if env.get("MINIMAX_API_KEY"):
        return env["MINIMAX_API_KEY"]
    r = subprocess.run(
        ["node", str(TOOLS / "secret_key.mjs"), "get", "MINIMAX_API_KEY"],
        capture_output=True, text=True, timeout=30, cwd=str(ROOT),
    )
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip()
    raise RuntimeError("未找到 MINIMAX_API_KEY（环境变量 / tools/.env / 加密保险箱）")


def tts(text: str, voice_id: str, model: str, api_key: str) -> tuple[bytes, float]:
    body = {
        "model": model,
        "text": text,
        "stream": False,
        "output_format": "hex",
        "voice_setting": {"voice_id": voice_id, "speed": 1.0, "vol": 1.0, "pitch": 0},
        "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1},
    }
    req = urllib.request.Request(
        BASE_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if data.get("base_resp", {}).get("status_code", 0) != 0:
        raise RuntimeError("API 错误: " + json.dumps(data.get("base_resp", data), ensure_ascii=False)[:300])
    audio_hex = (data.get("data") or {}).get("audio")
    if not audio_hex:
        raise RuntimeError("响应无音频: " + json.dumps(data, ensure_ascii=False)[:300])
    dur = (data.get("extra_info") or {}).get("audio_length", 0) / 1000.0
    return bytes.fromhex(audio_hex), dur


def to_wav(mp3_bytes: bytes, out_wav: Path) -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "tmp.mp3"
        tmp.write_bytes(mp3_bytes)
        r = subprocess.run(
            [FFMPEG, "-y", "-i", str(tmp), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(out_wav)],
            capture_output=True, text=True, timeout=90,
        )
        if r.returncode != 0:
            raise RuntimeError("ffmpeg 失败: " + r.stderr[-300:])


def main() -> int:
    p = argparse.ArgumentParser(description="MiniMax 批量重配夏雅主线语音")
    p.add_argument("--dry-run", action="store_true", help="只打印任务清单，不调用 API")
    p.add_argument("--limit", type=int, default=0, help="只跑前 N 条")
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--voice-id", default=DEFAULT_VOICE_ID)
    p.add_argument("--force", action="store_true", help="忽略断点标记，全部重新生成")
    args = p.parse_args()

    tasks = load_xiya_tasks()
    if args.limit > 0:
        tasks = tasks[: args.limit]

    done: set[str] = set()
    if DONE_MARKER.exists() and not args.force:
        done = {ln.strip() for ln in DONE_MARKER.read_text(encoding="utf-8").splitlines() if ln.strip()}
    todo = [t for t in tasks if t[1] not in done]
    print(f"MiniMax 重配启动：共 {len(tasks)} 条，已完成 {len(done)}，待跑 {len(todo)} | voice={args.voice_id} model={args.model}")
    if args.dry_run:
        for role, tid, text in todo:
            print(f"  [{role}/{tid}] {text}")
        return 0

    api_key = get_api_key()
    VOICE_DIR.mkdir(parents=True, exist_ok=True)

    ok = 0
    failed: list[str] = []
    for role, tid, text in todo:
        out = VOICE_DIR / f"{tid}.wav"
        sidecar = VOICE_DIR / f"{tid}.wav.txt"
        try:
            mp3, dur = None, 0.0
            last_err = ""
            for attempt in range(1, MAX_RETRY + 1):
                try:
                    mp3, dur = tts(text, args.voice_id, args.model, api_key)
                    break
                except Exception as e:  # noqa: BLE001
                    last_err = str(e)
                    print(f"  [重试 {attempt}/{MAX_RETRY}] {tid}: {last_err[:120]}")
            if mp3 is None:
                raise RuntimeError(f"生成失败（{MAX_RETRY} 次重试）: {last_err}")
            to_wav(mp3, out)
            if out.stat().st_size < 1024:
                raise RuntimeError("产物过小，疑似无效")
            sidecar.write_text(text, encoding="utf-8")
            done.add(tid)
            DONE_MARKER.write_text("\n".join(sorted(done)) + "\n", encoding="utf-8")
            ok += 1
            print(f"  [OK] [{role}/{tid}] {dur:.1f}s -> {out.name} ({out.stat().st_size:,} bytes)")
        except Exception as e:  # noqa: BLE001
            failed.append(f"{role}/{tid}")
            print(f"  [FAIL] [{role}/{tid}] {e}")

    print(f"\n完成：本轮成功 {ok}，累计 {len(done)} / {len(tasks)}，失败 {len(failed)}")
    if failed:
        print("失败列表:", ", ".join(failed))
        return 40
    return 0


if __name__ == "__main__":
    sys.exit(main())
