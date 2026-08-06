# 《归星物语》APK 打包可行性方案

**版本**：v0.5.3
**日期**：2026-08-02
**状态**：✅ 已实施（v0.5.3）
**适用**：将 Web 游戏打包为 Android APK

> **2026-08-02 实施更新**：Capacitor 方案已落地，成功产出 `app-debug.apk`（19.5MB）。
> 新增文档章节：§8 实施记录（实际执行过程 + 环境差异 + 产物验证）。

---

## 1. 现状分析

| 项 | 现状 | 对打包的影响 |
|----|------|--------------|
| 技术栈 | Vite + TypeScript + Phaser 3.80 | ✅ 纯静态构建产物，标准 Web 技术栈 |
| 构建配置 | `base: './'`（相对路径） | ✅ **关键利好**：资源全部相对路径，可直接 file:// 加载 |
| 资源 | 全部位于 `public/assets`，总 <2MB | ✅ 体积小，可整体打入 APK |
| 持久化 | localStorage（`return_star_save`） | ⚠️ Android WebView 支持，但 WebView 数据可能被系统清理 |
| 音频 | Web Audio API（程序合成） | ⚠️ WebView 需 `autoplay` 策略；懒初始化已有，风险低 |
| 触屏 | TouchControls（DOM）+ Phaser 指针 | ✅ 原生 touch 事件，WebView 无兼容问题 |
| 现有环境 | Node v25 ✅ / Java ❌ / Android SDK ❌ | ❌ 需安装 Java 17 + Android SDK 才能出 APK |

**结论：项目本身 100% 具备打包条件，唯一硬性前置是构建环境（Java + Android SDK）。**

---

## 2. 打包方案对比

| 方案 | 技术栈 | 包体 | 维护性 | 门槛 | 适配成本 | 推荐度 |
|------|--------|------|--------|------|----------|--------|
| **Capacitor** | Node + Gradle | 5-8MB | 活跃（Ionic 出品） | 需 Java 17 + SDK | 低（1-2 处适配） | ⭐⭐⭐⭐⭐ 首选 |
| Cordova | Node + Gradle | 5-8MB | 半维护（Apache） | 需 Java + SDK | 中 | ⭐⭐⭐ |
| Tauri v2 | Rust + Gradle | 2-4MB | 活跃 | 需 Rust + Java + SDK | 中高 | ⭐⭐⭐ |
| PWA + TWA | 无需本地环境 | 无 APK | 依赖 Play 商店 | 低 | 高（需 Chrome 内核） | ⭐⭐ |
| Android WebView 壳 | 手动 Java/Kotlin | 5MB | 自己维护 | 需 Android Studio | 高 | ⭐⭐ |

### 推荐：Capacitor

理由：
1. **对 Phaser/Vite 友好**：官方模板 `npm create @capacitor/app` 支持任意前端，打包后加载 `dist/` 静态文件。
2. **适配成本最低**：本项目只有 localStorage + Web Audio 两个点需要验证，均无阻塞。
3. **调试方便**：`npx cap run android` 可连真机热更新，与现有 `probe-*.mjs` 探针流程可结合。
4. **生态成熟**：Icon/Splash/文件系统等插件齐全，后续如需原生能力（存档导出/分享）可扩展。

---

## 3. 推荐方案实施路径（Capacitor）

### 3.1 前置环境（本机缺失项，需先安装）

| 依赖 | 版本要求 | 当前状态 | 安装方式 |
|------|----------|----------|----------|
| Node.js | ≥18 | ✅ v25.2.1 | 已有 |
| Java JDK | 17（Android Gradle 要求） | ❌ 未安装 | `winget install Microsoft.OpenJDK.17` |
| Android SDK | API 34 + Build-Tools | ❌ 未安装 | Android Studio 或 `winget install Google.AndroidStudio` |
| Android SDK Platform | API 34 | ❌ | SDK Manager 安装 |

> 说明：也可用命令行方式装 Android Command-Line Tools（不装 Android Studio），但 Android Studio 更省心（含模拟器）。

### 3.2 实施步骤

