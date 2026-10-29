# 元数据接口 v1

这些接口由本项目定义，供已加载 `bangumi.js` 的调用方使用。它们不是原版 Shirox 已实现的元数据插件协议。

## 调用方式

| 对象接口 | JSON 字符串入口 | 返回值 |
| --- | --- | --- |
| `Bangumi.getMetadata(value)` | `extractMetadata(value)` | 单个动画元数据对象 |
| `Bangumi.searchMetadata(keyword)` | `searchMetadata(keyword)` | 元数据摘要数组 |
| `Bangumi.getEpisodeMetadata(value)` | `extractEpisodeMetadata(value)` | 正片剧集元数据数组 |
| `Bangumi.browseMetadata(catalog, page)` | `browseMetadata(catalog, page)` | 排行或首播日期目录数组 |

对象接口返回 Promise，解析后直接得到对象或数组，不要再 `JSON.parse`。全局入口的 Promise 解析后得到 JSON 字符串，需要解析一次。

`value` 支持：

- 正整数 subject ID，例如 `400602` 或字符串 `"400602"`。
- `bgm:400602` / `subject:400602`。
- `https://bgm.tv/subject/400602`，以及 bangumi.tv / chii.in 对应的 HTTPS 条目地址。

`catalog` 只接受 `topRated`（官方 API 的 `sort=rank`）和 `newest`（`sort=date`）；每页 25 项，`page` 为 1–1000 的整数。最新首播是按条目播出日期排序，不声称是最近更新或正在播出。

此处传的是 **subject ID**，不是 episode ID、AniList ID 或 MAL ID。脚本不会把这些来源的同号 ID 当作同一个作品，也不会将名称搜索的第一项自动认作已匹配作品。

元数据接口不会修改收藏、评分或观看进度。公开数据无需 Token；配置 Token 时也只向固定的 `https://api.bgm.tv/v0` API 地址发送。

## 动画元数据对象

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `schemaVersion` | integer | 当前为 `1`，是此结构的版本，不是模块发布版本 |
| `source` | string | 固定为 `bangumi` |
| `id` | integer | Bangumi subject ID |
| `url` | string | 规范化的 bgm.tv 条目地址 |
| `detailLevel` | string | `subject` 表示条目详情接口；`search` 表示搜索或收藏列表入口 |
| `type` | string | 固定为 `ANIME`；仅接受 API `type=2` 的动画 |
| `title` | string | 中文标题优先，其次原文标题，缺失时用 `Bangumi #ID` |
| `titles.chinese` | string / null | 中文标题 |
| `titles.original` | string / null | 原文标题；不假定它一定是日语 |
| `aliases` | string[] | 中文名、原文名及 infobox 别名，去空格和重复项 |
| `description` | string | 纯简介；详情缺失时使用搜索摘要，再缺失则为空字符串 |
| `poster` | string / null | 推荐的封面地址；依次尝试 large、common、medium、small、image |
| `images` | object | large、common、medium、small、grid 各尺寸地址，缺失值为 null |
| `format` | string / null | API 的 platform 原值，例如 TV、剧场版；不擅自重分类 |
| `releaseDate` | string / null | 有效 YYYY-MM-DD 日期；未知或非法日期为 null |
| `year` | integer / null | 从有效 releaseDate 取得的年份 |
| `episodeCount` | integer / null | API `eps`，正片数量，非正整数为未知 |
| `totalEpisodes` | integer / null | API `total_episodes` 原值，可能与 eps 不同，不用它覆盖正片数量 |
| `tags` | string[] | 去重的社区标签；不宣称这些标签是严格的 genres 分类 |
| `studios` | string[] | infobox 的“动画制作”值；未知为空数组 |
| `directors` | string[] | infobox 的“导演”值；未知为空数组 |
| `rating.score` | number / null | 原始 10 分制评分，范围 (0, 10]；0 表示未评分，返回 null |
| `rating.scale` | integer | 固定为 10 |
| `rating.rank` | integer / null | 正整数排名；0 或缺失为 null |
| `rating.votes` | integer / null | 评分人数，0 是有效值；未知为 null |

搜索使用 API 的类型过滤并再次过滤非动画和被标记为成人的条目。默认最多 25 项，可在本机配置 `searchLimit` 为 1–50；这个接口不代表整个 Bangumi 库或完整用户收藏。

搜索结果不会逐项再请求详情，因此 studios、directors、format、totalEpisodes 等可能缺失。需要这些字段时，用所选结果的 `id` 再调用 `getMetadata`。没有提供推断的连载状态、虚构的背景图或自动转换后的其他站点 ID。

以下是字段使用示例，不是另一次网络请求：

```javascript
async function makeCard(subjectId) {
    var anime = await Bangumi.getMetadata(subjectId);
    return {
        key: anime.source + ':' + anime.id,
        title: anime.title,
        image: anime.poster,
        summary: anime.description,
        scoreLabel: anime.rating.score === null ? '暂无评分' : anime.rating.score + '/10'
    };
}
```

如宿主使用 100 分制，可在适配层把非空评分乘以 10；不要把 8.5 误当成 8.5/100。

## 剧集元数据对象

`getEpisodeMetadata` 自动获取全部分页，过滤并保留 `type=0` 正片，按 API 的 sort 排序。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `source` | string | bangumi |
| `id` | integer | Bangumi episode ID |
| `subjectId` | integer | 对应 subject ID |
| `number` | number | API sort，保留小数，用于同类型章节的展示排序 |
| `episodeNumber` | number / null | API ep，保留与 sort 的区别，不通过数组下标猜测 |
| `title` | string | 中文标题优先，其次原文标题，再缺失用“第 N 集” |
| `originalTitle` | string / null | 原文章节名 |
| `description` | string | 章节简介，缺失为空字符串 |
| `airdate` | string / null | 有效 YYYY-MM-DD 播出日期 |
| `duration` | string / null | API 原始时长文字，不假定格式统一 |
| `durationSeconds` | integer / null | API 提供的正整数秒数；0 表示不能解析，返回 null |
| `url` | string | bgm.tv 章节网页链接，**不是视频地址** |

number 与 episodeNumber 可能不同。章节 ID 更不能用这两个编号代替。SP、OP、ED 未混入本接口的正片列表。

## 与原版 Shirox 的关系

本项目保持 `searchResults`、`extractDetails`、`extractEpisodes` 三个原有模块入口兼容。

0.3.0 将清单类型设为 `metadata`。配套 Shirox 源码补丁实现了该类型的独立选择、元数据检查、首页目录、搜索和详情；原版 Shirox 仍不具备这些接入点。

`extractDetails` 仍返回一个数组，其中第一项包含 `description`、`aliases`、`airdate`；0.2.0 新增 `metadata` 嵌套对象，值与 `getMetadata` 相同。原版 `JSEngine+Details.swift` 只读取前面三个字段，会忽略 metadata；评分、标签和制作信息因此不会自动成为原生 UI 的独立字段。

自定义调用方应选择直接调用新的结构化入口，并将字段映射到自己的显示模型。其他播放模块与本模块不共享元数据调用关系，除非宿主明确实现这种连接。

## 错误语义

请求失败、条目类型不支持、HTTP 401/403/404/429、JSON 格式变化和异常分页会拒绝 Promise，不伪装成“查询成功但没有元数据”。空关键词搜索返回空数组。

API 限流后应由宿主适度重试；本模块不执行无限重试。缺失的某个字段与整个请求失败是两种不同情况，调用方可以保留上一份有效元数据，并向用户展示请求错误。
