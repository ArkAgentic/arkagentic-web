import { ConsoleShell } from "@/components/console-shell";
import { BillingClientPanel } from "@/components/console/billing-client";

export default function LlmGatewayConsoleBillingPage() {
  return (
    <ConsoleShell active="billing" basePath="/llmapigateway/console">
      <BillingClientPanel showTopup={false} tableMode="usage" />
    </ConsoleShell>
  );
}
