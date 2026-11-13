import importlib.util
import json
import threading
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch, Mock

path = Path(__file__).resolve().parents[2] / 'bahaba-app/scripts/admin-scoped-collectors.py'
spec = importlib.util.spec_from_file_location('scoped_collectors', path)
collectors = importlib.util.module_from_spec(spec)
with patch.dict('sys.modules', {'x_agent_reach':types.ModuleType('x_agent_reach')}):
    spec.loader.exec_module(collectors)


class ScopedCollectorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.original_base = collectors.BASE
        collectors.BASE = Path(self.temporary.name)

    def tearDown(self):
        collectors.BASE = self.original_base
        self.temporary.cleanup()

    def run_poll(self, saved, current=None, text="baha in Bulacan"):
        stop = threading.Event()
        forward = Mock()
        calls = 0
        def gateway(scope, platform):
            nonlocal calls
            calls += 1
            return saved if calls == 1 else current
        def wait(seconds):
            stop.set()
        post = {'id':'123','text':text,'url':'https://www.facebook.com/example/posts/123','created_at':datetime.now(timezone.utc).isoformat()}
        collectors.states.clear()
        with patch.object(collectors,'SCOPES',{'bulacan':'Bulacan'}), patch.object(collectors,'PLATFORMS',('Facebook',)), patch.object(collectors,'settings',return_value={}), patch.object(collectors,'gateway',side_effect=gateway), patch.object(collectors,'fetch',return_value=[post]) as fetch, patch.object(stop,'wait',side_effect=wait):
            collectors.poll(stop,forward,lambda path:set(),lambda seen,path:None)
        return forward, fetch

    def test_disconnected_account_never_fetches_shared_credentials(self):
        forward, fetch = self.run_poll(None)
        fetch.assert_not_called()
        forward.assert_not_called()

    def test_disconnect_discards_in_flight_results(self):
        forward, fetch = self.run_poll({'revision':'old'})
        fetch.assert_called_once()
        forward.assert_not_called()

    def test_switch_discards_previous_account_results(self):
        forward, fetch = self.run_poll({'revision':'old'},{'revision':'new'})
        forward.assert_not_called()

    def test_matching_account_revision_forwards_result(self):
        forward, fetch = self.run_poll({'revision':'same'},{'revision':'same'})
        forward.assert_called_once()
        self.assertEqual(forward.call_args.args[0]['post_id'],'123')

    def test_forwarded_post_keeps_its_lgu_scope(self):
        forward, _ = self.run_poll({'revision':'same'},{'revision':'same'},'May baha sa Bulacan')
        payload = forward.call_args.args[0]
        self.assertEqual(payload['location_id'], 'bulacan')
        self.assertEqual(payload['city'], 'Bulacan')

    def test_water_and_road_posts_are_not_discarded(self):
        for text in ['May tubig na sa Bulacan, baha na sa kalsada?', 'May mga motor na tumitirik sa Bulacan dahil sa baha.']:
            forward, _ = self.run_poll({'revision':'same'}, {'revision':'same'}, text)
            forward.assert_called_once()

    def test_city_search_does_not_require_literal_baha(self):
        saved={'storage':{'cookies':[]}}
        with patch.object(collectors.subprocess, 'run', return_value=Mock(returncode=0, stdout='{"posts":[]}')) as run:
            collectors.fetch('navotas','Threads',saved)
        target=run.call_args.args[0][3]
        self.assertEqual(target,'https://www.threads.com/search?q=Navotas')

    def test_navotas_threads_also_reads_profile_posts_when_search_is_unreadable(self):
        saved={'storage':{'cookies':[]}}
        profile={'id':'DezU2qJE6QV','text':'Sobrang taas na ng tubig sa Bangkulasi, Navotas. May mga motor na hindi na makadaan.','url':'https://www.threads.com/@bantalafloodapp/post/DezU2qJE6QV','created_at':datetime.now(timezone.utc).isoformat()}
        replies=[Mock(returncode=0,stdout=json.dumps({'posts':[profile]})),Mock(returncode=1,stdout='{"error":"no_posts_visible"}')]
        collectors.states.clear()
        with patch.object(collectors,'settings',return_value={}), patch.object(collectors.subprocess,'run',side_effect=replies) as run:
            posts=collectors.fetch('navotas','Threads',saved)
        targets=[call.args[0][3] for call in run.call_args_list]
        self.assertEqual(targets,['https://www.threads.com/@bantalafloodapp','https://www.threads.com/search?q=Navotas'])
        self.assertEqual(posts,[profile])
        self.assertIn('no readable posts',collectors.states['navotas:Threads']['last_error'])

    def cycle(self, revision, posts, forward, seen=None, scopes=None, platform='Threads'):
        seen = set() if seen is None else seen
        stop=threading.Event()
        def wait(seconds): stop.set()
        saved={'revision':revision}
        with patch.object(collectors,'SCOPES',scopes or {'navotas':'Navotas'}), patch.object(collectors,'PLATFORMS',(platform,)), patch.object(collectors,'settings',return_value={}), patch.object(collectors,'gateway',return_value=saved), patch.object(collectors,'fetch',return_value=posts), patch.object(stop,'wait',side_effect=wait):
            collectors.poll(stop,forward,lambda path:set(seen),lambda values,path:seen.update(values))
        return seen

    def test_failed_delivery_is_queued_and_retried_after_restart(self):
        collectors.states.clear()
        post={'id':'real-post','text':'May baha sa Navotas','url':'https://www.threads.com/@resident/post/real-post','created_at':datetime.now(timezone.utc).isoformat()}
        rejected=Mock(side_effect=RuntimeError('BAHABA ingest API rejected the result (HTTP 401): Invalid ingestion token.'))
        seen=self.cycle('same',[post],rejected)
        self.assertFalse(seen)
        queue=collectors.pending_path('navotas','Threads')
        self.assertEqual(len(collectors.read_pending(queue,'same')),1)
        self.assertIn('tokens do not match',collectors.states['navotas:Threads']['last_error'])
        collectors.states.clear()
        accepted=Mock()
        self.cycle('same',[],accepted,seen)
        accepted.assert_called_once()
        self.assertIn('real-post',seen)
        self.assertEqual(collectors.read_pending(queue,'same'),[])

    def test_account_switch_discards_previous_pending_posts(self):
        post={'id':'old','text':'baha Navotas'}
        queue=collectors.pending_path('navotas','Threads')
        collectors.write_pending(queue,'old-revision',[post])
        accepted=Mock()
        self.cycle('new-revision',[],accepted)
        accepted.assert_not_called()
        self.assertEqual(collectors.read_pending(queue,'new-revision'),[])

    def test_one_failed_item_does_not_lose_the_rest_of_batch(self):
        posts=[{'id':str(i),'text':'baha Navotas','created_at':datetime.now(timezone.utc).isoformat()} for i in range(3)]
        self.cycle('same',posts,Mock(side_effect=RuntimeError('delivery failed')))
        self.assertEqual(len(collectors.read_pending(collectors.pending_path('navotas','Threads'),'same')),3)

    def test_queries_rotate_between_city_keywords_and_barangays(self):
        (collectors.BASE/'collector-locations.json').write_text(json.dumps({'navotas':['Navotas','San Roque','Navotas East']}))
        collectors.states.clear()
        queries=[collectors.search_query('navotas','Threads') for _ in range(24)]
        self.assertIn('Navotas',queries)
        self.assertIn('baha Navotas',queries)
        self.assertIn('tubig Navotas',queries)
        self.assertIn('baha San Roque',queries)
        self.assertIn('tubig Navotas East',queries)

    def test_x_search_rotates_between_flood_terms_city_and_barangay_names(self):
        (collectors.BASE/'collector-locations.json').write_text(json.dumps({'navotas':['Navotas','San Roque']}))
        collectors.states.clear()
        queries=[collectors.search_query('navotas','X') for _ in range(6)]
        self.assertTrue(all('baha' in query and ' -filter:retweets since:' in query for query in queries))
        self.assertTrue(all('"Navotas"' in query for query in queries))
        self.assertIn('"San Roque"',queries[1])

    def test_x_flood_post_with_navotas_barangay_is_forwarded(self):
        (collectors.BASE/'collector-locations.json').write_text(json.dumps({'navotas':['Navotas','San Roque']}))
        post={'id':'public-x-post','text':'Flooding blocks roads around San Roque','publisher_id':'other-account','url':'https://x.com/resident/status/123','created_at':datetime.now(timezone.utc).isoformat()}
        forward=Mock()
        self.cycle('same',[post],forward,platform='X')
        forward.assert_called_once()
        self.assertEqual(forward.call_args.args[0]['location_id'],'navotas')

    def test_location_only_post_is_not_forwarded_to_nlp(self):
        (collectors.BASE/'collector-locations.json').write_text(json.dumps({'navotas':['Navotas','Tumana']}))
        post={'id':'unrelated-x-post','text':'Community meeting in Tumana, Navotas','created_at':datetime.now(timezone.utc).isoformat()}
        forward=Mock()
        self.cycle('same',[post],forward,platform='X')
        forward.assert_not_called()

    def test_baha_post_from_tumana_navotas_is_flood_candidate(self):
        (collectors.BASE/'collector-locations.json').write_text(json.dumps({'navotas':['Navotas','Tumana']}))
        post={'id':'tumana-flood-post','text':'baha na po sa brgy. tumana, navotas'}
        self.assertTrue(collectors.is_flood_candidate(post))
        self.assertEqual(collectors.post_scope(post),'navotas')

    def test_rolling_window_keeps_yesterday_and_rejects_future_unknown_and_expired_dates(self):
        now=datetime(2026,10,24,1,tzinfo=timezone.utc)
        for hours in (0,1,23,24):
            self.assertTrue(collectors.recent_post({'created_at':(now-timedelta(hours=hours)).isoformat()},now))
        for value in (None,'not-a-date','2026-10-24T00:30:00',(now+timedelta(seconds=1)).isoformat(),(now-timedelta(hours=24,seconds=1)).isoformat()):
            self.assertFalse(collectors.recent_post({'created_at':value},now))

    def test_future_same_day_post_is_never_queued_or_forwarded(self):
        post={'id':'future','text':'baha Navotas','created_at':(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()}
        forward=Mock()
        self.cycle('same',[post],forward)
        forward.assert_not_called()
        self.assertEqual(collectors.read_pending(collectors.pending_path('navotas','Threads'),'same'),[])

    def test_expired_pending_post_does_not_block_a_new_report(self):
        old={'id':'old','text':'baha Navotas','created_at':(datetime.now(timezone.utc)-timedelta(hours=25)).isoformat()}
        new={'id':'new','text':'baha Navotas','created_at':datetime.now(timezone.utc).isoformat()}
        collectors.write_pending(collectors.pending_path('navotas','Threads'),'same',[old])
        forward=Mock()
        self.cycle('same',[new],forward)
        forward.assert_called_once()
        self.assertEqual(forward.call_args.args[0]['post_id'],'new')

    def test_workers_poll_each_account_independently(self):
        stop=threading.Event()
        with patch.object(collectors,'settings',return_value={'LGU_SOCIAL_COLLECTORS_ENABLED':'true'}), patch.object(collectors,'SCOPES',{'navotas':'Navotas','bulacan':'Bulacan'}), patch.object(collectors,'PLATFORMS',('Facebook','Threads')), patch.object(collectors.threading,'Thread') as threads:
            collectors.start(stop,Mock(),Mock(),Mock())
        self.assertEqual(threads.call_count,4)
        accounts=[call.kwargs['kwargs']['accounts'] for call in threads.call_args_list]
        self.assertEqual(accounts,[{('navotas','Facebook')},{('navotas','Threads')},{('bulacan','Facebook')},{('bulacan','Threads')}])

    def test_public_flood_post_from_any_author_is_forwarded_without_guessing_location(self):
        post={'id':'public-post','text':'May baha sa isang lugar','publisher_id':'other-account','url':'https://x.com/resident/status/123','created_at':datetime.now(timezone.utc).isoformat()}
        forward=Mock()
        seen=self.cycle('same',[post],forward)
        forward.assert_called_once()
        self.assertIn('public-post',seen)
        payload=forward.call_args.args[0]
        self.assertIsNone(payload['location_id'])
        self.assertIsNone(payload['city'])

    def test_public_flood_post_is_not_rejected_when_it_names_a_different_city(self):
        post={'id':'marikina-post','text':'May baha sa Marikina','created_at':datetime.now(timezone.utc).isoformat()}
        forward=Mock()
        self.cycle('same',[post],forward,scopes={'navotas':'Navotas','marikina':'Marikina'})
        forward.assert_called_once()
        self.assertEqual(forward.call_args.args[0]['location_id'],'marikina')

    def test_only_unique_barangay_mentions_resolve_without_city(self):
        (collectors.BASE/'collector-locations.json').write_text(json.dumps({'navotas':['Bagumbayan North','San Roque'],'bulacan':['San Roque ? Pandi']}))
        self.assertEqual(collectors.post_scope({'text':'Baha sa Bagumbayan North'}),'navotas')
        self.assertIsNone(collectors.post_scope({'text':'Baha sa San Roque'}))
        self.assertIsNone(collectors.post_scope({'text':'Baha sa Bagumbayan Northern'}))
        self.assertEqual(collectors.post_scope({'text':'Baha sa Malolos, Bulacan'}),'malolos')

    def test_own_unlocated_report_is_never_given_collecting_city(self):
        post={'text':'May baha dito','collection_origin':'own_profile'}
        payload=collectors.ingestion_payload('navotas','X',post)
        self.assertIsNone(payload['location_id'])
        self.assertIsNone(payload['city'])

    def test_signed_in_x_profile_report_survives_prior_search_failure(self):
        saved={'storage':{'cookies':[{'name':'twid','domain':'.x.com','value':'u%3D12345'}]}}
        (collectors.BASE/'collector-profiles.json').write_text('{}')
        post={'id':'actual-post','text':'baha sa Navotas','created_at':datetime.now(timezone.utc).isoformat()}
        replies=[Mock(returncode=1,stdout='{"error":"navigation_timeout"}'),Mock(returncode=0,stdout=json.dumps({'posts':[post]}))]
        collectors.states.clear()
        with patch.object(collectors,'settings',return_value={}), patch.object(collectors.subprocess,'run',side_effect=replies) as run:
            posts=collectors.fetch('navotas','X',saved)
        self.assertIn('https://x.com/search?',run.call_args_list[0].args[0][3])
        self.assertEqual(run.call_args_list[1].args[0][3],'https://x.com/i/user/12345')
        self.assertEqual(run.call_count,2)
        self.assertEqual(posts[0]['id'],'actual-post')
        self.assertEqual(posts[0]['collection_origin'],'own_profile')

    def test_signed_in_profile_results_survive_a_later_search_failure(self):
        saved={'storage':{'cookies':[{'name':'twid','domain':'.x.com','value':'u%3D12345'}]}}
        (collectors.BASE/'collector-profiles.json').write_text('{}')
        post={'id':'already-delivered','text':'baha sa Navotas','created_at':datetime.now(timezone.utc).isoformat()}
        directory=collectors.BASE/'.state/lgu-accounts/navotas'
        directory.mkdir(parents=True)
        (directory/'x-seen.json').write_text('["already-delivered"]')
        replies=[Mock(returncode=1,stdout='{"error":"navigation_timeout"}'),Mock(returncode=0,stdout=json.dumps({'posts':[post]}))]
        collectors.states.clear()
        with patch.object(collectors,'settings',return_value={}), patch.object(collectors.subprocess,'run',side_effect=replies) as run:
            posts=collectors.fetch('navotas','X',saved)
        self.assertEqual(run.call_count,2)
        self.assertEqual(posts[0]['id'],'already-delivered')
        self.assertEqual(posts[0]['collection_origin'],'own_profile')
        self.assertIn('timed out',collectors.states['navotas:X']['last_error'])

    def test_profile_discovery_rejects_unrelated_or_malformed_cookie(self):
        for cookie in ({'name':'twid','domain':'example.com','value':'u%3D12345'},{'name':'twid','domain':'.x.com','value':'u%3D12345/../../other'},{'name':'other','domain':'.x.com','value':'u%3D12345'}):
            self.assertIsNone(collectors.x_profile_target({'storage':{'cookies':[cookie]}}))

    def test_configured_public_x_profile_is_checked_without_a_twid_cookie(self):
        (collectors.BASE/'collector-profiles.json').write_text(json.dumps({'navotas':'BANTALA_APP'}))
        saved={'storage':{'cookies':[]}}
        post={'id':'bantala-post','text':'Flooding in Navotas','created_at':datetime.now(timezone.utc).isoformat()}
        with patch.object(collectors,'settings',return_value={}), patch.object(collectors.subprocess,'run',return_value=Mock(returncode=0,stdout=json.dumps({'posts':[post]}))) as run:
            posts=collectors.fetch('navotas','X',saved)
        self.assertEqual(run.call_args.args[0][3],'https://x.com/BANTALA_APP')
        self.assertEqual(posts[0]['collection_origin'],'own_profile')
        self.assertEqual(posts[0]['id'],'bantala-post')

    def test_configured_public_x_profile_rejects_invalid_handles(self):
        (collectors.BASE/'collector-profiles.json').write_text(json.dumps({'navotas':'https://x.com/BANTALA_APP'}))
        self.assertEqual(collectors.monitored_x_profile('navotas'),[])

    def test_multiple_configured_x_profiles_include_the_shared_report_author(self):
        (collectors.BASE/'collector-profiles.json').write_text(json.dumps({'navotas':['lauveyfan','BANTALA_APP','invalid handle']}))
        post={'id':'2118423310350622957','text':'baha na po sa brgy. tumana, navotas','created_at':datetime.now(timezone.utc).isoformat()}
        collectors.states.clear()
        with patch.object(collectors,'settings',return_value={'X_PROVIDER':'browser'}), patch.object(collectors.subprocess,'run',return_value=Mock(returncode=0,stdout=json.dumps({'posts':[post]}))) as run:
            posts=collectors.fetch('navotas','X',{'storage':{'cookies':[]}})
        targets=[call.args[0][3] for call in run.call_args_list]
        self.assertEqual(targets[0],'https://x.com/lauveyfan')
        self.assertEqual(posts[0]['id'],'2118423310350622957')
        self.assertEqual(posts[0]['collection_origin'],'own_profile')


class FacebookParserTests(unittest.TestCase):
    def setUp(self):
        path=Path(__file__).resolve().parents[1] / 'huggingface-space/social_browser.py'
        spec=importlib.util.spec_from_file_location('browser_adapter',path)
        self.adapter=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.adapter)

    def test_embedded_story_is_read_without_article_element(self):
        story={'message':{'text':'May tubig na sa Navotas East'},'url':'https://www.facebook.com/example/posts/123','creation_time':1700000000}
        html='<script type="application/json">'+json.dumps({'data':{'story':story}})+'</script>'
        with patch.object(self.adapter,'facebook_helpers',return_value={}):
            posts=self.adapter.facebook_posts(html,'https://www.facebook.com/search/posts/?q=Navotas')
        self.assertEqual(len(posts),1)
        self.assertEqual(posts[0]['id'],'123')
        self.assertEqual(posts[0]['text'],story['message']['text'])

    def test_profile_metadata_is_not_a_post(self):
        profile={'message':{'text':'Navotas'},'url':'https://www.facebook.com/example'}
        html='<script type="application/json">'+json.dumps(profile)+'</script>'
        with patch.object(self.adapter,'facebook_helpers',return_value={}):
            self.assertEqual(self.adapter.facebook_posts(html,'https://www.facebook.com/search/posts/?q=Navotas'),[])

    def test_share_permalink_in_current_facebook_search_markup_is_parsed(self):
        html='<div data-pagelet="FeedUnit_0"><a href="/share/p/AbC123/">Open post</a><div dir="auto">May baha na sa San Roque, Navotas.</div></div>'
        helpers={'_extract_post_text':lambda article:''}
        with patch.object(self.adapter,'facebook_helpers',return_value=helpers):
            posts=self.adapter.facebook_posts(html,'https://www.facebook.com/search/posts/?q=Navotas')
        self.assertEqual(len(posts),1)
        self.assertEqual(posts[0]['id'],'share_AbC123')
        self.assertEqual(posts[0]['url'],'https://www.facebook.com/share/p/AbC123/')
        self.assertEqual(posts[0]['text'],'May baha na sa San Roque, Navotas.')

    def test_share_permalink_identity_is_extracted_from_facebook_url(self):
        self.assertEqual(
            self.adapter.post_url('Facebook','/share/p/AbC123/?mibextid=example','https://www.facebook.com/search/posts/?q=Navotas'),
            ('https://www.facebook.com/share/p/AbC123/','share_AbC123'),
        )

    def test_threads_post_without_article_role_is_read(self):
        html='<div><div><a href="/@resident/post/ABC123"><time datetime="2026-10-22T14:00:00Z">now</time></a><div dir="auto">May mga motor na tumitirik sa baha sa Navotas East.</div></div><div><a href="/@other/post/OTHER1">now</a><div dir="auto">Another post</div></div></div>'
        with patch.object(self.adapter,'threads_parser',return_value=Mock()):
            posts=self.adapter.threads_posts(html,'https://www.threads.com/search?q=Navotas')
        original=next(p for p in posts if p['id']=='ABC123')
        self.assertIn('tumitirik',original['text'])
        self.assertNotIn('Another post',original['text'])

    def test_threads_search_selects_recent_results_when_available(self):
        page=Mock()
        control=Mock()
        control.count.return_value=1
        control.first.is_visible.return_value=True
        page.get_by_role.return_value=control
        self.adapter.select_recent_search(page,'Threads','https://www.threads.com/search?q=Navotas')
        control.first.click.assert_called_once()

    def test_profile_page_does_not_change_tabs(self):
        page=Mock()
        self.adapter.select_recent_search(page,'Threads','https://www.threads.com/@resident')
        page.get_by_role.assert_not_called()

    def test_exact_threads_permalink_uses_its_own_metadata(self):
        url='https://www.threads.com/@bantalafloodapp/post/DezN8lKFCiu'
        html='<meta property="og:url" content="'+url+'"><meta property="og:description" content="May baha na sa San Roque, Navotas.">'
        with patch.object(self.adapter,'threads_parser',return_value=Mock()):
            posts=self.adapter.threads_posts(html,url)
        self.assertEqual(posts[0]['id'],'DezN8lKFCiu')
        self.assertIn('San Roque',posts[0]['text'])
        self.assertIsNone(posts[0]['created_at'])
        self.assertIsNone(self.adapter.metadata_post(__import__('bs4').BeautifulSoup(html,'html.parser'),'Threads','https://www.threads.com/search?q=Navotas'))

    def test_other_post_metadata_is_rejected(self):
        html='<meta property="og:url" content="https://www.threads.com/@other/post/OTHER"><meta property="og:description" content="baha Navotas">'
        self.assertIsNone(self.adapter.metadata_post(__import__('bs4').BeautifulSoup(html,'html.parser'),'Threads','https://www.threads.com/@bantalafloodapp/post/DezN8lKFCiu'))

    def test_invalid_threads_original_time_does_not_use_vendor_fallback_to_now(self):
        raw={'caption':{'text':'baha Navotas'},'code':'ABC','user':{'username':'resident'},'taken_at':'invalid-date'}
        parser=Mock()
        parser.parse_item.return_value={'id':'ABC','text':'baha Navotas','url':'https://www.threads.com/@resident/post/ABC','created_at':datetime.now(timezone.utc).isoformat()}
        with patch.object(self.adapter,'threads_parser',return_value=parser):
            posts=self.adapter.threads_posts('<script type="application/json">'+json.dumps(raw)+'</script>','https://www.threads.com/search?q=Navotas')
        self.assertIsNone(posts[0]['created_at'])

    def test_original_dates_normalize_only_actual_aware_or_epoch_dates(self):
        self.assertEqual(self.adapter.original_timestamp(1792800000000),self.adapter.original_timestamp(1792800000))
        self.assertEqual(self.adapter.original_timestamp('2026-10-24T14:00:00+08:00'),'2026-10-24T06:00:00+00:00')
        for value in (None,'','invalid',True,'2026-10-24T14:00:00'):
            self.assertIsNone(self.adapter.original_timestamp(value))

    def test_x_date_comes_from_the_main_permalink_id(self):
        published=datetime(2026,10,24,6,tzinfo=timezone.utc)
        identity=str((int(published.timestamp()*1000)-1288834974657)<<22)
        html='<article><a href="/quoted/status/123456789">quoted post</a><a href="/resident/status/'+identity+'"><time datetime="2030-11-09T00:00:00Z">now</time></a><div data-testid="tweetText">baha Navotas</div></article>'
        posts=self.adapter.x_posts(html,'https://x.com/search?q=baha')
        self.assertEqual(posts[0]['id'],identity)
        self.assertEqual(posts[0]['created_at'],published.isoformat())

    def test_pinned_x_report_is_still_an_original_post(self):
        published=datetime(2026,10,24,6,tzinfo=timezone.utc)
        identity=str((int(published.timestamp()*1000)-1288834974657)<<22)
        for context,is_repost in [('Pinned',False),('Resident reposted',True)]:
            html='<article><div data-testid="socialContext">'+context+'</div><a href="/resident/status/'+identity+'"><time datetime="2026-10-24T06:00:00Z">now</time></a><div data-testid="tweetText">baha Navotas</div></article>'
            self.assertEqual(self.adapter.x_posts(html,'https://x.com/resident')[0]['is_repost'],is_repost)


if __name__ == '__main__':
    unittest.main()
