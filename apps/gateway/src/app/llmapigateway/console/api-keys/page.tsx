import { ConsoleShell } from "@/components/console-shell";
import { KeysClientPanel } from "@/components/console/keys-client";

export default function LlmGatewayConsoleApiKeysPage() {
  return (
    <ConsoleShell active="keys" basePath="/llmapigateway/console">
      <KeysClientPanel />
    </ConsoleShell>
  );
}
