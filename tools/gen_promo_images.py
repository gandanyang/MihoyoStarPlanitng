#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
宣发物料二次元美图批量生成脚本（ComfyUI / anima turbo）

- 本地 ComfyUI：http://127.0.0.1:8188
- 模型：anima_turboV10.safetensors + CLIP anima_baseV10_txt + qwen_image_vae
- LoRA：yourname_style.safetensors（strength_model=0.8, strength_clip=1.0）
- KSampler：steps=8, cfg=1.0, sampler=er_sde, scheduler=simple, denoise=1.0
- 输出：public/assets/images/promo/promo_XX.png（已存在则跳过，--force 覆盖）

用法：
  python tools/gen_promo_images.py                # 全量（已存在跳过）
  python tools/gen_promo_images.py --force        # 覆盖已有
  python tools/gen_promo_images.py --only 3,5     # 只跑指定编号
  python tools/gen_promo_images.py --seed 8888    # 统一覆盖随机种子
  python tools/gen_promo_images.py --list         # 打印任务清单
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8188"
OUT_DIR = Path("public") / "assets" / "images" / "promo"
POLL_INTERVAL = 2.0
TIMEOUT_S = 600

# 负向提示词（与 tmp/comfy_neg.txt 一致）
NEGATIVE = (
    "lowres, bad anatomy, bad hands, missing fingers, extra digits, watermark, "
    "text, logo, signature, username, realistic photo, 3d, nsfw, blurry, "
    "jpeg artifacts, worst quality, low quality, deformed, extra limbs"
)

COMMON = (
    "yourname style, masterpiece, best quality, score_9, score_8, highres, "
    "absurdres, anime screenshot, "
)

