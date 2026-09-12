import { ConsoleShell } from "@/components/console-shell";
import { SetupGuideClientPanel } from "@/components/console/setup-guide-client";

export default function ConsoleSetupGuidePage() {
  return (
    <ConsoleShell active="setupGuide">
      <SetupGuideClientPanel />
    </ConsoleShell>
  );
}
