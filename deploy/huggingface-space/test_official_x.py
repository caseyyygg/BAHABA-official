import io
import json
import unittest
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch
import official_x


class OfficialXTests(unittest.TestCase):
    def test_one_bounded_search_preserves_timestamp_and_permalink(self):
        body = {'data': [{'id': '123', 'text': 'Baha sa Navotas', 'created_at': '2026-10-17T00:00:00Z'}],
                'meta': {'next_token': 'must-not-follow'}}
        with patch.object(official_x, 'urlopen', return_value=io.BytesIO(json.dumps(body).encode())) as fetch:
            result = official_x.search('test-token', 'baha Navotas', max_results=10)
        fetch.assert_called_once()
        request = fetch.call_args.args[0]
        self.assertEqual(urlparse(request.full_url).hostname, 'api.x.com')
        self.assertEqual(parse_qs(urlparse(request.full_url).query)['max_results'], ['10'])
        self.assertEqual(request.get_header('Authorization'), 'Bearer test-token')
        self.assertEqual(result['tweets'][0]['createdAt'], '2026-10-17T00:00:00Z')
        self.assertEqual(result['tweets'][0]['url'], 'https://x.com/i/web/status/123')

    def test_missing_token_makes_no_request(self):
        with patch.object(official_x, 'urlopen') as fetch, self.assertRaises(official_x.XApiError):
            official_x.search('', 'baha')
        fetch.assert_not_called()

    def test_credit_failure_has_no_retry_or_credential_leak(self):
        error = HTTPError('https://api.x.com', 402, 'private-response', {}, None)
        with patch.object(official_x, 'urlopen', side_effect=error) as fetch, self.assertRaises(official_x.XApiError) as caught:
            official_x.search('test-token', 'baha')
        fetch.assert_called_once()
        self.assertEqual(caught.exception.status, 402)
        self.assertNotIn('private-response', str(caught.exception))

    def test_no_results_is_not_an_authentication_failure(self):
        with patch.object(official_x, 'urlopen', return_value=io.BytesIO(b'{"meta":{"result_count":0}}')):
            self.assertEqual(official_x.search('token', 'baha'), {'tweets': []})


if __name__ == '__main__':
    unittest.main()
