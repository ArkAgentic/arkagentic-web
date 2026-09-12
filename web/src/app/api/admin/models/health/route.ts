import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { listChannels, listRoutes } from "@/lib/upstream-admin";

type DeploymentMeta = {
  deploymentName?: string;
  modelName?: string;
  deploymentType?: string;
  status?: string;
};

function ensureAdmin(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function normalizeDeploymentType(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "unknown";
  return raw.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export async function GET(request: NextRequest) {
  const deny = ensureAdmin(request);
  if (deny) return deny;

  const [channels, routes] = await Promise.all([listChannels(), listRoutes()]);
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));

  const activeRoutes = routes.filter((route) => route.enabled);

  const models = activeRoutes.map((route) => {
    const channel = channelById.get(route.channelId);
    const deployments = ((channel?.metadata?.deployments || {}) as Record<string, DeploymentMeta>) ?? {};
    const deploymentMeta = deployments[route.arkModelId] || {};

    const deploymentType = normalizeDeploymentType(deploymentMeta.deploymentType);

    return {
      arkModelId: route.arkModelId,
      active: true,
      priority: route.priority,
      channel: {
        id: route.channelId,
        name: route.channelName,
        type: channel?.channelType || "unknown",
        enabled: Boolean(channel?.enabled),
        healthStatus: channel?.healthStatus || "unknown",
        connected: channel?.healthStatus === "healthy",
        lastHealthCheckAt: channel?.lastHealthCheckAt || null,
        lastLatencyMs: channel?.lastLatencyMs ?? null,
        lastHealthError: channel?.lastHealthError || null,
      },
      deployment: {
        name: deploymentMeta.deploymentName || route.upstreamModelOverride || null,
        model: deploymentMeta.modelName || route.upstreamModelOverride || null,
        type: deploymentType,
        status: deploymentMeta.status || null,
      },
    };
  });

  const deploymentTypeCounts = new Map<string, number>();
  for (const model of models) {
    const type = model.deployment.type || "unknown";
    deploymentTypeCounts.set(type, (deploymentTypeCounts.get(type) || 0) + 1);
  }

  const channelsSummary = channels.map((channel) => {
    const activeModelCount = models.filter((m) => m.channel.id === channel.id).length;
    return {
      channelId: channel.id,
      name: channel.name,
      type: channel.channelType,
      enabled: channel.enabled,
      healthStatus: channel.healthStatus,
      connected: channel.healthStatus === "healthy",
      lastHealthCheckAt: channel.lastHealthCheckAt,
      lastLatencyMs: channel.lastLatencyMs,
      lastHealthError: channel.lastHealthError,
      activeModelCount,
    };
  });

  return NextResponse.json({
    summary: {
      activeModelCount: models.length,
      activeChannelCount: channelsSummary.filter((c) => c.enabled).length,
      connectedChannelCount: channelsSummary.filter((c) => c.connected).length,
      deploymentTypeCounts: Object.fromEntries(Array.from(deploymentTypeCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))),
      generatedAt: new Date().toISOString(),
    },
    channels: channelsSummary,
    models,
  });
}
