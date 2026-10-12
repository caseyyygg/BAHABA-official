from __future__ import annotations

import hmac
import hashlib
import html
import json
import logging
import os
import sqlite3
import threading
import time
import zipfile
from contextlib import contextmanager
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import quote, urlencode, urlparse

import x_agent_reach
import social_collectors
import scoped_collectors
import feedparser
import torch
from fastapi import Depends, FastAPI, Header, HTTPException, Request as FastAPIRequest
from pydantic import BaseModel, Field
from starlette.responses import PlainTextResponse
from transformers import AutoModelForSequenceClassification, AutoModelForTokenClassification, AutoTokenizer

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("bahaba-nlp")

BASE_DIR = Path(__file__).resolve().parent
MODEL_CACHE = Path(os.getenv("MODEL_CACHE_DIR", str(BASE_DIR / "model-cache"))).resolve()
BAHABA_INGEST_URL = os.getenv("BAHABA_INGEST_URL", "http://127.0.0.1:8001/api.php?action=nlp-ingest")
BAHABA_INGEST_TOKEN = os.getenv("BAHABA_INGEST_TOKEN", "")
BAHABA_INGEST_TIMEOUT_SECONDS = max(15, int(os.getenv("BAHABA_INGEST_TIMEOUT_SECONDS", "90")))
NLP_SERVICE_TOKEN = os.getenv("NLP_SERVICE_TOKEN", "")
FACEBOOK_PAGE_ID = os.getenv("FACEBOOK_PAGE_ID", "").strip()
FACEBOOK_PAGE_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN", "")
FACEBOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")
FACEBOOK_WEBHOOK_VERIFY_TOKEN = os.getenv("FACEBOOK_WEBHOOK_VERIFY_TOKEN", "")
FACEBOOK_WEBHOOK_PUBLIC_URL = os.getenv("FACEBOOK_WEBHOOK_PUBLIC_URL", "").strip()
FACEBOOK_GRAPH_API_VERSION = os.getenv("FACEBOOK_GRAPH_API_VERSION", os.getenv("META_GRAPH_API_VERSION", "v24.0"))
FACEBOOK_POLL_SECONDS = max(30, int(os.getenv("FACEBOOK_POLL_SECONDS", "60")))
FACEBOOK_INITIAL_BACKFILL = max(0, min(25, int(os.getenv("FACEBOOK_INITIAL_BACKFILL", "10"))))
FACEBOOK_DEFAULT_CITY = os.getenv("FACEBOOK_DEFAULT_CITY", "").strip() or None
FACEBOOK_DEFAULT_BARANGAY = os.getenv("FACEBOOK_DEFAULT_BARANGAY", "").strip() or None
try:
    FACEBOOK_KEYWORDS = json.loads(os.getenv("FACEBOOK_KEYWORDS", "[]"))
except json.JSONDecodeError:
    FACEBOOK_KEYWORDS = []
FACEBOOK_KEYWORDS = list(dict.fromkeys(
    keyword.casefold().strip() for keyword in FACEBOOK_KEYWORDS[:20]
    if isinstance(keyword, str) and keyword.strip()
)) if isinstance(FACEBOOK_KEYWORDS, list) else []
X_PROVIDER = os.getenv("X_PROVIDER", "agent-reach").strip().lower()
XQUIK_API_KEY = os.getenv("XQUIK_API_KEY", "").strip()
try:
    X_KEYWORDS = json.loads(os.getenv("X_KEYWORDS", '["baha","flood","lubog"]'))
except json.JSONDecodeError:
    X_KEYWORDS = []
X_KEYWORDS = list(dict.fromkeys(
    keyword.strip() for keyword in X_KEYWORDS[:20]
    if isinstance(keyword, str) and keyword.strip()
)) if isinstance(X_KEYWORDS, list) else []
X_POLL_SECONDS = max(60, int(os.getenv("X_POLL_SECONDS", "60")))
X_MAX_RESULTS = max(1, min(100, int(os.getenv("X_MAX_RESULTS", "30"))))
X_INITIAL_BACKFILL = max(0, min(X_MAX_RESULTS, int(os.getenv("X_INITIAL_BACKFILL", "10"))))
X_SEARCH_ENDPOINT = "https://xquik.com/api/v1/x/tweets/search"
APIFY_API_TOKEN = os.getenv("APIFY_API_TOKEN", "").strip()
APIFY_SOCIAL_ENABLED = os.getenv("APIFY_SOCIAL_ENABLED", "false").strip().lower() in {"1", "true", "yes"}
try:
    APIFY_KEYWORDS = json.loads(os.getenv("APIFY_KEYWORDS", '["baha","flood","lubog"]'))
except json.JSONDecodeError:
    APIFY_KEYWORDS = []
APIFY_KEYWORDS = list(dict.fromkeys(
    keyword.casefold().strip() for keyword in APIFY_KEYWORDS[:20]
    if isinstance(keyword, str) and keyword.strip()
)) if isinstance(APIFY_KEYWORDS, list) else []
APIFY_POLL_SECONDS = max(300, int(os.getenv("APIFY_POLL_SECONDS", "3600")))
APIFY_MAX_RESULTS = max(1, min(100, int(os.getenv("APIFY_MAX_RESULTS", "3"))))
APIFY_MAX_TOTAL_CHARGE_USD = max(0.001, min(1.0, float(os.getenv("APIFY_MAX_TOTAL_CHARGE_USD", "0.01"))))
APIFY_ACTORS = {
    "Facebook": "scraper_one/facebook-posts-search",
    "X": "xquik/x-tweet-scraper",
    "Threads": "themineworks/threads-scraper",
}
try:
    RSS_FEED_URLS = json.loads(os.getenv("RSS_FEED_URLS", "[]"))
except json.JSONDecodeError:
    RSS_FEED_URLS = []
