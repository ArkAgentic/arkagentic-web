import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import pg from "pg";
import { fileURLToPath } from "url";
import { encryptSecret } from "./db/encryption.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

function pickEnv(...keys) {
  for (const key of keys) {
    const v = process.env[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function normalizeBaseUrl(raw) {
  const base = String(raw || "").trim().replace(/\/$/, "");
  if (!base) return "";
  return base.replace(/\/openai(?:\/v\d+)?$/i, "");
}

function inferAccountNameFromEndpoint(endpoint) {
  try {
    const host = new URL(endpoint).host;
    return host.split(".")[0] || "";
  } catch {
    return "";
  }
}

function normalizeArkModelId(deploymentName) {
  const normalized = String(deploymentName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!normalized) return "";
  return normalized.startsWith("ark-") ? normalized : `ark-${normalized}`;
}

function parseStatus(item) {
  return String(
    item?.status ||
      item?.properties?.provisioningState ||
      item?.properties?.status ||
      item?.provisioningState ||
      "",
  ).toLowerCase();
}

function parseDeploymentModel(item) {
  return (
    item?.model ||
    item?.properties?.model?.name ||
    item?.properties?.model ||
    item?.properties?.modelFormat ||
    item?.properties?.modelName ||
    item?.name ||
    ""
  );
}

function parseDeploymentType(item) {
  return (
    item?.sku?.name ||
    item?.properties?.sku?.name ||
    item?.properties?.deploymentType ||
    item?.properties?.scaleSettings?.scaleType ||
    "unknown"
  );
}

async function fetchDataPlaneDeployments({ baseUrl, apiKey }) {
  const apiVersion = pickEnv("AZURE_OPENAI_DEPLOYMENTS_API_VERSION", "AZURE_OPENAI_API_VERSION") || "2024-10-21";
  const url = `${normalizeBaseUrl(baseUrl)}/openai/deployments?api-version=${encodeURIComponent(apiVersion)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  const raw = await resp.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Azure data-plane returned non-JSON (${resp.status}): ${raw.slice(0, 400)}`);
  }

  if (!resp.ok) {
    throw new Error(`Azure data-plane list deployments failed (${resp.status}): ${raw.slice(0, 400)}`);
  }

  const items = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.value)
      ? json.value
      : Array.isArray(json)
        ? json
        : [];

  return {
    source: "data-plane",
    apiVersion,
    rawCount: items.length,
    deployments: items,
  };
}

async function getArmBearerTokenFromManagedIdentity() {
  const clientId = pickEnv("AZURE_CLIENT_ID");

  const identityEndpoint = pickEnv("IDENTITY_ENDPOINT");
  const identityHeader = pickEnv("IDENTITY_HEADER");
  if (identityEndpoint && identityHeader) {
    try {
      const url = new URL(identityEndpoint);
      url.searchParams.set("api-version", "2019-08-01");
      url.searchParams.set("resource", "https://management.azure.com/");
      if (clientId) url.searchParams.set("client_id", clientId);
      const resp = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-IDENTITY-HEADER": identityHeader,
          Metadata: "true",
        },
      });
      const text = await resp.text();
      const json = JSON.parse(text);
      const token = String(json?.access_token || "").trim();
      if (resp.ok && token) return token;
    } catch {
      // continue to IMDS fallback
    }
  }

  try {
    const params = new URLSearchParams({
      "api-version": "2018-02-01",
      resource: "https://management.azure.com/",
    });
    if (clientId) params.set("client_id", clientId);
    const resp = await fetch(`http://169.254.169.254/metadata/identity/oauth2/token?${params.toString()}`, {
      method: "GET",
      headers: { Metadata: "true" },
    });
    const text = await resp.text();
    const json = JSON.parse(text);
    const token = String(json?.access_token || "").trim();
    if (resp.ok && token) return token;
  } catch {
    // continue to Azure CLI fallback
  }

  return "";
}

