import { ConsoleShell } from "@/components/console-shell";
import { BillingClientPanel } from "@/components/console/billing-client";

export default function LlmGatewayConsoleTopupPage() {
  return (
    <ConsoleShell active="topup" basePath="/llmapigateway/console">
      <BillingClientPanel showTopup tableMode="topup" />
    </ConsoleShell>
  );
}
