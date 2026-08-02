# APK 一键打包操作手册

**版本**：v1.0
**日期**：2026-08-03
**适用**：归星物语项目，任何人或 AI 照此文档操作即可产出可安装 APK

> 前置分析见 [APK打包可行性方案.md](reports/APK打包可行性方案.md)（方案选型 / 技术栈对比 / 适配点分析）

---

## 1. 快速开始（两条命令出包）

```powershell
# 打包 APK（前端编译 → cap sync → gradle assemble → 结构校验）
# 产物直接写入 Gradle 原生目录：android/app/build/outputs/apk/<release|debug>/
python tools/build_apk.py                        # 默认 release
python tools/build_apk.py --variant debug        # 打 debug 包（快，未签名）
python tools/build_apk.py --variant both         # 两个都打
python tools/build_apk.py --archive              # 额外归档时间戳副本到 dist_apk/

# 连手机一键安装 + 启动（需 USB 调试）
python tools/install_apk.py                      # auto 策略（release 优先）
python tools/install_apk.py --variant debug      # 强制装 debug
python tools/install_apk.py --no-uninstall       # 保留存档覆盖安装
```

**产物路径（默认不用 dist_apk/）**：
- release：`android/app/build/outputs/apk/release/app-release.apk`
- debug：`android/app/build/outputs/apk/debug/app-debug.apk`
- 归档（加 `--archive` 才生成）：`dist_apk/latest-<variant>.apk` + 带时间戳备份

---

## 2. 前置环境要求

| 依赖 | 版本 | 用途 | 本机现状 |
|------|------|------|----------|
| Node.js | ≥18 | 前端编译（Vite） | ✅ v25.2.1 |
| Python | ≥3.10 | 运行打包脚本 | ✅ 3.10 |
| Java JDK | 21（Capacitor 8 要求） | Gradle 编译 APK | ⚠️ 需配置 |
| Android SDK | API 34 + Build-Tools 34 | Android 编译工具链 | ✅ 已装（`%LOCALAPPDATA%\Android\Sdk`） |
| Gradle | 8.14（项目自带 wrapper） | 构建工具 | ✅ `android/gradlew.bat` |

### 2.1 JDK 配置（关键！）

脚本会按以下优先级自动查找 JDK：

1. 环境变量 `JAVA_HOME`
2. PATH 中的 `java` 命令
3. Android Studio 自带 JBR（自动搜索常见安装目录）
4. scoop / .jdks / 常见手动解压目录

**如果脚本报"未找到 JDK"，三种解法（任选一）：**

**解法 A（推荐）：写 `tools/local.env.ps1`**

在 `tools/` 目录下创建 `local.env.ps1`（已被 `.gitignore` 忽略，不会泄露路径）：

```powershell
$env:JAVA_HOME = "C:\Java\jdk-21.0.12+8"
$env:ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"
# 如果有代理还需加：
# $env:GRADLE_OPTS = "-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"
```

然后每次打包前先 source 它：

```powershell
. .\tools\local.env.ps1
python tools/build_apk.py
```

**解法 B：设置系统环境变量**

在 Windows 系统设置里把 `JAVA_HOME` 指向 JDK 21 根目录，一劳永逸。

**解法 C：在已有 JDK 的终端里跑**

之前成功打包过的终端（CMD / PowerShell / AS Terminal）里环境变量已配好，直接在那里面跑脚本即可。

### 2.2 代理配置（网络受限环境）

Gradle 下载依赖时可能需要代理。如果构建卡在 "Downloading..." 超时：

```powershell
# 在 local.env.ps1 里加一行
$env:GRADLE_OPTS = "-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"
```

---

## 3. 脚本说明

### 3.1 `tools/build_apk.py` — 打包脚本

**参数：**

```text
--variant <debug|release|both>   打包版本，默认 release（正式分发）
--archive                        额外复制时间戳归档到 dist_apk/（默认不复制）
--skip-frontend                  跳过 npm run build + npx cap sync（前端没改动时省时间）
```

**流程（4 步，无交互，失败非零退出）：**

