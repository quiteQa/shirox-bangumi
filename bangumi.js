/* Shirox Bangumi metadata module 0.2.0. No dependencies; JavaScriptCore compatible.
 * bgm.tv is a metadata/tracking service and provides no video streams.
 * Edit the config below locally, or call Bangumi.configure() from a custom host.
 */
var BGM_CONFIG = {
    username: '',
    accessToken: '',
    userAgent: 'quiteQa/ShiroxBangumi/0.2.0 (https://github.com/quiteQa/shirox-bangumi)',
    searchLimit: 25
};

var Bangumi = (function () {
    'use strict';
    var API = 'https://api.bgm.tv/v0';
    var SITE = 'https://bgm.tv';
    var STATUS = { '想看': 1, '看过': 2, '在看': 3, '搁置': 4, '抛弃': 5 };

    function fail(message) { throw new Error('[Bangumi] ' + message); }
    function positiveId(value) {
        var s = String(value == null ? '' : value).trim();
        if (!/^[1-9]\d*$/.test(s) || !Number.isSafeInteger(Number(s))) fail('无效的 Bangumi ID。');
        return Number(s);
    }
    function subjectId(value) {
        var s = String(value == null ? '' : value).trim();
        var m = s.match(/^https:\/\/(?:bgm\.tv|bangumi\.tv|chii\.in)\/subject\/([1-9]\d*)\/?(?:[?#].*)?$/i)
            || s.match(/^(?:bgm:|subject:)([1-9]\d*)$/i);
        return positiveId(m ? m[1] : s);
    }
    function integer(value, min, max, name) {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
            fail(name + ' 必须是 ' + min + '–' + max + ' 的整数。');
        }
        return value;
    }
    function configure(options) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) fail('配置必须是对象。');
        var allowed = ['username', 'accessToken', 'userAgent', 'searchLimit'];
        var next = {};
        allowed.forEach(function (key) { next[key] = BGM_CONFIG[key]; });
        Object.keys(options).forEach(function (key) {
            if (allowed.indexOf(key) === -1) fail('未知配置项：' + key);
            if (key === 'searchLimit') next[key] = integer(options[key], 1, 50, 'searchLimit');
            else {
                if (typeof options[key] !== 'string' || /[\r\n]/.test(options[key])) fail('无效配置：' + key);
                next[key] = options[key].trim();
            }
        });
        if (!next.userAgent) fail('请设置带开发者标识及应用版本的 User-Agent。');
        allowed.forEach(function (key) { BGM_CONFIG[key] = next[key]; });
        // Deliberately do not return or log credentials.
        return { username: next.username, authenticated: !!next.accessToken };
    }
    function query(values) {
        return Object.keys(values).filter(function (k) { return values[k] !== undefined; })
            .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(values[k])); }).join('&');
    }
    async function request(path, method, body, authenticated) {
        // Every URL is constructed here. Tokens never go to subject/image/video hosts.
        if (typeof path !== 'string' || path.charAt(0) !== '/' || path.indexOf('://') !== -1) fail('无效 API 路径。');
        var token = String(BGM_CONFIG.accessToken || '').trim();
        if (authenticated && !token) fail('此操作需要 Bangumi Access Token；请仅在本机配置。');
        var headers = { 'Accept': 'application/json', 'User-Agent': BGM_CONFIG.userAgent };
        if (token) headers.Authorization = 'Bearer ' + token;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        var response;
        try {
            if (typeof fetchv2 === 'function') {
                response = await fetchv2(API + path, headers, method || 'GET', body === undefined ? null : JSON.stringify(body));
            } else if (typeof fetch === 'function') {
                var options = { method: method || 'GET', headers: headers };
                if (body !== undefined) options.body = JSON.stringify(body);
                response = await fetch(API + path, options);
            } else fail('宿主未提供 fetchv2 / fetch 网络接口。');
        } catch (_) { fail('网络请求失败，请检查 api.bgm.tv 是否可访问。'); }
        if (!response || typeof response.status !== 'number') fail('宿主返回了无效的 HTTP 响应。');
        var status = response.status;
        if (status < 200 || status >= 300) {
            var reasons = {
                401: 'Token 无效或已过期。', 403: '没有权限访问此内容。',
                404: '条目、用户或收藏不存在，或收藏不可见。', 429: '请求过于频繁，请稍后重试。'
            };
            // Do not echo response bodies/transport errors: they may contain credentials.
            fail('HTTP ' + status + '：' + (reasons[status] || 'Bangumi API 请求失败。'));
        }
        if (status === 204) return null;
        try {
            return typeof response.json === 'function' ? await response.json() : JSON.parse(await response.text());
        } catch (_) { fail('Bangumi API 返回了无效 JSON。'); }
    }
    function pageData(page) {
        if (!page || !Array.isArray(page.data)) fail('Bangumi API 分页格式发生变化。');
        return page.data;
    }
    async function paged(path, params) {
        var offset = 0, output = [], seen = Object.create(null);
        // 200 x 200 covers long-running series, while bounding broken pagination.
        for (var count = 0; count < 200; count++) {
            params.offset = offset;
            var page = await request(path + '?' + query(params));
            var rows = pageData(page);
            var fresh = 0;
            rows.forEach(function (row) {
                var id = positiveId(row.id);
                if (!seen[id]) { seen[id] = true; output.push(row); fresh++; }
            });
            var next = offset + rows.length;
            if (!rows.length) {
                if (typeof page.total === 'number' && offset < page.total) fail('API 在分页结束前返回了空列表。');
                return output;
            }
            if (!fresh) fail('API 重复返回同一分页，已停止以避免无限请求。');
            if (typeof page.total === 'number' && next >= page.total) return output;
            if (typeof page.total !== 'number' && rows.length < params.limit) return output;
            offset = next;
        }
        fail('分页超过安全上限，未返回不完整的剧集列表。');
    }
    function isAnime(item) { return item && item.type === 2 && item.nsfw !== true; }
    function searchItem(item) {
        var id = positiveId(item.id), images = item.images || {};
        return {
            title: text(item.name_cn) || text(item.name) || ('Bangumi #' + id),
            image: images.large || images.common || images.medium || images.small || '',
            href: SITE + '/subject/' + id
        };
    }
    async function getSubject(value) {
        var item = await request('/subjects/' + subjectId(value));
        if (!isAnime(item)) fail('此模块仅支持非成人动画条目。');
        return item;
    }
    async function searchSubjects(keyword) {
        keyword = String(keyword == null ? '' : keyword).trim();
        if (!keyword) return [];
        if (/^(?:bgm:|subject:|https:\/\/(?:bgm\.tv|bangumi\.tv|chii\.in)\/subject\/)/i.test(keyword)) {
            return [await getSubject(keyword)];
        }
        var command = keyword.match(/^(想看|看过|在看|搁置|抛弃|收藏)(?:\s+(.+))?$/);
        if (command) {
            var username = (command[2] || BGM_CONFIG.username || '').trim();
            if (!username) fail('请先设置 BGM_CONFIG.username，或搜索“在看 用户名”。');
            var page = await getCollections(username, { type: STATUS[command[1]], limit: BGM_CONFIG.searchLimit });
            return page.data.map(function (entry) { return entry.subject; }).filter(isAnime);
        }
        var result = await request('/search/subjects?' + query({ limit: BGM_CONFIG.searchLimit, offset: 0 }), 'POST', {
            keyword: keyword, sort: 'match', filter: { type: [2], nsfw: false }
        });
        return pageData(result).filter(isAnime);
    }
    async function search(keyword) { return (await searchSubjects(keyword)).map(searchItem); }
    function aliasList(item) {
        var names = [item.name, item.name_cn];
        (Array.isArray(item.infobox) ? item.infobox : []).forEach(function (field) {
            if (!field || field.key !== '别名') return;
            if (typeof field.value === 'string') names.push(field.value);
            else if (Array.isArray(field.value)) field.value.forEach(function (x) {
                if (x && typeof x.v === 'string') names.push(x.v);
            });
        });
        return names.map(function (x) { return text(x); })
            .filter(function (x, i, all) { return x && all.indexOf(x) === i; });
    }
    function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
    function count(value) { return Number.isSafeInteger(value) && value > 0 ? value : null; }
    function date(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        var parsed = new Date(value + 'T00:00:00Z');
        return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
    }
    function fieldValues(item, key) {
        var output = [];
        (Array.isArray(item.infobox) ? item.infobox : []).forEach(function (field) {
            if (!field || field.key !== key) return;
            var values = Array.isArray(field.value) ? field.value.map(function (v) { return v && v.v; }) : [field.value];
            values.forEach(function (v) { if (text(v) && output.indexOf(v.trim()) === -1) output.push(v.trim()); });
        });
        return output;
    }
    function metadata(item, detailLevel) {
        var id = positiveId(item.id), images = item.images || {}, rating = item.rating || {};
        var score = typeof rating.score === 'number' ? rating.score : item.score;
        var rank = rating.rank || item.rank, releaseDate = date(item.date);
        var tags = (Array.isArray(item.tags) ? item.tags : []).map(function (tag) {
            return text(typeof tag === 'string' ? tag : tag && tag.name);
        }).filter(function (tag, i, all) { return tag && all.indexOf(tag) === i; });
        return {
            schemaVersion: 1,
            source: 'bangumi',
            id: id,
            url: SITE + '/subject/' + id,
            detailLevel: detailLevel,
            type: 'ANIME',
            title: text(item.name_cn) || text(item.name) || ('Bangumi #' + id),
            titles: { chinese: text(item.name_cn), original: text(item.name) },
            aliases: aliasList(item),
            description: text(item.summary) || text(item.short_summary) || '',
            poster: text(images.large) || text(images.common) || text(images.medium) || text(images.small) || text(item.image),
            images: {
                large: text(images.large), common: text(images.common), medium: text(images.medium),
                small: text(images.small), grid: text(images.grid)
            },
            format: text(item.platform),
            releaseDate: releaseDate,
            year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
            episodeCount: count(item.eps),
            totalEpisodes: count(item.total_episodes),
            // Bangumi tags are community labels, not a strict genre taxonomy.
            tags: tags,
            studios: fieldValues(item, '动画制作'),
            directors: fieldValues(item, '导演'),
            rating: {
                score: typeof score === 'number' && isFinite(score) && score > 0 && score <= 10 ? score : null,
                scale: 10,
                rank: count(rank),
                votes: Number.isSafeInteger(rating.total) && rating.total >= 0 ? rating.total : null
            }
        };
    }
    async function getMetadata(value) { return metadata(await getSubject(value), 'subject'); }
    async function searchMetadata(keyword) {
        return (await searchSubjects(keyword)).map(function (item) { return metadata(item, 'search'); });
    }
    async function details(value) {
        var item = await getMetadata(value), info = [];
        if (item.rating.score !== null) info.push('Bangumi 评分：' + item.rating.score + '/10');
        if (item.rating.rank !== null) info.push('排名：#' + item.rating.rank);
        if (item.episodeCount !== null) info.push('正片集数：' + item.episodeCount);
        if (item.format) info.push('类型：' + item.format);
        if (item.description) info.push(item.description);
        info.push('此模块展示 Bangumi 条目数据；bgm.tv 不提供视频流。');
        return [{ description: info.join('\n\n'), aliases: item.aliases.join(' / '), airdate: item.releaseDate || '', metadata: item }];
    }
    async function getEpisodes(value) {
        var id = subjectId(value);
        // Validate the subject type before listing episodes (also covers direct ID callers).
        await getSubject(id);
        var rows = await paged('/episodes', { subject_id: id, type: 0, limit: 200 });
        return rows.filter(function (ep) { return ep.type === 0 && ep.subject_id === id; })
            .sort(function (a, b) { return a.sort - b.sort || a.id - b.id; });
    }
    async function episodes(value) {
        var rows = await getEpisodes(value);
        return rows.filter(function (ep) { return typeof ep.sort === 'number' && isFinite(ep.sort) && ep.sort > 0; })
            .map(function (ep) {
                return { number: ep.sort, href: SITE + '/ep/' + positiveId(ep.id) };
            });
    }
    async function getEpisodeMetadata(value) {
        var id = subjectId(value), rows = await getEpisodes(id);
        return rows.filter(function (ep) { return typeof ep.sort === 'number' && isFinite(ep.sort) && ep.sort > 0; })
            .map(function (ep) {
                return {
                    source: 'bangumi', id: positiveId(ep.id), subjectId: id,
                    number: ep.sort,
                    episodeNumber: typeof ep.ep === 'number' && isFinite(ep.ep) && ep.ep > 0 ? ep.ep : null,
                    title: text(ep.name_cn) || text(ep.name) || ('第 ' + ep.sort + ' 集'),
                    originalTitle: text(ep.name), description: text(ep.desc) || '',
                    airdate: date(ep.airdate), duration: text(ep.duration),
                    durationSeconds: count(ep.duration_seconds), url: SITE + '/ep/' + positiveId(ep.id)
                };
            });
    }
    function usernamePath(username) {
        if (typeof username !== 'string' || !username.trim() || /[\r\n]/.test(username)) fail('请输入 Bangumi 用户名。');
        return encodeURIComponent(username.trim());
    }
    async function getCollections(username, options) {
        options = options || {};
        var params = {
            subject_type: 2,
            limit: integer(options.limit === undefined ? 50 : options.limit, 1, 50, 'limit'),
            offset: integer(options.offset === undefined ? 0 : options.offset, 0, 1000000, 'offset')
        };
        if (options.type !== undefined) params.type = integer(options.type, 1, 5, '收藏类型');
        var page = await request('/users/' + usernamePath(username) + '/collections?' + query(params));
        pageData(page);
        return page;
    }
    async function getCollection(username, value) {
        return request('/users/' + usernamePath(username) + '/collections/' + subjectId(value));
    }
    async function getMe() { return request('/me', 'GET', undefined, true); }
    async function setCollection(value, change) {
        var id = subjectId(value), payload = {};
        if (!change || typeof change !== 'object' || Array.isArray(change)) fail('收藏修改内容必须是对象。');
        Object.keys(change).forEach(function (key) {
            if (key === 'type') payload.type = integer(change.type, 1, 5, '收藏类型');
            else if (key === 'rate') payload.rate = integer(change.rate, 0, 10, '评分');
            else if (key === 'comment' && typeof change.comment === 'string') payload.comment = change.comment;
            else if (key === 'private' && typeof change.private === 'boolean') payload.private = change.private;
            else if (key === 'tags' && Array.isArray(change.tags) && change.tags.every(function (t) {
                return typeof t === 'string' && t.length > 0 && !/\s/.test(t);
            })) payload.tags = change.tags.slice();
            else fail('不支持的收藏字段或字段值：' + key + '。动画进度请使用 setEpisodeState。');
        });
        if (!Object.keys(payload).length) fail('没有要修改的收藏字段。');
        // POST upserts; omitted fields are preserved by the API. No progress guesses.
        return request('/users/-/collections/' + id, 'POST', payload, true);
    }
    async function setEpisodeState(value, episodeIds, state) {
        var id = subjectId(value);
        integer(state, 0, 3, '章节状态');
        if (!Array.isArray(episodeIds) || !episodeIds.length || episodeIds.length > 100) fail('每次需提供 1–100 个明确的章节 ID。');
        var ids = episodeIds.map(positiveId).filter(function (x, i, all) { return all.indexOf(x) === i; });
        if (!BGM_CONFIG.accessToken) fail('修改进度需要 Bangumi Access Token。');
        // Validate membership before mutating anything. Episode numbers are not API IDs.
        var rows = await getEpisodes(id);
        var allowed = Object.create(null);
        rows.forEach(function (ep) { allowed[ep.id] = true; });
        if (ids.some(function (ep) { return !allowed[ep]; })) fail('章节 ID 不属于该动画的正片列表，未修改任何进度。');
        return request('/users/-/collections/' + id + '/episodes', 'PATCH', { episode_id: ids, type: state }, true);
    }
    return {
        configure: configure, search: search, details: details, episodes: episodes,
        searchMetadata: searchMetadata, getMetadata: getMetadata, getEpisodeMetadata: getEpisodeMetadata,
        getSubject: getSubject, getEpisodes: getEpisodes,
        getCollections: getCollections, getCollection: getCollection, getMe: getMe,
        setCollection: setCollection, setEpisodeState: setEpisodeState
    };
})();

// Shirox / Sora entry points: host expects stringified JSON.
async function searchResults(keyword) { return JSON.stringify(await Bangumi.search(keyword)); }
async function extractDetails(url) { return JSON.stringify(await Bangumi.details(url)); }
async function extractEpisodes(url) { return JSON.stringify(await Bangumi.episodes(url)); }
// Structured metadata entry points for hosts that explicitly implement this contract.
// Unmodified Shirox does not call these automatically.
async function searchMetadata(keyword) { return JSON.stringify(await Bangumi.searchMetadata(keyword)); }
async function extractMetadata(url) { return JSON.stringify(await Bangumi.getMetadata(url)); }
async function extractEpisodeMetadata(url) { return JSON.stringify(await Bangumi.getEpisodeMetadata(url)); }
async function extractStreamUrl() {
    throw new Error('[Bangumi] bgm.tv 不提供视频流；请切换到播放源。此模块不会把网页地址伪装成视频链接。');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Bangumi: Bangumi, searchResults: searchResults, extractDetails: extractDetails,
        extractEpisodes: extractEpisodes, extractStreamUrl: extractStreamUrl,
        searchMetadata: searchMetadata, extractMetadata: extractMetadata, extractEpisodeMetadata: extractEpisodeMetadata
    };
}
