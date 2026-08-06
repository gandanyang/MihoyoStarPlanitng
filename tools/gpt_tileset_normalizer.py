"""GPT Pixel Asset Pipeline v1.1 — 把 GPT 出图转成游戏级 16x16 tileset

制作人 2026-08-07 拍板的美术管线（"GPT + 规范化 = 归星物语自己的美术语言"）。
v1.1 六步处理：
  1. 网格检测    ：统计整图行/列平均亮度，识别 AI 概念图的分隔暗线
  2. 网格线删除  ：块内完整暗行/暗列 → 邻域像素替换（消除"黑十字网格"AI 味）
  3. 色彩量化    ：MEDIANCUT 量化（256 → --palette 默认 12 色，类似 Aseprite Indexed Color）
  4. 调色板映射  ：主色对齐 star_island_palette.json 锚点色（delta 偏移，保留相对色差/纹理）
                   —— 跨场景统一的关键：GPT 负责形状/纹理/细节，normalizer 负责世界统一
  5. 无缝边缘修复：左右/上下边缘均值对齐，保证平铺无缝（--no-seamless 关闭）
  6. 16px 输出   ：32×32 → 16×16 NEAREST 降采样

调色板锁定（本版本核心）：
  每个 tile 通过 --map 指定语义（grass/soil/water/...），工具把 tile 主色
  精确拉到锚点色，其余颜色整体偏移。同一锚点色系下，不同 GPT 图产出的
  grass tile 会呈现一致的色温 → farm/town/forest 不再割裂。

用法：

  # v1.1 完整管线（网格清洗 + 量化 + 调色板锁定 + 无缝边缘）
  python tools/gpt_tileset_normalizer.py \
      --input tmp/gpt_tileset_grid.png \
      --output tmp/farm_tileset_v3.png \
      --block-size 32 --palette 12 \
      --picks 4,3 4,9 12,9 20,15 4,15 4,21 12,21 20,21 \
      --map grass,dirt,stone,water,soil,wood,path,flower \
      --preview

  # 全部块输出（仅供检查网格分布）
  python tools/gpt_tileset_normalizer.py --input ... --output tmp/all_tiles.png --auto-all

  # 对比两个 tileset
  python tools/gpt_tileset_normalizer.py \
      --compare public/assets/tiles/farm_tileset.png tmp/farm_tileset_v3.png \
      --compare-out tmp/normalizer_compare.png

约束：
  - 输入图必须能被 --block-size 整除
  - 输出 PNG 高度固定 16px（1 行水平排列），宽度 = 选中 tile 数 × 16
  - 不修改 gid 语义（gid 1-8 = 草/泥/石墙/水/农田土/木板/路/花）
  - 不修改 MapScene.ts 加载逻辑

锚点调色板：tools/star_island_palette.json（与现有脚本 tileset 主色对齐）

后续（v1.2+ 候补）：
  - 自动 tile 分类（主色 HSL 匹配锚点，免去 --map）
  - 阴影方向归一（统一光源）
  - 总调色板约束（跨 tile 强制 ≤16 色共享调色板）
"""
import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tmp"


# ---------------------------------------------------------------------------
# Step 1：自动切块
# ---------------------------------------------------------------------------

