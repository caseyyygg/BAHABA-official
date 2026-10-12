FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/tmp/huggingface-cache \
    MODEL_CACHE_DIR=/tmp/bantala-model-cache \
    X_KEYWORDS=[] \
    RSS_FEED_URLS=[] \
    APIFY_SOCIAL_ENABLED=false

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu 'torch>=2.6,<3' \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY app.py social_collectors.py scoped_collectors.py x_agent_reach.py social_browser.py ./
COPY vendor/ ./vendor/

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
