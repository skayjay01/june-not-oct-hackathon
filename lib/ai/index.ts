import "server-only";
import { db } from "@/lib/db/server";
import { loadAccountConfigs, toAccount } from "./accounts";
import { createSwitchboard, type Switchboard } from "./switchboard";

export { AllAccountsFailedError, type JsonCall, type JsonResult, type Step } from "./switchboard";

let instance: Switchboard | undefined;

/** The app-wide switchboard: accounts from env, timings into latency_log. */
export function ai(): Switchboard {
  if (instance) return instance;
  instance = createSwitchboard({
    accounts: loadAccountConfigs().map((c) => toAccount(c)),
    log: async (entry) => {
      await db().from("latency_log").insert(entry);
    },
  });
  return instance;
}
