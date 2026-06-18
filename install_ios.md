# 在个人 iPhone 上安装可用的 production 版本

这份文档记录的是当前仓库里已经跑通的一条安装路径：

- 使用 `production` 配置
- 使用个人 Apple 账号签名
- 安装到自己的 `iPhone`
- 可以正常打开和使用

注意：

- 这不是 App Store / TestFlight 分发包
- 这是本地开发签名安装版
- 因为使用个人签名，当前配置里禁用了 `Push Notifications` 和 `Associated Domains`

## 当前这条安装路径做了什么

仓库里已经加好了个人签名专用脚本：

```bash
pnpm --filter happy-app prebuild:ios:production:personal
pnpm --filter happy-app ios:production:personal --device
```

这条路径会：

- 使用 `APP_ENV=production`
- 生成 `Happy` 的 iOS 工程
- 使用个人可签名的 bundle id
- 当前默认 bundle id 是 `com.personal.confidence.happy.app`
- 去掉会卡住 `Personal Team` 签名的 iOS capability

## 前置条件

需要本机已经具备这些条件：

- 已安装 `Xcode`
- 已安装 Xcode Command Line Tools
- iPhone 已连接到 Mac
- iPhone 已开启 `Developer Mode`
- Apple ID 已登录到 Xcode
- 手机已信任这台 Mac

## 第一次安装步骤

在仓库根目录执行：

```bash
cd happy
pnpm install
pnpm --filter happy-app prebuild:ios:production:personal
pnpm --filter happy-app ios:production:personal --device
```

执行到 `--device` 时：

- 选择你的 iPhone
- 等待 Xcode / CocoaPods / Expo 完成构建

## 如果手机上已经安装成功但命令行报错

如果看到类似下面这种报错：

- `The application failed to launch`
- `profile has not been explicitly trusted by the user`
- `invalid code signature, inadequate entitlements or its profile has not been explicitly trusted by the user`

通常表示：

- App 已经安装成功
- 但手机还没有信任这份个人开发者签名

这时去手机上操作：

1. 打开 `设置`
2. 进入 `通用`
3. 进入 `VPN 与设备管理`
4. 找到你的开发者账号
5. 点击 `信任`
6. 回到桌面，手动打开 `Happy`

如果手动已经能正常打开，命令行这次报错可以先忽略。

## 如果再次安装 / 更新

后续重新安装或更新时，通常直接执行：

```bash
cd happy
pnpm --filter happy-app ios:production:personal --device
```

如果你改了 iOS 配置、bundle id、plugin 或原生工程生成逻辑，建议先重新 prebuild：

```bash
cd happy
pnpm --filter happy-app prebuild:ios:production:personal
pnpm --filter happy-app ios:production:personal --device
```

## 如果想改成你自己的 bundle id

可以显式指定：

```bash
cd happy
IOS_BUNDLE_ID=com.yourname.happy pnpm --filter happy-app prebuild:ios:production:personal
IOS_BUNDLE_ID=com.yourname.happy pnpm --filter happy-app ios:production:personal --device
```

## 这次实际踩到的坑

### 1. 默认 dev 配置无法用个人账号签名

原始 `dev` 变体会命中：

- `com.slopus.happy.dev`
- `Push Notifications`
- `Associated Domains`

个人 Apple 开发团队不支持这两个 capability，所以会直接卡在 provisioning / signing。

解决方式：

- 新增 `production + personal signing` 路径
- 去掉个人签名下的相关 capability

### 2. `react-native-audio-api` 在当前 Xcode 工具链下编译失败

报错大意是：

```text
unknown type name 'size_t'
```

根因是第三方库头文件缺少：

```cpp
#include <cstddef>
```

仓库里已经通过根级 postinstall 修补：

- [patches/fix-react-native-audio-api-cstddef.cjs](happy/patches/fix-react-native-audio-api-cstddef.cjs)
- [scripts/postinstall.cjs](happy/scripts/postinstall.cjs)

所以后续 `pnpm install` 会自动补上。

### 3. Expo / Metro 偶发缓存清理报错

如果遇到类似：

```text
Error: ENOTEMPTY: directory not empty, rmdir .../metro-cache/...
```

一般先重试一次。如果仍然报错，可以清理 Metro 临时缓存后再跑：

```bash
rm -rf /var/folders/2w/14xv8s9j62qcbknzw0j9fk_h0000gn/T/metro-cache
```

然后重新执行：

```bash
cd happy
pnpm --filter happy-app ios:production:personal --device
```

## 当前这个安装版的限制

因为是个人签名 production 安装版，所以有这些限制：

- 没有远程推送
- 没有 `app.happy.engineering` 的 Universal Link 直达
- 依赖 `Developer Mode`

## 关于 Developer Mode

当前这个本地开发签名安装版，建议不要关闭 `Developer Mode`。

如果关闭：

- 很可能后续无法继续正常启动
- 重新安装或重新信任时也会更麻烦

## 本地 iOS 调试

如果你的目标不是“安装一个个人签名的 production 版到 iPhone”，而是日常在本机做 iOS 开发调试，直接使用 `happy-app` 的开发变体即可。

