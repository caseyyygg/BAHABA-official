FROM python:3.12-slim
WORKDIR /service
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && playwright install --with-deps chromium
COPY app.py .
ENV SESSION_DIRECTORY=/data/social-sessions
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8003} --workers 1 --no-access-log"]
