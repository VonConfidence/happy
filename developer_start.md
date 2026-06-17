# happy-app 启动命令说明

本文整理 `packages/happy-app` 里最常用的启动命令，重点说明：

- 每条命令实际执行什么
- 适合什么场景
- 它们之间最容易混淆的差异
- `APP_ENV` 对应用配置的影响

## 1. 前置说明

`happy-app` 是一个基于 Expo 的多端应用，同一套代码可以跑在：

- iOS
- Android
- Web
- macOS Desktop（Tauri）

这里有两个概念要先分清：

| 概念 | 作用 | 例子 |
| --- | --- | --- |
| 运行方式 | 决定应用跑在哪个平台、由什么开发服务器驱动 | `expo start`、`expo start --web`、`expo run:ios`、`tauri dev` |
| 变体环境 | 决定应用用哪套变体配置 | `APP_ENV=development`、`APP_ENV=preview`、`APP_ENV=production` |

一句话理解：

| 问题 | 看什么 |
| --- | --- |
| 我现在跑的是 Web 还是 iOS？ | 看启动命令 |
| 我现在用的是 dev / preview / production 哪套配置？ | 看 `APP_ENV` |

## 2. 三个核心命令对比

| 命令 | 实际执行 | 平台 | 是否显式设置 `APP_ENV` | 默认结果 | 适用场景 |
| --- | --- | --- | --- | --- | --- |
| `pnpm --filter happy-app start` | `expo start` | Expo 开发服务器，主要给 iOS / Android Dev Client 用 | 否 | 若外部未设置，则走 `development` | 日常原生开发入口 |
| `pnpm --filter happy-app web` | `expo start --web` | Web | 否 | 若外部未设置，则走 `development` | 在浏览器里调试 Web 版本 |
| `pnpm --filter happy-app start:dev` | `cross-env APP_ENV=development expo start` | Expo 开发服务器，主要给 iOS / Android Dev Client 用 | 是 | 强制 `development` | 想确保自己一定跑在开发变体时使用 |

## 3. 详细使用方法

| 命令 | 使用方法 | 你会看到什么 | 常见搭配 |
| --- | --- | --- | --- |
| `pnpm --filter happy-app start` | 在仓库根目录执行；启动后用 Expo Dev Client、模拟器或真机连接 | Metro bundler 启动，终端显示二维码、端口、设备连接信息 | 常搭配 `ios:dev`、`android:dev` 或已安装的开发客户端 |
| `pnpm --filter happy-app web` | 在仓库根目录执行；启动后直接在浏览器中打开本地地址 | 浏览器版本启动，本地页面热更新 | 适合调试 Web UI、布局、键盘交互、浏览器专属逻辑 |
| `pnpm --filter happy-app start:dev` | 用法和 `start` 一样，只是额外锁定了 `APP_ENV=development` | 和 `start` 类似，但不会误继承当前 shell 中别的 `APP_ENV` | 适合 shell 里可能残留 `APP_ENV=preview` / `production` 的情况 |

## 4. 三者最关键的差异

| 对比维度 | `start` | `web` | `start:dev` |
| --- | --- | --- | --- |
| 平台目标 | 原生开发为主 | 浏览器 | 原生开发为主 |
| 底层命令 | `expo start` | `expo start --web` | `cross-env APP_ENV=development expo start` |
| 是否强制 dev 变体 | 否 | 否 | 是 |
| 是否可能受外部 `APP_ENV` 影响 | 是 | 是 | 否 |
| 是否用于浏览器调试 | 否 | 是 | 否 |

## 5. `start` 和 `start:dev` 为什么看起来很像

项目配置里有这段逻辑：

```js
const variant = process.env.APP_ENV || 'development';
```

这意味着：

| 场景 | `start` 的结果 | `start:dev` 的结果 |
| --- | --- | --- |
| 当前 shell 没有设置 `APP_ENV` | `development` | `development` |
| 当前 shell 设置了 `APP_ENV=preview` | `preview` | `development` |
| 当前 shell 设置了 `APP_ENV=production` | `production` | `development` |

所以在大多数干净环境里，`start` 和 `start:dev` 几乎一样；真正的区别是：

| 命令 | 核心价值 |
| --- | --- |
| `start` | 简单、默认、日常使用最顺手 |
| `start:dev` | 显式、稳定，能避免环境变量串掉 |

## 6. APP_ENV 变体对照表

| `APP_ENV` | App 名称 | Bundle ID / Package | Console 日志默认值 | iOS HTTP 策略 | Deep Link / Associated Domains |
| --- | --- | --- | --- | --- | --- |
| `development` | `Happy (dev)` | `com.slopus.happy.dev` | 开 | 允许本地网络，允许任意 HTTP | 关闭 |
| `preview` | `Happy (preview)` | `com.slopus.happy.preview` | 开 | 允许本地网络，允许任意 HTTP | 关闭 |
| `production` | `Happy` | `com.ex3ndr.happy` | 关 | 只放开本地网络，不额外放开任意 HTTP | 开启 |

