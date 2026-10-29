// Read-only smoke test. No token is loaded; no collection/progress writes occur.
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
global.fetchv2 = async function (url, headers, method, body) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://api.bgm.tv');
  assert.ok(method === 'GET' || (method === 'POST' && parsed.pathname === '/v0/search/subjects'));
  assert.equal(headers.Authorization, undefined);
  const args = ['--silent', '--show-error', '--location', '--max-time', '20', '--max-filesize', '3000000', '-X', method, '-w', '\n%{http_code}'];
  Object.entries(headers).forEach(([k, v]) => args.push('-H', k + ': ' + v));
  if (body != null) args.push('--data-raw', body);
  args.push(url);
  const { stdout } = await run('curl', args, { maxBuffer: 4000000 });
  const split = stdout.lastIndexOf('\n');
  const text = stdout.slice(0, split);
  return { status: Number(stdout.slice(split + 1)), text: async () => text, json: async () => JSON.parse(text) };
};
const moduleApi = require('../bangumi.js');
(async () => {
  const results = JSON.parse(await moduleApi.searchResults('葬送的芙莉莲'));
  const first = results.find(x => x.href === 'https://bgm.tv/subject/400602');
  assert.ok(first, 'Known Frieren subject was not found');
  const [detail] = JSON.parse(await moduleApi.extractDetails(first.href));
  assert.equal(detail.airdate, '2023-09-29');
  const episodes = JSON.parse(await moduleApi.extractEpisodes(first.href));
  assert.equal(episodes.length, 28);
  assert.equal(episodes[0].number, 1);
  assert.equal(episodes.at(-1).number, 28);
  assert.ok(episodes.every(x => /^https:\/\/bgm\.tv\/ep\/\d+$/.test(x.href)));
  await assert.rejects(moduleApi.extractStreamUrl(episodes[0].href), /不提供视频流/);
  const metadata = JSON.parse(await moduleApi.extractMetadata(400602));
  assert.equal(metadata.source, 'bangumi');
  assert.equal(metadata.id, 400602);
  assert.equal(metadata.title, first.title);
  assert.equal(metadata.episodeCount, 28);
  assert.equal(metadata.year, 2023);
  assert.equal(metadata.rating.scale, 10);
  assert.ok(metadata.rating.score > 0 && metadata.rating.score <= 10);
  assert.ok(metadata.poster.startsWith('https://'));
  assert.ok(Array.isArray(metadata.studios));
  const summaries = JSON.parse(await moduleApi.searchMetadata('葬送的芙莉莲'));
  assert.ok(summaries.some(x => x.id === 400602 && x.detailLevel === 'search'));
  const episodeMetadata = JSON.parse(await moduleApi.extractEpisodeMetadata(400602));
  assert.equal(episodeMetadata.length, 28);
  assert.ok(episodeMetadata.every(x => x.subjectId === 400602 && x.id > 0));
  const user = process.argv[2];
  let publicCollections;
  if (user) {
    const page = await moduleApi.Bangumi.getCollections(user, { limit: 3 });
    publicCollections = { returned: page.data.length, total: page.total };
  }
  console.log(JSON.stringify({ result: 'PASS', title: first.title, searchResults: results.length, airdate: detail.airdate,
    episodes: episodes.length, firstEpisode: episodes[0].number, lastEpisode: episodes.at(-1).number,
    metadata: { schemaVersion: metadata.schemaVersion, score: metadata.rating.score, scale: metadata.rating.scale,
      tags: metadata.tags.length, studios: metadata.studios, episodeMetadataCount: episodeMetadata.length },
    publicCollections, authenticatedWrites: 'not run', nativeShiroxPlayback: 'not run' }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
