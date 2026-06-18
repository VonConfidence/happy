# Android APK 打包说明

本文说明这个仓库里当前可用的 Android 出包方式，重点区分：

- 哪些命令会产出可安装的 `.apk`
- 哪些命令属于商店发布流程，默认不是 `.apk`
- 什么时候该用 `development`，什么时候该用 `preview`
- 没有 Expo / EAS 权限时，如何直接在本地打 APK

## 两条路线

当前有两条实际可用的 Android 出包路线：

- 有 Expo / EAS 权限：走 EAS 云构建
- 没有 Expo / EAS 权限：走本地 Gradle 构建

如果你只是想先拿到一个可安装 APK，而当前 Expo 项目没有权限，优先走下面的“本地 Gradle 打包”。

## 现在打 Android APK 的命令

### 方案 A：有 Expo / EAS 权限

在执行下面任何命令前，先确认 EAS 已认证。二选一：

```bash
pnpm dlx eas-cli@latest login
```

或者在当前 shell 里设置 CI 用的令牌：

```bash
export EXPO_TOKEN=你的_token
```

如果你的目标是打一个可直接安装到设备上的 Android APK，当前优先使用下面这个脚本：

```bash
pnpm --filter happy-app android:build:preview
```

如果你要打开发客户端 APK，则用：

```bash
pnpm --filter happy-app android:build:development
```

如果你要走正式商店发布构建，则用：

```bash
pnpm --filter happy-app android:build:production
```

### 方案 B：没有 Expo / EAS 权限

如果你当前没有 Expo 项目权限，不能走 EAS 云构建，也仍然可以直接在本机打一个可安装 APK。

前提：

- 已安装 JDK 17
- 已安装 Android SDK
- `packages/happy-app/android` 目录已经存在

本机构建命令：

```bash
cd happy/packages/happy-app/android
./gradlew assembleRelease
```

构建完成后的 APK 默认在：

```bash
happy/packages/happy-app/android/app/build/outputs/apk/release/app-release.apk
```

如果 Gradle 提示找不到 Android SDK，需要在 `packages/happy-app/android/local.properties` 写入：

```properties
sdk.dir=/Users/confidence/Library/Android/sdk
```

这个文件本来就在 [packages/happy-app/android/.gitignore](happy/packages/happy-app/android/.gitignore:5) 里，只影响本机，不需要提交。

## 无 Expo 权限时的本地说明

这条本地打包路径的特点是：

- 不依赖 Expo 账号权限
- 不依赖 EAS 项目 owner / projectId
- 直接用 Gradle 在本机产出 APK
- 更适合“先拿到一个能装的 APK”

当前仓库里 Android `release` 构建使用的是 debug keystore，因此可以直接产出可安装 APK。对应配置见 [packages/happy-app/android/app/build.gradle](happy/packages/happy-app/android/app/build.gradle:100)。

另外，这个仓库目前已经在 [packages/happy-app/android/build.gradle](happy/packages/happy-app/android/build.gradle:16) 里加了本地 Maven 仓库优先级，用来绕过某些机器上 JitPack TLS 握手失败的问题。

需要注意：

- 这条路径打出来的是“当前本地 Android 工程”的 APK
- 当前 Android 原生工程的 `applicationId` 是 `com.slopus.happy.dev`
- 它更接近当前 checked-in 的原生配置，不等同于 EAS `preview` 云构建结果

对应原生配置见 [packages/happy-app/android/app/build.gradle](happy/packages/happy-app/android/app/build.gradle:90)。

## 为什么这些命令会产出不同类型的产物

仓库里的 `eas.json` 当前配置是：

- `development`：`distribution` 为 `internal`，并开启 `developmentClient`
- `preview`：`distribution` 为 `internal`
- `production`：没有设置 `distribution: internal`

对应配置见 [packages/happy-app/eas.json](happy/packages/happy-app/eas.json:6)。

根据 Expo 官方文档，Android 的 internal distribution 会生成可安装的 APK；而默认生产构建面向商店分发，默认产物是 AAB，不是 APK。

## 该用哪个 profile

`preview` 适合大多数“我要一个安装包给自己或别人装机测试”的场景：

```bash
pnpm --filter happy-app android:build:preview
```

特点：

- 产物是安装包
- `APP_ENV=preview`
- 不带 dev client
- 更接近给测试人员安装的版本

`development` 适合需要 Dev Client 的开发调试：

```bash
pnpm --filter happy-app android:build:development
```

特点：

- 产物也是安装包
- `APP_ENV=development`
- `developmentClient: true`
- 主要用于原生开发联调

`production` 适合正式发版到 Google Play：

```bash
pnpm --filter happy-app android:build:production
```

特点：

- 这是商店发布构建，不是测试安装包优先路径
- 对应 `APP_ENV=production`
- 默认应按商店分发来理解
- 命令里带 `--auto-submit-with-profile=production`，会衔接提交流程

一句话区分：

- `preview`：给人装机测试
- `production`：给商店发版

## 不要混淆的几个命令

下面这些命令不是“打 APK 云构建命令”：

```bash
pnpm --filter happy-app android:dev
pnpm --filter happy-app android:preview
pnpm --filter happy-app android:production
```

它们定义在 [packages/happy-app/package.json](happy/packages/happy-app/package.json:33)，本质是本地 `expo run:android`，用于本机编译并运行到模拟器或设备，不是 EAS 云端出包。

下面这个脚本也不要误解：

```bash
pnpm --filter happy-app release:build:appstore
pnpm --filter happy-app android:build:production
```

它会走 [packages/happy-app/release-production.sh](happy/packages/happy-app/release-production.sh:1) 里的 production 流程，其中 Android 命令是：

```bash
eas build --profile production --platform android --auto-submit-with-profile=production --no-wait --non-interactive
```

这个流程默认是给商店发布准备的，不应当当成“我要一个 APK 安装包”来使用。

## 推荐用法

如果只是想拿到一个 Android 安装包，优先用：

```bash
pnpm --filter happy-app android:build:preview
```

如果你没有 Expo / EAS 权限，直接改走本地 Gradle：

```bash
cd happy/packages/happy-app/android
./gradlew assembleRelease
```

如果你明确需要 Dev Client，再改用：

```bash
pnpm --filter happy-app android:build:development
```

如果你的目标是上 Google Play，而不是拿 APK 给人安装，就用：

```bash
pnpm --filter happy-app android:build:production
```

## 使用步骤

### EAS 云构建

1. 在仓库根目录执行对应脚本。
2. 等 EAS 返回构建任务链接。
3. `development` / `preview` 构建完成后，在 EAS 页面下载 Android 安装产物。
4. `production` 构建完成后，按商店发布流程检查提交状态。

### 本地 Gradle 构建

1. 确认本机已安装 JDK 17 和 Android SDK。
2. 确认 `packages/happy-app/android/local.properties` 指向本机 SDK。
3. 执行：

```bash
cd happy/packages/happy-app/android
./gradlew assembleRelease
```

4. 构建成功后，从 `app/build/outputs/apk/release/app-release.apk` 取包。

## 补充说明

- 当前已经封装了这三个脚本：
- `pnpm --filter happy-app android:build:development`
- `pnpm --filter happy-app android:build:preview`
- `pnpm --filter happy-app android:build:production`
- 这几个脚本内部显式使用 `pnpm dlx eas-cli@latest`，不依赖本地存在全局 `eas` 命令，也绕开了当前机器上 `npx eas-cli@latest` 的安装异常。
