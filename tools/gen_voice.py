#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
归星物语一键语音生成脚本（双引擎：本地 VoxCPM / 小米 MiMo-TTS）。

引擎说明：
  · engine=voxcpm  → 本地推理，E 盘 VoxCPM 自带 3 模型 + CLI，不联网
                      优点：完全离线、免费、可精细调参 cfg/steps/enhance
                      缺点：吃显存、每条 20~120 秒
  · engine=mimo    → HTTP 调用本机 F 盘 MiMo-TTS Node 服务
                      优点：生成速度快（3~15秒/条）、音质稳定、自带语速调节
                      缺点：需先启动 start.bat、需 MiMo API Key、可能限流

目标：不打开 GUI，一条命令生成 NPC/剧情语音文件落到 public/audio/voice/。

退出码详见 docs\VoxCPM语音生成一键调用手册.md §3.3。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

# ========================= 常量 =========================
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOCS = PROJECT_ROOT / "docs" / "VoxCPM语音生成一键调用手册.md"

# VoxCPM 固定位置（E 盘用户长期固定路径）
DEFAULT_VOXCPM_ROOT = Path(r"E:\BINGdown\VoxCPM")
MWEDM_SCRIPTS = Path("mwedm") / "Scripts"
VOXCPM_EXE_NAME = "voxcpm" + (".exe" if sys.platform == "win32" else "")
VOXCPM_PYTHON_NAME = "python" + (".exe" if sys.platform == "win32" else "")
FFMPEG_EXE_NAME = "ffmpeg" + (".exe" if sys.platform == "win32" else "")

# MiMo-TTS 固定位置（F 盘，用户本地一键 Node 服务）
DEFAULT_MIMO_ROOT = Path(r"F:\MiMo-TTS-Win-v1.1.2\MiMo-TTS-Win")
MIMO_APP_DIR = Path("app")
MIMO_STARTUP = Path("start.bat")
MIMO_DEFAULT_PORT = 4000          # 从 app\.env 中 PORT=4000 确认；不一致时 --mimo-port 覆盖
MIMO_BASE_URL_FMT = "http://127.0.0.1:{port}"
MIMO_VOICE_CLONE_PATH = "/api/tts/voice-clone"
MIMO_HEALTH_PATH = "/api/tts/config"
# MiMo 输出最小字节数（< 8KB 基本是坏包，对比 VoxCPM 的 .wav 30KB，MiMo 返回的是 mp3，阈值调低）
MIMO_MIN_OUTPUT_BYTES = 8 * 1024

# 3 个必需模型相对路径（相对于 VOXCPM_ROOT）
MODEL_REL_PATHS = {
    "voxcpm-0.5b": Path("models") / "openbmb__VoxCPM-0.5B",
    "zipenhancer": Path("models") / "modelscope_cache" / "models" / "iic" / "speech_zipenhancer_ans_multiloss_16k_base",
    "sensevoice": Path("models") / "modelscope_cache" / "models" / "iic" / "SenseVoiceSmall",
}
MODEL_MANDATORY_FILES = {
    "voxcpm-0.5b":     ["config.json", "pytorch_model.bin", "tokenizer.json", "audiovae.pth"],
    "zipenhancer":     ["configuration.json", "pytorch_model.bin"],
    "sensevoice":      ["config.yaml", "model.pt"],
}

# 输出最小字节数（< 30KB 基本是坏包）
MIN_OUTPUT_BYTES = 30 * 1024


# ========================= 日志/工具函数（与 build_apk.py 同风格）=========================
def log(title: str, msg: str = "") -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    if msg:
        print(f"[{stamp}] ╔══ {title}\n{msg}")
    else:
        print(f"[{stamp}] ╔══ {title}")


def err(msg: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] ❌ {msg}", file=sys.stderr)


def warn(msg: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] ⚠️  {msg}")


def ensure_dir(dir_path: Path) -> None:
    """创建目录：不存在→创建；存在且是目录→OK；存在但是文件→报错不破坏用户数据。"""
    if not dir_path.exists():
        dir_path.mkdir(parents=True, exist_ok=True)
        return
    if dir_path.is_dir():
        return
    # 是文件不是目录：**不能删用户数据**
    err(f"输出路径冲突：{dir_path} 已经是一个文件，不是目录。请改名或删除后再跑。")
    sys.exit(21)


def check_output_file(path: Path) -> None:
    """校验生成产物：存在且 ≥ MIN_OUTPUT_BYTES，否则 exit(30)。"""
    if not path.exists():
        err(f"生成失败：产物不存在（{path}）")
        sys.exit(30)
    sz = path.stat().st_size
    if sz < MIN_OUTPUT_BYTES:
        err(f"生成失败：产物过小（{sz} bytes < {MIN_OUTPUT_BYTES}，疑似 0 字节坏音频）。建议：换参考音频 / 调 cfg / 调 steps / 手动给 ref_text。")
        sys.exit(30)
    log(f"产物校验通过：{path}（{sz:,} bytes）")


# ========================= 环境检查 =========================
def resolve_voxcpm_root(cli_arg: str | None) -> Path:
    root = Path(cli_arg) if cli_arg else DEFAULT_VOXCPM_ROOT
    if not root.exists() or not root.is_dir():
        err(f"VOXCPM 根目录不存在：{root}。请用 --voxcpm-root 指定正确路径，或确认 E 盘目录没移动。")
        sys.exit(10)
    return root


