import { ConsoleShell } from "@/components/console-shell";
import { BillingClientPanel } from "@/components/console/billing-client";

export default function ConsoleTopupPage() {
  return (
    <ConsoleShell active="topup">
      <BillingClientPanel showTopup tableMode="topup" />
    </ConsoleShell>
  );
}