| 步骤 | 命令 | 产物校验 | 失败退出码 |
|------|------|----------|-----------|
| ① 环境探测 | 自动查找 Node / Java / SDK / Gradle | — | 2/3 |
| ② 前端编译 | `npm run build` | `dist/index.html` 存在 | 10/11 |
| ③ Capacitor 同步 | `npx cap sync android` | `android/.../assets/public/index.html` 存在 | 20/21 |
| ④ Gradle 打包 | `gradlew :app:assemble<Variant>` | APK 文件存在于 `apk/<variant>/` | 30/31 |
| ⑤ 结构校验 | zipfile 检查 | 含 `AndroidManifest.xml` / `classes.dex` / `resources.arsc` + ≥4MB | 43 |
| ⑥ （可选）归档 | 复制到 `dist_apk/` | `latest-<variant>.apk` + 时间戳备份 | 仅 `--archive` 时执行 |

**APK 产物路径（默认写入 Gradle 原生目录，不复制到 dist_apk/）：**
- release：`android/app/build/outputs/apk/release/app-release.apk`
- debug：`android/app/build/outputs/apk/debug/app-debug.apk`
- 归档（`--archive`）：`dist_apk/com.starvalley.returntostar-v{ver}-{stamp}-{variant}.apk`，并复制 `latest-<variant>.apk`

**退出码含义**（便于 AI 判断失败原因）：

| 退出码 | 含义 |
|--------|------|
| 2 | Node / npm / Java 不在 PATH 且自动探测失败 |
| 3 | `android/gradlew.bat` 不存在（android 目录不完整） |
| 10/11 | `npm run build` 失败（TypeScript / Vite 编译错误） |
| 20/21 | `cap sync` 失败（Capacitor 依赖缺失） |
| 30/31 | Gradle 构建失败（Java 版本 / SDK / 签名 / 代理问题） |
| 43 | APK 结构校验失败（ZIP 损坏 / 缺关键条目 / <4MB） |

### 3.2 `tools/install_apk.py` — 安装脚本

**参数：**

```text
--apk APK            指定 APK 文件（优先级最高，跳过自动查找）
--variant <auto|release|debug>   自动查找时锁定版本，默认 auto（release 优先）
--no-uninstall       不先卸载，直接覆盖安装（保留存档）
--no-launch          不自动启动
```

**APK 查找优先级（默认 `--variant auto`）：**
1. `android/app/build/outputs/apk/release/app-release.apk`
2. `android/app/build/outputs/apk/debug/app-debug.apk`
3. `dist_apk/latest-release.apk`（`--archive` 归档产物）
4. `dist_apk/latest-debug.apk`
5. `dist_apk/latest.apk`（兼容老脚本命名）
- 所有候选必须 ≥4MB，否则判定为坏包跳过。
- `--variant release` 时只查 release 相关路径；`--variant debug` 时只查 debug 相关路径。

**安全限制**：只允许 1 台设备在线（多台会报错退出，避免装错手机）

---

## 4. AI 调用规范

> 其他 AI Agent 按此规范调用打包脚本，可避免重复踩坑。

### 4.1 标准调用流程

```powershell
# 1. 确认在项目根目录
cd c:\Users\Gdy\Documents\trae_projects\mihoyoStarPlanting

# 2.（可选）加载本地环境
if (Test-Path tools/local.env.ps1) { . .\tools\local.env.ps1 }

# 3. 打包（默认 release，产物在 Gradle 原生目录）
python tools/build_apk.py
#  可选变体：
#   --variant debug     打 debug 包（快，未签名）
#   --variant both      release + debug 都打
#   --archive           额外归档副本到 dist_apk/（一般不需要）
#   --skip-frontend     前端没改时省时间（跳过 npm build + cap sync）
# 成功 → exit 0
#   release 产物：android/app/build/outputs/apk/release/app-release.apk
#   debug 产物：  android/app/build/outputs/apk/debug/app-debug.apk
# 失败 → 看退出码（见上表），不要无脑重试

# 4. 安装到手机（需 adb devices 能看到设备）
python tools/install_apk.py --no-uninstall   # auto 策略 + 保留存档
#  可选参数：
#   --variant release|debug|auto   锁定装哪种（默认 auto，release 优先）
#   --apk path/to/file.apk         显式指定 APK
```

### 4.2 失败处理决策树