def check_voxcpm_environment(root: Path) -> tuple[Path, Path, Path, dict[str, Path]]:
    """
    返回：(voxcpm_exe, ffmpeg_exe, model_dir, env_paths_dict)
    任何缺失直接 sys.exit(11)。
    """
    # 1. mwedm 结构：
    #    mwedm/Scripts/voxcpm.exe  ← CLI（对）
    #    mwedm/python.exe          ← 内嵌解释器（在根目录，不在 Scripts 下！v0.2 修）
    mwedm_scripts = root / MWEDM_SCRIPTS
    mwedm_root = root / "mwedm"
    voxcpm_exe = mwedm_scripts / VOXCPM_EXE_NAME
    mwedm_python = mwedm_root / VOXCPM_PYTHON_NAME
    if not voxcpm_exe.exists():
        err(f"VOXCPM 自带 CLI 可执行文件缺失：{voxcpm_exe}")
        sys.exit(11)
    if not mwedm_python.exists():
        err(f"VOXCPM 内嵌 Python 缺失：{mwedm_python}（应为 mwedm 根目录下的 python.exe）")
        sys.exit(11)

    # 2. ffmpeg（src/ffmpeg/bin，mp3 输出需要）
    ffmpeg_exe = root / "src" / "ffmpeg" / "bin" / FFMPEG_EXE_NAME
    if not ffmpeg_exe.exists():
        warn(f"ffmpeg 不在打包路径：{ffmpeg_exe}，后续 .mp3 输出可能失败；.wav 输出不受影响。")

    # 3. 三个模型目录 + 关键文件
    resolved_models: dict[str, Path] = {}
    missing: list[str] = []
    for name, rel in MODEL_REL_PATHS.items():
        abs_path = root / rel
        resolved_models[name] = abs_path
        if not abs_path.is_dir():
            missing.append(f"  · {name}：缺少目录 {abs_path}")
            continue
        for fn in MODEL_MANDATORY_FILES[name]:
            f = abs_path / fn
            if not f.exists():
                missing.append(f"  · {name}：缺少关键文件 {fn}（{f}）")
    if missing:
        err("VOXCPM 模型文件不完整：\n" + "\n".join(missing) +
            "\n请参考 docs §6 FAQ 重新下载模型，或双击 VoxCPM 启动器.exe 自动下载。")
        sys.exit(11)

    return voxcpm_exe, ffmpeg_exe, resolved_models["voxcpm-0.5b"], resolved_models


# ========================= MiMo 环境检查 & HTTP 工具 =========================
def resolve_mimo_port(cli_arg: str | None) -> int:
    if cli_arg:
        try:
            return int(cli_arg)
        except ValueError:
            err(f"--mimo-port 必须是整数，收到：{cli_arg}")
            sys.exit(12)
    return MIMO_DEFAULT_PORT


def resolve_mimo_api_key(cli_arg: str | None, mimo_root: Path) -> str | None:
    """优先级：--mimo-api-key > 环境变量 MIMO_API_KEY > 尝试读取 MiMo 目录 data 配置"""
    if cli_arg:
        return cli_arg.strip()
    env_key = os.environ.get("MIMO_API_KEY", "").strip()
    if env_key:
        return env_key
    # 尝试从 MiMo data/llm-config.json 读取（可选，不强制）
    candidate = mimo_root / "app" / "data" / "llm-config.json"
    if candidate.is_file():
        try:
            with candidate.open("r", encoding="utf-8") as f:
                cfg = json.load(f)
            k = cfg.get("apiKey") or cfg.get("mimo_api_key") or ""
            if isinstance(k, str) and k.strip():
                return k.strip()
        except (json.JSONDecodeError, OSError):
            pass
    return None


def mimo_base_url(port: int) -> str:
    return MIMO_BASE_URL_FMT.format(port=port)


def check_mimo_environment(port: int, mimo_root: Path, api_key: str | None, timeout_s: float = 3.0) -> None:
    """
    检查 MiMo 服务：
      1. 根目录存在（可选但建议）
      2. HTTP /api/tts/config 可访问（证明服务已启动）
      3. API Key 非空（可选：MiMo 本地模式可能不需要 key，不强制失败，只 warn）
    任何硬性缺失直接 sys.exit(12)。
    """
    if not mimo_root.exists() or not mimo_root.is_dir():
        warn(f"MiMo 根目录不存在：{mimo_root}。仍尝试连接服务（可能服务在别的机器启动）。")

    url = mimo_base_url(port) + MIMO_HEALTH_PATH
    log(f"MiMo 服务连通性检查", f"  GET {url}（timeout={timeout_s}s）")
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status}")
            body = resp.read(512)
            log(f"MiMo 服务在线", f"  status=200  响应前 128 字节：{body[:128]!r}")
    except urllib.error.URLError as e:
        err(
            "MiMo 服务连接失败：" + str(e) +
            f"\n  · 请先双击启动：{mimo_root / MIMO_STARTUP}" +
            f"\n  · 或确认端口：当前 {port}，如果不是 4000 请加 --mimo-port <端口>" +
            "\n  · 启动后再跑本脚本"
        )
        sys.exit(12)
    except Exception as e:  # pragma: no cover
        err(f"MiMo 健康检查异常：{type(e).__name__}: {e}")
        sys.exit(12)

    if not api_key:
        warn("未检测到 MiMo API Key（--mimo-api-key / 环境变量 MIMO_API_KEY / data/llm-config.json 都没有）。"
             "本地模式可能不需要；如果生成失败并报 401/403，请手动配置。")
    else:
        log(f"MiMo API Key 已加载（脱敏：sk-…{api_key[-4:] if len(api_key) >= 4 else '****'}）")


