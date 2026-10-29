# Bangumi 动画元数据

版本：**0.2.0** · [GitHub 仓库](https://github.com/quiteQa/shirox-bangumi) · [元数据字段说明](docs/METADATA.md)

从 bgm.tv 读取动画元数据，供加载本脚本的插件或自定义宿主调用。主要提供中文与原文标题、别名、封面、简介、首播日期、评分、标签、制作公司、导演及剧集信息。公开动画元数据无需登录。

**本版本提供插件内可调用的接口。原版 Shirox 不会因为导入这个模块，就自动将首页、搜索和详情页的数据源切换到 Bangumi。**

## 直接调用元数据接口

在已加载 `bangumi.js` 的 JavaScript 环境中：

```javascript
async function readAnimeMetadata() {
    // 返回对象；支持 Bangumi subject ID、bgm:ID 或已知域名的 HTTPS 条目地址。
    var anime = await Bangumi.getMetadata(400602);

    // 返回元数据摘要数组，不为每个搜索结果额外请求详情。
    var matches = await Bangumi.searchMetadata('葬送的芙莉莲');

    // 返回正片的章节 ID、两种集数编号、标题、简介、播出日期和时长。
    var episodes = await Bangumi.getEpisodeMetadata(400602);

    return { anime: anime, matches: matches, episodes: episodes };
}
```

独立网络环境需提供标准 `fetch`；Shirox 中使用宿主的 `fetchv2`。脚本无第三方运行时依赖。

## JSON 字符串入口

通过 Shirox 风格 JS 桥接调用时，使用以下全局函数。它们返回 **JSON 字符串**，调用方应解析一次：

| 函数 | JSON 解析后的结果 |
| --- | --- |
| `extractMetadata(subjectIdOrUrl)` | 一个完整的动画条目元数据对象 |
| `searchMetadata(keyword)` | 动画元数据摘要数组 |
| `extractEpisodeMetadata(subjectIdOrUrl)` | 正片剧集元数据数组 |

```javascript
async function readFromBridge() {
    var anime = JSON.parse(await extractMetadata('https://bgm.tv/subject/400602'));
    return { title: anime.title, poster: anime.poster, score: anime.rating.score };
}
```

评分保留 Bangumi 的 **10 分制**；缺失字段使用 `null` 或空数组，不根据首播日期猜测完结状态。Bangumi 的社区标签保留为 `tags`，不冒充严格的题材分类。字段、单位及空值规则见 [METADATA.md](docs/METADATA.md)。

## 在 Shirox 中通过 URL 导入

复制下面的地址到 **Shirox → Settings（设置）→ Modules（模块）** 的添加模块 URL 输入框：

```text
https://raw.githubusercontent.com/quiteQa/shirox-bangumi/main/bangumi.json
```

清单使用完整 HTTPS 脚本地址。若自动检测提示没有播放流，选择 **Keep（保留）**：bgm.tv 提供元数据，不提供视频流。

当前 Shirox 普通模块只会调用以下兼容入口：

| 入口 | 原版 Shirox 可使用的数据 |
| --- | --- |
| `searchResults(keyword)` | 标题、封面、条目链接 |
| `extractDetails(subjectIdOrUrl)` | 简介、别名、日期；评分以简介文字展示 |
| `extractEpisodes(subjectIdOrUrl)` | 正片集数与章节链接 |
| `extractStreamUrl()` | 明确提示 bgm.tv 没有视频流 |

`extractDetails` 还返回嵌套的 `metadata` 对象，但原版 Shirox 的解析器会忽略这个额外字段；新增的三个结构化入口也需要调用方主动调用。它们不是 Shirox 已有的官方元数据扩展协议。

模块清单仍使用 Shirox 能识别的 `type: "anime"`，没有虚构 `type: "metadata"` 来绕过宿主限制。

## 从文件导入

1. 下载 `bangumi.js` 和 `bangumi.json`。
2. 打开 Shirox → Settings → Modules → **Import from Files**。
3. Script 选择 `bangumi.js`，Manifest 选择 `bangumi.json`，然后添加。
4. 如果播放流检测失败，选择 Keep。

旧版 Shirox 若没有从文件导入入口，可使用上面的 URL 导入方式。更换播放源不会自动让那个播放源调用本模块的元数据接口。

## 元数据字段

| 字段 | 内容 |
| --- | --- |
| `source` / `id` / `url` | 数据来源、Bangumi 条目 ID、原条目链接 |
| `title` / `titles` / `aliases` | 优先中文标题、中文与原文标题、去重后的别名 |
| `poster` / `images` | 推荐封面及各尺寸封面地址 |
| `description` | 纯剧情简介；不混入评分说明 |
| `releaseDate` / `year` / `format` | 首播日期、年份、TV/剧场版等平台原值 |
| `episodeCount` / `totalEpisodes` | API 给出的正片数量及总集数；分别保留 |
| `rating` | 评分、10 分制、排名、评分人数 |
| `tags` / `studios` / `directors` | 社区标签、条目信息中的动画制作公司和导演 |

剧集元数据提供 `id`、`subjectId`、`number`、`episodeNumber`、`title`、`originalTitle`、`description`、`airdate`、`duration`、`durationSeconds` 和 `url`。只列正片，自动获取全部分页。

## 原有查询与追踪 API

保留 0.1.0 的收藏查询和手动追踪 API，供已有调用者使用。它们不会被元数据读取过程触发：

- `Bangumi.getCollections(username, { type, limit, offset })`：分页读取公开动画收藏。
- `Bangumi.getCollection(username, subjectId)`：读取单个收藏。
- `Bangumi.setCollection(subjectId, change)`：需要 Token，手动修改明确传入的收藏类型、评分等字段。
- `Bangumi.setEpisodeState(subjectId, episodeIds, state)`：需要 Token，校验章节归属后修改明确的正片章节 ID。

普通模块搜索仍支持 `bgm:400602`、`在看 用户名`、`想看 用户名`、`看过 用户名`、`收藏 用户名` 等查询。用户名不是昵称。

Token 由自定义宿主在本机通过 `Bangumi.configure({ accessToken: token })` 注入，默认留空。不要将个人 Token 写入公开脚本；本版本没有账号登录界面或自动追番同步。

## 自定义托管

需要托管到自己的 HTTPS 目录时：

```bash
npm run package -- https://your-host.example/shirox-bangumi/
```

上传生成的 `dist/bangumi.json` 和 `dist/bangumi.js`。打包器会改写脚本地址，并拒绝打包配置了用户名或 Token 的脚本。示例域名不是可用地址。

## 验证与范围

无需安装依赖：

```bash
npm test
npm run test:live
```

30 项离线测试覆盖元数据字段、评分量纲、日期与缺失值、两种剧集编号、搜索摘要、兼容入口、分页、错误处理及模拟写入。联网测试只读取公开 API，验证《葬送的芙莉莲》及其 28 集正片的结构化元数据。

验证环境为 Node VM、模拟的 Shirox 网络桥和真实 Bangumi API；没有在 iPhone/macOS Shirox 客户端内运行，也没有修改 Shirox 的原生 Provider。

## 接口依据

- [Bangumi v0 OpenAPI](https://github.com/bangumi/api/blob/master/open-api/v0.yaml)
- [Bangumi User-Agent 要求](https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md)
- [Shirox 模块详情解析器](https://github.com/xibrox/Shirox/blob/398d36715b34a17ec68bfd52d792f7a2e7db06f5/Shirox/Services/JSEngine%2BDetails.swift)
- [Shirox 原生 MediaProvider](https://github.com/xibrox/Shirox/blob/398d36715b34a17ec68bfd52d792f7a2e7db06f5/Shirox/Protocols/MediaProvider.swift)
