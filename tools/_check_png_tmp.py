from pathlib import Path
import struct, zlib

p = Path(r"tools/_gs_smoke.png")
data = p.read_bytes()
w = struct.unpack(">I", data[16:20])[0]
h = struct.unpack(">I", data[20:24])[0]
channels = {6: 4, 2: 3, 0: 1, 4: 2}[data[25]]
print(f"PNG {w}x{h} channels={channels}")
pos = 8
idat = b""
while pos < len(data):
    ln = struct.unpack(">I", data[pos:pos+4])[0]
    typ = data[pos+4:pos+8]
    if typ == b"IDAT":
        idat += data[pos+8:pos+8+ln]
    pos += 8 + ln + 4
raw = zlib.decompress(idat)
stride = w * channels + 1
print(f"stride={stride} total={len(raw)}")

def unfilter(raw, stride, h):
    out = bytearray()
    prev = bytearray(stride)
    off = 0
    for y in range(h):
        f = raw[off]
        line = bytearray(raw[off+1:off+stride])
        lw = len(line)
        if f == 1:
            for i in range(channels, lw):
                line[i] = (line[i] + line[i-channels]) & 0xFF
        elif f == 2:
            for i in range(lw):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(lw):
                a = line[i-channels] if i >= channels else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(lw):
                a = line[i-channels] if i >= channels else 0
                b = prev[i]
                c = prev[i-channels] if i >= channels else 0
                pp = a + b - c
                pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        out += line
        prev = line
        off += stride
    return bytes(out)

px = unfilter(raw, stride, h)
seen = set()
bright = dark = 0
for y in range(0, h, 71):
    row = px[y*stride+1:(y+1)*stride]
    for x in range(0, w, 71):
        r, g, b = row[x*channels], row[x*channels+1], row[x*channels+2]
        seen.add((r, g, b))
        if r+g+b > 240: bright += 1
        elif r+g+b < 90: dark += 1
print(f"唯一色 {len(seen)} | 亮色点 {bright} | 暗色点 {dark}")
print("判定:", "画面丰富" if len(seen) > 60 else ("有内容但色块少" if len(seen) > 15 else "疑似黑屏"))
for c in list(seen)[:10]:
    print("  ", c)
