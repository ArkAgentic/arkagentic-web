# Ledgerly service scaffold

Minimal Cloud Run service for `ledgerly-backend`.

## Endpoints
- `GET /health` health check
- `GET /` service info

## Local run
```bash
cd services/ledgerly
npm install
npm start
```

## Docker build
```bash
docker build -t ledgerly-backend:local .
```
