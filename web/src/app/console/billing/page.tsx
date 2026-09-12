import { ConsoleShell } from "@/components/console-shell";
import { BillingClientPanel } from "@/components/console/billing-client";

export default function ConsoleBillingPage() {
  return (
    <ConsoleShell active="billing">
      <BillingClientPanel showTopup={false} tableMode="usage" />
    </ConsoleShell>
  );
}
