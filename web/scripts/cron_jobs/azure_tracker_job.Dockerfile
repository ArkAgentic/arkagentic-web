FROM mcr.microsoft.com/azure-cli:2.63.0

WORKDIR /app

# Python + deps for xlsx scripts
RUN apk add --no-cache python3 py3-pip nodejs npm bash \
 && python3 -m pip install --no-cache-dir openpyxl requests

# Project files needed by cron jobs
COPY scripts ./scripts
COPY src ./src
COPY package.json package-lock.json* ./

# Node runtime deps for DB sync scripts (pg)
RUN npm ci --omit=dev --no-audit --no-fund

ENTRYPOINT ["bash", "/app/scripts/cron_jobs/azure_daily_tracker_job.sh"]
