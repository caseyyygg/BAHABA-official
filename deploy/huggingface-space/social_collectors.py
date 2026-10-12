"""Independent Facebook/Threads polling, persistent dedup and sanitized status."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import quote

from dotenv import dotenv_values
from social_browser import checked_url, post_url

BASE = Path(__file__).resolve().parent
SOURCES = {'Facebook':'FACEBOOK_SCRAPER_URLS', 'Threads':'THREADS_SCRAPER_URLS'}
states = {source: {'configured':False, 'running':False, 'last_poll':None,
                  'last_error':None, 'posts_processed':0, 'posts_seen':0,
                  'target_count':0, 'poll_seconds':300} for source in SOURCES}
threads = []


def config_versions(source):
    paths = [BASE / '.env', BASE / '.state' / f'{source.lower()}-browser.json']
    return tuple(path.stat().st_mtime_ns if path.exists() else None for path in paths)


def settings(source):
    values = dict(os.environ)
    values.update({key:value for key,value in dotenv_values(BASE / '.env').items() if value is not None})
    targets = json.loads(values.get(SOURCES[source], '[]'))
    if not isinstance(targets, list) or len(targets) > 20:
        raise ValueError('Configure up to 20 public page/profile URLs per platform.')
    targets = list(dict.fromkeys(checked_url(source, target) for target in targets))
    words = json.loads(values.get('SOCIAL_SCRAPER_KEYWORDS','["baha","flood","lubog"]'))
    if not isinstance(words, list) or not all(isinstance(word,str) and word.strip() for word in words):
        raise ValueError('SOCIAL_SCRAPER_KEYWORDS must be a JSON list of nonempty words.')
    words = [word.casefold().strip() for word in words]
    search_enabled = values.get('SOCIAL_SCRAPER_SEARCH_ENABLED','true').lower() in {'true','1','yes'}
    if search_enabled:
        for word in words:
            for location in ['Navotas','Bulacan','Marikina','Pampanga','Malolos']:
                query = quote(f'{word} {location}', safe='')
                targets.append(f'https://www.facebook.com/search/posts/?q={query}' if source == 'Facebook' else f'https://www.threads.com/search?q={query}')
    targets = list(dict.fromkeys(targets))
    return targets, words, max(300, int(values.get('SOCIAL_SCRAPER_POLL_SECONDS','300')))


def fetch(source, target):
    result = subprocess.run([sys.executable, str(BASE / 'social_browser.py'), source, target, '20'],
                            capture_output=True, encoding='utf-8', timeout=70,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    try:
        payload = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise RuntimeError(f'{source} browser collector could not start.') from None
    if result.returncode or payload.get('error'):
        messages = {'login_required':f'{source} requires login. Run configure-social.ps1 and choose local sign-in.',
                    'rate_limit':f'{source} rate limit reached. Retrying after a cooldown.',
                    'no_posts_visible':f'No readable {source} posts were visible. The page may require sign-in or its layout may have changed.'}
        raise RuntimeError(messages.get(payload.get('error'), f'{source} browser collection failed. It will retry automatically.'))
    if not isinstance(payload.get('posts'), list):
        raise RuntimeError(f'{source} returned an invalid post list.')
    return payload['posts']


def process_posts(source, target, items, words, seen, forward, save):
    processed = 0
    for item in items:
        text = str(item.get('text') or '').strip()[:60000]
        link = post_url(source, item.get('url',''), target)
        if not text or not link or not any(word in text.casefold() for word in words):
            continue
        # Permalink identity is shared across targets to avoid counting one post
        # twice. Mark only after classification AND database delivery succeed.
        identity = link[1]
        if identity in seen:
            continue
        forward({'source':source, 'post_id':identity, 'post_text':text,
                 'post_url':link[0], 'timestamp':item.get('created_at')})
        seen.add(identity)
        save(seen)
        processed += 1
        states[source]['posts_processed'] += 1
    return processed


def poll(source, stop, forward, load, save):
    path = BASE / '.state' / f'{source.lower()}_scraper_seen.json'
    seen = load(path)
    state = states[source]
    cursor = 0
    while not stop.is_set():
        versions = config_versions(source)
        wait = 30
        try:
            targets, words, seconds = settings(source)
            state.update(configured=bool(targets), running=bool(targets), target_count=len(targets), poll_seconds=seconds, last_error=None, posts_seen=0)
            wait = seconds if targets else 30
            errors = []
            # Rotate five search targets per cycle to cover all cities and
            # keywords without launching dozens of browsers simultaneously.
            batch = [targets[(cursor + offset) % len(targets)] for offset in range(min(5,len(targets)))] if targets else []
            cursor = (cursor + len(batch)) % len(targets) if targets else 0
            for target in batch:
                if stop.is_set():
                    break
                try:
                    items = fetch(source,target)
                    state['posts_seen'] += len(items)
                    process_posts(source,target,items,words,seen,forward,lambda ids:save(ids,path))
                except Exception as exc:
                    # Never send raw browser errors, session state or request
                    # headers to the dashboard or log.
                    errors.append(str(exc) if isinstance(exc, RuntimeError) else f'{source} collection or NLP delivery failed; retrying automatically.')
                    state['last_error'] = '; '.join(dict.fromkeys(errors))
                    if 'requires login' in errors[-1] or 'rate limit' in errors[-1]:
                        break
                stop.wait(2)
            state['last_error'] = '; '.join(dict.fromkeys(errors)) or None
            if targets:
                state['last_poll'] = time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
        except Exception:
            state.update(configured=False, running=False, last_error=f'Check {SOURCES[source]} and SOCIAL_SCRAPER settings in local .env.')
        deadline = time.monotonic() + wait
        while time.monotonic() < deadline and not stop.wait(min(5,deadline-time.monotonic())):
            if config_versions(source) != versions:
                break
    state['running'] = False


def start(stop, forward, load, save):
    for source in SOURCES:
        thread = threading.Thread(target=poll,args=(source,stop,forward,load,save),name=f'{source.lower()}-browser-collector',daemon=True)
        thread.start()
        threads.append(thread)


def shutdown():
    for thread in threads:
        thread.join(timeout=2)


def health():
    return {source:dict(state) for source,state in states.items()}
