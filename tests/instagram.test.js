import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, APIKeyError, BadRequestError, GetSocialAPIError, InstagramError, NotFoundError, RateLimitError, ServiceUnavailableError } from '../src/index.js';

const json = (obj, init = {}) =>
  new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

function recordingFetch(calls, respond) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    return respond(calls.length - 1);
  };
}

test('routes map 1:1 to API endpoints', async () => {
  const calls = [];
  const client = new Client({ apiKey: 'gsa_live_test', fetchImpl: recordingFetch(calls, () => json({})) });

  await client.instagram.userInfo(25025320);
  await client.instagram.userByUsername('durov');
  await client.instagram.profile(25025320);
  await client.instagram.searchUsername('durov');
  await client.instagram.similarUsers(25025320);
  await client.instagram.userMedias(25025320);
  await client.instagram.userMedias(25025320, 5, 'CURSOR');
  await client.instagram.userTags(25025320);
  await client.instagram.userStories(25025320);
  await client.instagram.userHighlights(25025320);
  await client.instagram.followers(43586162288, 25);
  await client.instagram.following(25025320);
  await client.instagram.following(25025320, 30, 'CUR', 'durov');
  await client.instagram.mediaInfo('Deu3BoCBbDP');
  await client.instagram.mediaLikers('4012386322294878415'); // big pks must be passed as strings in JS
  await client.instagram.mediaComments('4012386322294878415', 50, 'recent');
  await client.instagram.hashtagInfo('#photography');
  await client.instagram.hashtagSearch('photo');
  await client.instagram.locationInfo(213385402);

  const urls = calls.map((c) => c.url);
  assert.deepEqual(urls, [
    'https://api.getsocialapi.com/v1/ig/user/info/25025320',
    'https://api.getsocialapi.com/v1/ig/user/username_info/durov',
    'https://api.getsocialapi.com/v1/profile/25025320',
    'https://api.getsocialapi.com/v1/search/username/durov?count=10',
    'https://api.getsocialapi.com/v1/ig/user/similar/25025320',
    'https://api.getsocialapi.com/v1/ig/user/media/25025320?count=12',
    'https://api.getsocialapi.com/v1/ig/user/media/25025320?count=5&max_id=CURSOR',
    'https://api.getsocialapi.com/v1/ig/user/tags/25025320?count=12',
    'https://api.getsocialapi.com/v1/ig/user/stories/25025320',
    'https://api.getsocialapi.com/v1/ig/user/highlights/25025320',
    'https://api.getsocialapi.com/v1/followers/43586162288?count=25',
    'https://api.getsocialapi.com/v1/following/25025320?count=25',
    'https://api.getsocialapi.com/v1/following/25025320?count=30&max_id=CUR&query=durov',
    'https://api.getsocialapi.com/v1/ig/media/info/Deu3BoCBbDP',
    'https://api.getsocialapi.com/v1/ig/media/likers/4012386322294878415',
    'https://api.getsocialapi.com/v1/ig/media/comments/4012386322294878415?count=50&sort_order=recent',
    'https://api.getsocialapi.com/v1/ig/hashtag/info/photography',
    'https://api.getsocialapi.com/v1/ig/hashtag/search/photo',
    'https://api.getsocialapi.com/v1/ig/location/info/213385402',
  ]);
});

test('sends X-API-Key header; health skips auth', async () => {
  const calls = [];
  const client = new Client({ apiKey: 'gsa_live_test', fetchImpl: recordingFetch(calls, () => json({ ok: true })) });

  await client.instagram.userInfo(1);
  assert.equal(calls[0].init.headers['X-API-Key'], 'gsa_live_test');

  await client.health();
  assert.equal(calls[1].url, 'https://api.getsocialapi.com/v1/health');
  assert.deepEqual(calls[1].init.headers, {});
});

test('encodes unicode tags and verbatim comment cursors', async () => {
  const calls = [];
  const client = new Client({ apiKey: 'k', fetchImpl: recordingFetch(calls, () => json({})) });

  await client.instagram.hashtagInfo('#природа');
  assert.ok(calls[0].url.endsWith('/ig/hashtag/info/' + encodeURIComponent('природа')));

  await client.instagram.mediaComments('Deu3BoCBbDP', null, null, '{"min_id":"x"}');
  const u = new URL(calls[1].url);
  assert.equal(u.searchParams.get('min_id'), '{"min_id":"x"}');
  assert.equal(u.searchParams.get('count'), null);
  assert.equal(u.searchParams.get('sort_order'), null);
});