RSS_FEED_URLS = [
    value.strip()
    for value in RSS_FEED_URLS[:50]
    if isinstance(value, str) and urlparse(value.strip()).scheme in {"http", "https"} and urlparse(value.strip()).netloc
] if isinstance(RSS_FEED_URLS, list) else []
RSS_POLL_SECONDS = max(60, int(os.getenv("RSS_POLL_SECONDS", "300")))
RSS_INITIAL_BACKFILL = max(0, min(25, int(os.getenv("RSS_INITIAL_BACKFILL", "10"))))
RSS_DEFAULT_CITY = os.getenv("RSS_DEFAULT_CITY", "").strip() or None
RSS_DEFAULT_BARANGAY = os.getenv("RSS_DEFAULT_BARANGAY", "").strip() or None
MAX_TEXT_LENGTH = 60_000

MODEL_ARCHIVES = {
    "flood": os.getenv("FLOOD_MODEL_ZIP", ""),
    "severity": os.getenv("SEVERITY_MODEL_ZIP", ""),
    "urgency": os.getenv("URGENCY_MODEL_ZIP", ""),
    "location": os.getenv("LOCATION_MODEL_ZIP", ""),
}
HF_MODEL_REPO_ID = os.getenv("HF_MODEL_REPO_ID", "").strip()
HF_MODEL_REPO_TYPE = os.getenv("HF_MODEL_REPO_TYPE", "model").strip() or "model"
HF_MODEL_TOKEN = os.getenv("HF_TOKEN", "").strip()
MODEL_ARCHIVE_FILENAMES = {
    name: os.getenv(f"{name.upper()}_MODEL_FILENAME", f"{name}.zip").strip()
    for name in MODEL_ARCHIVES
}
NEEDED_MODEL_FILES = {
    "config.json",
    "model.safetensors",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.txt",
}

app = FastAPI(title="BAHABA FLOOD NLP", version="1.0.0")
models: dict[str, Any] = {}
tokenizers: dict[str, Any] = {}
model_lock = threading.Lock()
collector_stop = threading.Event()
collector_state: dict[str, Any] = {
    "configured": bool(FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN),
    "running": False,
    "last_poll": None,
    "last_post_at": None,
    "last_error": None,
    "posts_processed": 0,
}
x_collector_state: dict[str, Any] = {
    "configured": bool(X_KEYWORDS and (x_agent_reach.configured() if X_PROVIDER == "agent-reach" else XQUIK_API_KEY)),
    "running": False,
    "last_poll": None,
    "last_post_at": None,
    "last_error": None,
    "posts_seen": 0,
    "posts_processed": 0,
}
apify_collector_state: dict[str, Any] = {
    "configured": bool(APIFY_SOCIAL_ENABLED and APIFY_API_TOKEN and APIFY_KEYWORDS),
    "running": False,
    "last_poll": None,
    "last_error": None,
    "posts_seen": {source: 0 for source in APIFY_ACTORS},
    "posts_processed": {source: 0 for source in APIFY_ACTORS},
    "posts_seen_total": 0,
    "posts_processed_total": 0,
    "platform_errors": {source: None for source in APIFY_ACTORS},
}
rss_collector_state: dict[str, Any] = {
    "configured": bool(RSS_FEED_URLS),
    "running": False,
    "last_poll": None,
    "last_post_at": None,
    "last_error": None,
    "feeds_checked": 0,
    "items_seen": 0,
    "posts_processed": 0,
}
seen_posts_path = (BASE_DIR / ".state" / "facebook_seen_posts.json").resolve()
x_seen_posts_path = (BASE_DIR / ".state" / "x_seen_posts.json").resolve()
x_since_id_path = (BASE_DIR / ".state" / "x_since_id.txt").resolve()
apify_seen_posts_path = (BASE_DIR / ".state" / "apify_social_seen_posts.json").resolve()
rss_seen_posts_path = (BASE_DIR / ".state" / "rss_seen_posts.json").resolve()
webhook_queue_path = (BASE_DIR / ".state" / "facebook_webhook_queue.sqlite3").resolve()
collector_thread: threading.Thread | None = None
x_collector_thread: threading.Thread | None = None
apify_collector_thread: threading.Thread | None = None
rss_collector_thread: threading.Thread | None = None
webhook_worker_thread: threading.Thread | None = None
collector_state.update({
    "webhook_configured": bool(FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_APP_SECRET and FACEBOOK_WEBHOOK_VERIFY_TOKEN),
    "last_webhook_at": None,
    "webhooks_received": 0,
    "webhook_events_queued": 0,
    "webhook_events_processed": 0,
    "webhook_queue_depth": 0,
    "webhook_last_error": None,
})


class DetectionRequest(BaseModel):
    source: str = Field(default="Unknown", max_length=32)
    post_id: str | None = Field(default=None, max_length=191)
    post_text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    post_url: str | None = Field(default=None, max_length=2048)
    location: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=150)
    barangay: str | None = Field(default=None, max_length=150)
    timestamp: str | None = None


def _archive_path(name: str) -> Path:
    value = MODEL_ARCHIVES[name]
    if value:
        path = Path(value).expanduser().resolve()
        if not path.is_file():
            raise RuntimeError(f"Model archive for {name} does not exist at its configured local path")
        return path
    if not HF_MODEL_REPO_ID:
        raise RuntimeError("Set the model archive paths or HF_MODEL_REPO_ID")
    from huggingface_hub import hf_hub_download
    try:
        archive = hf_hub_download(
            repo_id=HF_MODEL_REPO_ID,
            filename=MODEL_ARCHIVE_FILENAMES[name],
            repo_type=HF_MODEL_REPO_TYPE,
            token=HF_MODEL_TOKEN or None,
        )
    except Exception as exc:
        raise RuntimeError(f"Could not download the private {name} model archive from Hugging Face") from exc
    return Path(archive)


def _ensure_model_files(name: str) -> Path:
    archive_path = _archive_path(name)
    model_dir = MODEL_CACHE / name
    marker = model_dir / "model.safetensors"
    if marker.is_file() and (model_dir / "config.json").is_file():
        return model_dir

    model_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Preparing %s model from %s", name, archive_path.name)
    try:
        with zipfile.ZipFile(archive_path) as archive:
            for entry in archive.infolist():
                basename = Path(entry.filename).name
                if basename not in NEEDED_MODEL_FILES or entry.is_dir():
                    continue
                destination = model_dir / basename
                with archive.open(entry) as source, destination.open("wb") as target:
                    while chunk := source.read(1024 * 1024):
                        target.write(chunk)
    except (OSError, zipfile.BadZipFile) as exc:
        raise RuntimeError(f"Could not prepare {name} checkpoint: {exc}") from exc

    missing = [filename for filename in ("config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json") if not (model_dir / filename).is_file()]
    if missing:
        raise RuntimeError(f"Archive for {name} is missing required files: {', '.join(missing)}")
    return model_dir