```bash
# 1. 安装 Capacitor 依赖
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. 初始化 Capacitor（按提示填应用名/包名）
npx cap init "归星物语" "com.starvalley.returntostar" --web-dir dist

# 3. 构建 Web 产物
npm run build        # → dist/

# 4. 添加 Android 平台
npx cap add android

# 5. 同步 Web 产物到原生工程
npx cap sync android

# 6. 打开/构建（需已装 Android Studio 或命令行 gradle）
npx cap open android # 或在 android/ 目录下执行 gradlew assembleDebug

# 产物路径：android/app/build/outputs/apk/debug/app-debug.apk
```

### 3.3 项目适配点（预计 2 处，均为低风险）

| 适配点 | 位置 | 说明 | 风险 |
|--------|------|------|------|
| localStorage 确认 | SaveSystem.ts | Android WebView（Chromium）支持 localStorage，默认开启 | 低，仅需真机验证 |
| 音频解锁 | AudioSystem.ts | WebView 首次播放需用户手势，项目已懒初始化（getCtx 在 play 时创建） | 低 |
| 状态栏/safe-area | index.html + TouchControls | 建议同步 iOS 审查 B1/B2 的 safe-area 适配，WebView 全屏时 Home 手势/状态栏叠加 | 低 |
| 返回键 | 新增 | Android 物理返回键默认会退出 App，应拦截为"关闭面板/回到上一场景" | 中，需插件或 WebView 桥接 |
| 全屏沉浸 | index.html | 打包后建议隐藏状态栏/导航栏（Capacitor StatusBar 插件） | 低 |

### 3.4 签名与分发（后续阶段）

- **Debug 包**：`app-debug.apk` 可直接安装测试（未签名）
- **Release 包**：需生成 keystore 签名 + `gradlew assembleRelease`（配置 `android/app/build.gradle`）
- 分发渠道：APK 直传 / 应用宝 / 酷安（无需上架 Google Play）

---

## 4. 风险与注意事项

| 风险 | 等级 | 说明 | 缓解 |
|------|------|------|------|
| 环境安装耗时 | 中 | Java 17 + Android SDK 首次安装约 30-60 分钟 | 可先用 `npx cap add android` 验证结构 |
| WebView 版本碎片化 | 低 | 老机型 WebView 内核旧，`inset:0`/`backdrop-filter` 等 CSS 不兼容 | 同步 iOS B3/B4 修复（显式 top/left/right/bottom + -webkit- 前缀） |
| localStorage 被系统清理 | 低 | WebView 应用数据被清除时存档丢失 | 后续可加 Capacitor Filesystem 插件落盘 JSON |
| 物理返回键行为 | 中 | 默认按返回键退出游戏 | 后续实现返回键层级（关闭面板→场景→退出） |
| 无 IAP/广告需求 | - | 当前无内购，无需 Google Play Billing | - |

---

## 5. 验证方案（与现有测试体系结合）

1. **构建验证**：`npm run build` 产物可正常 `vite preview` 访问（现有流程）。
2. **WebView 冒烟**：装 `app-debug.apk` 后跑一遍核心流程——新游戏 → 教程 → 睡觉跨天 → 存档刷新恢复（对应现有 `test-tutorial.mjs` 18 项断言人工版）。
3. **触屏专项**：虚拟摇杆移动、交互按钮连点、背包/任务按钮、每日任务领奖（对应 `probe-mobile-*.mjs`）。
4. **兼容回归**：iOS 审查 B3/B4 修复后，同 CSS 需在 Android 老 WebView 复测。
5. **性能**：`adb logcat` 观察 JS 报错 + Chrome DevTools 远程调试（`chrome://inspect`）看内存。

---

## 6. 决策点（需制作人拍板）

1. **包名**：建议 `com.starvalley.returntostar`（一旦上架不可改）。
2. **是否同步做 iOS**：Capacitor 同一套代码可加 `@capacitor/ios` 出 `.ipa`（需 macOS + Xcode + 开发者账号）。
3. **环境安装时机**：是否现在就装 Java 17 + Android SDK（耗时约 1 小时），还是先出方案评审。
4. **优先级**：APK 打包 与 移动端 UI 优化（Phase 2/3）、P1 剧情修复 的排期关系。

---

## 7. 结论

- **技术上完全可行**，项目 `base:'./'` + 轻量资源是天然优势，Capacitor 适配成本预计 1-2 天（含环境）。
- **硬性前置**：安装 Java 17 + Android SDK（本机缺失）。
- **推荐路径**：先修 iOS 审查 P1（safe-area，复用 Android WebView 同样受益）→ 装环境 → Capacitor 打包 → Debug APK 真机冒烟。

