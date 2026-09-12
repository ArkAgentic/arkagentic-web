import { ConsoleShell } from "@/components/console-shell";
import { KeysClientPanel } from "@/components/console/keys-client";

export default function ConsoleApiKeysPage() {
  return (
    <ConsoleShell active="keys">
      <KeysClientPanel />
    </ConsoleShell>
  );
}
