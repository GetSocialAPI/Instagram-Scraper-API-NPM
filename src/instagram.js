const quote = (value) => encodeURIComponent(String(value));

function digits(value, name, maxLen = 20) {
  const s = String(value);
  if (!/^\d+$/.test(s) || s.length < 1 || s.length > maxLen) {
    throw new TypeError(`${name} must be 1-${maxLen} digits, got: ${s}`);
  }
  return s;
}

function length(value, name, lo, hi) {
  const s = String(value);
  if (s.length < lo || s.length > hi) {
    throw new TypeError(`${name} must be ${lo}-${hi} characters, got: ${s}`);
  }
  return s;
}

/** Numeric media pk or shortcode (e.g. DehVsgBi3sH). */
function mediaArg(value) {
  const s = String(value);
  if (/^\d+$/.test(s)) return digits(s, 'media id');
  if (/^[A-Za-z0-9_-]{5,64}$/.test(s)) return s;
  throw new TypeError(`media id must be a numeric pk or a shortcode, got: ${s}`);
}

function checkCount(value, lo = 1, hi = 50, dflt = null) {
  if (value == null) return dflt;
  if (!Number.isInteger(value) || value < lo || value > hi) {
    throw new TypeError(`count must be an integer ${lo}-${hi}, got: ${value}`);
  }
  return value;
}

