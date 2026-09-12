import { ConsoleShell } from "@/components/console-shell";
import { ModelsClientPanel } from "@/components/console/models-client";

export default function LlmGatewayConsoleModelsPage() {
  return (
    <ConsoleShell active="models" basePath="/llmapigateway/console">
      <ModelsClientPanel />
    </ConsoleShell>
  );
}
