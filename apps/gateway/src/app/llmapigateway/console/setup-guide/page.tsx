import { ConsoleShell } from "@/components/console-shell";
import { SetupGuideClientPanel } from "@/components/console/setup-guide-client";

export default function LlmGatewayConsoleSetupGuidePage() {
  return (
    <ConsoleShell active="setupGuide" basePath="/llmapigateway/console">
      <SetupGuideClientPanel />
    </ConsoleShell>
  );
}