## 7. 常见相关命令总表

| 命令 | 实际执行 | 平台 | 变体 | 说明 |
| --- | --- | --- | --- | --- |
| `pnpm --filter happy-app start` | `expo start` | iOS / Android 开发服务器 | 默认或继承外部环境 | 最基础的原生开发入口 |
| `pnpm --filter happy-app start:dev` | `cross-env APP_ENV=development expo start` | iOS / Android 开发服务器 | `development` | 推荐在需要明确 dev 变体时使用 |
| `pnpm --filter happy-app start:preview` | `cross-env APP_ENV=preview expo start` | iOS / Android 开发服务器 | `preview` | 调试 preview 变体配置 |
| `pnpm --filter happy-app start:production` | `cross-env APP_ENV=production expo start` | iOS / Android 开发服务器 | `production` | 调试 production 配置，但仍是开发模式 |
| `pnpm --filter happy-app web` | `expo start --web` | Web | 默认或继承外部环境 | 浏览器版开发 |
| `pnpm --filter happy-app web:test` | `cross-env APP_ENV=development expo start --web --non-interactive` | Web | `development` | 更适合自动化或无交互场景 |
| `pnpm --filter happy-app ios:dev` | `cross-env APP_ENV=development expo run:ios` | iOS | `development` | 构建并运行 iOS 开发变体 |
| `pnpm --filter happy-app ios:preview` | `cross-env APP_ENV=preview expo run:ios` | iOS | `preview` | 构建并运行 iOS preview 变体 |
| `pnpm --filter happy-app ios:production` | `cross-env APP_ENV=production expo run:ios --configuration Release` | iOS | `production` | 更接近发布配置的 iOS 运行方式 |
| `pnpm --filter happy-app android:dev` | `cross-env APP_ENV=development expo run:android` | Android | `development` | 构建并运行 Android 开发变体 |
| `pnpm --filter happy-app android:preview` | `cross-env APP_ENV=preview expo run:android` | Android | `preview` | 构建并运行 Android preview 变体 |
| `pnpm --filter happy-app android:production` | `cross-env APP_ENV=production expo run:android --variant release` | Android | `production` | 更接近发布配置的 Android 运行方式 |
| `pnpm --filter happy-app tauri:dev` | `tauri dev --config src-tauri/tauri.dev.conf.json` | macOS Desktop | dev 桌面配置 | 启动 Tauri 桌面应用 |

## 8. 如何选择

| 你的目标 | 推荐命令 | 原因 |
| --- | --- | --- |
| 日常开发 iOS / Android 功能 | `pnpm --filter happy-app start` | 默认成本最低 |
| 想避免环境变量污染，明确使用开发变体 | `pnpm --filter happy-app start:dev` | 强制 `APP_ENV=development` |
| 调试浏览器端表现 | `pnpm --filter happy-app web` | 直接进入 Web 版本 |
| 想验证 preview 变体配置 | `pnpm --filter happy-app start:preview` | 明确走 preview 配置 |
| 想验证 production 变体配置 | `pnpm --filter happy-app start:production` | 明确走 production 配置 |
| 想运行桌面版 | `pnpm --filter happy-app tauri:dev` | 进入 Tauri 桌面开发流程 |

## 9. 一个容易误解的点

`APP_ENV=production` 不等于“真正生产环境运行”。

| 情况 | 是否是生产配置 | 是否是开发模式 |
| --- | --- | --- |
| `pnpm --filter happy-app start:production` | 是 | 是 |
| `pnpm --filter happy-app ios:production` | 是 | 更接近发布构建 |
| `pnpm --filter happy-app android:production` | 是 | 更接近发布构建 |

原因是很多运行时行为还会看 `__DEV__`，不是只看 `APP_ENV`。也就是说：

| 结论 | 说明 |
| --- | --- |
| `APP_ENV` | 决定应用配置变体 |
| `__DEV__` | 决定是否处于开发运行模式 |

## 10. 推荐记法

如果只想记最实用的一版，可以直接记下面这张表：

| 需求 | 直接用什么 |
| --- | --- |
| 原生日常开发 | `pnpm --filter happy-app start` |
| 原生开发且确保是 dev 变体 | `pnpm --filter happy-app start:dev` |
| 浏览器调试 | `pnpm --filter happy-app web` |
| iOS 真正跑起来 | `pnpm --filter happy-app ios:dev` |
| Android 真正跑起来 | `pnpm --filter happy-app android:dev` |
| 桌面版开发 | `pnpm --filter happy-app tauri:dev` |
