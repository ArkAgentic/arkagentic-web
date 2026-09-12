import { ConsoleShell } from "@/components/console-shell";
import { ModelsClientPanel } from "@/components/console/models-client";

export default function ConsoleModelsPage() {
  return (
    <ConsoleShell active="models">
      <ModelsClientPanel />
    </ConsoleShell>
  );
}
