# Shirox 内置 Bangumi 动画元数据

[shirox-metadata.patch](shirox-metadata.patch) 基于上游 `398d36715b34a17ec68bfd52d792f7a2e7db06f5`，把 Bangumi（bgm.tv）作为 **Swift 原生内置元数据源** 加入 Shirox。

## 实现方式

- `ProviderType.bangumi`：Bangumi 与 AniList、MyAnimeList、Simkl 同为内置来源，显示名称和图标由 App 提供。
- `BangumiService`：用 `URLSession` 直接读取公开的 `api.bgm.tv/v0` 接口（搜索、条目、排行/首播目录、正片剧集），带标识 User-Agent，无需账号。不打包、不下载、不执行任何 JavaScript。
- `DiscoverySource` 新增 `bangumi` 选项：首页来源菜单和模块页均可直接选择 Bangumi。首页提供评分排行与最新首播，搜索支持关键词、条目链接和 `bgm:<id>`。
- Bangumi 条目为 `bangumi-<条目 ID>`，打开独立的条目页（简介、评分、排名、标签、制作公司、导演、正片剧集），可另选已安装的播放模块观看，可收藏到“我的书库”。

Bangumi 与 Simkl 一样**不进入 AniList/MyAnimeList 的 Provider 链**：AniList 条目页的追踪、继续观看和同步全部以 AniList ID 为键，把 Bangumi ID 放进去会读写错误的条目。因此 Bangumi 条目不打开 AniList 页面，也不会发送给任何追踪服务；个人资料、通知和书库仍使用已登录的 AniList / MyAnimeList 账号。

## 从旧版升级

旧版把 `bangumi.js` 打包进 App，在 JSContext 中作为“元数据模块”运行。新版删除了打包资源：

- 之前选择了 Bangumi 模块的用户，启动后自动切换为内置 Bangumi。
- 已导入的旧 Bangumi 模块被隐藏，不会运行，也不会出现在播放或下载源中。
- 其他第三方 `type: "metadata"` 模块仍按原方式工作。

## 构建

```bash
git clone https://github.com/xibrox/Shirox.git
cd Shirox
git checkout 398d36715b34a17ec68bfd52d792f7a2e7db06f5
git apply --check /path/to/shirox-metadata.patch
git apply /path/to/shirox-metadata.patch
open Shirox.xcodeproj
```

仅在上游原始源码上应用一次。构建、签名遵循上游 BUILDING.txt。[构建工作流](https://github.com/quiteQa/shirox-bangumi/actions/workflows/shirox-metadata-build.yml)会编译四个平台、编译 iOS 测试目标，并打包未签名 IPA（`metadata-Shirox_iOS` 产物）；[SwiftLint 工作流](https://github.com/quiteQa/shirox-bangumi/actions/workflows/shirox-metadata-lint.yml)执行严格检查。

`quiteQa/Shirox` Fork 需要同步为此补丁的内容后，才包含原生实现。

## 验证范围

`MetadataModuleTests` 覆盖 Bangumi 条目/剧集/分页解码、成人与非动画过滤、条目链接解析、旧模块处理及跨配置文件的来源选择。XCTest 未在模拟器中执行，尚未真机验证。
