# 任务介绍：宣发物料二次元美图（ComfyUI / anima turbo）

> 立项：制作人 2026-08-06 ｜ 执行：可操作 ComfyUI 的 AI（本地工作流已就绪）｜ 状态：📋 待执行
> 目标：产出《归星物语》角色宣发美图（二次元风格），供商店卡片 / 宣传片 / 社群传播使用

---

## 一、背景与目标

游戏《归星物语》是像素风乡村农场生活 RPG（类星露谷二游，宇宙浪漫主义气质）。需要一批**角色向二次元美图**做宣发物料。

要求：新海诚式画面质感（yourname 风格 LoRA）、角色外观**跨图保持一致**、每张都是"电影感一帧"而不是大头贴。

---

## 二、工作流（已在本地 ComfyUI 配置好，直接用）

**ComfyUI 地址**：`http://127.0.0.1:8188`

**模型与节点**（与 `user/default/workflows/anima出图.json` 一致）：

| 节点 | 参数 |
|---|---|
| UNETLoader | `anima_turboV10.safetensors`（weight_dtype=default） |
| CLIPLoader | `anima_baseV10_txt.safetensors`（type=qwen_image） |
| VAELoader | `qwen_image_vae.safetensors` |
| LoraLoader | `yourname_style.safetensors`（strength_model=0.8, strength_clip=1.0） |
| KSampler | steps=8, cfg=1.0, sampler=`er_sde`, scheduler=`simple`, denoise=1.0 |

**尺寸建议**：
- 横版（封面/宣传片）：1216×832（或 1920×1128）
- 竖版（海报/社交）：832×1216（单人美图推荐）

**现成脚本**：`tools/_tmp_comfyui.mjs`（Node，已封装完整工作流 + 下载到项目）：

```bash
node tools/_tmp_comfyui.mjs --positive-file 提示词.txt --negative-file tmp/comfy_neg.txt \
  --prefix 文件名 --width 1216 --height 832 --steps 8 --cfg 1 --sampler er_sde --scheduler simple --seed 随机数
```

提示词文件放 `tmp/` 下（英文，UTF-8）；输出自动保存到 `public/assets/images/promo/`。

---

## 三、角色锚点（所有图必须遵守，保证跨图一致）

### 林澈（主角，27 岁返乡程序员）
- 深棕色短发、**黑框眼镜**（标志性）、温和内敛的神情
- **蓝白格纹衬衫** + 牛仔裤 + 运动鞋（偶尔戴工牌/手表——程序员细节）
- 气质：疲惫但开始放松的城市青年，不是热血男主

### 夏雅（女主，18 岁乡村少女）
- 橙金色中长发 + 小发夹，元气温暖的笑容
- **短外套** + 轻便鞋
- **标志物：旧帆布工具包 + 小扳手**（背在肩上/拿在手里——"拿着扳手跑过来的女孩"）
- 气质：阳光、行动派、温柔，不是御姐

### 爷爷（林远山，70-80 岁乡村老人）
- 花白头发/胡须、朴素旧衣（棉布衫）、慈祥慢悠悠的气质
- 意象：坐在门口/树下，身后是庄园与农田

### 阿风（青年冒险家，约 25 岁）
- 旅行夹克 + 背包、微乱的头发、松弛自由的神情（看过世界又回来）
- 意象：风、远方、自由

---

## 四、出图清单（首批 8 张）

| # | 内容 | 画幅 | 优先级 |
|---|---|---|---|
| 1 | 林澈 + 夏雅在夕阳下的田埂上奔跑（回头笑，暖金色逆光） | 横版 | P0 |
| 2 | 林澈 + 夏雅夜晚坐在观星点看星空（银河、萤火虫、剪影） | 横版 | P0 |
| 3 | 夏雅单人：站在乡村小路上，肩上工具包+扳手，晚霞 | 竖版 | P0 |
| 4 | 夏雅单人：在花园/农田里回眸，手拿扳手，晨光 | 竖版 | P1 |
| 5 | 林澈单人：站在老宅门口，夕阳，行李箱在脚边（归来感） | 竖版 | P1 |
| 6 | 爷爷单人：坐在大树下看天，傍晚，手里一本旧笔记 | 竖版 | P2 |
| 7 | 阿风单人：站在海边/岔路口，背包，风吹起衣角 | 竖版 | P2 |
| 8 | 林澈 + 夏雅：车站月台/老宅门口日常互动（二选一场景） | 横版 | P1 |

## 五、提示词模板

### 正向提示词结构（英文）

```
yourname style, masterpiece, best quality, score_9, score_8, highres, absurdres, anime screenshot,
<角色描述>, <场景描述>, <光线/氛围>, <构图>
```

示例（夏雅单人，已测试通过）：

```
yourname style, masterpiece, best quality, score_9, score_8, highres, absurdres, anime screenshot, 1girl, xia ya, 18 year old chinese countryside girl, orange-gold medium-length hair with a small hair clip, warm bright smile, short jacket, light shoes, old canvas tool bag with a small wrench on her shoulder, standing on a country path at sunset, golden hour light, green rice fields and old village houses in the background, gentle wind, fireflies, warm nostalgic atmosphere, high detail, vibrant colors, cinematic composition
```

### 负向提示词（复用）

```
lowres, bad anatomy, bad hands, missing fingers, extra digits, watermark, text, logo, signature, username, realistic photo, 3d, nsfw, blurry, jpeg artifacts, worst quality, low quality, deformed, extra limbs
```

### 多人图要点
- 双人图明确写 `2girls` / `1boy 1girl`，并分别描述两人特征
- 互动动作写具体：`running together on a field path, looking back with smiles` / `sitting side by side looking up at the starry sky`

---

## 六、验收标准

- [ ] 角色可辨识：一眼认出是林澈/夏雅/爷爷/阿风（外观锚点一致）
- [ ] 跨图一致：同一角色多张图发型/服装/标志物不漂移
- [ ] 新海诚画面质感：天空/光线/色彩有"电影感一帧"的感觉
- [ ] 无文字/水印/Logo；无低质量瑕疵（手、脸、比例）
- [ ] 产出保存于 `public/assets/images/promo/`，每张标注内容
- [ ] 完成后给制作人过目，按反馈调整重跑

## 七、红线

- ❌ 不改动 ComfyUI 工作流文件 / 模型参数（除非制作人要求）
- ❌ 不生成露骨/暴力内容
- ❌ 不直接用于游戏内立绘（游戏内头像/立绘走 gpt-image-2 管线，风格不同）
