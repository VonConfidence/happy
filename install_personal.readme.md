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

### 本地调试和上面那条个人安装路径的区别

- `ios:dev` 主要用于本机开发调试，默认是开发环境和模拟器
- `ios:production:personal --device` 主要用于把 production 版安装到个人 iPhone
- 前者更适合日常写代码、热更新、查问题
- 后者更适合验证“真机可安装、可打开、可使用”

## 相关文件

- [packages/happy-app/app.config.js](./packages/happy-app/app.config.js)
- [packages/happy-app/package.json](./packages/happy-app/package.json)
- [packages/happy-app/plugins/withIosPersonalSigning.js](./packages/happy-app/plugins/withIosPersonalSigning.js)
- [patches/fix-react-native-audio-api-cstddef.cjs](./patches/fix-react-native-audio-api-cstddef.cjs)
- [scripts/postinstall.cjs](./scripts/postinstall.cjs)
