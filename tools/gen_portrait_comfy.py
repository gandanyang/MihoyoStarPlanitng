import json
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:8188"
WORKFLOW = "workflow/anima_turboV10.json"

STYLE_TAIL = (
    "游戏角色头像，半身胸像，脸占画面六成，二次元动画风格，干净线条，柔和赛璐璐上色，"
    "扁平均匀光照，暖色治愈氛围，正面略侧，单一角色"
)

CHAR_PROMPTS = {
    "linchen": (
        "一个年轻的少年男性，明确男性特征，清瘦的少年面庞，下颌线条分明，利落的深棕色短发，细黑框眼镜，"
        "温柔平静略带疲惫的眼神，微微沉思出神的表情，安静理性，程序员气质，格子衬衫，胸前挂着工牌，手腕戴智能手表，"
        "深藏青色拉链连帽衫内搭白色T恤，蓝灰色冷色调服装，城市青年程序员风格，"
        + STYLE_TAIL
    ),
    "xiya": (
        "一个20岁开朗元气的少女，庄园管理员，橙金色短发波波头，明亮温暖的琥珀色大眼睛，明媚有感染力的微笑，"
        "米白色工装衬衫，深蓝色背带裤，腰间棕色工具皮带别着一把扳手，暖橙色系，亲切活力感，"
        + STYLE_TAIL
    ),
    "elder": (
        "一个六十岁左右的慈祥老人，村长，面容沧桑温和，深褐色的皮肤皱纹，花白短发和络腮胡，"
        "眉目沉稳，眼神中带着怀念与睿智，微微含笑，长者风范，"
        "米黄色亚麻对襟外套，内搭浅米色布衣，腰间系深棕色腰带，一位老农夫的气质，"
        "米黄色暖色调，朴素稳重感，"
        + STYLE_TAIL
    ),
}

SEEDS = [1069320130983756, 202608021, 777001]


def queue(char_id, seed, cfg=3):
    with open(WORKFLOW, encoding="utf-8") as f:
        wf = json.load(f)
    wf["5"]["inputs"]["value"] = 1024
    wf["6"]["inputs"]["value"] = 1536
    wf["16"]["inputs"]["seed"] = seed
    wf["16"]["inputs"]["cfg"] = cfg
    wf["20"]["inputs"]["value"] = CHAR_PROMPTS[char_id]
    wf["22"]["inputs"]["filename_prefix"] = f"portraits/{char_id}_s{seed}"
    data = json.dumps({"prompt": wf, "client_id": "portrait-gen"}).encode()
    req = urllib.request.Request(f"{BASE}/prompt", data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def wait_done(prompt_id, timeout=600):
    start = time.time()
    while time.time() - start < timeout:
        with urllib.request.urlopen(f"{BASE}/history/{prompt_id}") as resp:
            hist = json.load(resp)
        if prompt_id in hist:
            return hist[prompt_id]
        time.sleep(2)
    raise TimeoutError(prompt_id)


def download(history, char_id, seed, out_dir):
    outputs = history["outputs"]
    saved = []
    for nid, out in outputs.items():
        for img in out.get("images", []):
            url = f"{BASE}/view?filename={img['filename']}&subfolder={img.get('subfolder', '')}&type={img['type']}"
            with urllib.request.urlopen(url) as resp:
                body = resp.read()
            path = f"{out_dir}/{char_id}_s{seed}.png"
            with open(path, "wb") as f:
                f.write(body)
            saved.append(path)
    return saved


if __name__ == "__main__":
    char_id = sys.argv[1]
    out_dir = sys.argv[2]
    results = []
    for seed in SEEDS:
        q = queue(char_id, seed)
        pid = q["prompt_id"]
        print(f"[queue] {char_id} seed={seed} prompt_id={pid}")
        hist = wait_done(pid)
        paths = download(hist, char_id, seed, out_dir)
        for p in paths:
            print(f"[save] {p}")
            results.append(p)
    print(f"DONE {len(results)} images")