def load_models() -> None:
    with model_lock:
        if models:
            return
        pending_models: dict[str, Any] = {}
        pending_tokenizers: dict[str, Any] = {}
        for name in ("flood", "severity", "urgency", "location"):
            model_dir = str(_ensure_model_files(name))
            logger.info("Loading %s tokenizer and model on CPU", name)
            pending_tokenizers[name] = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
            model_class = AutoModelForTokenClassification if name == "location" else AutoModelForSequenceClassification
            pending_models[name] = model_class.from_pretrained(model_dir, local_files_only=True)
            pending_models[name].eval()
        tokenizers.update(pending_tokenizers)
        models.update(pending_models)
        logger.info("All four BAHABA NLP models are loaded")


def _classify(name: str, text: str) -> tuple[str, float]:
    encoded = tokenizers[name](text, truncation=True, max_length=512, return_tensors="pt")
    with torch.inference_mode():
        probabilities = torch.softmax(models[name](**encoded).logits[0], dim=-1)
    index = int(torch.argmax(probabilities).item())
    label = models[name].config.id2label.get(index, models[name].config.id2label.get(str(index), str(index)))
    return str(label), round(float(probabilities[index].item()) * 100, 2)


def _extract_location(text: str) -> str:
    tokenizer = tokenizers["location"]
    encoded = tokenizer(text, truncation=True, max_length=512, return_offsets_mapping=True, return_tensors="pt")
    offsets = encoded.pop("offset_mapping")[0].tolist()
    with torch.inference_mode():
        predictions = torch.argmax(models["location"](**encoded).logits[0], dim=-1).tolist()

    id2label = models["location"].config.id2label
    spans: list[tuple[int, int]] = []
    active_start: int | None = None
    active_end = 0
    for token_index, label_index in enumerate(predictions):
        start, end = offsets[token_index]
        if start == end:
            continue
        label = id2label.get(label_index, id2label.get(str(label_index), "O"))
        if label == "B-LOC":
            if active_start is not None:
                spans.append((active_start, active_end))
            active_start, active_end = start, end
        elif label == "I-LOC" and active_start is not None:
            active_end = end
        elif active_start is not None:
            spans.append((active_start, active_end))
            active_start = None
    if active_start is not None:
        spans.append((active_start, active_end))

    found: list[str] = []
    for start, end in spans:
        entity = text[start:end].strip(" ,.;:!?()[]{}\"'")
        if entity and entity not in found:
            found.append(entity)
    return ", ".join(found)[:255]


def _ingest(payload: dict[str, Any]) -> dict[str, Any]:
    if not BAHABA_INGEST_TOKEN:
        raise HTTPException(status_code=503, detail="BAHABA_INGEST_TOKEN is missing. Set the same local token in nlp-service/.env and in the PHP API environment/config.")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        BAHABA_INGEST_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {BAHABA_INGEST_TOKEN}",
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=BAHABA_INGEST_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.warning("BAHABA ingest rejected an NLP result: HTTP %s", exc.code)
        raise HTTPException(status_code=502, detail=f"BAHABA ingest API rejected the result (HTTP {exc.code}): {detail[:500]}") from exc
    except (URLError, TimeoutError) as exc:
        logger.warning("Could not connect to BAHABA ingest API: %s", exc)
        raise HTTPException(status_code=502, detail="Could not connect to the BAHABA admin ingest API") from exc


def _detect_and_forward(post: DetectionRequest) -> dict[str, Any]:
    load_models()
    flood_label, flood_confidence = _classify("flood", post.post_text)
    severity_label, _ = _classify("severity", post.post_text)
    urgency_label, _ = _classify("urgency", post.post_text)
    extracted_location = _extract_location(post.post_text)

    is_flood = flood_label.strip().lower().replace("_", " ") == "flood"
    severity = {"low": "Low", "medium": "Mid", "mid": "Mid", "high": "High"}.get(severity_label.strip().lower(), "Low")
    urgency = {"neutral": "Neutral", "concerned": "Concerned", "distressed": "Distress", "distress": "Distress"}.get(urgency_label.strip().lower(), "Neutral")
    result: dict[str, Any] = {
        "source": post.source,
        "post_id": post.post_id,
        "post_text": post.post_text,
        "post_url": post.post_url,
        "location": post.location or extracted_location or None,
        "city": post.city,
        "barangay": post.barangay,
        "timestamp": post.timestamp,
        "classification": "Flood" if is_flood else "Non-Flood",
        "severity": severity,
        "urgency": urgency,
        "confidence": flood_confidence,
    }
    return {"detection": result, "stored": _ingest(result)}


def _load_seen_post_ids(path: Path = seen_posts_path) -> set[str]:
    try:
        return set(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, TypeError):
        return set()


def _save_seen_post_ids(post_ids: set[str], path: Path = seen_posts_path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(sorted(post_ids)[-5000:]), encoding="utf-8")
    temporary.replace(path)


class _FeedTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if text:
            self.parts.append(text)


def _plain_feed_text(value: Any) -> str:
    parser = _FeedTextParser()
    parser.feed(html.unescape(str(value or "")))
    return " ".join(" ".join(parser.parts).split())


def _feed_entry_string(entry: Any, key: str) -> str:
    value = entry.get(key, "")
    if isinstance(value, dict):
        value = value.get("value", "")
    return _plain_feed_text(value)


