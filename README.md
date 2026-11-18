# Instagram Scraper API · Node.js

[![tests](https://github.com/GetSocialAPI/Instagram-Scraper-API-NPM/actions/workflows/tests.yml/badge.svg)](https://github.com/GetSocialAPI/Instagram-Scraper-API-NPM/actions/workflows/tests.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-18%2B-blue)](https://nodejs.org)

Node.js client for the **[GetSocialAPI](https://getsocialapi.com/)** Instagram Scraper API.

- **No cookies required** — you never provide Instagram session cookies
- **No accounts needed** — zero ban risk for your own profiles
- Raw Instagram JSON responses, REST endpoints — no transformations
- Automatic retries with `Retry-After`, typed exceptions
- Zero dependencies — native `fetch` (Node.js >= 18)

## Installation

```bash
npm install getsocialapi-instagram
```

## Quickstart

```js
import { Client } from 'getsocialapi-instagram';

// Get your API key at https://getsocialapi.com/dashboard/
const client = new Client({ apiKey: 'gsa_live_...' }); // or set GETSOCIALAPI_API_KEY

// Profile by numeric id (or userByUsername for usernames)
const user = await client.instagram.userInfo(25025320);
console.log(user.user.follower_count);

// Posts (grid)
const medias = await client.instagram.userMedias(25025320, 12);

// Followers / following — paginated on unverified accounts: pass `next_max_id`
// back as `maxId`. Verified accounts (blue checkmark) expose ~50 followers max.
let page = await client.instagram.followers(43586162288, 25);
page = await client.instagram.followers(43586162288, 25, page.next_max_id);

// All comments of a post — cursor is next_min_id -> minId ("recent" by default)
const comments = [];
let cursor = null;
for (;;) {
  const page = await client.instagram.mediaComments('4012386322294878415', 50, 'recent', cursor);
  comments.push(...page.comments);
  cursor = page.next_min_id ?? null;
  if (!cursor) break;
}
```

> **Note:** numeric ids above `Number.MAX_SAFE_INTEGER` (2^53-1) — e.g. most
> media pks — lose precision in JS. Pass them as strings:
> `mediaInfo('4012386322294878415')` (shortcodes are strings anyway).

Base URL: `https://api.getsocialapi.com/v1` — authenticate with the API key
from your [dashboard](https://getsocialapi.com/dashboard/).

## Client

```js
new Client({ apiKey, baseUrl, timeout = 30, maxRetries = 3, fetchImpl })
```

| Parameter | Default | Description |
| --- | --- | --- |
| `apiKey` | env `GETSOCIALAPI_API_KEY` | your API key |
| `baseUrl` | API endpoint | override only for testing |
| `timeout` | `30` | per-request timeout, seconds |
| `maxRetries` | `3` | retries on 429/503/5xx and network errors |
| `fetchImpl` | native `fetch` | inject a custom fetch for testing |

## Methods

| Method | Route | Description |
| --- | --- | --- |
| `profile(userId)` | `/profile/<id>` | profile by numeric id |
| `userInfo(userId)` | `/ig/user/info/<id>` | profile by numeric id |
| `userByUsername(username)` | `/ig/user/username_info/<username>` | profile by username |
| `searchUsername(query, count = 10)` | `/search/username/<q>` | search users, resolve username → pk |
| `similarUsers(userId)` | `/ig/user/similar/<id>` | suggested accounts |
| `userMedias(userId, count = 12, maxId = null)` | `/ig/user/media/<id>` | profile grid posts |
| `userTags(userId, count = 12, maxId = null)` | `/ig/user/tags/<id>` | posts with the user tagged |
| `userStories(userId)` | `/ig/user/stories/<id>` | active stories |
| `userHighlights(userId)` | `/ig/user/highlights/<id>` | highlights tray |
| `highlightStories(highlightId)` | `/ig/highlight/stories/<id>` | media of a highlight |
| `followers(userId, count = 50, maxId = null, query = null)` | `/followers/<id>` | followers list |
| `following(userId, count = 25, maxId = null, query = null)` | `/following/<id>` | following list |
| `mediaInfo(media)` | `/ig/media/info/<pk\|shortcode>` | full media card; accepts numeric pk or shortcode |
| `mediaLikers(media)` | `/ig/media/likers/<pk\|shortcode>` | users who liked (up to ~100, no pagination) |
| `mediaComments(media, count = null, sortOrder = "recent", minId = null)` | `/ig/media/comments/<pk\|shortcode>` | media comments; cursor pagination `next_min_id` → `minId` |
| `hashtagInfo(tag)` | `/ig/hashtag/info/<tag>` | hashtag card |
| `hashtagSearch(query)` | `/ig/hashtag/search/<q>` | search hashtags |
| `locationInfo(pk)` | `/ig/location/info/<pk>` | location card |

Every method returns the raw JSON of the API route as a promise resolving to
the parsed object — nothing is unwrapped, filtered or renamed. Where the API
supports pagination (`followers`*, `following`, `userMedias`, `userTags`), pass the cursor
from the previous response (`next_max_id`) as `maxId`. `mediaComments` paginates with a different cursor:
always request with `sortOrder` `"recent"` (the default) and pass `next_min_id`
back as `minId` until it comes back null — pages are chronological and
disjoint. Instagram never returns `next_max_id` for comments, so `max_id` must
not be used there. *`followers` works on unverified accounts (nearly the full
list, plus the `query` filter); verified accounts (blue checkmark) expose no
more than ~50 followers — one page, no cursor, `query` ignored. `hashtagSearch` returns one page without a cursor.

Full request/response reference with live examples:
[docs.getsocialapi → API Reference](https://getsocialapi.com/docs/api/instagram/user/get_info_by_id/)
(see the Documentation section on [getsocialapi.com](https://getsocialapi.com/)).

## Errors

| Exception | HTTP | Notes |
| --- | --- | --- |
| `GetSocialAPIError` | — | base class; also network errors |
| `APIKeyError` / `UnauthorizedError` | 401 | invalid or missing key |
| `BadRequestError` | 400 | `.field` points to the bad parameter |
| `NotFoundError` | 404 | object does not exist — never retried |
| `RateLimitError` | 429 | `.retryAfter` seconds |
| `ServiceUnavailableError` | 503 | no live accounts, `.retryAfter` |
| `InstagramError` | any | upstream Instagram error, `.upstreamStatus` |

All errors expose `.status`, `.headers` and `.body` of the failing response.

```js
import { APIKeyError, NotFoundError, RateLimitError } from 'getsocialapi-instagram';

try {
  await client.instagram.userInfo(25025320);
} catch (e) {
  if (e instanceof NotFoundError) {
    // object does not exist
  } else if (e instanceof RateLimitError) {
    await new Promise((r) => setTimeout(r, e.retryAfter * 1000));
  } else if (e instanceof APIKeyError) {
    // invalid key
  }
}
```

Only successful responses (HTTP `200` and `404`) count against your quota.
Rate limits and plans: [pricing](https://getsocialapi.com/#pricing).

## Support

- Telegram: [@getsocialapi](https://t.me/getsocialapi)
- Email: [hello@getsocialapi.com](mailto:hello@getsocialapi.com)
- Website: [getsocialapi.com](https://getsocialapi.com/)
- Documentation: [getsocialapi.com/docs](https://getsocialapi.com/docs/)
- Status: [getsocialapi.com/status](https://getsocialapi.com/status/)

## License

MIT
