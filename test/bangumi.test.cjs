const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '..', 'bangumi.js'), 'utf8');
const subject = {
  id: 400602, type: 2, name: '葬送のフリーレン', name_cn: '葬送的芙莉莲',
  date: '2023-09-29', eps: 28, summary: '一段新的旅程。', platform: 'TV',
  images: { large: 'https://lain.bgm.tv/example.jpg' }, rating: { score: 8.5, rank: 43 },
  infobox: [{ key: '别名', value: [{ v: 'Frieren' }, { v: '葬送的芙莉莲' }] }]
};
function episode(id, sort, extra = {}) { return { id, sort, ep: sort, subject_id: 400602, type: 0, ...extra }; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function harness(handler) {
  const calls = [];
  const ctx = vm.createContext({ fetchv2: async (url, headers, method, body) => {
    const call = { url, headers: clone(headers), method, body: body == null ? null : JSON.parse(body) };
    calls.push(call);
    const result = await handler(call, calls.length);
    const status = result.status || 200;
    return { status, json: async () => clone(result.data), text: async () => JSON.stringify(result.data) };
  } });
  vm.runInContext(script, ctx, { timeout: 1000 });
  return { ctx, api: ctx.Bangumi, calls };
}
function defaultHandler(call) {
  if (call.url.includes('/subjects/400602')) return { data: subject };
  if (call.url.includes('/episodes?')) return { data: { total: 2, data: [episode(10, 1), episode(11, 2)] } };
  return { data: { total: 1, data: [subject] } };
}

test('Shirox search uses Chinese titles, canonical links and explicit animation filters', async () => {
  const h = harness(defaultHandler);
  assert.deepEqual(JSON.parse(await h.ctx.searchResults('芙莉莲')), [{
    title: subject.name_cn, image: subject.images.large, href: 'https://bgm.tv/subject/400602'
  }]);
  assert.equal(h.calls[0].method, 'POST');
  assert.deepEqual(h.calls[0].body.filter, { type: [2], nsfw: false });
  assert.equal(h.calls[0].headers.Authorization, undefined);
});
test('empty searches make no requests', async () => {
  const h = harness(() => { throw Error('must not fetch'); });
  assert.equal(await h.ctx.searchResults('  '), '[]');
  assert.equal(h.calls.length, 0);
});
test('direct IDs accept known Bangumi domains and prefixes', async () => {
  const h = harness(defaultHandler);
  for (const input of ['bgm:400602', 'https://bangumi.tv/subject/400602?foo=bar', 'https://chii.in/subject/400602/']) {
    assert.equal((await h.api.search(input))[0].href, 'https://bgm.tv/subject/400602');
  }
  assert.ok(h.calls.every(c => c.url === 'https://api.bgm.tv/v0/subjects/400602'));
});
test('invalid and foreign-host IDs are rejected before any request', async () => {
  const h = harness(defaultHandler);
  for (const id of ['https://bgm.tv.evil.test/subject/400602', 'https://evil.test/400602', '400602/../me', 0, -1, '1.5', '9007199254740992']) {
    await assert.rejects(h.api.getSubject(id), /无效的 Bangumi ID/);
  }
  assert.equal(h.calls.length, 0);
});
test('search filters non-animation and adult results returned by upstream', async () => {
  const h = harness(() => ({ data: { data: [subject, { ...subject, type: 1 }, { ...subject, nsfw: true }] } }));
  assert.equal((await h.api.search('frieren')).length, 1);
});
test('non-animation direct lookups fail explicitly', async () => {
  const h = harness(() => ({ data: { ...subject, type: 1 } }));
  await assert.rejects(h.api.getSubject(400602), /动画条目/);
});
test('details match the Shirox contract and preserve aliases, rating and airdate', async () => {
  const h = harness(defaultHandler);
  const [d] = JSON.parse(await h.ctx.extractDetails('bgm:400602'));
  assert.equal(d.airdate, '2023-09-29');
  assert.match(d.aliases, /Frieren/);
  assert.equal(d.aliases.split(subject.name_cn).length, 2);
  assert.match(d.description, /8\.5\/10/);
  assert.match(d.description, /不提供视频流/);
});
test('episode pagination sorts Bangumi numbering, removes specials, and uses episode IDs', async () => {
  const h = harness(call => {
    if (call.url.includes('/subjects/')) return { data: subject };
    const offset = Number(new URL(call.url).searchParams.get('offset'));
    return { data: { total: 4, data: offset === 0
      ? [episode(12, 12, { ep: 2 }), episode(10, 1)]
      : [episode(11, 2), episode(13, 1, { type: 1 })] } };
  });
  assert.deepEqual(JSON.parse(await h.ctx.extractEpisodes('400602')), [
    { number: 1, href: 'https://bgm.tv/ep/10' },
    { number: 2, href: 'https://bgm.tv/ep/11' },
    { number: 12, href: 'https://bgm.tv/ep/12' }
  ]);
  assert.ok(h.calls[2].url.includes('offset=2'));
});
test('repeating pages fail instead of silently truncating or looping forever', async () => {
  const h = harness(call => call.url.includes('/subjects/') ? { data: subject }
    : { data: { total: 4, data: [episode(10, 1), episode(11, 2)] } });
  await assert.rejects(h.api.getEpisodes(400602), /重复返回/);
  assert.equal(h.calls.length, 3);
});
test('prematurely empty pages fail instead of returning incomplete episodes', async () => {
  const h = harness(call => call.url.includes('/subjects/') ? { data: subject } : { data: { total: 4, data: [] } });
  await assert.rejects(h.api.getEpisodes(400602), /分页结束前/);
});
test('collect commands allow configured or explicitly supplied usernames and status mapping', async () => {
  const h = harness(() => ({ data: { data: [{ subject }], total: 1 } }));
  h.api.configure({ username: 'my-user' });
  assert.equal((await h.api.search('在看'))[0].title, subject.name_cn);
  assert.match(h.calls[0].url, /users\/my-user\/collections/);
  assert.equal(new URL(h.calls[0].url).searchParams.get('type'), '3');
  await h.api.search('收藏 other-user');
  assert.match(h.calls[1].url, /users\/other-user\/collections/);
  assert.equal(new URL(h.calls[1].url).searchParams.get('type'), null);
});
test('collection pagination is explicit and does not imply a full library import', async () => {
  const h = harness(() => ({ data: { data: [], total: 500 } }));
  await h.api.getCollections('a/b', { offset: 50, limit: 25, type: 2 });
  assert.match(h.calls[0].url, /users\/a%2Fb\/collections/);
  assert.equal(new URL(h.calls[0].url).searchParams.get('offset'), '50');
});
test('collection commands with no username report configuration error', async () => {
  const h = harness(defaultHandler);
  await assert.rejects(h.api.search('在看'), /username/);
  assert.equal(h.calls.length, 0);
});
test('token configuration is not returned and API errors never echo secrets', async () => {
  const secret = 'test-only-not-a-real-token';
  const h = harness(() => ({ status: 401, data: { token: secret } }));
  assert.deepEqual(clone(h.api.configure({ accessToken: secret })), { username: '', authenticated: true });
  await assert.rejects(h.api.getMe(), e => e.message.includes('401') && !e.message.includes(secret));
  assert.equal(h.calls[0].headers.Authorization, 'Bearer ' + secret);
  assert.ok(h.calls.every(c => new URL(c.url).origin === 'https://api.bgm.tv'));
});
test('transport errors are sanitized', async () => {
  const h = harness(() => { throw Error('Authorization: Bearer secret'); });
  await assert.rejects(h.api.search('frieren'), e => /网络请求失败/.test(e.message) && !/secret/.test(e.message));
});
test('HTTP 429 and schema changes are explicit errors', async () => {
  const rate = harness(() => ({ status: 429, data: {} }));
  await assert.rejects(rate.api.search('frieren'), /429/);
  const schema = harness(() => ({ data: { results: [] } }));
  await assert.rejects(schema.api.search('frieren'), /分页格式/);
});
test('write helpers require a token and are never called by Shirox entry points', async () => {
  const h = harness(defaultHandler);
  await assert.rejects(h.api.setCollection(400602, { type: 3 }), /Access Token/);
  await assert.rejects(h.api.setEpisodeState(400602, [10], 2), /Access Token/);
  assert.equal(h.calls.length, 0);
});
test('collection updates use upsert and preserve omitted fields', async () => {
  const h = harness(() => ({ status: 204 }));
  h.api.configure({ accessToken: 'test-only' });
  assert.equal(await h.api.setCollection(400602, { type: 3, rate: 8 }), null);
  assert.equal(h.calls[0].method, 'POST');
  assert.deepEqual(h.calls[0].body, { type: 3, rate: 8 });
  assert.match(h.calls[0].url, /users\/-\/collections\/400602$/);
});
test('invalid ratings, statuses and ep_status writes fail before touching the network', async () => {
  const h = harness(defaultHandler);
  h.api.configure({ accessToken: 'test-only' });
  for (const payload of [{ rate: 11 }, { rate: 1.2 }, { type: 6 }, { ep_status: 3 }, { tags: ['two words'] }, {}]) {
    await assert.rejects(h.api.setCollection(400602, payload));
  }
  assert.equal(h.calls.length, 0);
});
test('episode writes use confirmed IDs and reject IDs belonging to other subjects', async () => {
  const h = harness(call => call.method === 'PATCH' ? { status: 204 } : defaultHandler(call));
  h.api.configure({ accessToken: 'test-only' });
  await assert.rejects(h.api.setEpisodeState(400602, [99], 2), /不属于/);
  assert.equal(h.calls.filter(c => c.method === 'PATCH').length, 0);
  assert.equal(await h.api.setEpisodeState(400602, [10, 10, 11], 2), null);
  const write = h.calls.find(c => c.method === 'PATCH');
  assert.deepEqual(write.body, { episode_id: [10, 11], type: 2 });
  assert.match(write.url, /collections\/400602\/episodes$/);
});
test('the module never advertises Bangumi HTML as a playable stream', async () => {
  const h = harness(defaultHandler);
  await assert.rejects(h.ctx.extractStreamUrl('https://bgm.tv/ep/10'), /不提供视频流/);
  assert.equal(h.calls.length, 0);
});
test('configuration validation is atomic', () => {
  const h = harness(defaultHandler);
  assert.throws(() => h.api.configure({ username: 'changed', searchLimit: 100 }), /searchLimit/);
  assert.equal(h.ctx.BGM_CONFIG.username, '');
  assert.throws(() => h.api.configure({ accessToken: 'x\r\ny' }), /无效配置/);
});
test('standard fetch hosts work without a fetchv2 bridge', async () => {
  const ctx = vm.createContext({ fetch: async (url, options) => {
    assert.ok(url.startsWith('https://api.bgm.tv/v0/'));
    assert.equal(options.method, 'POST');
    return { status: 200, json: async () => ({ data: [subject] }) };
  } });
  vm.runInContext(script, ctx);
  assert.equal(JSON.parse(await ctx.searchResults('frieren'))[0].title, subject.name_cn);
});

test('structured metadata exposes titles, artwork, rating, tags and production credits', async () => {
  const data = { ...subject, total_episodes: 30, rating: { score: 8.5, rank: 43, total: 36759 },
    tags: [{ name: '奇幻' }, { name: '奇幻' }, { name: '治愈' }], infobox: [
      ...subject.infobox, { key: '动画制作', value: 'MADHOUSE' },
      { key: '导演', value: [{ v: '斎藤圭一郎' }] }
    ] };
  const h = harness(() => ({ data }));
  const m = clone(await h.api.getMetadata('bgm:400602'));
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.source, 'bangumi');
  assert.equal(m.id, 400602);
  assert.equal(m.detailLevel, 'subject');
  assert.equal(m.title, subject.name_cn);
  assert.deepEqual(m.titles, { chinese: subject.name_cn, original: subject.name });
  assert.equal(m.description, subject.summary);
  assert.equal(m.poster, subject.images.large);
  assert.deepEqual(m.rating, { score: 8.5, scale: 10, rank: 43, votes: 36759 });
  assert.equal(m.episodeCount, 28);
  assert.equal(m.totalEpisodes, 30);
  assert.equal(m.releaseDate, '2023-09-29');
  assert.equal(m.year, 2023);
  assert.equal(m.format, 'TV');
  assert.deepEqual(m.tags, ['奇幻', '治愈']);
  assert.deepEqual(m.studios, ['MADHOUSE']);
  assert.deepEqual(m.directors, ['斎藤圭一郎']);
  assert.equal(m.status, undefined, 'Do not infer airing status from the release date');
  assert.equal(m.genres, undefined, 'Community tags are not a strict genre taxonomy');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, 'GET');
});
test('JSON metadata entry point agrees with object API and legacy details retain rich data', async () => {
  const h = harness(defaultHandler);
  const metadata = JSON.parse(await h.ctx.extractMetadata('https://bgm.tv/subject/400602'));
  assert.deepEqual(metadata, clone(await h.api.getMetadata(400602)));
  const detail = JSON.parse(await h.ctx.extractDetails('400602'))[0];
  assert.deepEqual(detail.metadata, metadata);
  assert.match(detail.description, /Bangumi 评分/);
  assert.equal(detail.metadata.description, subject.summary);
});
test('metadata search keeps summary ratings without fetching every result again', async () => {
  const h = harness(() => ({ data: { total: 1, data: [{ id: 400602, type: 2, name: subject.name,
    name_cn: '', short_summary: '搜索结果简介', score: 8.2, rank: 50, eps: 28,
    images: { medium: 'https://lain.bgm.tv/medium.jpg' }, tags: [{ name: '奇幻' }] }] } }));
  const [m] = JSON.parse(await h.ctx.searchMetadata('frieren'));
  assert.equal(m.detailLevel, 'search');
  assert.equal(m.description, '搜索结果简介');
  assert.equal(m.title, subject.name);
  assert.equal(m.poster, 'https://lain.bgm.tv/medium.jpg');
  assert.equal(m.rating.score, 8.2);
  assert.equal(m.rating.rank, 50);
  assert.equal(m.rating.votes, null);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, 'POST');
});
test('unknown and invalid metadata values stay null rather than invented defaults', async () => {
  const h = harness(() => ({ data: { id: 123, type: 2, name: '  动画  ', date: '2023-02-29',
    rating: { score: 0, rank: 0, total: 0 }, eps: 0, total_episodes: 0, tags: [null], infobox: [null] } }));
  const m = clone(await h.api.getMetadata(123));
  assert.equal(m.title, '动画');
  assert.equal(m.poster, null);
  assert.equal(m.releaseDate, null);
  assert.equal(m.year, null);
  assert.equal(m.episodeCount, null);
  assert.equal(m.totalEpisodes, null);
  assert.deepEqual(m.rating, { score: null, scale: 10, rank: null, votes: 0 });
  assert.deepEqual(m.tags, []);
  assert.deepEqual(m.studios, []);
  assert.deepEqual(m.aliases, ['动画']);
});
test('original titles are not labeled Japanese and invalid rating scales are rejected', async () => {
  const h = harness(() => ({ data: { id: 123, type: 2, name: '中国动画', name_cn: '中国动画',
    date: '2024-02-29', rating: { score: 85, rank: -1, total: -1 } } }));
  const m = clone(await h.api.getMetadata(123));
  assert.equal(m.titles.original, '中国动画');
  assert.equal(m.titles.japanese, undefined);
  assert.equal(m.releaseDate, '2024-02-29');
  assert.deepEqual(m.rating, { score: null, scale: 10, rank: null, votes: null });
});
test('episode metadata preserves episode IDs, both numbering fields and explicit durations', async () => {
  const h = harness(call => call.url.includes('/subjects/') ? { data: subject } : { data: { total: 2, data: [
    episode(10, 13, { ep: 1, name_cn: '旅程', name: '旅立ち', airdate: '2023-09-29', desc: '第一话简介', duration: '24:00', duration_seconds: 1440 }),
    episode(11, 14, { ep: 2, name: '次の話', airdate: '', duration_seconds: 0 })
  ] } });
  const rows = JSON.parse(await h.ctx.extractEpisodeMetadata(400602));
  assert.equal(rows[0].subjectId, 400602);
  assert.equal(rows[0].id, 10);
  assert.equal(rows[0].number, 13);
  assert.equal(rows[0].episodeNumber, 1);
  assert.equal(rows[0].title, '旅程');
  assert.equal(rows[0].originalTitle, '旅立ち');
  assert.equal(rows[0].description, '第一话简介');
  assert.equal(rows[0].durationSeconds, 1440);
  assert.equal(rows[0].url, 'https://bgm.tv/ep/10');
  assert.equal(rows[1].title, '次の話');
  assert.equal(rows[1].airdate, null);
  assert.equal(rows[1].durationSeconds, null);
  assert.ok(h.calls.every(c => c.method === 'GET'));
});
test('metadata APIs filter disallowed content and blank searches without exposing write operations', async () => {
  const h = harness(() => ({ data: { ...subject, nsfw: true } }));
  await assert.rejects(h.api.getMetadata(400602), /动画条目/);
  const empty = harness(() => { throw Error('must not fetch'); });
  assert.equal(await empty.ctx.searchMetadata('  '), '[]');
  assert.equal(empty.calls.length, 0);
});

test('metadata catalog uses read-only ranked or premiere-date pagination', async () => {
  const h = harness(() => ({ data: { total: 1, data: [subject] } }));
  const result = JSON.parse(await h.ctx.browseMetadata('topRated', 2));
  assert.equal(result[0].id, 400602);
  const url = new URL(h.calls[0].url);
  assert.equal(url.pathname, '/v0/subjects');
  assert.equal(url.searchParams.get('type'), '2');
  assert.equal(url.searchParams.get('sort'), 'rank');
  assert.equal(url.searchParams.get('offset'), '25');
  await h.api.browseMetadata('newest');
  assert.equal(new URL(h.calls[1].url).searchParams.get('sort'), 'date');
  assert.ok(h.calls.every(x => x.method === 'GET'));
  await assert.rejects(h.api.browseMetadata('__proto__'), /不支持/);
  await assert.rejects(h.api.browseMetadata('topRated', 0), /page/);
  assert.equal(h.calls.length, 2);
});