```
build_apk.py 失败
├─ 退出码 2（找不到 JDK）
│   → 检查 tools/local.env.ps1 是否存在且 JAVA_HOME 路径正确
│   → 不要自己装 JDK（需用户授权），提示用户配置
├─ 退出码 10/11（前端编译失败）
│   → 修 TypeScript 错误（npx tsc --noEmit 定位）
│   → 不要跳过 build 直接 cap sync
├─ 退出码 20/21（cap sync 失败）
│   → npm install 补依赖
├─ 退出码 30/31（Gradle 失败）
│   → 看 stderr 末尾 40 行
│   → "SDK not found" → 检查 ANDROID_SDK_ROOT
│   → "class file version" → Java 版本不对（需 17/21）
│   → "Connection timed out" → 代理问题，加 GRADLE_OPTS
│   → 不要无脑重试同一命令
└─ 退出码 43（APK 校验失败）
    → 产物已损坏（ZIP 坏 / 缺关键条目 / <4MB）
    → 清理 android/app/build/ 后重新 build
```

### 4.3 注意事项

- **产物就在 Gradle 原生目录**：默认不再复制到 `dist_apk/`，安装脚本会直接从 `android/app/build/outputs/apk/<variant>/` 读取。需要备份时加 `--archive`。
- **不要跳步骤**：`build_apk.py` 内部的 4 步有依赖关系，不能只跑 Gradle 不跑 `npm run build`（前端产物会过时）。除非确定前端没改，否则不要用 `--skip-frontend`。
- **不要生成假 APK**：脚本会校验 APK 结构（含 `AndroidManifest.xml` / `classes.dex` / `resources.arsc` + ≥4MB），伪造产物过不了。
- **不要并行跑多个 build**：Gradle daemon 会锁文件，串行执行。
- **修改代码后必须重新打包**：`npm run build` + `cap sync` + `gradle assemble` 一个都不能少，脚本已自动串起这三步。
- **签名配置**：`android/keystore.properties` + `android/app/build.gradle` 已配好 release 签名，脚本直接出 release 包。
- **AI 调用时先看产物目录**：若 `android/app/build/outputs/apk/` 下已存在最近时间的 APK，可根据修改范围判断是否用 `--skip-frontend` 省时间（改了 TypeScript/CSS/HTML 时不能跳）。

---

## 5. 常见问题排查

### Q1: 脚本报 "未找到 JDK / Java"

→ 见 §2.1 JDK 配置，写 `tools/local.env.ps1`

### Q2: Gradle 下载超时 / 网络错误

→ 见 §2.2 代理配置，在 `local.env.ps1` 里加 `GRADLE_OPTS`

### Q3: "INSTALL_FAILED_UPDATE_INCOMPATIBLE"（安装失败）

→ 手机上已有不同签名的旧版本。先手动卸载旧 app，或用 `python tools/install_apk.py`（默认先卸载）

### Q4: "INSTALL_PARSE_FAILED_NOT_APK"（安装失败）

→ APK 损坏。清理 `android/app/build/` 后重新 `python tools/build_apk.py`

### Q5: 打包成功但游戏白屏 / 秒退

→ `adb logcat -s AndroidRuntime:*` 抓崩溃栈。常见原因：
- WebView 资源路径错误（检查 `base: './'` 配置）
- localStorage 权限问题（WebView 默认支持）
- 音频自动播放策略（需用户首次点击）

### Q6: 之前能打包，现在突然不行

→ 检查是否在**不同的终端**里跑（环境变量可能不同）。最稳的做法：写 `tools/local.env.ps1` 统一环境

---

## 6. 项目签名配置（已就位，无需操作）

| 项 | 值 |
|----|-----|
| 签名文件 | `android/guixing-release.keystore`（不入库） |
| 配置文件 | `android/keystore.properties`（不入库） |
| Gradle 引用 | `android/app/build.gradle` signingConfigs.release |
| 签名验证 | `apksigner verify` 已通过 |
| 包名 | `com.starvalley.returntostar` |

---

## 7. 相关文件索引

| 文件 | 用途 |
|------|------|
| [tools/build_apk.py](../tools/build_apk.py) | 一键打包脚本 |
| [tools/install_apk.py](../tools/install_apk.py) | 一键安装+启动脚本 |
| [capacitor.config.ts](../capacitor.config.ts) | Capacitor 配置（appId / appName / webDir） |
| android/keystore.properties | 签名配置（不入库） |
| android/local.properties | SDK 路径（不入库） |
| android/app/build.gradle | Gradle 构建配置（签名引用在此） |