test('validates arguments', async () => {
  const client = new Client({ apiKey: 'k', fetchImpl: async () => json({}) });
  await assert.rejects(async () => client.instagram.userInfo(-1), TypeError);
  await assert.rejects(async () => client.instagram.userInfo('123456789012345678901'), TypeError);
  await assert.rejects(async () => client.instagram.userByUsername(''), TypeError);
  await assert.rejects(async () => client.instagram.mediaInfo('!!'), TypeError);
  await assert.rejects(async () => client.instagram.mediaComments('Deu3BoCBbDP', null, 'hot'), TypeError);
  await assert.rejects(async () => client.instagram.userMedias(1, 0), TypeError);
  await assert.rejects(async () => client.instagram.following(1, 51), TypeError);
});

test('client requires an API key', () => {
  const saved = process.env.GETSOCIALAPI_API_KEY;
  delete process.env.GETSOCIALAPI_API_KEY;
  assert.throws(() => new Client(), /apiKey is required/);
  if (saved !== undefined) process.env.GETSOCIALAPI_API_KEY = saved;
});

test('retries retryable statuses then succeeds', async () => {
  const calls = [];
  const client = new Client({
    apiKey: 'k',
    maxRetries: 2,
    fetchImpl: recordingFetch(calls, (i) =>
      i === 0
        ? new Response('{"error":"rate limit"}', { status: 429, headers: { 'retry-after': '0' } })
        : json({ ok: true })
    ),
  });

  const body = await client.instagram.userInfo(1);
  assert.deepEqual(body, { ok: true });
  assert.equal(calls.length, 2);
});

test('rate limit error carries retryAfter', async () => {
  const client = new Client({
    apiKey: 'k',
    maxRetries: 0,
    fetchImpl: async () => new Response('{}', { status: 429, headers: { 'retry-after': '7' } }),
  });
  await assert.rejects(client.instagram.userInfo(1), (e) => {
    assert.ok(e instanceof RateLimitError);
    assert.equal(e.retryAfter, 7);
    assert.match(e.message, /retry after 7s/);
    return true;
  });
});

test('maps error statuses to typed exceptions', async () => {
  const make = (status, body = '{}', headers = {}) =>
    new Client({ apiKey: 'k', maxRetries: 0, fetchImpl: async () => new Response(body, { status, headers }) });

  await assert.rejects(make(401).instagram.userInfo(1), (e) => {
    assert.ok(e instanceof APIKeyError);
    assert.equal(e.message, 'Invalid API key');
    return true;
  });
  await assert.rejects(
    make(400, '{"error":"count must be 1-50","field":"count"}').instagram.userInfo(1),
    (e) => {
      assert.ok(e instanceof BadRequestError);
      assert.equal(e.field, 'count');
      assert.match(e.message, /count must be 1-50/);
      return true;
    }
  );
  await assert.rejects(make(404, '{"message":"user not found"}').instagram.userInfo(1), (e) => {
    assert.ok(e instanceof NotFoundError);
    assert.equal(e.message, 'user not found');
    return true;
  });
  await assert.rejects(make(503).instagram.userInfo(1), ServiceUnavailableError);
  await assert.rejects(
    make(420, '{"status":"fail","message":"checkpoint required"}').instagram.userInfo(1),
    (e) => {
      assert.ok(e instanceof InstagramError);
      assert.equal(e.upstreamStatus, 420);
      assert.match(e.message, /checkpoint required/);
      return true;
    }
  );
  await assert.rejects(make(451, '{"error":"restricted"}').instagram.userInfo(1), (e) => {
    assert.ok(e instanceof GetSocialAPIError && !(e instanceof InstagramError));
    return true;
  });
});

test('network errors exhaust retries and raise GetSocialAPIError', async () => {
  const client = new Client({
    apiKey: 'k',
    maxRetries: 0,
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  await assert.rejects(client.instagram.userInfo(1), (e) => {
    assert.ok(e instanceof GetSocialAPIError);
    assert.match(e.message, /Network error/);
    return true;
  });
});