# ── 任务清单（首批 8 张；角色锚点见 docs/tasks/任务-宣发物料二次元美图-ComfyUI.md）──
# id: 输出文件名；w/h: 画幅；seed: 固定种子（可 --seed 覆盖）；desc: 内容说明；prompt: 正向提示词
JOBS = [
    dict(
        id="promo_01", w=1216, h=832, seed=1001,
        desc="林澈+夏雅 夕阳田埂奔跑回头笑（P0）",
        prompt=(
            COMMON +
            "1boy 1girl, running together on a field path at sunset, looking back with smiles, "
            "warm golden backlight, boy: Lin Che, 27 year old returning programmer, dark brown "
            "short hair, black-framed glasses, blue-white plaid shirt, jeans, girl: Xia Ya, "
            "18 year old chinese countryside girl, orange-gold medium-length hair with a small "
            "hair clip, short jacket, old canvas tool bag with a small wrench, green rice fields "
            "and old village houses in the background, flying hair and clothes, gentle wind, "
            "golden hour glow, nostalgic cinematic atmosphere, high detail, vibrant colors"
        ),
    ),
    dict(
        id="promo_02", w=1216, h=832, seed=1002,
        desc="林澈+夏雅 观星点看银河萤火虫（P0）",
        prompt=(
            COMMON +
            "1boy 1girl, sitting side by side on a hilltop observation point at night, looking "
            "up at the starry sky, milky way galaxy, fireflies floating around, silhouettes "
            "against the deep blue night sky, boy: Lin Che, dark brown short hair, black-framed "
            "glasses, blue-white plaid shirt, girl: Xia Ya, orange-gold medium-length hair with "
            "a small hair clip, short jacket, old canvas tool bag with a small wrench beside "
            "her, quiet romantic atmosphere, deep blue night tones, cinematic composition"
        ),
    ),
    dict(
        id="promo_03", w=832, h=1216, seed=1003,
        desc="夏雅单人 乡村小路晚霞·工具包+扳手（P0）",
        prompt=(
            COMMON +
            "1girl, Xia Ya, 18 year old chinese countryside girl, orange-gold medium-length hair "
            "with a small hair clip, warm bright smile, short jacket, light shoes, old canvas "
            "tool bag with a small wrench on her shoulder, standing on a country path at sunset, "
            "golden hour light, green rice fields and old village houses in the background, "
            "gentle wind, fireflies, warm nostalgic atmosphere, high detail, vibrant colors, "
            "cinematic composition"
        ),
    ),
    dict(
        id="promo_04", w=832, h=1216, seed=1004,
        desc="夏雅单人 花园回眸手拿扳手·晨光（P1）",
        prompt=(
            COMMON +
            "1girl, Xia Ya, 18 year old chinese countryside girl, orange-gold medium-length hair "
            "with a small hair clip, warm smile, short jacket, old canvas tool bag on her "
            "shoulder, holding a small wrench in her hand, looking back over her shoulder in a "
            "flower garden at morning, soft morning light, blooming flowers, old manor courtyard, "
            "fresh morning atmosphere, high detail, vibrant colors, cinematic composition"
        ),
    ),
    dict(
        id="promo_05", w=832, h=1216, seed=1005,
        desc="林澈单人 老宅门口夕阳·行李箱归来（P1）",
        prompt=(
            COMMON +
            "1boy, Lin Che, 27 year old returning programmer, dark brown short hair, black-framed "
            "glasses, blue-white plaid shirt, jeans, sneakers, standing in front of an old "
            "countryside house gate at sunset, a suitcase at his feet, returning home feeling, "
            "golden evening light, old wooden gate, overgrown yard, nostalgic quiet atmosphere, "
            "high detail, cinematic composition"
        ),
    ),
    dict(
        id="promo_06", w=832, h=1216, seed=1006,
        desc="爷爷 大树下看天·旧笔记·傍晚（P2）",
        prompt=(
            COMMON +
            "1old man, Lin Yuanshan, 70-80 year old chinese countryside elder, gray hair and "
            "beard, plain cotton clothes, sitting under a big tree at dusk, looking up at the "
            "sky, holding an old notebook, manor and farmland behind him, warm dusk light, "
            "fireflies, peaceful nostalgic atmosphere, high detail, cinematic composition"
        ),
    ),
    dict(
        id="promo_07", w=832, h=1216, seed=1007,
        desc="阿风 海边岔路口·背包·风吹衣角（P2）",
        prompt=(
            COMMON +
            "1boy, A Feng, 25 year old adventurer, travel jacket, backpack, slightly messy hair, "
            "relaxed free-spirited expression, standing at a crossroads by the sea, wind blowing "
            "his jacket and hair, ocean and distant road in the background, bright daylight, "
            "freedom and wanderlust atmosphere, high detail, cinematic composition"
        ),
    ),
    dict(
        id="promo_08", w=1216, h=832, seed=1008,
        desc="林澈+夏雅 车站月台日常互动（P1）",
        prompt=(
            COMMON +
            "1boy 1girl, at a countryside train station platform, casual daily interaction, "
            "talking and smiling at each other, boy: Lin Che, dark brown short hair, black-framed "
            "glasses, blue-white plaid shirt, jeans, girl: Xia Ya, orange-gold medium-length hair "
            "with a small hair clip, short jacket, old canvas tool bag with a small wrench, old "
            "station building and a train in the background, soft daylight, warm everyday "
            "atmosphere, high detail, cinematic composition"
        ),
    ),
]


# ── ComfyUI API ──
def http_post(url: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build_workflow(job: dict, seed: int, use_lora: bool = True) -> dict:
    """构建 anima_turboV10 工作流（--no-lora 时跳过 yourname LoRA 直连底模）"""
    model_in, clip_in = ["1", 0], ["2", 0]
    if use_lora:
        lora = {"class_type": "LoraLoader", "inputs": {"model": ["1", 0], "clip": ["2", 0], "lora_name": "yourname_style.safetensors", "strength_model": 0.8, "strength_clip": 1}}
        model_in, clip_in = ["4", 0], ["4", 1]
    nodes = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "anima_turboV10.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "anima_baseV10_txt.safetensors", "type": "qwen_image"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": job["w"], "height": job["h"], "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": job["prompt"], "clip": clip_in}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": clip_in}},
        "8": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "er_sde", "scheduler": "simple", "denoise": 1.0, "model": model_in, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"filename_prefix": job["id"], "images": ["9", 0]}},
    }
    if use_lora:
        nodes["4"] = lora
    return {"prompt": nodes, "client_id": "promo-batch"}


def wait_history(pid: str) -> list[str]:
    start = time.time()
    while time.time() - start < TIMEOUT_S:
        try:
            h = http_get(f"{BASE}/history/{pid}")
        except Exception:
            time.sleep(POLL_INTERVAL)
            continue
        if pid in h:
            entry = h[pid]
            status = (entry.get("status") or {}).get("status_str")
            if status == "error":
                raise RuntimeError(f"ComfyUI 执行失败: {json.dumps(entry.get('status'))[:400]}")
            files = []
            for node in (entry.get("outputs") or {}).values():
                for img in node.get("images", []):
                    files.append(img["filename"])
            if files:
                return files
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"等待 ComfyUI 结果超时（{TIMEOUT_S}s）")


