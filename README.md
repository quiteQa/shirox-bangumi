# Shirox Bangumi 番组计划模块

版本：0.1.0。基于 2026-10-29 查看的 Shirox `main` 模块接口与 Bangumi v0 API。

代码仓库：[quiteQa/shirox-bangumi](https://github.com/quiteQa/shirox-bangumi)。当前按私有仓库保存，登录有权限的 GitHub 账号后可下载代码。

这是支持 URL 和文件导入的 **bgm.tv 条目与公开收藏查询模块**，并附带可供宿主接入的收藏/章节修改 API。URL 导入需要清单和脚本可匿名访问。

## 能做什么

| 功能 | 本版本 |
| --- | --- |
| 动画搜索、中文标题、封面 | 可用，无需登录 |
| 详情、别名、评分、首播日期 | 可用，无需登录 |
| 正片剧集列表 | 可用，自动分页，保留 Bangumi 集数编号 |
| 按用户名查询公开动画收藏 | 可用，通过模块搜索命令或 API；不是导入 Shirox 资料库 |
| 收藏类型、评分修改 | 提供 `Bangumi.setCollection`，需 Token，Shirox 原版不会调用 |
| 标记明确的章节为看过等状态 | 提供 `Bangumi.setEpisodeState`，需 Token，Shirox 原版不会调用 |
| Bangumi 账号登录与自动同步 | **未接入**，需要修改 Shirox 原生源码 |
| 视频播放与下载 | **不提供**，bgm.tv 本身没有视频流 |

它不会替换 Shirox 首页的 AniList/MyAnimeList，也不会因你在另一个模块中看完一集而修改 Bangumi。

## URL 导入

模块清单已使用完整的 HTTPS 脚本地址。GitHub 安装链接为：

```text
https://raw.githubusercontent.com/quiteQa/shirox-bangumi/main/bangumi.json
```

**当前仓库为私有，上述链接尚不能被 Shirox 匿名读取。** 需要将仓库设为公开，或把模块文件放到可匿名访问的 HTTPS 地址。私有仓库的网页链接、登录 Cookie 和临时 Raw Token 不适合用作长期安装链接。

在清单及脚本可公开访问后：

1. 打开 Shirox → Settings（设置）→ Modules（模块）。
2. 在添加模块的 URL 输入框粘贴上面的 `bangumi.json` 链接，然后添加。
3. 如果自动检测提示没有播放流，选择 **Keep（保留）**。这是条目和收藏查询模块，bgm.tv 不提供视频流。

## 从文件安装

1. 解压，把 `bangumi.js` 和 `bangumi.json` 保存到设备的“文件”中。
2. 打开 Shirox → Settings（设置）→ Modules（模块）→ **Import from Files（从文件导入）**。
3. 在 Script 一栏选择 `bangumi.js`。
4. 在 Manifest 一栏选择 `bangumi.json`，填入名称、类型等信息。
5. 点击 Add。若自动检测报告“无法获取播放流”，选择 **Keep（保留）**：Shirox 的检测把“能播放视频”作为通过条件，而此模块是条目查询模块。

原版 Shirox 没有“元数据模块”分类，因此清单使用它支持的 `anime` 类型，播放入口会明确解释没有视频流。不要把检测失败误认为已实现播放功能。

此安装方式依据当前 `main` 中的 `ModuleImportView`；如果你安装的版本没有“从文件导入”，需更新到具备该功能的版本，或使用下文的 HTTPS 托管方式。

## 搜索用法

在支持直接搜索模块的入口中输入：

| 输入 | 结果 |
| --- | --- |
| `葬送的芙莉莲` / `Frieren` | 搜索动画条目 |
| `bgm:400602` | 直接打开这个 Bangumi 动画条目 |
| `https://bgm.tv/subject/400602` | 按条目地址查询；也接受 bangumi.tv / chii.in 的 HTTPS 条目地址 |
| `在看 sai` | 查询该用户的在看动画 |
| `想看 sai` / `看过 sai` / `搁置 sai` / `抛弃 sai` | 按收藏状态查询 |
| `收藏 sai` | 查询该用户所有状态的动画收藏，默认最多 25 项 |

`sai` 只是公开用户名示例，请换成你自己的 **用户名/ID，不是昵称**。

想简写为 `在看`，在 JS 顶部把 `BGM_CONFIG.username` 改成自己的用户名，再重新导入；也可以通过 Shirox 的脚本编辑器修改。

模块搜索结果最多 25 项，可在本机把 `searchLimit` 调到 1–50。需要完整收藏的调用者应使用 `getCollections` 的 `offset` 分页，不能把一页结果当作完整资料库。剧集列表会自动获取所有分页；只列 `type=0` 正片，不把 SP、OP、ED 混入进度。

## 收藏与进度 API：供宿主开发者接入

以下函数是 API 客户端能力，**原版 Shirox 没有调用它们的按钮或播放回调**。不能仅通过导入清单获得自动追番同步。

```javascript
// 在自定义宿主中由安全存储注入；这里的 token 变量需由调用者提供。
Bangumi.configure({
    username: 'your-bgm-username',
    accessToken: token,
    userAgent: 'your-developer-id/ShiroxBangumi/0.1.0 (private module)'
});

await Bangumi.getMe();
await Bangumi.getCollections('your-bgm-username', { type: 3, limit: 50, offset: 0 });
await Bangumi.getCollection('your-bgm-username', 400602);

// 只修改明确传入的字段，保留未传入的评分、评论、标签、私密状态。
await Bangumi.setCollection(400602, { type: 3 });
await Bangumi.setCollection(400602, { rate: 8 });

// 从 API 返回值中取得真实章节 ID；不能用“第 1 集”的数字 1 代替章节 ID。
var eps = await Bangumi.getEpisodes(400602);
var first = eps.find(function (ep) { return ep.sort === 1; });
if (first) await Bangumi.setEpisodeState(400602, [first.id], 2);
```

以上带 `set` 的示例会修改账号数据，只在用户明确触发操作时调用。交付和测试阶段未登录任何账号，也未向真实账号写入收藏、评分或进度。

收藏状态：`1` 想看、`2` 看过、`3` 在看、`4` 搁置、`5` 抛弃。

章节状态：`0` 未收藏、`1` 想看、`2` 看过、`3` 抛弃。

`setEpisodeState` 每次接受 1–100 个章节 ID，去重并验证它们属于该条目的正片，再调用官方 PATCH API。它不猜测你已看完前几集，也不会自动批量标记前面的集数。官方 API 会重算条目完成度；动画不能通过 `ep_status` 直接修改进度。

Token 可由你在本机的 https://next.bgm.tv/demo/access-token 创建。**不要把 Token 发到聊天或放进公开托管的 JS**；脚本中的 Token 会随导出、备份而暴露。本模块默认 Token 留空，日常公开查询不需要 Token。原生集成应把它放在 Keychain，按当前 Shirox 个人资料隔离，并仅向 `api.bgm.tv` 注入。

## 托管为 URL 模块

默认 `bangumi.json` 的 `scriptUrl` 已指向本仓库 `main` 分支的 `bangumi.js` 完整 HTTPS 地址；仓库公开后可直接使用上面的 GitHub 安装链接。从文件导入仍可选择本机的 JS 文件。

在有 Node.js 18+ 的电脑上，将目录 URL 换成你实际控制的 HTTPS 托管目录：

```bash
npm run package -- https://your-host.example/shirox-bangumi/
```

将生成的 `dist/bangumi.json`、`dist/bangumi.js` 放到该目录，再在 Shirox 中导入对应的 `bangumi.json` HTTPS 地址。打包器会检查本地配置，拒绝把含 Token 或用户名的脚本打成公开版本。

保留私有仓库时，应将打包后的两个文件放到可匿名访问的 HTTPS 地址。上面的示例域名不是可用安装链接。

## 验证

无需安装依赖：

```bash
npm test
npm run test:live
node test/live.cjs your-public-username
```

离线测试覆盖搜索契约、动画筛选、别名、剧集分页与排序、重复分页、错误提示、Token 错误信息脱敏、收藏字段校验，以及章节 ID 校验后的写入请求。写入测试使用假 Token 和模拟网络。

联网测试只调用搜索、详情、剧集及可选的公开收藏查询。2026-10-29 实测《葬送的芙莉莲》条目 `400602`：搜索成功、首播日期正确、正片列表 28 集。

验证范围：Node VM 中的 Shirox `fetchv2` 接口模拟及真实 Bangumi HTTP API。**未在 iPhone/macOS 的 Shirox 客户端或 JavaScriptCore 中实测；未验证真实 Token 的写入权限。**

## 原生自动同步的接入边界

若要真正实现“播放后自动同步到 bgm.tv”，还需修改宿主：

- 用 Keychain 和个人资料隔离实现 Token 登录、退出与账号状态。
- 建立 AniList/MAL/播放源条目与 Bangumi subject ID 的人工可确认映射，避免同名作品或不同季度误配。
- 接入实际的完成观看事件，使用明确的 Bangumi episode ID 写入；不能在解析播放链接或预加载时写入。
- 将收藏及进度读取接入资料库，处理离线队列、失败重试、重新观看和冲突。当前模块不会冒充这些功能已经完成。

## 接口依据

- [Shirox 模块模型](https://github.com/xibrox/Shirox/blob/398d36715b34a17ec68bfd52d792f7a2e7db06f5/Shirox/Models/ModuleDefinition.swift)
- [Shirox 文件导入](https://github.com/xibrox/Shirox/blob/398d36715b34a17ec68bfd52d792f7a2e7db06f5/Shirox/Views/ModuleImportView.swift)
- [Shirox 模块检测](https://github.com/xibrox/Shirox/blob/398d36715b34a17ec68bfd52d792f7a2e7db06f5/Shirox/Services/ModuleCheck.swift)
- [Shirox 追踪服务类型](https://github.com/xibrox/Shirox/blob/398d36715b34a17ec68bfd52d792f7a2e7db06f5/Shirox/Models/Media.swift)
- [Bangumi v0 OpenAPI](https://github.com/bangumi/api/blob/master/open-api/v0.yaml)
- [Bangumi User-Agent 要求](https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md)
