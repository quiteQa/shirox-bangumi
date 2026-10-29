# Shirox 内置 Bangumi 动画元数据

完整 App 源码：[quiteQa/Shirox](https://github.com/quiteQa/Shirox)，内置接入提交 [50b3167](https://github.com/quiteQa/Shirox/commit/50b31671a002842708427de05fbb68098f6ce016)。直接克隆 Fork 即可构建，无需手动应用补丁。

## 使用

安装含内置资源的修改版后，在模块页或首页来源菜单直接选择 **Bangumi**。无需模块 URL，无需下载 JavaScript，也无需 Bangumi 账号；读取公开元数据和封面仍需联网。

- 首页提供评分排行和最新首播；搜索、详情和剧集读取 Bangumi 元数据。
- 模块页固定显示“Bangumi · 内置动画元数据”，与 AniList、MyAnimeList 一起选择。
- 配置与脚本随 App 打包到全部平台；刷新外部模块不会替换内置脚本。
- 保留旧 Bangumi 模块身份，兼容已有来源选择和收藏；旧导入副本不会重复显示。
- 元数据不进入播放、下载源列表。详情页可另选已安装的播放模块。
- 缺失资源会报告错误，不会回退到远程下载脚本。

## 构建与安装

[最新构建](https://github.com/quiteQa/shirox-bangumi/actions/workflows/shirox-metadata-build.yml) · [SwiftLint](https://github.com/quiteQa/shirox-bangumi/actions/workflows/shirox-metadata-lint.yml)

下载最新成功构建的 `metadata-Shirox_iOS` 产物，解压后自行签名安装 `Shirox-metadata-unsigned.ipa`。GitHub 产物下载需要登录，且有保留期限。旧的构建 40844088237 尚未内置资源，仍需手动导入模块。

## 完整补丁

[shirox-metadata.patch](shirox-metadata.patch) 基于上游 `398d36715b34a17ec68bfd52d792f7a2e7db06f5`，包含元数据宿主适配和内置资源。仅在上游原始源码上应用一次，不要对已经修改的 Fork 再次应用。

```bash
git clone https://github.com/xibrox/Shirox.git
cd Shirox
git checkout 398d36715b34a17ec68bfd52d792f7a2e7db06f5
git apply --check /path/to/shirox-metadata.patch
git apply /path/to/shirox-metadata.patch
open Shirox.xcodeproj
```

构建、签名遵循上游 BUILDING.txt 和 CLAUDE.md。内置脚本是本仓库的 0.3.0 版本；更新脚本需更新 App。

## 验证

内置脚本的 31 项离线 JavaScript 测试通过；Swift 语法、本地化、图标与资源登记检查通过。构建工作流验证四个平台、编译 iOS 测试目标，并检查生成的 IPA 内含配置和脚本且与源码一致。原生测试新增了资源读取、旧版本迁移、去重与配置切换覆盖。

XCTest 没有执行，尚未真机验证。上游 libzstd / AppIntents 构建警告仍可能存在。CI 使用 bash pipefail，避免日志管道掩盖编译失败。