---

## 8. 实施记录（2026-08-02 已落地）

### 8.1 环境安装（本机实际执行）

| 依赖 | 方案文档预期 | 实际安装 | 差异说明 |
|------|--------------|----------|----------|
| Java | JDK 17（`winget install Microsoft.OpenJDK.17`） | **JDK 17**（Temurin 17.0.20+8，ZIP 解压到 `C:\Java\jdk-17.0.20+8`）+ **JDK 21**（Temurin 21.0.12+8，`C:\Java\jdk-21.0.12+8`） | Capacitor 8 要求 Java 21 编译（报错"无效的源发行版：21"），JDK 17 仅满足 Gradle 引导 |
| Android SDK | Android Studio 或 cmdline-tools | **cmdline-tools**（11076708）+ `platforms;android-34` + `build-tools;34.0.0` + platform-tools | 未装 Android Studio（体积大），纯命令行，`$env:LOCALAPPDATA\Android\Sdk` |
| Android SDK Platform | API 34 | API 34 ✅ | 与 Capacitor 8 默认 compileSdk 34 一致 |

### 8.2 网络问题与代理（关键坑）

- Gradle 官方源 `services.gradle.org` 在代理环境下载超时（Java 不读系统代理）
- 解决：`gradle-wrapper.properties` 换腾讯镜像 `mirrors.cloud.tencent.com`（后也超时），最终 **GRADLE_OPTS 显式传 JVM 代理**：
  `-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897`
- 系统代理为 `127.0.0.1:7897`（Clash 类工具），需每次构建前设置 `GRADLE_OPTS`

### 8.3 构建命令（Windows PowerShell）

```powershell
$env:JAVA_HOME = "C:\Java\jdk-21.0.12+8"
$env:Path = "C:\Java\jdk-21.0.12+8\bin;$env:Path"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:GRADLE_OPTS = "-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897"
cd android; .\gradlew.bat assembleDebug --no-daemon
```

### 8.4 产物与配置

| 项 | 值 |
|----|-----|
| APK 产物 | `android/app/build/outputs/apk/debug/app-debug.apk`（**19.5MB**，Debug 未签名） |
| 包名 | `com.starvalley.returntostar` |
| Capacitor | 8.5.x（core + cli + android） |
| 本地配置 | `android/local.properties`（sdk.dir）不入库；`.gitignore` 已覆盖 `android/app/build` 等构建产物 |
| 提交 | `36f9680` feat(apk): Capacitor Android 打包 |

### 8.5 真机验证（待执行）

- [x] Release 签名打包（keystore `guixing-release.keystore` + `assembleRelease` → `app-release.apk` 19.29MB，apksigner 验证通过，`6b13c44`）
- [x] 物理返回键层级（@capacitor/app backButton：关对话→关面板→回退场景→退出，`6b13c44`）
- [ ] 安装 `app-release.apk` → 新游戏 → 教程 → 睡觉跨天 → 存档刷新恢复（对应 `test-tutorial.mjs` 18 项）
- [ ] 触屏专项：摇杆 / 交互按钮 / 背包 / 任务 / 每日任务领奖
- [ ] 物理返回键真机实测（面板关闭 / 场景回退 / 农场退出）

### 8.6 环境变量备注（本机）

- `JAVA_HOME` → 指向 JDK 21（Capacitor 构建需要），JDK 17 保留用于其他场景
- `ANDROID_HOME` → `%LOCALAPPDATA%\Android\Sdk`
- Gradle 代理通过 `GRADLE_OPTS` 每次构建时传递（未写死到 gradle.properties，避免入库泄露代理配置）

---

## 9. 一键打包脚本（2026-08-03 已落地）

> **打包操作请直接参考 [APK一键打包操作手册.md](../APK一键打包操作手册.md)**
>
> 已封装为两个 Python 脚本，无需手动执行多步命令：
> - `python tools/build_apk.py` — 一键打包（环境探测 → build → cap sync → gradle assemble → APK 结构校验 → dist_apk/）
> - `python tools/install_apk.py` — 一键安装到手机 + 冷启动 + 前台判活
>
> 脚本自动探测 JDK / SDK（含 Android Studio JBR / scoop / .jdks 常见目录），失败时按退出码定位原因，AI Agent 可直接调用。