### 最常用的启动方式

在仓库根目录执行：

```bash
pnpm install
pnpm --filter happy-app ios:dev
```

这条命令会：

- 使用 `APP_ENV=development`
- 启动 Expo 的 iOS 本地开发构建
- 默认跑到 iOS Simulator

仓库里对应脚本是：

```bash
pnpm --filter happy-app ios:dev
```

它实际对应：

```bash
cross-env APP_ENV=development expo run:ios
```

### 如果需要连本地后端一起调试

先启动本地 server：

```bash
pnpm --filter happy-server standalone:dev
```

默认会起在：

```text
http://localhost:3005
```

然后在启动 iOS 时，把 app 指向本地服务：

```bash
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 pnpm --filter happy-app ios:dev
```

也可以只开 Metro：

```bash
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 pnpm --filter happy-app start:dev
```

### 日常推荐流程

通常按下面顺序就够了：

```bash
pnpm install
pnpm --filter happy-server standalone:dev
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 pnpm --filter happy-app ios:dev
```

### 其他常用命令

- 真机调试：`pnpm --filter happy-app ios:connected-device`
- 只开 Metro：`pnpm --filter happy-app start:dev`
- Web 联调：`pnpm --filter happy-app web`

## 本地 Web 开发如何启动使用

如果你的目标是直接在浏览器里调试 Happy web 版本，最常用的是 `happy-app` 里的 web 相关脚本。

### 最常用的启动方式

在仓库根目录执行：

```bash
cd ~/Documents/happy
pnpm install
pnpm --filter happy-app web
```

这条命令会：

- 启动 Expo web 开发服务
- 在本地打开 Happy 的 web 版本
- 适合只看前端页面、交互和基础联调

### Web 下几个常用命令有什么差别

最容易混淆的是下面这几条：

```bash
pnpm --filter happy-app web
pnpm --filter happy-app web:test
pnpm --filter happy-app start:dev
pnpm web
pnpm env:web
```

它们的区别可以直接这样理解：

- `pnpm --filter happy-app web`
  实际是 expo start --web。也是启动开发服务器，但目标是 Web，会跑浏览器版本。
  **想跑浏览器版本：用 web**

- `pnpm --filter happy-app web:test`
  也是启动 web，但会显式带上 `APP_ENV=development` 和 `--non-interactive`。更适合你想稳定起一个 development web bundler、少一点交互提示的时候。

- `pnpm --filter happy-app start`
  实际是 expo start。启动 Expo 的 Metro 开发服务器，默认给原生端用（iOS/Android/Dev Client）。它不显式设置 APP_ENV。
  **想跑原生开发：用 start**

- `pnpm --filter happy-app start:dev`
  实际上是 cross-env APP_ENV=development expo start，不专门限定 web。更适合你只想先把 Expo dev server 开起来，再自己选择平台。
  **明确保证是开发环境：用 start:dev**

- `pnpm web`
  这是仓库根目录里的快捷方式，本质上就是帮你转发到 `pnpm --filter happy-app web`。你在仓库根目录里图省事时可以直接用它。
- `pnpm env:web`
  显式把前端指到本地环境里的 server
  这是“隔离开发环境”模式。它会在当前选中的 dev environment 里启动 web，并自动注入该环境自己的端口、数据目录、server URL。适合你想把本地调试环境彼此隔离时使用，不是最基础的日常命令。

如果你只是想问“我平时开发 web 应该用哪条”，结论很简单：

- 普通 web 开发：`pnpm --filter happy-app web`
- 想显式用 development 环境、少交互：`pnpm --filter happy-app web:test`
- 想用隔离环境：`pnpm env:web`

### 如果需要连本地后端一起调试

先启动本地 server：

```bash
cd ~/Documents/happy
pnpm --filter happy-server standalone:dev
```

默认服务地址是：

```text
http://localhost:3005
```

然后再启动 web，并把前端指向本地 server：

```bash
cd ~/Documents/happy
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 pnpm --filter happy-app web
```

### 如果只想开 web 开发 bundler

有时候你只想开一个更明确的、development 配置下的 web bundler，也可以直接用：

```bash
cd ~/Documents/happy
pnpm --filter happy-app web:test
```

这条脚本实际对应：

```bash
cross-env APP_ENV=development expo start --web --non-interactive
```

可以把它理解成：

- `web`：日常开发默认入口
- `web:test`：更明确、更“脚本化”的 development web 启动方式

### 日常推荐流程

通常按下面顺序就够了：

```bash
cd ~/Documents/happy
pnpm install
pnpm --filter happy-server standalone:dev
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 pnpm --filter happy-app web
```

### Web 开发时常用的相关命令

- 启动 web：`pnpm --filter happy-app web`
- 启动 development web bundler：`pnpm --filter happy-app web:test`
- 启动本地 server：`pnpm --filter happy-server standalone:dev`
- 只开 Expo dev server：`pnpm --filter happy-app start:dev`
- 根目录快捷方式：`pnpm web`
- 隔离环境方式：`pnpm env:web`

