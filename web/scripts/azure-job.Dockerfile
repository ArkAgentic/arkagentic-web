FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY scripts ./scripts

ENTRYPOINT ["sh", "/app/scripts/azure-job-run.sh"]