def cut_blocks(img: Image.Image, block_size: int) -> tuple[list[Image.Image], int, int]:
    """把图按 block_size 切，返回 [(block, block_idx), ...] + cols/rows"""
    if img.width % block_size != 0 or img.height % block_size != 0:
        # 给出建议：裁掉右下余量
        new_w = (img.width // block_size) * block_size
        new_h = (img.height // block_size) * block_size
        print(f"  ⚠️ 输入 {img.size} 不被 {block_size} 整除；建议裁到 {new_w}x{new_h}")
    cols = img.width // block_size
    rows = img.height // block_size
    blocks = []
    for by in range(rows):
        for bx in range(cols):
            block = img.crop((bx * block_size, by * block_size,
                              (bx + 1) * block_size, (by + 1) * block_size))
            blocks.append(block)
    return blocks, cols, rows


# ---------------------------------------------------------------------------
# Step 1.5：网格检测 + 网格线删除（消除 AI 概念图的分隔暗线）
# ---------------------------------------------------------------------------

def _row_brightness(img: Image.Image, y: int) -> float:
    px = img.load()
    w = img.width
    s = 0
    for x in range(w):
        r, g, b = px[x, y]
        s += r + g + b
    return s / (w * 3)


def _col_brightness(img: Image.Image, x: int) -> float:
    px = img.load()
    h = img.height
    s = 0
    for y in range(h):
        r, g, b = px[x, y]
        s += r + g + b
    return s / (h * 3)


def detect_grid_lines(img: Image.Image, dark_ratio: float = 0.55) -> tuple[list[int], list[int]]:
    """检测整行/整列暗线（平均亮度 < 中位数 × dark_ratio）→ (暗行, 暗列)"""
    h, w = img.height, img.width
    rows_b = [_row_brightness(img, y) for y in range(h)]
    cols_b = [_col_brightness(img, x) for x in range(w)]
    med_r = sorted(rows_b)[h // 2]
    med_c = sorted(cols_b)[w // 2]
    dark_rows = [y for y, b in enumerate(rows_b) if b < med_r * dark_ratio]
    dark_cols = [x for x, b in enumerate(cols_b) if b < med_c * dark_ratio]
    return dark_rows, dark_cols


def remove_gridlines(block: Image.Image) -> tuple[Image.Image, list[int], list[int]]:
    """清洗块内完整暗线（整行/整列亮度显著低）→ 用紧邻下方/右方像素替换"""
    dark_rows, dark_cols = detect_grid_lines(block)
    if not dark_rows and not dark_cols:
        return block, [], []
    out = block.copy()
    px = block.load()
    opx = out.load()
    h, w = block.height, block.width
    for y in dark_rows:
        src = min(y + 1, h - 1)
        for x in range(w):
            opx[x, y] = px[x, src]
    for x in dark_cols:
        src = min(x + 1, w - 1)
        for y in range(h):
            opx[x, y] = px[src, y]
    return out, dark_rows, dark_cols


# ---------------------------------------------------------------------------
# Step 2：每块颜色量化（Aseprite Indexed Color 风格）
# ---------------------------------------------------------------------------

def quantize_block(block: Image.Image, n_colors: int) -> Image.Image:
    """256 → n_colors；返回 RGB 模式图像（已转回 RGB 便于下游处理）"""
    # PIL 的 quantize 会先转 P 模式；dither=NONE 才能保留干净边缘（不要 dither）
    pal = block.quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT,
                         dither=Image.Dither.NONE)
    return pal.convert("RGB")


# ---------------------------------------------------------------------------
# Step 3：32×32 → 16×16（保边缘）
# ---------------------------------------------------------------------------

def downsample_block(block: Image.Image, target_size: int) -> Image.Image:
    """NEAREST 采样保留硬边缘（量化后无渐变，更适合 NEAREST）"""
    return block.resize((target_size, target_size), Image.NEAREST)


# ---------------------------------------------------------------------------
# Step 4：调色板映射（主色对齐锚点，保留相对色差）
# ---------------------------------------------------------------------------

def dominant_color(img: Image.Image) -> tuple[int, int, int]:
    """返回出现最多的颜色"""
    from collections import Counter
    c = Counter(img.getdata())
    return c.most_common(1)[0][0]


def load_palette(path) -> dict[str, tuple[int, int, int]]:
    """读取锚点调色板 JSON → {name: (r, g, b)}"""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    anchors = {}
    for name, hexc in data["anchors"].items():
        h = hexc.lstrip("#")
        anchors[name] = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    return anchors


def map_to_anchor(tile: Image.Image, anchor: tuple[int, int, int],
                  threshold: int = 55) -> Image.Image:
    """主色对齐锚点：主色邻域整体偏移到锚点，杂色（花点/高光/细节）保留原样。

    - 与主色欧氏距离 < threshold 的像素 → 整体偏移（delta = anchor - dominant）
    - 距离 ≥ threshold 的像素 → 保留（避免把花/叶子细节整体染成锚点色）
    这样 flower tile 的绿底对齐锚点绿、黄色花点保留，花园不再一片黄。
    """
    dom = dominant_color(tile)
    delta = tuple(a - d for a, d in zip(anchor, dom))
    if all(d == 0 for d in delta):
        return tile
    out = tile.copy()
    px = out.load()
    for y in range(tile.height):
        for x in range(tile.width):
            r, g, b = tile.getpixel((x, y))
            dist = ((r - dom[0]) ** 2 + (g - dom[1]) ** 2 + (b - dom[2]) ** 2) ** 0.5
            if dist < threshold:
                px[x, y] = (
                    max(0, min(255, r + delta[0])),
                    max(0, min(255, g + delta[1])),
                    max(0, min(255, b + delta[2])),
                )
    return out


def soften_tile(tile: Image.Image, factor: float = 0.7) -> Image.Image:
    """整体降饱和（HSL S × factor），消除 AI 高饱和荧光感，更接近商业游戏柔和质感。

    factor 越小越灰；>=1 不变。默认 0.7。
    """
    if factor >= 1.0:
        return tile
    from colorsys import rgb_to_hls, hls_to_rgb
    out = tile.copy()
    px = out.load()
    for y in range(tile.height):
        for x in range(tile.width):
            r, g, b = tile.getpixel((x, y))
            h, l, s = rgb_to_hls(r / 255, g / 255, b / 255)
            s *= factor
            nr, ng, nb = hls_to_rgb(h, l, s)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255))
    return out


# ---------------------------------------------------------------------------
# Step 5：无缝边缘修复（左右/上下边缘对齐）
# ---------------------------------------------------------------------------

def seam_fix(tile: Image.Image) -> Image.Image:
    """把左右边缘列、上下边缘行分别均值化，保证平铺无缝"""
    out = tile.copy()
    px = out.load()
    h, w = tile.height, tile.width
    # 左右边缘：col0 ↔ col(w-1)
    for y in range(h):
        c0 = tile.getpixel((0, y))
        c1 = tile.getpixel((w - 1, y))
        m = tuple((a + b) // 2 for a, b in zip(c0, c1))
        px[0, y] = m
        px[w - 1, y] = m
    # 上下边缘：row0 ↔ row(h-1)
    for x in range(w):
        r0 = tile.getpixel((x, 0))
        r1 = tile.getpixel((x, h - 1))
        m = tuple((a + b) // 2 for a, b in zip(r0, r1))
        px[x, 0] = m
        px[x, h - 1] = m
    return out


# ---------------------------------------------------------------------------
# 选 tile（v1 手动，v1.2 再做自动分类）
# ---------------------------------------------------------------------------

def parse_picks(spec: list[str], cols: int) -> list[int]:
    """"--picks 0,0 1,0 2,0 ..." → [block_idx, ...] (按行主序，0=col0_row0)"""
    picks = []
    for s in spec:
        x, y = [int(v) for v in s.split(",")]
        picks.append(y * cols + x)
    return picks


def auto_all_picks(cols: int, rows: int) -> list[int]:
    """输出全部 block（用于检查网格分布；rows×cols 通常很大，慎用）"""
    return list(range(cols * rows))


# ---------------------------------------------------------------------------
# 输出 tileset PNG
# ---------------------------------------------------------------------------

def assemble_tileset(tiles: list[Image.Image], tile_size: int = 16) -> Image.Image:
    """水平拼接 tiles → N×tile_size, tile_size 的 PNG"""
    n = len(tiles)
    out = Image.new("RGB", (n * tile_size, tile_size), (0, 0, 0))
    for i, t in enumerate(tiles):
        if t.size != (tile_size, tile_size):
            t = t.resize((tile_size, tile_size), Image.NEAREST)
        out.paste(t, (i * tile_size, 0))
    return out


# ---------------------------------------------------------------------------
# 调试：tile 网格预览
# ---------------------------------------------------------------------------

def make_preview_grid(source: Image.Image, blocks: list[Image.Image],
                      cols: int, rows: int, block_size: int) -> Image.Image:
    """在原图上画红色网格线 + 块编号，方便人工挑 tile"""
    annotated = source.copy().convert("RGB")
    draw = ImageDraw.Draw(annotated)
    for i in range(cols + 1):
        x = i * block_size
        draw.line([(x, 0), (x, annotated.height)], fill=(255, 0, 0), width=1)
    for i in range(rows + 1):
        y = i * block_size
        draw.line([(0, y), (annotated.width, y)], fill=(255, 0, 0), width=1)
    # 写块编号（小字）
    try:
        font = ImageFont.truetype("arial.ttf", 10)
    except OSError:
        font = ImageFont.load_default()
    for idx in range(len(blocks)):
        bx = (idx % cols) * block_size + 2
        by = (idx // cols) * block_size + 2
        draw.text((bx, by), str(idx), fill=(255, 255, 0), font=font)
    return annotated


# ---------------------------------------------------------------------------
# v1 vs v2 对比图
# ---------------------------------------------------------------------------

def make_compare(v1_path: str, v2_path: str, out_path: str,
                 scale: int = 8) -> None:
    """把两张 tileset 上下排列、每 tile 放大 scale 倍，便于人眼对比"""
    v1 = Image.open(v1_path).convert("RGB")
    v2 = Image.open(v2_path).convert("RGB")
    label_h = 24
    pad = 4
    # 每张图放上面 label
    def zoom(img, lbl):
        n = img.width // 16
        big = img.resize((n * 16 * scale, 16 * scale), Image.NEAREST)
        canvas = Image.new("RGB", (big.width, big.height + label_h), (245, 245, 245))
        canvas.paste(big, (0, label_h))
        d = ImageDraw.Draw(canvas)
        try:
            font = ImageFont.truetype("arial.ttf", 14)
        except OSError:
            font = ImageFont.load_default()
        d.text((4, 4), lbl, fill=(20, 20, 20), font=font)
        return canvas
    a = zoom(v1, f"v1 (current): {Path(v1_path).name}")
    b = zoom(v2, f"v2 (normalizer): {Path(v2_path).name}")
    out_w = max(a.width, b.width)
    out_h = a.height + pad + b.height
    out = Image.new("RGB", (out_w, out_h), (220, 220, 220))
    out.paste(a, (0, 0))
    out.paste(b, (0, a.height + pad))
    out.save(out_path)
    print(f"[compare] -> {out_path}")


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def run_normalize(args) -> int:
    in_path = Path(args.input)
    if not in_path.exists():
        print(f"❌ 输入图不存在: {in_path}")
        return 1
    src = Image.open(in_path).convert("RGB")
    print(f"[normalizer] 输入: {in_path} ({src.size[0]}x{src.size[1]})")

    bs = args.block_size
    blocks, cols, rows = cut_blocks(src, bs)
    print(f"[normalizer] 切块: {cols} 列 × {rows} 行 = {len(blocks)} 块（每块 {bs}×{bs}）")

    # Step 1.5：网格线删除（量化前清洗，暗线更易识别）
    if not args.no_grid_clean:
        cleaned: list[Image.Image] = []
        total_r = total_c = 0
        for b in blocks:
            b2, dr, dc = remove_gridlines(b)
            total_r += len(dr)
            total_c += len(dc)
            cleaned.append(b2)
        blocks = cleaned
        print(f"[normalizer] 网格清洗: 共清除 {total_r} 行 + {total_c} 列暗线")

    # Step 2+3：量化 + 降采样
    processed: list[Image.Image] = []
    for i, b in enumerate(blocks):
        q = quantize_block(b, args.palette)
        s = downsample_block(q, args.tile_size)
        processed.append(s)
    print(f"[normalizer] 每块: 量化到 {args.palette} 色 → 降采样到 {args.tile_size}×{args.tile_size}")

    # 选 tile
    if args.auto_all:
        picks = auto_all_picks(cols, rows)
        print(f"[normalizer] --auto-all：输出全部 {len(picks)} 块")
    else:
        picks = parse_picks(args.picks, cols)
        print(f"[normalizer] --picks：选中 {len(picks)} 块 = {args.picks}")

    selected = [processed[i] for i in picks]

    # Step 4：调色板映射（锁定锚点色系）
    anchor_names = None
    if args.map:
        anchor_names = [s.strip() for s in ",".join(args.map).split(",") if s.strip()]
        if len(anchor_names) != len(selected):
            print(f"  ⚠️ --map 数量 {len(anchor_names)} ≠ 选中 tile 数 {len(selected)}，跳过调色板映射")
            anchor_names = None
    if anchor_names:
        palette = load_palette(args.palette_file)
        print(f"[normalizer] 调色板锁定: {args.palette_file}")
        for i, (t, name) in enumerate(zip(selected, anchor_names)):
            if name not in palette:
                print(f"  ⚠️ 锚点 '{name}' 不在调色板（可用: {sorted(palette)}），跳过该 tile")
                continue
            before = dominant_color(t)
            selected[i] = map_to_anchor(t, palette[name])
            after = dominant_color(selected[i])
            print(f"  tile {i + 1} ({name:6s}): 主色 #{before[0]:02x}{before[1]:02x}{before[2]:02x} → #{after[0]:02x}{after[1]:02x}{after[2]:02x}")

    # Step 5：无缝边缘修复
    if not args.no_seamless:
        selected = [seam_fix(t) for t in selected]
        print(f"[normalizer] 无缝边缘: 已对齐 {len(selected)} 个 tile 的左右/上下边缘")

    # Step 5.5：整体柔化（降饱和，消除高饱和荧光感）
    if args.soften and args.soften < 1.0:
        selected = [soften_tile(t, args.soften) for t in selected]
        print(f"[normalizer] 柔化: HSL 饱和度 ×{args.soften}")

    # 输出
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tileset = assemble_tileset(selected, args.tile_size)
    tileset.save(out_path)
    print(f"[normalizer] ✅ 输出 tileset: {out_path} ({tileset.size[0]}×{tileset.size[1]}, "
          f"{tileset.size[0] // args.tile_size} tile)")

    # 预览（标号原图）
    if args.preview:
        preview = make_preview_grid(src, blocks, cols, rows, bs)
        prev_path = out_path.with_name(out_path.stem + "_preview.png")
        preview.save(prev_path)
        print(f"[normalizer] 🗒️  原图+网格预览: {prev_path}")

    # 调试：每个 processed tile 都存一份
    if args.dump_all:
        dump_dir = out_path.with_name(out_path.stem + "_dump")
        dump_dir.mkdir(parents=True, exist_ok=True)
        for i, t in enumerate(processed):
            t.save(dump_dir / f"tile_{i:03d}.png")
        print(f"[normalizer] 💾 dump {len(processed)} 个 processed tile: {dump_dir}/")

    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="GPT Pixel Asset Pipeline v1.1 — GPT 出图 → 游戏级 16x16 tileset")
    ap.add_argument("--input", help="输入 GPT 图路径（PNG）")
    ap.add_argument("--output", help="输出 tileset PNG 路径")
    ap.add_argument("--block-size", type=int, default=32, help="切块尺寸（默认 32）")
    ap.add_argument("--tile-size", type=int, default=16, help="输出 tile 尺寸（默认 16）")
    ap.add_argument("--palette", type=int, default=12, help="每块量化色数（默认 12）")
    ap.add_argument("--picks", nargs="+", default=["0,0"], metavar="X,Y",
                    help="要保留的块坐标（行主序）；如 --picks 0,0 1,0 2,0 3,0")
    ap.add_argument("--map", nargs="+", metavar="NAME",
                    help="调色板锚点映射（对应 --picks 顺序）：grass,dirt,stone,water,soil,wood,path,flower")
    ap.add_argument("--palette-file", default=str(ROOT / "tools" / "star_island_palette.json"),
                    help="锚点调色板 JSON（默认 star_island_palette.json）")
    ap.add_argument("--no-seamless", action="store_true", help="关闭无缝边缘修复（默认开启）")
    ap.add_argument("--no-grid-clean", action="store_true", help="关闭网格线清洗（默认开启）")
    ap.add_argument("--soften", type=float, default=0.7,
                    help="整体降饱和系数（0~1，越小越灰；1 关闭。默认 0.7）")
    ap.add_argument("--auto-all", action="store_true", help="输出全部块（仅检查用）")
    ap.add_argument("--preview", action="store_true", help="在原图上画网格+编号")
    ap.add_argument("--dump-all", action="store_true", help="把所有 processed tile 存盘（调试）")

    # 对比子命令
    ap.add_argument("--compare", nargs=2, metavar=("V1", "V2"), help="对比两张 tileset PNG")
    ap.add_argument("--compare-out", default=str(TMP / "normalizer_compare.png"),
                    help="对比图输出路径")

    args = ap.parse_args()

    if args.compare:
        make_compare(args.compare[0], args.compare[1], args.compare_out)
        return 0

    if not args.input or not args.output:
        ap.error("需要 --input 和 --output（或用 --compare）")

    return run_normalize(args)


if __name__ == "__main__":
    sys.exit(main())