### 本地调试和上面那条个人安装路径的区别

- `ios:dev` 主要用于本机开发调试，默认是开发环境和模拟器
- `ios:production:personal --device` 主要用于把 production 版安装到个人 iPhone
- 前者更适合日常写代码、热更新、查问题
- 后者更适合验证“真机可安装、可打开、可使用”

## 使用本地 CLI，但不要覆盖原来的 happy

如果你改了 `packages/happy-cli`，又不想把系统里原来的 `happy` 替换掉，可以单独做一个本地命令，比如叫 `happy-fe`。

这样后面你就可以区分：

- 官方 / 已安装版本：`happy ...`
- 你当前仓库里的本地开发版本：`happy-fe ...`

### 适合这种方式的场景

- 你想继续保留原来的全局 `happy`
- 你只想验证本地改过的 CLI / daemon
- 你希望以后用 `happy-fe codex`、`happy-fe daemon start` 这类命令来区分

### 推荐做法：使用 `cli:install:fe`

现在仓库里已经有正式的本地安装脚本：

```bash
cd ~/Documents/happy
pnpm install
pnpm --filter happy cli:install:fe
```

它会做这些事：

- 构建当前仓库里的 `happy-cli`
- 生成一个本地别名包
- 全局注册 `happy-fe` 和 `happy-fe-mcp`
- 不覆盖你原来的 `happy`
- 会先尝试停掉现有的 `happy-fe daemon` 和 `happy daemon`
- 然后用 `happy-fe` 启动新的 daemon

装完后直接用：

```bash
happy-fe --version
happy-fe doctor
happy-fe daemon status
happy-fe codex
```

如果你想确认当前命令已经切到本地开发版，可以再执行：

```bash
which happy-fe
happy-fe --version
happy-fe daemon status
```

你应该能看到：

- `happy-fe` 已经在 PATH 里
- daemon 是通过 `happy-fe` 拉起的
- 而原来的 `happy` 命令仍然保留

### 不要用 `cli:install`

如果你执行：

```bash
pnpm --filter happy cli:install
```

它会直接把全局 `happy` 替换成本地仓库版本。

如果你就是想和原来的 `happy` 区分开，这里不要用这条命令。

### 它和 `cli:install` 的区别

- `cli:install` 会替换全局 `happy`
- `cli:install:fe` 会额外安装一个全局 `happy-fe`
- `happy` 和 `happy-fe` 可以同时存在
- 更适合你这种“要区分官方版本和本地开发版本”的场景

### 每次改完 CLI 代码后

因为 `happy-fe` 最终跑的也是这份仓库构建出来的 CLI，所以你改完 `packages/happy-cli` 代码后，需要重新安装一次：

```bash
cd ~/Documents/happy
pnpm --filter happy cli:install:fe
```

如果你改动影响了 daemon，建议顺手重启一次：

```bash
happy-fe daemon stop
happy-fe daemon start
```

如果你只是想看这次本地构建是否成功，也可以先单独执行：

```bash
cd ~/Documents/happy
pnpm --filter happy build
```

### 如果你还想把本地版本的数据目录也分开

只改命令名，不会自动把数据目录分开。默认它还是会使用：

```text
~/.happy
```

如果你希望本地开发版完全独立，不影响原来的 happy 数据，可以这样用：

```bash
HAPPY_HOME_DIR=~/.happy-fe happy-fe daemon start
HAPPY_HOME_DIR=~/.happy-fe happy-fe codex
```

这样你就同时区分了两层：

- 命令名区分：`happy` / `happy-fe`
- 数据目录区分：`~/.happy` / `~/.happy-fe`

### 最适合你当前这次需求的用法

如果你这次主要是验证“本地改过的 CLI 是否能扫描当前机器上的 Codex 会话”，建议直接这样：

```bash
cd ~/Documents/happy
pnpm --filter happy cli:install:fe
happy-fe codex
```

如果你希望继续复用原来已经登录过的 Happy 账号和机器信息，就不要额外设置 `HAPPY_HOME_DIR`。

### 如果你想移除本地 happy-fe

可以执行：

```bash
npm uninstall -g happy-fe-local
```

这只会移除本地开发版的 `happy-fe` / `happy-fe-mcp`，不会动你原来的 `happy`。

## 相关文件

- [packages/happy-cli/package.json](./packages/happy-cli/package.json)
- [packages/happy-cli/scripts/install-local-fe.cjs](./packages/happy-cli/scripts/install-local-fe.cjs)
- [packages/happy-cli/scripts/install-local.cjs](./packages/happy-cli/scripts/install-local.cjs)
- [packages/happy-app/app.config.js](./packages/happy-app/app.config.js)
- [packages/happy-app/package.json](./packages/happy-app/package.json)
- [packages/happy-app/plugins/withIosPersonalSigning.js](./packages/happy-app/plugins/withIosPersonalSigning.js)
- [patches/fix-react-native-audio-api-cstddef.cjs](./patches/fix-react-native-audio-api-cstddef.cjs)
- [scripts/postinstall.cjs](./scripts/postinstall.cjs)