def _encode_multipart_form(fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> tuple[bytes, str]:
    """手动构造 multipart/form-data，不依赖第三方 requests 库。"""
    boundary = "----MiMoFormBoundary" + datetime.now().strftime("%Y%m%d%H%M%S%f")
    body_chunks: list[bytes] = []
    CRLF = b"\r\n"

    # 文本字段
    for name, value in fields.items():
        body_chunks.append(f"--{boundary}".encode("utf-8") + CRLF)
        body_chunks.append(
            f'Content-Disposition: form-data; name="{name}"'.encode("utf-8") + CRLF + CRLF
        )
        body_chunks.append(str(value).encode("utf-8") + CRLF)

    # 文件字段
    for name, (filename, data, mime) in files.items():
        body_chunks.append(f"--{boundary}".encode("utf-8") + CRLF)
        body_chunks.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'.encode("utf-8") + CRLF
        )
        body_chunks.append(f"Content-Type: {mime}".encode("utf-8") + CRLF + CRLF)
        body_chunks.append(data + CRLF)

    body_chunks.append(f"--{boundary}--".encode("utf-8") + CRLF)
    return b"".join(body_chunks), f"multipart/form-data; boundary={boundary}"


def _file_to_base64_data_url(ref_audio: Path) -> tuple[str, str]:
    """把参考音频读成 base64，返回 (data_url, mime)。MiMo 支持 data:audio/mpeg;base64,xxx 格式。"""
    suffix = ref_audio.suffix.lower()
    if suffix in (".mp3", ".mpeg"):
        mime = "audio/mpeg"
    elif suffix == ".wav":
        mime = "audio/wav"
    elif suffix == ".m4a":
        mime = "audio/mp4"
    else:
        # 兜底 mp3，MiMo 侧大概率能处理
        mime = "audio/mpeg"
    raw = ref_audio.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}", mime


