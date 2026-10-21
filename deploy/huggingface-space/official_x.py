"""Bounded official X search. No retries, pagination, or implicit background calls."""
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class XApiError(RuntimeError):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


def search(token, query, *, since_id=None, max_results=10):
    if not token:
        raise XApiError(503, 'X_BEARER_TOKEN is not configured')
    params = {'query': query, 'max_results': str(max(10, min(100, int(max_results)))),
              'tweet.fields': 'created_at,author_id', 'sort_order': 'recency'}
    if since_id:
        params['since_id'] = str(since_id)
    request = Request('https://api.x.com/2/tweets/search/recent?' + urlencode(params),
                      headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'})
    try:
        with urlopen(request, timeout=25) as response:
            payload = json.load(response)
    except HTTPError as error:
        messages = {401: 'X rejected the Bearer Token', 402: 'X API credits are unavailable',
                    403: 'X denied API access for this app', 429: 'X API rate limit reached'}
        raise XApiError(error.code, messages.get(error.code, 'X API request failed')) from None
    except (URLError, TimeoutError):
        raise XApiError(503, 'Could not reach the official X API') from None
    if not isinstance(payload, dict) or payload.get('errors'):
        raise XApiError(502, 'X returned an incomplete or invalid search response')
    data = payload.get('data', [])
    if not isinstance(data, list):
        raise XApiError(502, 'X returned an invalid post list')
    tweets = []
    for post in data:
        if not isinstance(post, dict) or not str(post.get('id', '')).isdigit() or not isinstance(post.get('text'), str):
            continue
        tweets.append({'id': post['id'], 'text': post['text'], 'createdAt': post.get('created_at'),
                       'publisher_id': str(post.get('author_id') or ''),
                       'url': 'https://x.com/i/web/status/' + post['id']})
    return {'tweets': tweets}