def _normalize_feed_entry(entry: Any, feed_url: str, source_name: str) -> DetectionRequest | None:
    text_parts = [_feed_entry_string(entry, "title"), _feed_entry_string(entry, "summary")]
    content = entry.get("content", [])
    if isinstance(content, list):
        text_parts.extend(_feed_entry_string(item, "value") for item in content if isinstance(item, dict))
    post_text = " ".join(dict.fromkeys(part for part in text_parts if part))[:MAX_TEXT_LENGTH]
    if not post_text:
        return None

    post_url = str(entry.get("link", "")).strip()
    if not post_url.lower().startswith(("http://", "https://")):
        post_url = ""
    entry_key = str(entry.get("id") or entry.get("guid") or post_url or post_text)
    feed_scope = hashlib.sha256(feed_url.encode("utf-8")).hexdigest()[:16]
    post_id = f"{feed_scope}:{hashlib.sha256(entry_key.encode('utf-8')).hexdigest()}"
    parsed_date = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed_date:
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", parsed_date)
    else:
        timestamp = str(entry.get("published") or entry.get("updated") or "").strip() or None

    return DetectionRequest(
        source=(source_name.strip() or "Public feed")[:32],
        post_id=post_id,
        post_text=post_text,
        post_url=post_url or None,
        city=RSS_DEFAULT_CITY,
        barangay=RSS_DEFAULT_BARANGAY,
        timestamp=timestamp,
    )


def _fetch_public_feed(feed_url: str) -> tuple[str, list[Any]]:
    request = Request(
        feed_url,
        headers={
            "User-Agent": "BAHABA-Public-Feed-Collector/1.0",
            "Accept": "application/atom+xml, application/rss+xml, application/xml, text/xml",
        },
    )
    with urlopen(request, timeout=20) as response:
        content = response.read(5_000_001)
    if len(content) > 5_000_000:
        raise RuntimeError("Feed exceeded the 5 MB response limit")

    parsed = feedparser.parse(content)
    if parsed.bozo and not parsed.entries:
        raise RuntimeError("Feed was not valid RSS or Atom")
    source_name = _plain_feed_text(parsed.feed.get("title", "")) or "Public feed"
    return source_name[:32], list(parsed.entries)


