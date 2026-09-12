import { ConsoleShell } from "@/components/console-shell";
import { OverviewClientPanel } from "@/components/console/overview-client";

export default function ConsoleOverviewPage() {
  return (
    <ConsoleShell active="overview">
      <OverviewClientPanel />
    </ConsoleShell>
  );
}