function getArmBearerTokenFromAzureCli() {
  const clientId = pickEnv("AZURE_CLIENT_ID");

  if (clientId) {
    try {
      execSync(`az login --identity --username ${clientId} --allow-no-subscriptions -o none`, {
        stdio: ["ignore", "ignore", "ignore"],
        encoding: "utf8",
      });
    } catch {
      // continue; token fetch below may still work in pre-authenticated environments
    }
  }

  try {
    const token = execSync("az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    })
      .trim();
    return token || "";
  } catch {
    return "";
  }
}

async function fetchArmDeployments({ subscriptionId, resourceGroup, accountName, tenantId, clientId, clientSecret, bearerToken }) {
  let accessToken = String(bearerToken || "").trim();

  if (!accessToken && tenantId && clientId && clientSecret) {
    const tokenResp = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://management.azure.com/.default",
      }),
    });

    const tokenText = await tokenResp.text();
    let tokenJson = null;
    try {
      tokenJson = JSON.parse(tokenText);
    } catch {
      throw new Error(`Azure ARM token returned non-JSON (${tokenResp.status}): ${tokenText.slice(0, 300)}`);
    }
    if (!tokenResp.ok || !tokenJson?.access_token) {
      throw new Error(`Azure ARM token fetch failed (${tokenResp.status}): ${tokenText.slice(0, 300)}`);
    }
    accessToken = String(tokenJson.access_token || "").trim();
  }

  if (!accessToken) {
    throw new Error("Missing ARM bearer token. Provide SP credentials, AZURE_ARM_BEARER_TOKEN, or Azure CLI login.");
  }

  const configuredVersion = pickEnv("AZURE_ARM_DEPLOYMENTS_API_VERSION");
  const apiVersions = Array.from(
    new Set(
      [configuredVersion, "2024-10-01-preview", "2024-10-01", "2023-10-01-preview", "2023-05-01"].filter(Boolean),
    ),
  );

  let lastError = "";
  for (const apiVersion of apiVersions) {
    const url = `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.CognitiveServices/accounts/${encodeURIComponent(accountName)}/deployments?api-version=${encodeURIComponent(apiVersion)}`;

    const listResp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const listText = await listResp.text();
    let listJson = null;
    try {
      listJson = JSON.parse(listText);
    } catch {
      lastError = `Azure ARM deployments returned non-JSON (${listResp.status}) [api-version=${apiVersion}]: ${listText.slice(0, 400)}`;
      continue;
    }

    if (!listResp.ok) {
      lastError = `Azure ARM list deployments failed (${listResp.status}) [api-version=${apiVersion}]: ${listText.slice(0, 400)}`;
      continue;
    }

    const items = Array.isArray(listJson?.value) ? listJson.value : Array.isArray(listJson?.data) ? listJson.data : [];
    return {
      source: "arm",
      apiVersion,
      rawCount: items.length,
      deployments: items,
    };
  }

  throw new Error(lastError || "Azure ARM list deployments failed");
}

function normalizeDeployments(rawItems) {
  const out = [];
  for (const item of rawItems) {
    const status = parseStatus(item);
    if (status !== "succeeded") continue;

    const deploymentName = String(item?.name || item?.id || item?.properties?.deploymentName || "").trim();
    if (!deploymentName) continue;

    const model = String(parseDeploymentModel(item) || "").trim() || deploymentName;
    const deploymentType = String(parseDeploymentType(item) || "unknown").trim();
    const arkModelId = normalizeArkModelId(deploymentName);
    if (!arkModelId) continue;

    out.push({
      deploymentName,
      model,
      deploymentType,
      status: "Succeeded",
      arkModelId,
    });
  }

  const unique = new Map();
  for (const item of out) unique.set(item.arkModelId, item);
  return Array.from(unique.values()).sort((a, b) => a.arkModelId.localeCompare(b.arkModelId));
}