function tag(value) {
  return quote(length(String(value).replace(/^#+/, ''), 'tag', 1, 64));
}

function page(count_, maxId, dflt, hi = 50) {
  const params = { count: checkCount(count_, 1, hi, dflt) };
  if (maxId != null) params.max_id = maxId;
  return params;
}

/**
 * Instagram endpoints of GetSocialAPI.
 *
 * Methods map 1:1 to API routes and return the raw JSON responses as received.
 */
export class InstagramAPI {
  /** @internal */
  constructor(transport) {
    this._t = transport;
  }

  // ---------- Profile ----------

  /** GET /ig/user/info/{user_id} — profile by numeric id. */
  userInfo(userId) {
    return this._t.request('GET', `/ig/user/info/${digits(userId, 'user_id')}`);
  }

  /** GET /ig/user/username_info/{username} — profile by username. */
  userByUsername(username) {
    return this._t.request('GET', `/ig/user/username_info/${length(username, 'username', 1, 64)}`);
  }

  /** GET /profile/{user_id} — profile by numeric id. */
  profile(userId) {
    return this._t.request('GET', `/profile/${digits(userId, 'user_id')}`);
  }

  /**
   * GET /search/username/{query} — search users.
   *
   * `count` is forwarded to the service, but the response may include
   * one extra exact-match entry beyond it.
   */
  searchUsername(query, count = 10) {
    return this._t.request('GET', `/search/username/${quote(query)}`, {
      count: checkCount(count, 1, 50, 10),
    });
  }

  /** GET /ig/user/similar/{user_id} — suggested accounts. */
  similarUsers(userId) {
    return this._t.request('GET', `/ig/user/similar/${digits(userId, 'user_id')}`);
  }

  // ---------- User content ----------

  /** GET /ig/user/media/{user_id} — profile grid posts. */
  userMedias(userId, count = 12, maxId = null) {
    return this._t.request('GET', `/ig/user/media/${digits(userId, 'user_id')}`, page(count, maxId, 12));
  }

  /** GET /ig/user/tags/{user_id} — posts where the user is tagged. */
  userTags(userId, count = 12, maxId = null) {
    return this._t.request('GET', `/ig/user/tags/${digits(userId, 'user_id')}`, page(count, maxId, 12));
  }

  /** GET /ig/user/stories/{user_id} — active stories. */
  userStories(userId) {
    return this._t.request('GET', `/ig/user/stories/${digits(userId, 'user_id')}`);
  }

  /** GET /ig/user/highlights/{user_id} — highlights tray. */
  userHighlights(userId) {
    return this._t.request('GET', `/ig/user/highlights/${digits(userId, 'user_id')}`);
  }

  /**
   * GET /ig/highlight/stories/{highlight_id} — media of a highlight.
   *
   * Accepts the tray id as is — the leading `highlight:` prefix
   * (as returned by `userHighlights()`) is trimmed automatically.
   */
  highlightStories(highlightId) {
    const hid = String(highlightId).replace(/^highlight:/, '');
    return this._t.request('GET', `/ig/highlight/stories/${quote(length(hid, 'highlight_id', 1, 64))}`);
  }

  // ---------- Followers / following ----------

  /**
   * GET /followers/{user_id} — followers list.
   *
   * On unverified accounts `count`, the `next_max_id` cursor and the
   * `query` filter work — nearly the full list is accessible and
   * searchable. On verified accounts (blue checkmark) Instagram exposes
   * no more than ~50 followers: one page, no cursor, `query` ignored.
   */
  followers(userId, count = 50, maxId = null, query = null) {
    const params = page(count, maxId, 50);
    if (query != null) params.query = query;
    return this._t.request('GET', `/followers/${digits(userId, 'user_id')}`, params);
  }

  /**
   * GET /following/{user_id} — following list.
   *
   * Page size: the service returns the default 25 accounts per page and
   * at most 50. The response carries `next_max_id` — pass it as `maxId`
   * for the next page. `query` filters the list by name.
   */
  following(userId, count = 25, maxId = null, query = null) {
    const params = page(count, maxId, 25, 50);
    if (query != null) params.query = query;
    return this._t.request('GET', `/following/${digits(userId, 'user_id')}`, params);
  }

  // ---------- Media ----------

  /**
   * GET /ig/media/info/{pk|shortcode} — full media card.
   *
   * Accepts a numeric pk or a post shortcode (e.g. "Deu3BoCBbDP"):
   * items[0] carries pk, code, media_type (1=photo, 2=video,
   * 8=carousel), caption, like/comment/view counts, taken_at, owner.
   */
  mediaInfo(media) {
    return this._t.request('GET', `/ig/media/info/${mediaArg(media)}`);
  }

  /**
   * GET /ig/media/likers/{pk|shortcode} — users who liked the media.
   *
   * One shot of up to ~100 users; the route has no pagination.
   */
  mediaLikers(media) {
    return this._t.request('GET', `/ig/media/likers/${mediaArg(media)}`);
  }

  /**
   * GET /ig/media/comments/{pk|shortcode} — media comments.
   *
   * Full pagination works only with sortOrder="recent" (default):
   * pages are strictly chronological (newer → older) and disjoint.
   * The cursor is `next_min_id` from the previous response — pass it
   * back as `minId` verbatim. Collect until `next_min_id` is
   * null/empty or `comments` is an empty list.
   *
   * Instagram never returns `next_max_id` for this route — `max_id`
   * pagination must not be used. `count` (1-50) is accepted by the
   * validator but the real page size is ~12-20 comments. Without
   * sortOrder (ranked) the service returns a ~15 comment preview
   * whose pages overlap between pool accounts.
   */
  mediaComments(media, count = null, sortOrder = 'recent', minId = null) {
    const params = {};
    if (count != null) params.count = checkCount(count);
    if (sortOrder != null) {
      if (sortOrder !== 'recent' && sortOrder !== 'ranked') {
        throw new TypeError(`sort_order must be "recent" or "ranked", got: ${sortOrder}`);
      }
      params.sort_order = sortOrder;
    }
    if (minId != null) params.min_id = minId;
    return this._t.request('GET', `/ig/media/comments/${mediaArg(media)}`, params);
  }

  // ---------- Hashtags ----------

  /** GET /ig/hashtag/info/{tag} — hashtag card. A leading # is trimmed. */
  hashtagInfo(t) {
    return this._t.request('GET', `/ig/hashtag/info/${tag(t)}`);
  }

  /**
   * GET /ig/hashtag/search/{query} — search hashtags.
   *
   * Returns the full first page of tag matches; a page-size parameter
   * is not supported by the API for this route.
   */
  hashtagSearch(query) {
    return this._t.request('GET', `/ig/hashtag/search/${quote(query)}`);
  }

  // ---------- Locations ----------

  /** GET /ig/location/info/{pk} — location card. */
  locationInfo(pk) {
    return this._t.request('GET', `/ig/location/info/${digits(pk, 'pk')}`);
  }
}
