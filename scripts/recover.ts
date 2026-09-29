import { runLeadCli, recoveryError } from "../lib/recovery/leads.ts";

try {
  console.log(JSON.stringify(await runLeadCli(process.argv.slice(2)), null, 2));
} catch (error) {
  console.error("Lead recovery stopped: " + recoveryError(error));
  process.exitCode = 1;
}
