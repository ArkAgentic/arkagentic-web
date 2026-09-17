import { spawnSync } from "child_process";

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  return result.status ?? 1;
};

const sessionCheck = run("npm", ["run", "verify:session-recovery"]);
if (sessionCheck !== 0) process.exit(sessionCheck);

if (process.env.SKIP_BILLING_VERIFY === "1") {
  console.log("skip verify:billing/key-limit (SKIP_BILLING_VERIFY=1)");
  process.exit(0);
}

const billing = run("npm", ["run", "verify:billing"]);
if (billing !== 0) process.exit(billing);

const keyLimit = run("npm", ["run", "verify:key-limit"]);
process.exit(keyLimit);
