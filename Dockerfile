# ---- Stage 1: build the React frontend ----
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: FastAPI backend serving the API and the built frontend ----
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    DATA_DIR=/data STATIC_DIR=/app/static APP_ENV=production
# Every dependency, direct and indirect, is pinned with hashes; pip refuses anything that doesn't match.
COPY backend/requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY backend/app ./app
COPY --from=web /web/dist ./static
RUN useradd --create-home --uid 10001 appuser && mkdir -p /data && chown appuser /data
USER appuser
EXPOSE 8000
# Readiness, not just liveness: the database must accept writes and the disk must have room.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://localhost:8000/readyz',timeout=4).status==200 else 1)"
# One worker on purpose: sessions, rate limits and the store cache live in this process.
# Proxy headers are trusted only from private networks (Caddy runs in the compose network).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16", \
     "--timeout-keep-alive", "30", "--timeout-graceful-shutdown", "20"]