def download(filename: str, out: Path) -> None:
    with urllib.request.urlopen(f"{BASE}/view?filename={urllib.parse.quote(filename)}", timeout=60) as resp:
        data = resp.read()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)


def check_png(path: Path, expect_w: int, expect_h: int) -> str:
    """读取 PNG IHDR 校验尺寸，返回描述或抛错。"""
    with open(path, "rb") as f:
        head = f.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path.name} 不是有效 PNG")
    w, h = struct.unpack(">II", head[16:24])
    if w != expect_w or h != expect_h:
        raise ValueError(f"{path.name} 尺寸不符：{w}x{h}（期望 {expect_w}x{expect_h}）")
    return f"{w}x{h}"


def gen(job: dict, force: bool, seed: int, use_lora: bool = True) -> str:
    suffix = "" if use_lora else "_nolora"
    out = OUT_DIR / f"{job['id']}{suffix}.png"
    if out.exists() and not force:
        return f"已存在，跳过（{out.name}）"
    print(f"[{job['id']}] 生成中 {job['w']}x{job['h']} seed={seed} {'LoRA' if use_lora else 'NO-LoRA'} … {job['desc']}")
    pid = http_post(f"{BASE}/prompt", build_workflow(job, seed, use_lora))["prompt_id"]
    files = wait_history(pid)
    if not files:
        raise RuntimeError(f"{job['id']} 未产出图片")
    download(files[0], out)
    size = check_png(out, job["w"], job["h"])
    return f"已保存 {out.name}（{size}，{out.stat().st_size // 1024} KB）"


def main() -> None:
    p = argparse.ArgumentParser(description="宣发物料二次元美图批量生成（ComfyUI / anima turbo）")
    p.add_argument("--force", action="store_true", help="覆盖已存在文件")
    p.add_argument("--only", default="", help="只跑指定编号（逗号分隔，如 3,5）")
    p.add_argument("--seed", type=int, default=0, help="覆盖种子（0 = 用清单默认）")
    p.add_argument("--rounds", type=int, default=1, help="循环轮数，每轮全部主题（按轮次分目录 round_XX/）")
    p.add_argument("--no-lora", action="store_true", help="不使用 yourname LoRA（底模直出，输出 *_nolora.png）")
    p.add_argument("--list", action="store_true", help="只打印任务清单")
    args = p.parse_args()

    if args.list:
        for i, j in enumerate(JOBS, 1):
            print(f"  {i}. {j['id']:8s} {j['w']}x{j['h']:<5d} seed={j['seed']}  {j['desc']}")
        return

    jobs = JOBS
    if args.only:
        idx = [int(s) for s in args.only.split(",") if s.strip()]
        jobs = [JOBS[i - 1] for i in idx if 1 <= i <= len(JOBS)]

    # 服务自检
    try:
        http_get(f"{BASE}/system_stats")
    except Exception as e:
        print(f"❌ ComfyUI 不可用（{BASE}）：{e}", file=sys.stderr)
        sys.exit(1)

    rounds = max(1, args.rounds)
    print(f"任务数：{len(jobs)} × {rounds} 轮，LoRA={'关' if args.no_lora else '开'}，seed 覆盖={args.seed or '默认'}")
    total_ok = 0
    for r in range(1, rounds + 1):
        global OUT_DIR
        OUT_DIR = Path("public") / "assets" / "images" / "promo" / f"round_{r:02d}"
        print(f"── 第 {r}/{rounds} 轮 → {OUT_DIR.resolve()} ──")
        for job in jobs:
            seed = args.seed if args.seed else job["seed"] + (r - 1) * 1000
            try:
                msg = gen(job, args.force, seed, use_lora=not args.no_lora)
                print(f"  ✅ {msg}")
                total_ok += 1
            except Exception as e:
                print(f"  ❌ [{job['id']}] {e}", file=sys.stderr)
    print(f"完成：{total_ok}/{len(jobs) * rounds}，输出目录：{Path('public') / 'assets' / 'images' / 'promo'}")
    if total_ok < len(jobs) * rounds:
        sys.exit(2)


if __name__ == "__main__":
    main()
