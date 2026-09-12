## Diagnostic: Azure official billed items (7d)
| Resource Name | Resource Type | Actual Cost (USD) | Resource ID |
|---|---|---:|---|
| arkagentic | microsoft.cognitiveservices/accounts | 52.9286 | /subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/ai-resources-rg/providers/microsoft.cognitiveservices/accounts/arkagentic |
| arkag-mysql-private | microsoft.dbformysql/flexibleservers | 13.0356 | /subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/rg-arkagentic-prod/providers/microsoft.dbformysql/flexibleservers/arkag-mysql-private |
| arkag-vm-gateway | microsoft.compute/virtualmachines | 12.5536 | /subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/rg-arkagentic-prod/providers/microsoft.compute/virtualmachines/arkag-vm-gateway |
| arkag-pgvector | microsoft.dbforpostgresql/flexibleservers | 9.2676 | /subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/rg-arkagentic-prod/providers/microsoft.dbforpostgresql/flexibleservers/arkag-pgvector |
| arkag-redis-b1-eastasia | microsoft.cache/redisenterprise | 0.7385 | /subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/rg-arkagentic-prod/providers/microsoft.cache/redisenterprise/arkag-redis-b1-eastasia |

# Azure Milestone3 Spend Health (check-and-pulse)

- Generated: 2026-09-08T09:04:35.351Z
- Subscription: 59d44bfe-8130-434a-be8b-667739324fa7
- Latest settled day: 20260908
- Dynamic top-up threshold: $1.50
- Streak floor: $1.00 each workload
- Calculated Streak: 0

## Workload Status

| Workload | Resource Type | 24h Cost (USD) | Lookback Total (USD) | Status | Notes |
|---|---|---:|---:|---|---|
| Azure OpenAI / AI Foundry | microsoft.cognitiveservices/accounts | 0.01 | 52.93 | FAIL | latestDay=20260908 latest=$0.01 min=$1.50 action=PULSED |
| MySQL DB | microsoft.dbformysql/flexibleservers | 0.25 | 13.04 | FAIL | latestDay=20260908 latest=$0.25 min=$1.50 action=LIVE |
| Virtual Machine | microsoft.compute/virtualmachines | 0.22 | 12.55 | FAIL | latestDay=20260908 latest=$0.22 min=$1.50 action=LIVE |
| Redis Cache | microsoft.cache/redisenterprise | 0.49 | 0.74 | FAIL | latestDay=20260908 latest=$0.49 min=$1.50 action=SKIP |
| PostgreSQL DB | microsoft.dbforpostgresql/flexibleservers | 0.46 | 9.27 | FAIL | latestDay=20260908 latest=$0.46 min=$1.50 action=LIVE |

## Dynamic Top-up Actions

| Workload | Pulse Status | Detail |
|---|---|---|
| Azure OpenAI / AI Foundry | PULSED | ai batch=2, prompt=36, completion=481 |
| MySQL DB | LIVE | mysql state=Ready sku=Standard_B1ms |
| Virtual Machine | LIVE | vm powerState=unknown provisioningState=Succeeded |
| Redis Cache | SKIP | missing REDIS_KEY/AZURE_REDIS_KEY |
| PostgreSQL DB | LIVE | postgres connectivity OK |