def run_single_mimo(
    mimo_root: Path,
    port: int,
    api_key: str | None,
    text: str,
    ref_audio: Path,
    output: Path,
    speed: float,
    user_message: str | None,
    dry_run: bool,
    task_id: str = "single",
) -> tuple[bool, str]:
    """
    调用 MiMo-TTS /api/tts/voice-clone 接口生成语音。
    优先 multipart/form-data（上传文件），兼容性更好。
    返回 (是否成功, 备注信息)。
    """
    log(f"任务 [{task_id}] MiMo 准备",
        f"  文本: {text[:60]}{'…' if len(text) > 60 else ''}\n"
        f"  参考音频: {ref_audio}\n"
        f"  输出: {output}\n"
        f"  语速 speed={speed}  端口={port}  API Key={'有' if api_key else '无'}  user_msg={user_message or '(默认)'}")

    # 1. 参考音频存在校验（退出码 20 同 VoxCPM）
    if not ref_audio.is_file():
        msg = f"参考音频不存在：{ref_audio}"
        err(f"任务 [{task_id}] {msg}")
        return False, msg

    # 2. 输出父目录准备（21）
    ensure_dir(output.parent)

    # 3. 准备请求
    base = mimo_base_url(port) + MIMO_VOICE_CLONE_PATH
    ref_bytes = ref_audio.read_bytes()
    ref_mime = "audio/mpeg" if ref_audio.suffix.lower() != ".wav" else "audio/wav"

    fields: dict[str, str] = {"text": text}
    if api_key:
        fields["apiKey"] = api_key
    if speed and abs(speed - 1.0) > 1e-6:
        fields["speed"] = f"{speed:.2f}"
    if user_message:
        fields["userMessage"] = user_message
    files = {"audioFile": (ref_audio.name, ref_bytes, ref_mime)}

    body, content_type = _encode_multipart_form(fields, files)

    if dry_run:
        preview_b64_sample = base64.b64encode(ref_bytes[:32]).decode("ascii")
        log(f"任务 [{task_id}] MiMo DRY-RUN 不执行",
            f"POST {base}\n"
            f"Content-Type: {content_type}\n"
            f"body 总大小: {len(body):,} bytes\n"
            f"fields: {list(fields.keys())}\n"
            f"file: {ref_audio.name} ({len(ref_bytes):,} bytes, {ref_mime}, base64前16字样本: {preview_b64_sample})")
        return True, "dry-run 成功"

    # 4. 发送请求（MiMo 单条一般 3~15s，给 90s 超时防止卡死）
    log(f"任务 [{task_id}] 调用 MiMo /api/tts/voice-clone…（预计 3~15 秒，视文本长度和服务负载）")
    t0 = datetime.now()
    try:
        req = urllib.request.Request(base, data=body, method="POST")
        req.add_header("Content-Type", content_type)
        req.add_header("Accept", "audio/mpeg, application/json;q=0.9, */*;q=0.1")
        with urllib.request.urlopen(req, timeout=90.0) as resp:
            status = resp.status
            resp_content_type = resp.headers.get("Content-Type", "")
            raw = resp.read()
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            raw = e.read()
        except Exception:
            raw = b""
        resp_content_type = e.headers.get("Content-Type", "") if e.headers else ""
    except urllib.error.URLError as e:
        msg = f"MiMo HTTP 连接错误：{type(e).__name__}: {e.reason}"
        err(f"任务 [{task_id}] {msg}")
        return False, msg
    except Exception as e:  # pragma: no cover
        msg = f"MiMo 请求异常：{type(e).__name__}: {e}"
        err(f"任务 [{task_id}] {msg}")
        return False, msg

    elapsed_ms = int((datetime.now() - t0).total_seconds() * 1000)

    # 5. 解析响应
    is_json_resp = "application/json" in resp_content_type.lower() or (
        raw and raw.lstrip().startswith(b"{") and raw.rstrip().endswith(b"}")
    )
    is_audio_resp = (
        "audio/" in resp_content_type.lower()
        or ("octet-stream" in resp_content_type.lower() and len(raw) > MIMO_MIN_OUTPUT_BYTES)
    )

    log(f"任务 [{task_id}] MiMo 响应",
        f"  status={status}  Content-Type={resp_content_type or '(空)'}  size={len(raw):,} bytes  耗时={elapsed_ms}ms")

    # 5a. 非 2xx 优先解析 JSON 错误
    if status < 200 or status >= 300:
        hint = ""
        if is_json_resp:
            try:
                err_json = json.loads(raw.decode("utf-8", errors="replace"))
                hint = f" | JSON: success={err_json.get('success')} message={err_json.get('message')!r}"
            except Exception:
                hint = f" | raw前 256 字: {raw[:256]!r}"
        else:
            hint = f" | raw前 256 字: {raw[:256]!r}"
        msg = f"MiMo 返回 HTTP {status}{hint}"
        if status in (401, 403):
            msg += "。常见原因：API Key 无效 / 过期，或缺少音色克隆模型权限。"
        elif status == 429:
            msg += "。常见原因：限流（MiMo 对音色克隆接口有最小请求间隔），等几秒再试或批量任务减少并发。"
        elif status >= 500:
            msg += "。常见原因：MiMo 服务端异常，重启 start.bat 或稍后再试。"
        err(f"任务 [{task_id}] {msg}")
        return False, msg

    # 5b. 2xx 但却是 JSON（例如 {success:false} 仍然 200 的情况）
    if is_json_resp and not is_audio_resp:
        try:
            js = json.loads(raw.decode("utf-8", errors="replace"))
        except Exception:
            msg = f"响应是 JSON 但解析失败：raw前 256 字={raw[:256]!r}"
            err(f"任务 [{task_id}] {msg}")
            return False, msg
        if js.get("success") is False:
            msg = f"MiMo 返回业务失败：{js.get('message')!r} | full={js}"
            err(f"任务 [{task_id}] {msg}")
            return False, msg
        # 万一真的是 {success:true, data:base64,...} 形式：兼容兜底
        b64 = js.get("data") or (js.get("audio") or {}).get("data")
        if isinstance(b64, str) and b64:
            try:
                # data URL 形式
                if b64.startswith("data:") and "," in b64:
                    b64 = b64.split(",", 1)[1]
                raw = base64.b64decode(b64, validate=False)
                is_audio_resp = True
                log(f"任务 [{task_id}] 从 JSON data 字段还原音频", f"  还原后 {len(raw):,} bytes")
            except Exception as e:
                msg = f"从 JSON.data 解码 base64 失败：{type(e).__name__}: {e}"
                err(f"任务 [{task_id}] {msg}")
                return False, msg
        else:
            msg = f"JSON 响应里没有可识别的音频字段：keys={list(js.keys())}"
            err(f"任务 [{task_id}] {msg}")
            return False, msg

    # 5c. 音频大小校验（MiMo 返回 mp3，阈值 8KB）
    if len(raw) < MIMO_MIN_OUTPUT_BYTES:
        msg = f"生成失败：音频过小（{len(raw)} bytes < {MIMO_MIN_OUTPUT_BYTES}，疑似空响应/静音占位）。raw前 64 字：{raw[:64]!r}"
        err(f"任务 [{task_id}] {msg}")
        return False, msg

    # 6. 写文件
    try:
        # MiMo 默认输出 mp3；如果用户指定 .wav 后缀，我们仍然保留原生 mp3（不改编码，避免引入 ffmpeg 依赖），
        # 但在日志里提醒。如果未来需要 wav 输出，可以在这里加 ffmpeg 转码（同 VoxCPM 路径）。
        output.write_bytes(raw)
    except OSError as e:
        msg = f"写入输出文件失败：{type(e).__name__}: {e}"
        err(f"任务 [{task_id}] {msg}")
        return False, msg

    log(f"任务 [{task_id}] MiMo 产物写入成功",
        f"  {output}（{len(raw):,} bytes, Content-Type={resp_content_type or 'audio/mpeg(推定)'}）")
    return True, f"成功 → {output} ({len(raw):,} bytes, {elapsed_ms} ms)"


# ========================= 核心：单次 VoxCPM 调用 =========================
def build_cli_args(
    voxcpm_exe: Path,
    model_dir: Path,
    ffmpeg_in_path: Path | None,
    text: str,
    ref_audio: Path,
    ref_text: str | None,
    output: Path,
    cfg: float,
    steps: int,
    enhance: bool,
) -> list[str]:
    """构造 voxcpm CLI 参数列表（Windows 安全：路径加引号由 subprocess 管）。"""
    args: list[str] = [
        str(voxcpm_exe),
        "--text", text,
        "--prompt-audio", str(ref_audio),
        "--output", str(output),
        "--cfg-value", f"{cfg:.2f}",
        "--inference-timesteps", str(int(steps)),
        "--model-path", str(model_dir),
    ]
    # 参考文本：空着不传，让 VoxCPM 内部 SenseVoice 自动转写
    if ref_text and ref_text.strip():
        args += ["--prompt-text", ref_text.strip()]
    # 去噪增强（ZipEnhancer）
    if enhance:
        args += ["--denoise"]
    return args


