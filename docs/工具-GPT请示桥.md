# GPT 请示桥（gpt-bridge）使用说明

> 用途：把「任务上下文 + 输出」发到**网页版 ChatGPT**，取回回复——供制作人决策时做外部顾问。
> 定位：**不是替代本机 agent，而是"外部第二意见"工具**。制作人明确要求时使用。
> 工具：`tools/gpt-bridge.mjs` ｜ 登录态：复用 Chrome 独立 profile（`.gpt-bridge-profile/`，已登录）

---

## 一、为什么存在

制作人需要时（例："把结果拿去请示 GPT"），把 agent 的输出交给网页版 ChatGPT 做顾问，再把回复拉回来供制作人拍板：**完全遵循 / 再沟通一轮**。

## 二、用法（3 条命令）

```bash
# 1. 检查登录态（冒烟，确认 Chrome profile 还能用）
node tools/gpt-bridge.mjs --check

# 2. 直接发内容（短文本）
node tools/gpt-bridge.mjs --ask "要问 GPT 的内容"

# 3. 从文件发内容（长文推荐：任务上下文 + 输出落盘后整段发）
node tools/gpt-bridge.mjs --ask-file tmp/ask-gpt.md
```

**回复处理**：
- 终端直接打印 GPT 回复
- 同时落盘 `tmp/gpt-reply-<时间戳>.txt`（供后续引用）
- 发送前把内容写入文件：`tmp/ask-gpt.md`（先写文件再 --ask-file，便于审查发出去的是什么）

**多行消息规范（v1.1，2026-08-07）**：
- 脚本**逐行输入**：行间用 `Shift+Enter` 换行（ChatGPT 的换行键，不触发发送），**全部输完才按 Enter 发送**——多行长文不会提前发出
- 发送前打印 `▶ 内容已填入输入框（N 行 / M 字符）`，可确认消息完整
- 已验证：4 行内容 GPT 回"四行完整" ✅

## 三、给其他 AI agent（Codex / TRAE / WorkBuddy）的接入指引

### 方式 A：直接调 CLI（推荐，零配置）
任何能执行 shell 的 agent 都可以直接调用：
```bash
node "C:/Users/Gdy/Documents/trae_projects/mihoyoStarPlanting/tools/gpt-bridge.mjs" --ask-file "C:/.../tmp/ask-gpt.md"
```
**前提**：agent 工作目录是这个项目仓库（node 依赖在仓库内），且先确认登录态（`--check`）。

### 方式 B：配置为 Codex 的 MCP server（可选，需维护）
Codex `~/.codex/config.toml` 已支持 `[mcp_servers.*]`（现有 node_repl 先例）。若要让 Codex 以工具形式调用，需新增一个 stdio MCP server 包装 `gpt-bridge`。**当前未启用**（CLI 方式已够用，避免 MCP 配置维护成本）——需要时再包装。

## 四、注意事项

1. **登录态**：Chrome 独立 profile 已登录 ChatGPT；若登录失效（`--check` 显示未登录），需在脚本弹出的窗口手动登录一次（`--check --wait` 会等待）。
2. **人机验证**：ChatGPT 偶尔弹 Cloudflare 验证 → 在弹出窗口手动点一下，脚本会继续等待。
3. **不是自动化绕过**：本工具是"手动辅助传话"，不承诺绕过验证/风控。
4. **隐私**：发出去的内容会进入 ChatGPT 官方对话历史；敏感信息先确认再发。
5. **不要滥用**：制作人明确要求才使用；agent 不得自行频繁调用。

## 五、常见问题

| 问题 | 处理 |
|---|---|
| `--check` 显示未登录 | 跑 `--check --wait` 手动登录一次 |
| 卡在"等待回复" | 窗口里可能有人机验证，手动处理；或超时后看 `tmp/gpt-reply-*` |
| 回复为空 | 可能还在生成或页面结构变更；重试一次 |
| 其他 agent 找不到 node | 用绝对路径调 node（项目 node_modules 依赖仓库内） |