async function syncToDatabase({ deployments, baseUrl, apiKey, source, dryRun }) {
  const DATABASE_URL = pickEnv("DATABASE_URL");
  const ENCRYPTION_SECRET = pickEnv("ENCRYPTION_SECRET");
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!ENCRYPTION_SECRET) throw new Error("ENCRYPTION_SECRET is not set");

  const channelName = pickEnv("SYNC_AZURE_CHANNEL_NAME") || "azure-foundry-sync";
  const requestedChannelBaseUrl = normalizeBaseUrl(baseUrl);
  const hasApiKey = typeof apiKey === "string" && apiKey.trim().length > 0;

  const modelMapping = Object.fromEntries(deployments.map((d) => [d.arkModelId, d.deploymentName]));
  const deploymentMetaMap = Object.fromEntries(
    deployments.map((d) => [
      d.arkModelId,
      {
        deploymentName: d.deploymentName,
        modelName: d.model,
        deploymentType: d.deploymentType,
        status: d.status,
      },
    ]),
  );

  const metadata = {
    syncSource: "azure_foundry",
    syncFetchMode: source,
    syncedAt: new Date().toISOString(),
    projectName: pickEnv("AZURE_FOUNDRY_PROJECT_NAME") || "arkagentic-project",
    deployments: deploymentMetaMap,
  };

  if (dryRun) {
    return {
      dryRun: true,
      channelName,
      channelBaseUrl: requestedChannelBaseUrl,
      deploymentCount: deployments.length,
      arkModelIds: deployments.map((d) => d.arkModelId),
      hasApiKey,
    };
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("begin");

    const existingChannelRes = await client.query(
      `select id, base_url, api_key_encrypted from upstream_channels where name=$1 limit 1`,
      [channelName],
    );
    const existingChannel = existingChannelRes.rows[0];

    const finalBaseUrl = requestedChannelBaseUrl || String(existingChannel?.base_url || "").trim();
    if (!finalBaseUrl) {
      throw new Error("base_url is required. Set AZURE_OPENAI_ENDPOINT (or AZURE_PROJECT_ENDPOINT) or keep existing channel base_url.");
    }

    const finalEncrypted = hasApiKey
      ? encryptSecret(apiKey, ENCRYPTION_SECRET, "v1")
      : String(existingChannel?.api_key_encrypted || "").trim();
    if (!finalEncrypted) {
      throw new Error("api_key is required for new channel. Set AZURE_OPENAI_API_KEY (or AZURE_FOUNDRY_API_KEY/UPSTREAM_AZURE_API_KEY) or pre-create channel with key.");
    }

    const upsertChannelRes = await client.query(
      `insert into upstream_channels(
        id, channel_type, name, base_url, api_key_encrypted, encryption_kid, model_mapping, timeout_ms, enabled, metadata, health_status, created_at, updated_at
      ) values ($1,'azure_openai',$2,$3,$4,'v1',$5::jsonb,$6,true,$7::jsonb,'unknown',now(),now())
      on conflict (name) do update set
        channel_type='azure_openai',
        base_url=excluded.base_url,
        api_key_encrypted=excluded.api_key_encrypted,
        encryption_kid='v1',
        model_mapping=excluded.model_mapping,
        timeout_ms=excluded.timeout_ms,
        enabled=true,
        metadata=excluded.metadata,
        updated_at=now()
      returning id`,
      [
        randomUUID(),
        channelName,
        finalBaseUrl,
        finalEncrypted,
        JSON.stringify(modelMapping),
        45000,
        JSON.stringify(metadata),
      ],
    );

    const channelId = String(upsertChannelRes.rows[0].id);

    let routesUpserted = 0;
    for (const dep of deployments) {
      await client.query(
        `insert into upstream_model_routes(
          id, ark_model_id, channel_id, priority, enabled, upstream_model_override, created_at, updated_at
        ) values ($1,$2,$3,1,true,$4,now(),now())
        on conflict (ark_model_id, priority) do update set
          channel_id=excluded.channel_id,
          enabled=true,
          upstream_model_override=excluded.upstream_model_override,
          updated_at=now()`,
        [randomUUID(), dep.arkModelId, channelId, dep.deploymentName],
      );
      routesUpserted += 1;
    }

    const arkIds = deployments.map((d) => d.arkModelId);
    let disabledRoutes = 0;
    if (arkIds.length > 0) {
      const disableRes = await client.query(
        `update upstream_model_routes
         set enabled=false, updated_at=now()
         where channel_id=$1
           and enabled=true
           and not (ark_model_id = any($2::text[]))`,
        [channelId, arkIds],
      );
      disabledRoutes = Number(disableRes.rowCount || 0);
    } else {
      const disableRes = await client.query(
        `update upstream_model_routes
         set enabled=false, updated_at=now()
         where channel_id=$1
           and enabled=true`,
        [channelId],
      );
      disabledRoutes = Number(disableRes.rowCount || 0);
    }

    await client.query("commit");

    return {
      channelId,
      channelName,
      channelBaseUrl: finalBaseUrl,
      routesUpserted,
      disabledRoutes,
      deploymentCount: deployments.length,
      arkModelIds: arkIds,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  loadEnvFile();

  const args = new Set(process.argv.slice(2));
  const outputJsonOnly = args.has("--json");
  const dryRun = args.has("--dry-run");

  const baseUrl = normalizeBaseUrl(pickEnv("AZURE_OPENAI_ENDPOINT", "AZURE_PROJECT_ENDPOINT"));
  const apiKey = pickEnv("AZURE_OPENAI_API_KEY", "AZURE_FOUNDRY_API_KEY", "UPSTREAM_AZURE_API_KEY");

  let fetchInfo;
  let fetchErrors = [];

  if (baseUrl && apiKey) {
    try {
      fetchInfo = await fetchDataPlaneDeployments({ baseUrl, apiKey });
    } catch (error) {
      fetchErrors.push(`data-plane: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!fetchInfo) {
    const subscriptionId = pickEnv("AZURE_SUBSCRIPTION_ID", "AZURE_SUBSCRIPTION");
    const resourceGroup = pickEnv("AZURE_RESOURCE_GROUP", "AZURE_OPENAI_RESOURCE_GROUP");
    const accountName = pickEnv("AZURE_ACCOUNT_NAME", "AZURE_COGNITIVE_ACCOUNT_NAME", "AZURE_OPENAI_RESOURCE_NAME") || inferAccountNameFromEndpoint(baseUrl);
    const tenantId = pickEnv("AZURE_TENANT_ID");
    const clientId = pickEnv("AZURE_CLIENT_ID");
    const clientSecret = pickEnv("AZURE_CLIENT_SECRET");
    const bearerToken = pickEnv("AZURE_ARM_BEARER_TOKEN") || (await getArmBearerTokenFromManagedIdentity()) || getArmBearerTokenFromAzureCli();

    if (subscriptionId && resourceGroup && accountName && (bearerToken || (tenantId && clientId && clientSecret))) {
      try {
        fetchInfo = await fetchArmDeployments({
          subscriptionId,
          resourceGroup,
          accountName,
          tenantId,
          clientId,
          clientSecret,
          bearerToken,
        });
      } catch (error) {
        fetchErrors.push(`arm: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (!fetchInfo) {
    throw new Error(
      [
        "Failed to fetch Azure deployments.",
        "Provide AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY (preferred), or ARM credentials.",
        ...fetchErrors,
      ].join(" "),
    );
  }

  const deployments = normalizeDeployments(fetchInfo.deployments);
  const syncResult = await syncToDatabase({
    deployments,
    baseUrl,
    apiKey,
    source: fetchInfo.source,
    dryRun,
  });

  const result = {
    ok: true,
    fetchedBy: fetchInfo.source,
    fetchedRawCount: fetchInfo.rawCount,
    succeededDeploymentCount: deployments.length,
    deployments,
    syncResult,
  };

  if (outputJsonOnly) {
    process.stdout.write(JSON.stringify(result));
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ ok: false, error: message }));
  } else {
    console.error(message);
  }
  process.exit(1);
});
