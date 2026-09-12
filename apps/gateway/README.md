# ArkAgentic Web

## Getting Started

```bash
npm run dev
```

## Azure Milestone 3 automation

- Keepalive heartbeat (OpenAI + PostgreSQL + Blob + Log Analytics):

```bash
npm run azure:keepalive
```

- Spend health markdown report:

```bash
npm run azure:spend
```

- Export latest spend report and upload to Blob (`milestone3-reports`):

```bash
npm run azure:report
```

- One-shot local simulation of the cloud job flow:

```bash
npm run azure:job:run
```

- List latest uploaded XLSX reports from Blob:

```bash
az storage blob list \
  --account-name arkag0807050122 \
  --container-name milestone3-reports \
  --prefix spend/ \
  --account-key "$(az storage account keys list -g rg-arkagentic-prod -n arkag0807050122 --query '[0].value' -o tsv)" \
  --query "[].{name:name,lastModified:properties.lastModified,size:properties.contentLength}" \
  -o table
```
