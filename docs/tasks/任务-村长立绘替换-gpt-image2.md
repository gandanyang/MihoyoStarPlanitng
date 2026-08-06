# 任务卡：村长立绘替换（gpt-image-2 工作流）

> 立项：制作人 2026-08-03
> 指派对象：**待定**（制作人安排其他 AI 执行；本任务由 Codex 立项但**不执行**）
> 发起依据：《开发规范.md》「AI 美术资源生成（默认优先：gpt-image-2）」 + 现有村长头像为 ComfyUI/旧管线产物
> 优先级：P2（美术替换；不阻塞稳定性）
> 状态：📋 待执行（制作人验收/重做决策后启动）

---

## 0. 现状（必须先知道）

- 现有对话头像：`public/assets/portraits/elder.png`（512×768，旧管线产物，保留作回滚）
- **第一版 AI 替换已存在**：`public/assets/portraits/elder_ai.png`（512×512 正方形，gpt-image-2 生成，已接线 PORTRAIT_MAP，旧图保留）——本任务是**验收该版或按新标准重做**，二选一由制作人定
- 接线位置：`src/ui/StoryDialogue.ts` PORTRAIT_MAP `村长: 'assets/portraits/elder_ai.png'`
- 相关探针：`tests/probes/probe-elder-portrait.mjs`（断言 elder_ai.png 512×512 + 运行时 img 显示）

## 1. 任务目标

用 gpt-image-2 工作流产出/验收一版符合项目美术标准的**村长对话头像**（512×512 正方形 PNG），替换旧 `elder.png` 的显示，保留旧文件可回滚。

## 2. 角色锚点（禁止自扩，来自美术规范 + skills/10-art-direction）

- 村长 = 爷爷的老友、世界观传达者、主线任务授予者
- 形象：沉稳长者，米黄色（#c8b898）暖色调，白发/白须，温和庄重
- 非主要剧情线角色，允许"生活感"细节，不做夸张英雄化

## 3. 执行步骤（生图流程，每次须制作人批准）

1. 提示词：米黄长者风 + v2 像素/二游立绘约束（线条干净、色彩温暖、1px 深描边 RGB(18,14,22)、左上光源、无文字无水印）+ 人脸居中保证方形裁切安全
2. 预演：`node tools/gpt_image_gen.mjs --dry-run "提示词"`（确认地址与费用估算）
3. 生成：`node tools/gpt_image_gen.mjs --yes --size 1024x1536 --quality medium "提示词"`（约 $0.13~0.19/张）
4. 后处理：居中裁正方形 → 缩放 512×512 → `public/assets/portraits/elder_ai.png`（**不覆盖旧文件**）
5. 接线/探针：确认 PORTRAIT_MAP 指向 + `node tests/probes/probe-elder-portrait.mjs` + `npx tsc --noEmit`
6. 验收：制作人看效果；不满意按反馈改提示词重出（再次批准）

## 4. 验收标准

- [ ] 512×512 正方形 PNG，显示为对话头像不裁脸
- [ ] 一眼是"沉稳米黄长者"，与现有 NPC 立绘风格协调
- [ ] 与村长身份（爷爷老友/世界观传达者）气质匹配：温和、庄重、可亲
- [ ] 无文字/水印/边框标注；旧 elder.png 未被删除
- [ ] tsc 0 错误 + 探针通过

## 5. 红线

- 不新增存档字段、不改剧情文本、不触碰角色身份设定
- 不覆盖/删除旧资源（`elder.png` 保留为回滚版本）
- Key 安全：使用 `tools/.env.enc` 加密存储，禁止明文入库/发到对话