def run_single(
    voxcpm_exe: Path,
    model_dir: Path,
    ffmpeg_exe: Path | None,
    text: str,
    ref_audio: Path,
    ref_text: str | None,
    output: Path,
    cfg: float,
    steps: int,
    enhance: bool,
    dry_run: bool,
    task_id: str = "single",
) -> tuple[bool, str]:
    """
    执行单条生成。返回 (是否成功, 备注信息)。
    dry_run=True 时只打印命令不执行。
    """
    log(f"任务 [{task_id}] 准备",
        f"  文本: {text[:60]}{'…' if len(text) > 60 else ''}\n"
        f"  参考音频: {ref_audio}\n"
        f"  参考文本: {'（自动转写）' if not (ref_text and ref_text.strip()) else ref_text[:40] + '…'}\n"
        f"  输出: {output}\n"
        f"  cfg={cfg}  steps={steps}  enhance={enhance}")

    # 1. 参考音频存在校验（20）
    if not ref_audio.is_file():
        msg = f"参考音频不存在：{ref_audio}"
        err(f"任务 [{task_id}] {msg}")
        return False, msg

    # 2. 输出父目录准备（21）
    ensure_dir(output.parent)

    # 3. 构造 CLI
    args = build_cli_args(voxcpm_exe, model_dir, ffmpeg_exe,
                          text, ref_audio, ref_text, output, cfg, steps, enhance)
    pretty_cmd = " ".join(f'"{a}"' if " " in a else a for a in args)
    if dry_run:
        log(f"任务 [{task_id}] DRY-RUN 不执行", f"CMD:\n  {pretty_cmd}")
        return True, "dry-run 成功"

    # 4. ffmpeg 先加到 PATH（VoxCPM 内嵌 mwedm 可能没加自己的 ffmpeg）
    env = os.environ.copy()
    if ffmpeg_exe and ffmpeg_exe.exists():
        ffmpeg_dir = str(ffmpeg_exe.parent)
        env["PATH"] = ffmpeg_dir + os.pathsep + env.get("PATH", "")
        env["FFMPEG_BINARY"] = str(ffmpeg_exe)

    # 5. 运行
    log(f"任务 [{task_id}] 执行 VoxCPM…（预计 20~120 秒，视显卡和步数）")
    try:
        proc = subprocess.run(
            args,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as e:
        msg = f"执行失败：找不到 voxcpm CLI → {e}"
        err(f"任务 [{task_id}] {msg}")
        return False, msg
    except Exception as e:  # pragma: no cover - 兜底
        msg = f"执行失败：未知异常 → {type(e).__name__}: {e}"
        err(f"任务 [{task_id}] {msg}")
        return False, msg

    if proc.stdout:
        log(f"任务 [{task_id}] stdout", proc.stdout[-2000:])
    if proc.stderr:
        warn(f"任务 [{task_id}] stderr（最后 2000 字）\n{proc.stderr[-2000:]}")
    if proc.returncode != 0:
        msg = f"VoxCPM 返回非零退出码 {proc.returncode}，常见：参考音频损坏 / 模型加载失败 / OOM"
        err(f"任务 [{task_id}] {msg}")
        return False, msg

    # 6. 产物校验
    try:
        check_output_file(output)
    except SystemExit as e:
        # 单任务不直接 sys.exit，把失败交给上层（批量模式要继续）
        return False, f"产物校验失败（退出码 {e.code}）"

    return True, f"成功 → {output} ({output.stat().st_size:,} bytes)"


# ========================= 批量模式 =========================
def load_batch_json(batch_path: Path) -> dict:
    if not batch_path.is_file():
        err(f"批量任务文件不存在：{batch_path}。建议复制 voice_tasks.example.json 为 voice_tasks.json 后编辑。")
        sys.exit(22)
    try:
        with batch_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        err(f"批量任务 JSON 解析失败：{e}")
        sys.exit(22)


def resolve_task_output(
    defaults: dict,
    task: dict,
    project_root: Path,
) -> Path:
    """按 JSON 约定计算输出路径：任务写了 output 优先，否则默认 public/audio/voice/<role_en>/<id>.wav。"""
    explicit_out = task.get("output")
    if explicit_out:
        out_path = Path(explicit_out)
        if not out_path.is_absolute():
            out_path = project_root / out_path
        return out_path

    role = task.get("role_en", "unknown")
    tid = task.get("id", "task_" + datetime.now().strftime("%Y%m%d%H%M%S"))
    return project_root / "public" / "audio" / "voice" / role / f"{tid}.wav"


def merge_task_with_defaults(
    defaults: dict,
    task: dict,
    cli: argparse.Namespace,
) -> dict:
    """
    优先级：CLI 参数 > task.* > defaults.* > 脚本硬编码默认。
    返回 dict 同时包含 VoxCPM 和 MiMo 参数，调用方按 engine 取用。
    """
    # engine
    engine_cli = getattr(cli, "engine", None)
    if engine_cli and engine_cli != "auto":
        engine = engine_cli
    else:
        engine = task.get("engine") or defaults.get("engine") or "voxcpm"
    engine = str(engine).lower()
    if engine not in ("voxcpm", "mimo"):
        engine = "voxcpm"

    # VoxCPM 参数
    cfg = task.get("cfg", defaults.get("cfg", 2.0))
    steps = task.get("steps", defaults.get("steps", 10))
    enhance = task.get("enhance", defaults.get("enhance", True))
    voxcpm_root_cli = getattr(cli, "voxcpm_root", None)
    if not voxcpm_root_cli:
        vr = task.get("voxcpm_root") or defaults.get("voxcpm_root") or str(DEFAULT_VOXCPM_ROOT)
    else:
        vr = str(voxcpm_root_cli)

    # MiMo 参数
    mimo_root_cli = getattr(cli, "mimo_root", None)
    if not mimo_root_cli:
        mr = task.get("mimo_root") or defaults.get("mimo_root") or str(DEFAULT_MIMO_ROOT)
    else:
        mr = str(mimo_root_cli)
    mimo_port_cli = getattr(cli, "mimo_port", None)
    if mimo_port_cli:
        mp = int(mimo_port_cli)
    else:
        mp = int(task.get("mimo_port") or defaults.get("mimo_port") or MIMO_DEFAULT_PORT)
    mimo_api_key_cli = getattr(cli, "mimo_api_key", None)
    mak = mimo_api_key_cli or task.get("mimo_api_key") or defaults.get("mimo_api_key") or None
    speed = float(task.get("speed") or defaults.get("speed") or 1.0)
    user_message = task.get("user_message") or defaults.get("user_message") or None

    return {
        "engine": engine,
        # VoxCPM
        "cfg": float(cfg),
        "steps": int(steps),
        "enhance": bool(enhance),
        "voxcpm_root": Path(vr),
        # MiMo
        "mimo_root": Path(mr),
        "mimo_port": mp,
        "mimo_api_key": str(mak).strip() if isinstance(mak, str) and mak.strip() else None,
        "speed": float(speed),
        "user_message": str(user_message) if user_message else None,
    }


def _lazy_env(merged: dict, cache: dict) -> dict:
    """
    根据 engine 懒加载环境：VoxCPM 检查模型目录 / MiMo 检查服务在线。
    cache 键：('voxcpm', voxcpm_root) / ('mimo', mimo_root, mimo_port, mimo_api_key)
    返回环境 dict：{'voxcpm_exe':..., 'ffmpeg_exe':..., 'model_dir':...} 或 {'mimo_api_key':...}
    """
    engine = merged["engine"]
    if engine == "voxcpm":
        key = ("voxcpm", str(merged["voxcpm_root"]))
        if key not in cache:
            root = resolve_voxcpm_root(str(merged["voxcpm_root"]))
            voxcpm_exe, ffmpeg_exe, model_dir, _ = check_voxcpm_environment(root)
            cache[key] = {"voxcpm_exe": voxcpm_exe, "ffmpeg_exe": ffmpeg_exe, "model_dir": model_dir}
        return cache[key]
    else:  # mimo
        api_key_resolved = resolve_mimo_api_key(merged["mimo_api_key"], merged["mimo_root"])
        key = ("mimo", str(merged["mimo_root"]), merged["mimo_port"], api_key_resolved or "")
        if key not in cache:
            check_mimo_environment(merged["mimo_port"], merged["mimo_root"], api_key_resolved)
            cache[key] = {"mimo_api_key": api_key_resolved}
        env = dict(cache[key])
        env["mimo_api_key"] = api_key_resolved  # 重新解析（因为本次 merged 可能传了不同 key）
        return env


def run_batch(
    batch_path: Path,
    cli: argparse.Namespace,
) -> None:
    doc = load_batch_json(batch_path)
    defaults = doc.get("defaults", {}) if isinstance(doc, dict) else {}
    tasks = doc.get("tasks", []) if isinstance(doc, dict) else []
    if not isinstance(tasks, list) or len(tasks) == 0:
        err("批量 JSON 里 tasks 为空或不是数组。")
        sys.exit(22)

    stop_on_error = bool(getattr(cli, "stop_on_error", False))
    dry_run = bool(getattr(cli, "dry_run", False))

    log(f"批量模式启动：共 {len(tasks)} 条任务，出错策略：{'立刻停止' if stop_on_error else '继续下一条'}，dry-run={dry_run}")

    env_cache: dict = {}
    success = 0
    failed_ids: list[tuple[str, str]] = []
    for idx, raw_task in enumerate(tasks, start=1):
        task_id = raw_task.get("id", f"idx_{idx}")

        # 基本字段必填
        text = raw_task.get("text")
        ref_audio_s = raw_task.get("ref_audio")
        if not text or not ref_audio_s:
            msg = f"缺少必填字段 text/ref_audio"
            err(f"任务 [{task_id}] {msg}")
            failed_ids.append((task_id, msg))
            if stop_on_error:
                break
            continue

        merged = merge_task_with_defaults(defaults, raw_task, cli)
        ref_audio = Path(ref_audio_s)
        if not ref_audio.is_absolute():
            ref_audio = Path.cwd() / ref_audio
        output = resolve_task_output(defaults, raw_task, PROJECT_ROOT)

        # 懒加载环境（同一引擎同一 root/port 只会检查一次）
        try:
            env = _lazy_env(merged, env_cache)
        except SystemExit as e:
            msg = f"环境准备失败（退出码 {e.code}）"
            err(f"任务 [{task_id}] {msg}")
            failed_ids.append((task_id, msg))
            if stop_on_error:
                break
            continue

        if merged["engine"] == "voxcpm":
            ok, note = run_single(
                voxcpm_exe=env["voxcpm_exe"],
                model_dir=env["model_dir"],
                ffmpeg_exe=env["ffmpeg_exe"],
                text=text,
                ref_audio=ref_audio,
                ref_text=raw_task.get("ref_text"),
                output=output,
                cfg=merged["cfg"],
                steps=merged["steps"],
                enhance=merged["enhance"],
                dry_run=dry_run,
                task_id=task_id,
            )
        else:
            ok, note = run_single_mimo(
                mimo_root=merged["mimo_root"],
                port=merged["mimo_port"],
                api_key=env["mimo_api_key"],
                text=text,
                ref_audio=ref_audio,
                output=output,
                speed=merged["speed"],
                user_message=merged["user_message"],
                dry_run=dry_run,
                task_id=task_id,
            )
        if ok:
            success += 1
        else:
            failed_ids.append((task_id, note))
            if stop_on_error:
                warn(f"批量停止（stop-on-error），失败任务 [{task_id}]")
                break

    log(f"批量模式结束：成功 {success} / 总数 {len(tasks)}，失败 {len(failed_ids)} 条")
    if failed_ids:
        print("失败清单：")
        for tid, note in failed_ids:
            print(f"  · [{tid}]  {note}")
        sys.exit(40)
    sys.exit(0)


# ========================= 单条 CLI 模式 =========================
def run_single_cli(args: argparse.Namespace) -> None:
    # 1. 引擎选择
    engine = (args.engine or "voxcpm").lower()
    if engine not in ("voxcpm", "mimo"):
        err(f"未知引擎 {engine!r}，必须是 voxcpm 或 mimo")
        sys.exit(12)

    # 2. 文本
    text = args.text
    if not text:
        text = input("🎙️ 请输入要生成的文本：\n> ").strip()
        if not text:
            err("文本不能为空。")
            sys.exit(20)

    # 3. 参考音频
    ref_audio_s = args.ref_audio
    if not ref_audio_s:
        if engine == "voxcpm":
            vr = Path(args.voxcpm_root) if args.voxcpm_root else DEFAULT_VOXCPM_ROOT
            examples = vr / "examples"
            if examples.is_dir():
                some = list(examples.glob("林*.mp3"))[:3] + list(examples.glob("夏*.MP3"))[:3]
                hint = "；可选示例：" + " / ".join(p.name for p in some) if some else ""
            else:
                hint = ""
        else:
            hint = "（建议 3~30 秒清晰无杂音的单人语音）"
        ref_audio_s = input(f"🎧 请输入参考音频绝对路径（要克隆的声音）{hint}\n> ").strip().strip('"')
    ref_audio = Path(ref_audio_s)
    if not ref_audio.is_absolute():
        ref_audio = Path.cwd() / ref_audio

    # 4. 输出路径
    output_s = args.output
    if not output_s:
        role = input("👤 输入角色英文名（决定输出子目录 public/audio/voice/<role>/）:\n> ").strip() or "unknown"
        default_ext = ".mp3" if engine == "mimo" else ".wav"
        tid = input(f"🆔 输入任务 ID（输出文件名 <id>{default_ext}）:\n> ").strip() or datetime.now().strftime("voice_%Y%m%d_%H%M%S")
        output = PROJECT_ROOT / "public" / "audio" / "voice" / role / f"{tid}{default_ext}"
        print(f"📁 将输出到: {output}")
    else:
        output = Path(output_s)
        if not output.is_absolute():
            output = PROJECT_ROOT / output

    # 5. 环境准备 + 分发
    log(f"引擎 = {engine}", f"  文本={len(text)} 字  参考音频={ref_audio}  输出={output}")
    if engine == "voxcpm":
        root = resolve_voxcpm_root(args.voxcpm_root)
        voxcpm_exe, ffmpeg_exe, model_dir, _ = check_voxcpm_environment(root)
        ok, note = run_single(
            voxcpm_exe=voxcpm_exe,
            model_dir=model_dir,
            ffmpeg_exe=ffmpeg_exe,
            text=text,
            ref_audio=ref_audio,
            ref_text=args.ref_text,
            output=output,
            cfg=float(args.cfg),
            steps=int(args.steps),
            enhance=not args.no_enhance,
            dry_run=args.dry_run,
            task_id="cli",
        )
    else:  # mimo
        mimo_root = Path(args.mimo_root) if args.mimo_root else DEFAULT_MIMO_ROOT
        port = resolve_mimo_port(args.mimo_port)
        api_key = resolve_mimo_api_key(args.mimo_api_key, mimo_root)
        check_mimo_environment(port, mimo_root, api_key)
        ok, note = run_single_mimo(
            mimo_root=mimo_root,
            port=port,
            api_key=api_key,
            text=text,
            ref_audio=ref_audio,
            output=output,
            speed=float(args.speed),
            user_message=args.user_message,
            dry_run=args.dry_run,
            task_id="cli",
        )

    if ok:
        log("完成", note)
        sys.exit(0)
    else:
        err(note)
        sys.exit(30)


# ========================= argparse 入口 =========================
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="gen_voice.py",
        description="归星物语一键语音生成（双引擎）：本地 VoxCPM 离线推理 / 小米 MiMo-TTS HTTP 接口。产物落到 public/audio/voice/。详细文档：docs\\VoxCPM语音生成一键调用手册.md",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例（VoxCPM 单条）:\n"
            "  python tools/gen_voice.py --engine voxcpm --text \"大家好\" \\\n"
            "    --ref-audio \"E:\\BINGdown\\VoxCPM\\examples\\林远.mp3\" --output public/audio/voice/linche/demo.wav\n"
            "\n示例（MiMo 单条，先双击 start.bat 启动服务）:\n"
            "  python tools/gen_voice.py --engine mimo --text \"大家好\" \\\n"
            "    --ref-audio \"E:\\BINGdown\\VoxCPM\\examples\\林远.mp3\" --output public/audio/voice/linche/demo_mimo.mp3 --speed 1.05\n"
            "\n示例（批量）:\n"
            "  python tools/gen_voice.py --batch tools/voice_tasks.example.json --dry-run\n"
            "  python tools/gen_voice.py --batch tools/voice_tasks.json\n"
            "  python tools/gen_voice.py --engine mimo --batch tools/voice_tasks.json   # 强制所有任务走 mimo\n"
        ),
    )
    # 引擎选择（最顶层，放最前）
    engine_group = p.add_argument_group("引擎选择（二选一，不传默认 voxcpm）")
    engine_group.add_argument("--engine", type=str, default="voxcpm", choices=["voxcpm", "mimo", "auto"],
                              metavar="voxcpm|mimo|auto",
                              help="voxcpm=本地离线推理（免费吃显卡）；mimo=调用本机 MiMo HTTP 服务（快）；auto=批量模式里按任务 JSON 定，单条等同 voxcpm")

    # 互斥：--batch vs 单条参数
    mode = p.add_argument_group("模式")
    mode.add_argument("--batch", type=str, metavar="FILE.json",
                      help="批量模式：从 JSON 读 tasks[] 逐条跑（与 --text 互斥）")

    single = p.add_argument_group("单条模式参数")
    single.add_argument("--text", type=str, help="要合成的文本（中文/英文/混输都行）")
    single.add_argument("--ref-audio", type=str, metavar="PATH",
                        help="参考音频（wav/mp3/m4a 都行，要克隆的声音）")
    single.add_argument("--ref-text", type=str, default=None,
                        help="[VoxCPM 专属] 参考音频里的文字；空=自动 SenseVoice 转写（推荐）")
    single.add_argument("--output", type=str, metavar="PATH",
                        help="输出文件（VoxCPM 默认 .wav；MiMo 默认 .mp3）")
    single.add_argument("--user-message", type=str, default=None, metavar="TEXT",
                        help="[MiMo 专属] 额外 system 提示词，用于风格/方言/情绪引导（可选）")

    v_knobs = p.add_argument_group("[VoxCPM] 生成调参（批量里可写在 defaults/task 里覆盖）")
    v_knobs.add_argument("--cfg", type=float, default=2.0,
                         help="CFG Value：声音假调低(1.2~1.8)，要贴角色调高(2.0~2.6)。默认 2.0")
    v_knobs.add_argument("--steps", type=int, default=10,
                         help="推理步数：快→慢→更精细，范围 4~20。默认 10")
    g = v_knobs.add_mutually_exclusive_group()
    g.add_argument("--enhance", dest="no_enhance", action="store_false",
                   help="（默认开启）参考音频去噪增强，素材脏时用")
    g.add_argument("--no-enhance", dest="no_enhance", action="store_true",
                   help="关闭去噪增强（素材干净时省几秒）")

    m_knobs = p.add_argument_group("[MiMo] 生成调参（批量里可写在 defaults/task 里覆盖）")
    m_knobs.add_argument("--speed", type=float, default=1.0,
                         help="语速倍率：0.8~1.2 常用。1.0 原速，1.1 稍快，0.9 稍慢。默认 1.0")

    env_group = p.add_argument_group("环境覆盖")
    env_group.add_argument("--voxcpm-root", type=str, metavar="PATH",
                           help=f"VoxCPM 根目录，默认 {DEFAULT_VOXCPM_ROOT}")
    env_group.add_argument("--mimo-root", type=str, metavar="PATH",
                           help=f"MiMo-TTS 根目录（用于找 start.bat / data/llm-config.json），默认 {DEFAULT_MIMO_ROOT}")
    env_group.add_argument("--mimo-port", type=str, metavar="INT",
                           help=f"MiMo-TTS HTTP 端口，默认 {MIMO_DEFAULT_PORT}（与 app\\.env 一致）")
    env_group.add_argument("--mimo-api-key", type=str, metavar="KEY",
                           help="MiMo API Key（优先级高于环境变量 MIMO_API_KEY 和 data/llm-config.json）")

    batch_flags = p.add_argument_group("批量模式控制")
    batch_flags.add_argument("--continue-on-error", dest="stop_on_error", action="store_false",
                             help="（默认）一条失败继续跑下一条")
    batch_flags.add_argument("--stop-on-error", dest="stop_on_error", action="store_true",
                             help="任何一条失败立刻停")

    p.add_argument("--dry-run", action="store_true",
                   help="只打印命令不实际执行，用于确认参数和路径")
    return p


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    # 互斥判断：--batch 不能跟 --text 同给
    if args.batch and args.text:
        err("--batch 批量模式与 --text 单条模式互斥，请二选一。")
        sys.exit(23)

    if args.batch:
        run_batch(batch_path=Path(args.batch), cli=args)
    else:
        run_single_cli(args)


if __name__ == "__main__":
    main()