def _public_feed_collector() -> None:
    seen_post_ids = _load_seen_post_ids(rss_seen_posts_path)
    rss_collector_state["running"] = True
    logger.info("Public RSS/Atom collector started for %s feeds; polling every %s seconds", len(RSS_FEED_URLS), RSS_POLL_SECONDS)

    while not collector_stop.is_set():
        rss_collector_state["last_error"] = None
        rss_collector_state["feeds_checked"] = 0
        rss_collector_state["items_seen"] = 0
        for feed_url in RSS_FEED_URLS:
            try:
                source_name, entries = _fetch_public_feed(feed_url)
                rss_collector_state["feeds_checked"] += 1
                rss_collector_state["items_seen"] += len(entries)
                posts = [
                    post
                    for entry in reversed(entries)
                    if (post := _normalize_feed_entry(entry, feed_url, source_name)) is not None
                ]
                feed_scope = hashlib.sha256(feed_url.encode("utf-8")).hexdigest()[:16] + ":"
                if not any(post_id.startswith(feed_scope) for post_id in seen_post_ids) and RSS_INITIAL_BACKFILL:
                    posts = posts[-RSS_INITIAL_BACKFILL:]

                for post in posts:
                    if not post.post_id or post.post_id in seen_post_ids:
                        continue
                    try:
                        _detect_and_forward(post)
                        seen_post_ids.add(post.post_id)
                        rss_collector_state["posts_processed"] += 1
                        rss_collector_state["last_post_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    except Exception as exc:
                        rss_collector_state["last_error"] = str(exc)[:500]
                        logger.exception("Could not classify or forward a public feed item")
                        break
                _save_seen_post_ids(seen_post_ids, rss_seen_posts_path)
            except HTTPError as exc:
                rss_collector_state["last_error"] = f"Public feed HTTP {exc.code}"
                logger.warning("Public feed returned HTTP %s: %s", exc.code, feed_url)
            except (URLError, TimeoutError) as exc:
                rss_collector_state["last_error"] = "Could not connect to a public feed"
                logger.warning("Could not fetch public feed %s: %s", feed_url, exc)
            except Exception as exc:
                rss_collector_state["last_error"] = str(exc)[:500]
                logger.exception("Public feed collection failed for %s", feed_url)

        rss_collector_state["last_poll"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        collector_stop.wait(RSS_POLL_SECONDS)

    rss_collector_state["running"] = False


def _fetch_facebook_page_posts() -> list[dict[str, Any]]:
    url = f"https://graph.facebook.com/{FACEBOOK_GRAPH_API_VERSION}/{FACEBOOK_PAGE_ID}/posts?fields=id,message,permalink_url,created_time&limit=25"
    request = Request(url, headers={"Authorization": f"Bearer {FACEBOOK_PAGE_ACCESS_TOKEN}", "Accept": "application/json"})
    with urlopen(request, timeout=25) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload.get("data", [])


def _facebook_page_collector() -> None:
    seen_post_ids = _load_seen_post_ids()
    collector_state["running"] = True
    logger.info("Facebook Page collector started; polling every %s seconds", FACEBOOK_POLL_SECONDS)

    while not collector_stop.is_set():
        try:
            posts = _fetch_facebook_page_posts()
            collector_state["last_poll"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            collector_state["last_error"] = None
            unseen = [post for post in reversed(posts) if post.get("id") and post["id"] not in seen_post_ids]
            if not seen_post_ids and FACEBOOK_INITIAL_BACKFILL:
                unseen = unseen[-FACEBOOK_INITIAL_BACKFILL:]

            for post in unseen:
                post_id = str(post.get("id", ""))
                message = str(post.get("message", "")).strip()
                if not message:
                    seen_post_ids.add(post_id)
                    continue
                if not _matches_facebook_keywords(message):
                    seen_post_ids.add(post_id)
                    continue

                try:
                    request_data = DetectionRequest(
                        source="Facebook",
                        post_id=post_id,
                        post_text=message,
                        post_url=post.get("permalink_url"),
                        city=FACEBOOK_DEFAULT_CITY,
                        barangay=FACEBOOK_DEFAULT_BARANGAY,
                        timestamp=post.get("created_time"),
                    )
                    _detect_and_forward(request_data)
                    seen_post_ids.add(post_id)
                    collector_state["posts_processed"] += 1
                    collector_state["last_post_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    logger.info("Processed Facebook Page post %s", post_id)
                except Exception as exc:
                    collector_state["last_error"] = str(exc)[:500]
                    logger.exception("Could not classify or forward Facebook Page post %s", post_id)
                    break

            _save_seen_post_ids(seen_post_ids)
        except HTTPError as exc:
            collector_state["last_error"] = f"Facebook Graph API HTTP {exc.code}"
            logger.error("Facebook Graph API returned HTTP %s; check Page token and permissions", exc.code)
        except (URLError, TimeoutError) as exc:
            collector_state["last_error"] = "Could not connect to Facebook Graph API"
            logger.error("Facebook Graph API connection failed: %s", exc)
        except Exception as exc:
            collector_state["last_error"] = str(exc)[:500]
            logger.exception("Facebook Page collector failed")

        collector_stop.wait(FACEBOOK_POLL_SECONDS)

    collector_state["running"] = False


def _matches_facebook_keywords(message: str) -> bool:
    if not FACEBOOK_KEYWORDS:
        return True
    normalized_message = message.casefold()
    return any(keyword in normalized_message for keyword in FACEBOOK_KEYWORDS)


def _build_x_search_query() -> str:
    terms = [f'"{keyword.replace(chr(92), chr(92) * 2).replace(chr(34), chr(92) + chr(34))}"' for keyword in X_KEYWORDS]
    if not terms:
        raise RuntimeError("Set X_KEYWORDS before starting X collection")
    return f"({' OR '.join(terms)}) -is:retweet"


def _fetch_x_recent_posts(since_id: str | None) -> dict[str, Any]:
    if X_PROVIDER == "agent-reach":
        x_collector_state["configured"] = bool(X_KEYWORDS and x_agent_reach.configured())
        return x_agent_reach.fetch_posts(X_KEYWORDS, X_MAX_RESULTS)
    params: dict[str, str] = {
        "q": _build_x_search_query(),
        "queryType": "Latest",
        "limit": str(X_MAX_RESULTS),
        "withinTime": "7d",
    }
    if since_id:
        params["sinceId"] = since_id
    request = Request(
        f"{X_SEARCH_ENDPOINT}?{urlencode(params)}",
        headers={"x-api-key": XQUIK_API_KEY, "Accept": "application/json"},
    )
    with urlopen(request, timeout=25) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("X returned an unexpected search response")
    return payload


def _normalize_x_post(item: dict[str, Any]) -> DetectionRequest | None:
    post_id = str(item.get("id", "")).strip()
    post_text = str(item.get("text", "")).strip()
    if not post_id or not post_text:
        return None
    author = item.get("author") or {}
    username = str(author.get("username", "")).strip() if isinstance(author, dict) else ""
    post_url = str(item.get("url", "")).strip()
    if not post_url:
        post_url = f"https://x.com/{username}/status/{post_id}" if username else f"https://x.com/i/web/status/{post_id}"
    return DetectionRequest(
        source="X",
        post_id=post_id[:191],
        post_text=post_text[:MAX_TEXT_LENGTH],
        post_url=post_url,
        timestamp=str(item.get("createdAt", "")).strip() or None,
    )


def _load_x_since_id() -> str | None:
    try:
        since_id = x_since_id_path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return since_id if since_id.isdigit() else None


def _save_x_since_id(since_id: str) -> None:
    x_since_id_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = x_since_id_path.with_suffix(".tmp")
    temporary.write_text(since_id, encoding="utf-8")
    temporary.replace(x_since_id_path)


def _x_collector() -> None:
    seen_post_ids = _load_seen_post_ids(x_seen_posts_path)
    since_id = _load_x_since_id()
    x_collector_state["running"] = True
    logger.info("X collector (%s) started; polling every %s seconds", X_PROVIDER, X_POLL_SECONDS)

    while not collector_stop.is_set():
        try:
            payload = _fetch_x_recent_posts(since_id)
            posts = payload.get("tweets") or []
            x_collector_state["posts_seen"] = len(posts)
            x_collector_state["last_error"] = None
            x_collector_state["last_poll"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            if not since_id and X_PROVIDER != "agent-reach":
                posts = posts[:X_INITIAL_BACKFILL]

            processing_failed = False
            for item in reversed(posts):
                post = _normalize_x_post(item)
                if not post or not post.post_id or post.post_id in seen_post_ids:
                    continue
                try:
                    _detect_and_forward(post)
                    seen_post_ids.add(post.post_id)
                    x_collector_state["posts_processed"] += 1
                    x_collector_state["last_post_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                except Exception as exc:
                    x_collector_state["last_error"] = str(exc)[:500]
                    logger.exception("Could not classify or forward an X post")
                    processing_failed = True
                    break

            _save_seen_post_ids(seen_post_ids, x_seen_posts_path)
            if not processing_failed:
                post_ids = [str(post.get("id", "")) for post in payload.get("tweets", []) if str(post.get("id", "")).isdigit()]
                newest_id = max(post_ids, key=int, default="")
                if newest_id.isdigit() and (not since_id or int(newest_id) > int(since_id)):
                    since_id = newest_id
                    _save_x_since_id(since_id)
        except HTTPError as exc:
            x_collector_state["last_error"] = f"Xquik API HTTP {exc.code}; check API access, credits, or rate limits"
            logger.warning("Xquik search API returned HTTP %s", exc.code)
        except (URLError, TimeoutError) as exc:
            x_collector_state["last_error"] = "Could not connect to Xquik search API"
            logger.warning("Xquik search API connection failed: %s", exc)
        except Exception as exc:
            x_collector_state["last_error"] = str(exc)[:500]
            logger.warning("X collector (%s): %s", X_PROVIDER, x_collector_state["last_error"])

        wait_seconds = max(300, X_POLL_SECONDS) if "rate limit" in str(x_collector_state["last_error"]).lower() else X_POLL_SECONDS
        collector_stop.wait(wait_seconds)

    x_collector_state["running"] = False


def _apify_actor_jobs() -> list[tuple[str, str, dict[str, Any]]]:
    if not APIFY_KEYWORDS:
        raise RuntimeError("Set APIFY_KEYWORDS before enabling Apify collection")

    jobs: list[tuple[str, str, dict[str, Any]]] = []
    facebook_actor = APIFY_ACTORS["Facebook"]
    for keyword in APIFY_KEYWORDS:
        jobs.append(("Facebook", facebook_actor, {
            "query": keyword,
            "resultsCount": APIFY_MAX_RESULTS,
            "searchType": "latest",
        }))

    jobs.append(("X", APIFY_ACTORS["X"], {
        "searchTerms": APIFY_KEYWORDS,
        "maxItems": APIFY_MAX_RESULTS * len(APIFY_KEYWORDS),
        "queryType": "Latest",
        "outputVariant": "rich",
        "fieldStyle": "camelCase",
    }))

    threads_actor = APIFY_ACTORS["Threads"]
    for keyword in APIFY_KEYWORDS:
        jobs.append(("Threads", threads_actor, {
            "mode": "search",
            "searchQuery": keyword,
            "maxPosts": APIFY_MAX_RESULTS,
            "resultType": "recent",
            "monitorMode": True,
        }))
    return jobs


def _fetch_apify_actor_items(actor_id: str, actor_input: dict[str, Any]) -> list[dict[str, Any]]:
    actor_path = quote(actor_id.replace("/", "~"), safe="~")
    query = urlencode({
        "timeout": "300",
        "format": "json",
        "clean": "true",
        "maxTotalChargeUsd": f"{APIFY_MAX_TOTAL_CHARGE_USD:.3f}",
    })
    request = Request(
        f"https://api.apify.com/v2/acts/{actor_path}/run-sync-get-dataset-items?{query}",
        data=json.dumps(actor_input, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {APIFY_API_TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=360) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError("Apify returned an unexpected dataset response")
    return [item for item in payload if isinstance(item, dict)]


def _apify_timestamp(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 100_000_000_000:
            timestamp /= 1000
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp))
    return str(value).strip() or None


def _normalize_apify_social_post(source: str, item: dict[str, Any]) -> DetectionRequest | None:
    post_id = str(item.get("postId") or item.get("post_id") or item.get("id") or "").strip()
    post_text = str(item.get("postText") or item.get("text") or item.get("content") or "").strip()
    if not post_text:
        return None
    if not post_id:
        post_id = hashlib.sha256(post_text.encode("utf-8")).hexdigest()

    post_url = str(item.get("postUrl") or item.get("post_url") or item.get("postUrl") or item.get("url") or "").strip()
    if not post_url.lower().startswith(("http://", "https://")):
        post_url = ""
    posted_at = item.get("createdAt") or item.get("posted_at") or item.get("created_at") or item.get("timestamp")

    return DetectionRequest(
        source=source,
        post_id=post_id[:191],
        post_text=post_text[:MAX_TEXT_LENGTH],
        post_url=post_url or None,
        timestamp=_apify_timestamp(posted_at),
    )


def _matches_apify_keywords(message: str) -> bool:
    normalized_message = message.casefold()
    return any(keyword in normalized_message for keyword in APIFY_KEYWORDS)


def _apify_social_collector() -> None:
    seen_post_ids = _load_seen_post_ids(apify_seen_posts_path)
    apify_collector_state["running"] = True
    logger.info(
        "Apify social collector started for %s platforms; polling every %s seconds with %s results per run",
        len(APIFY_ACTORS), APIFY_POLL_SECONDS, APIFY_MAX_RESULTS,
    )

    while not collector_stop.is_set():
        total_seen = 0
        total_processed = 0
        apify_collector_state["posts_seen"] = {source: 0 for source in APIFY_ACTORS}
        for source, actor_id, actor_input in _apify_actor_jobs():
            try:
                items = _fetch_apify_actor_items(actor_id, actor_input)
                apify_collector_state["posts_seen"][source] += len(items)
                apify_collector_state["platform_errors"][source] = None
                total_seen += len(items)

                for item in items:
                    post = _normalize_apify_social_post(source, item)
                    if not post or not post.post_id:
                        continue
                    seen_key = f"{source}:{post.post_id}"
                    if seen_key in seen_post_ids:
                        continue
                    if not _matches_apify_keywords(post.post_text):
                        seen_post_ids.add(seen_key)
                        continue
                    try:
                        _detect_and_forward(post)
                        seen_post_ids.add(seen_key)
                        total_processed += 1
                        apify_collector_state["posts_processed"][source] += 1
                    except Exception as exc:
                        apify_collector_state["platform_errors"][source] = str(exc)[:500]
                        logger.exception("Could not classify or forward an Apify %s post", source)
                        break
            except HTTPError as exc:
                apify_collector_state["platform_errors"][source] = f"Apify HTTP {exc.code}"
                logger.warning("Apify %s actor returned HTTP %s", source, exc.code)
            except (URLError, TimeoutError) as exc:
                apify_collector_state["platform_errors"][source] = "Could not connect to Apify API"
                logger.warning("Apify %s request failed: %s", source, exc)
            except Exception as exc:
                apify_collector_state["platform_errors"][source] = str(exc)[:500]
                logger.exception("Apify %s collection failed", source)
            finally:
                _save_seen_post_ids(seen_post_ids, apify_seen_posts_path)

        apify_collector_state["posts_seen_total"] = total_seen
        apify_collector_state["posts_processed_total"] += total_processed
        apify_collector_state["last_poll"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        apify_collector_state["last_error"] = "; ".join(
            f"{source}: {error}" for source, error in apify_collector_state["platform_errors"].items() if error
        ) or None
        collector_stop.wait(APIFY_POLL_SECONDS)

    apify_collector_state["running"] = False


@contextmanager
def _webhook_queue_connection():
    webhook_queue_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(webhook_queue_path, timeout=15)
    try:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS facebook_webhook_queue ("
            "event_key TEXT PRIMARY KEY, page_id TEXT NOT NULL, change_json TEXT NOT NULL, "
            "status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, "
            "last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _queue_facebook_webhook(payload: dict[str, Any]) -> int:
    if payload.get("object") != "page":
        raise HTTPException(status_code=400, detail="Expected a Facebook Page webhook payload")

    queued = 0
    with _webhook_queue_connection() as connection:
        for entry in payload.get("entry", []):
            page_id = str(entry.get("id", ""))
            if page_id != FACEBOOK_PAGE_ID:
                logger.info("Ignoring Facebook webhook entry for an unconfigured Page")
                continue
            for change in entry.get("changes", []):
                value = change.get("value") or {}
                if change.get("field") != "feed" or value.get("item") != "post" or value.get("verb") != "add":
                    continue
                post_id = str(value.get("post_id") or value.get("id") or "").strip()
                if not post_id:
                    continue
                event_key = f"{page_id}:{post_id}"
                cursor = connection.execute(
                    "INSERT OR IGNORE INTO facebook_webhook_queue (event_key, page_id, change_json) VALUES (?, ?, ?)",
                    (event_key, page_id, json.dumps(value, ensure_ascii=False)),
                )
                queued += cursor.rowcount

    collector_state["last_webhook_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    collector_state["webhooks_received"] += 1
    collector_state["webhook_events_queued"] += queued
    collector_state["webhook_queue_depth"] = _webhook_queue_depth()
    return queued


def _webhook_queue_depth() -> int:
    if not webhook_queue_path.exists():
        return 0
    try:
        with _webhook_queue_connection() as connection:
            row = connection.execute("SELECT COUNT(*) FROM facebook_webhook_queue WHERE status = 'queued'").fetchone()
            return int(row[0] if row else 0)
    except sqlite3.Error:
        logger.exception("Could not read Facebook webhook queue depth")
        return 0


def _fetch_facebook_post(post_id: str, change: dict[str, Any]) -> dict[str, Any]:
    graph_post_id = post_id
    if not FACEBOOK_PAGE_ACCESS_TOKEN:
        return change
    fields = "id,message,permalink_url,created_time,from"
    url = f"https://graph.facebook.com/{FACEBOOK_GRAPH_API_VERSION}/{graph_post_id}?{urlencode({'fields': fields})}"
    request = Request(url, headers={"Authorization": f"Bearer {FACEBOOK_PAGE_ACCESS_TOKEN}", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=15) as response:
            detail = json.loads(response.read().decode("utf-8"))
        return {**change, **detail}
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Could not fetch full details for Page post %s: %s", post_id, exc)
        return change


def _process_webhook_event(event_key: str, page_id: str, change: dict[str, Any]) -> None:
    post_id = str(change.get("post_id") or change.get("id") or "").strip()
    details = _fetch_facebook_post(post_id, change)
    message = str(details.get("message") or change.get("message") or "").strip()
    if not message:
        logger.info("Skipping Page post %s because it contains no readable text", post_id)
        return
    if not _matches_facebook_keywords(message):
        logger.info("Skipping Page post %s because it did not match a configured keyword", post_id)
        return

    request_data = DetectionRequest(
        source="Facebook",
        post_id=post_id,
        post_text=message,
        post_url=details.get("permalink_url") or details.get("link") or change.get("permalink_url") or change.get("link"),
        city=FACEBOOK_DEFAULT_CITY,
        barangay=FACEBOOK_DEFAULT_BARANGAY,
        timestamp=details.get("created_time") or change.get("created_time"),
    )
    _detect_and_forward(request_data)
    collector_state["webhook_events_processed"] += 1
    collector_state["last_post_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    collector_state["webhook_last_error"] = None


def _facebook_webhook_worker() -> None:
    collector_state["running"] = True
    logger.info("Facebook Page webhook queue worker started")
    while not collector_stop.is_set():
        event: tuple[str, str, str] | None = None
        try:
            with _webhook_queue_connection() as connection:
                row = connection.execute(
                    "SELECT event_key, page_id, change_json FROM facebook_webhook_queue WHERE status = 'queued' ORDER BY created_at LIMIT 1"
                ).fetchone()
                if row:
                    event_key, page_id, change_json = row
                    connection.execute(
                        "UPDATE facebook_webhook_queue SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE event_key = ?",
                        (event_key,),
                    )
                    event = (event_key, page_id, change_json)
            collector_state["webhook_queue_depth"] = _webhook_queue_depth()
            if event:
                event_key, page_id, change_json = event
                try:
                    _process_webhook_event(event_key, page_id, json.loads(change_json))
                    status, error = "done", None
                except Exception as exc:
                    status, error = "failed", str(exc)[:500]
                    collector_state["webhook_last_error"] = error
                    logger.exception("Facebook webhook post processing failed for %s", event_key)
                with _webhook_queue_connection() as connection:
                    connection.execute(
                        "UPDATE facebook_webhook_queue SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_key = ?",
                        (status, error, event_key),
                    )
                continue
        except sqlite3.Error as exc:
            collector_state["webhook_last_error"] = "Webhook queue database error"
            logger.exception("Facebook webhook queue failed")
        collector_stop.wait(0.5)
    collector_state["running"] = False


@app.on_event("startup")
def start_facebook_collector() -> None:
    global apify_collector_thread, rss_collector_thread, x_collector_thread
    collector_stop.clear()
    scoped_collectors.start(collector_stop, lambda payload: _detect_and_forward(DetectionRequest(**payload)), _load_seen_post_ids, _save_seen_post_ids)
    social_collectors.start(collector_stop, lambda payload: _detect_and_forward(DetectionRequest(**payload)), _load_seen_post_ids, _save_seen_post_ids)
    if X_KEYWORDS and (X_PROVIDER == "agent-reach" or x_collector_state["configured"]):
        collector_stop.clear()
        x_collector_thread = threading.Thread(target=_x_collector, name="agent-reach-x-collector", daemon=True)
        x_collector_thread.start()
    if apify_collector_state["configured"]:
        collector_stop.clear()
        apify_collector_thread = threading.Thread(target=_apify_social_collector, name="apify-social-collector", daemon=True)
        apify_collector_thread.start()
        logger.info("Apify is the active social collector for Facebook, X, and Threads")
    else:
        logger.info("Apify social collection is disabled until APIFY_SOCIAL_ENABLED, APIFY_API_TOKEN, and APIFY_KEYWORDS are configured locally")

    if rss_collector_state["configured"]:
        collector_stop.clear()
        rss_collector_thread = threading.Thread(target=_public_feed_collector, name="public-feed-collector", daemon=True)
        rss_collector_thread.start()
    else:
        logger.info("Public RSS/Atom collector is disabled until RSS_FEED_URLS is configured locally")


@app.on_event("shutdown")
def stop_facebook_collector() -> None:
    collector_stop.set()
    social_collectors.shutdown()
    if x_collector_thread:
        x_collector_thread.join(timeout=5)
    if apify_collector_thread:
        apify_collector_thread.join(timeout=5)
    if rss_collector_thread:
        rss_collector_thread.join(timeout=5)


def require_collector_token(authorization: str | None = Header(default=None)) -> None:
    if not NLP_SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="NLP_SERVICE_TOKEN is not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Collector bearer token required")
    supplied = authorization[7:].strip()
    if not hmac.compare_digest(supplied, NLP_SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid collector token")


@app.get("/health")
def health() -> dict[str, Any]:
    if collector_state["webhook_configured"]:
        collection_mode = "webhook"
    elif collector_state["configured"]:
        collection_mode = "polling"
    else:
        collection_mode = "not_configured"
    return {
        "service": "bahaba-flood-nlp",
        "social_browser_collectors": social_collectors.health(),
        "lgu_social_collectors": scoped_collectors.health(),
        "models_loaded": bool(models),
        "model_archives_configured": bool(HF_MODEL_REPO_ID) or all(bool(value) for value in MODEL_ARCHIVES.values()),
        "bahaba_ingest_configured": bool(BAHABA_INGEST_TOKEN),
        "collector_auth_configured": bool(NLP_SERVICE_TOKEN),
        "facebook_collector_configured": collector_state["configured"],
        "facebook_collection_mode": collection_mode,
        "facebook_webhook_configured": collector_state["webhook_configured"],
        "facebook_webhook_public_url": FACEBOOK_WEBHOOK_PUBLIC_URL,
        "facebook_collector_running": collector_state["running"],
        "facebook_last_poll": collector_state["last_poll"],
        "facebook_last_post_at": collector_state["last_post_at"],
        "facebook_last_error": collector_state["last_error"],
        "facebook_posts_processed": collector_state["posts_processed"],
        "facebook_webhooks_received": collector_state["webhooks_received"],
        "facebook_webhook_events_queued": collector_state["webhook_events_queued"],
        "facebook_webhook_events_processed": collector_state["webhook_events_processed"],
        "facebook_webhook_queue_depth": collector_state["webhook_queue_depth"],
        "facebook_last_webhook_at": collector_state["last_webhook_at"],
        "facebook_webhook_last_error": collector_state["webhook_last_error"],
        "facebook_keyword_count": len(FACEBOOK_KEYWORDS),
        "apify_social_configured": apify_collector_state["configured"],
        "apify_social_running": apify_collector_state["running"],
        "apify_platforms": list(APIFY_ACTORS),
        "apify_keyword_count": len(APIFY_KEYWORDS),
        "apify_poll_seconds": APIFY_POLL_SECONDS,
        "apify_max_results_per_actor": APIFY_MAX_RESULTS,
        "apify_max_total_charge_per_actor_usd": APIFY_MAX_TOTAL_CHARGE_USD,
        "apify_last_poll": apify_collector_state["last_poll"],
        "apify_last_error": apify_collector_state["last_error"],
        "apify_posts_seen": apify_collector_state["posts_seen"],
        "apify_posts_processed": apify_collector_state["posts_processed"],
        "apify_posts_seen_total": apify_collector_state["posts_seen_total"],
        "apify_posts_processed_total": apify_collector_state["posts_processed_total"],
        "apify_platform_errors": apify_collector_state["platform_errors"],
        "x_provider": X_PROVIDER,
        "x_poll_seconds": X_POLL_SECONDS,
        "x_collector_configured": x_collector_state["configured"],
        "x_collector_running": x_collector_state["running"],
        "x_keyword_count": len(X_KEYWORDS),
        "x_last_poll": x_collector_state["last_poll"],
        "x_last_post_at": x_collector_state["last_post_at"],
        "x_last_error": x_collector_state["last_error"],
        "x_posts_seen": x_collector_state["posts_seen"],
        "x_posts_processed": x_collector_state["posts_processed"],
        "rss_collector_configured": rss_collector_state["configured"],
        "rss_collector_running": rss_collector_state["running"],
        "rss_feed_count": len(RSS_FEED_URLS),
        "rss_last_poll": rss_collector_state["last_poll"],
        "rss_last_post_at": rss_collector_state["last_post_at"],
        "rss_last_error": rss_collector_state["last_error"],
        "rss_feeds_checked": rss_collector_state["feeds_checked"],
        "rss_items_seen": rss_collector_state["items_seen"],
        "rss_posts_processed": rss_collector_state["posts_processed"],
    }


@app.get("/webhooks/facebook")
async def verify_facebook_webhook(request: FastAPIRequest) -> PlainTextResponse:
    if not collector_state["webhook_configured"]:
        raise HTTPException(status_code=503, detail="Facebook webhook is not configured")
    query = request.query_params
    mode = query.get("hub.mode")
    verify_token = query.get("hub.verify_token", "")
    challenge = query.get("hub.challenge", "")
    if mode != "subscribe" or not hmac.compare_digest(verify_token, FACEBOOK_WEBHOOK_VERIFY_TOKEN):
        raise HTTPException(status_code=403, detail="Invalid Facebook webhook verification request")
    return PlainTextResponse(challenge, status_code=200)


@app.post("/webhooks/facebook")
async def receive_facebook_webhook(request: FastAPIRequest) -> dict[str, Any]:
    if not collector_state["webhook_configured"]:
        raise HTTPException(status_code=503, detail="Facebook webhook is not configured")

    raw_body = await request.body()
    supplied_signature = request.headers.get("x-hub-signature-256", "")
    expected_signature = "sha256=" + hmac.new(FACEBOOK_APP_SECRET.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not supplied_signature or not hmac.compare_digest(supplied_signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid Facebook webhook signature")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Webhook payload must be valid JSON") from exc

    queued = _queue_facebook_webhook(payload)
    return {"received": True, "queued": queued}


@app.post("/detect", dependencies=[Depends(require_collector_token)])
def detect(post: DetectionRequest) -> dict[str, Any]:
    try:
        return _detect_and_forward(post)
    except Exception as exc:
        logger.exception("NLP model initialization failed")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
