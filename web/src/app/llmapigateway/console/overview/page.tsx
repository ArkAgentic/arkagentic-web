import { ConsoleShell } from "@/components/console-shell";
import { OverviewClientPanel } from "@/components/console/overview-client";

export default function LlmGatewayConsoleOverviewPage() {
  return (
    <ConsoleShell active="overview" basePath="/llmapigateway/console">
      <OverviewClientPanel />
    </ConsoleShell>
  );
}
