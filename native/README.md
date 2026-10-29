# Shirox 元数据模块接入

[完整源码补丁](shirox-metadata.patch)，基于 xibrox/Shirox 的提交 `398d36715b34a17ec68bfd52d792f7a2e7db06f5`。

## 修改后的行为

- 元数据模块与动画播放模块分开选择；元数据检查不再获取视频流。
- 首页提供评分排行和最新首播，搜索与详情读取结构化元数据。
- 标题、封面、简介、评分、标签、导演、制作公司和剧集信息由模块提供。
- Bangumi ID 使用来源隔离的本地身份，不当作 AniList/MAL ID。
- 元数据卡片可存入本机资料库，再次打开仍进入元数据详情。
- “选择播放源”搜索安装的网站播放模块，由用户确认匹配结果。
- 选择元数据来源不会将其载入共享的播放 JavaScript 上下文，也不会将它列入下载源。

## 应用补丁

在 Mac 上准备上游所需的 Xcode 环境：

```bash
git clone https://github.com/xibrox/Shirox.git
cd Shirox
git checkout 398d36715b34a17ec68bfd52d792f7a2e7db06f5
git apply --check /path/to/shirox-metadata.patch
git apply /path/to/shirox-metadata.patch
open Shirox.xcodeproj
```

请将补丁路径换成本机真实路径。构建、签名遵循上游 BUILDING.txt 和 CLAUDE.md。安装修改后的 App 后，添加：

```text
https://raw.githubusercontent.com/quiteQa/shirox-bangumi/main/bangumi.json
```

旧版模块先刷新至 0.3.0，再重新检查，然后选择 Bangumi 作为元数据来源。

## 验证状态

插件 31 项测试及真实只读 API 测试通过，包括 28 集正片及两个各 25 项的目录。
原生源码在 Linux 环境完成了 Swift 语法、本地化、图标及工程结构检查；这些检查不等于 Xcode 编译或真机验证。
已提供 MetadataModuleTests，但本机没有 Xcode，尚未执行原生 XCTest。

提供 macOS 构建工作流验证四个 scheme，并在不启动模拟器的情况下编译测试目标。只有实际 Actions 构建成功后才会生成需要自行签名的 IPA。
