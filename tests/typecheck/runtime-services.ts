import type { SchedulerOptions } from "../../src/cron/scheduler.js";
import type { HealthcheckResult } from "../../src/ops/healthcheck.js";

const schedulerOptions: SchedulerOptions = {
  bot: {
    telegram: {
      sendMessage: async () => ({})
    }
  },
  config: {
    cron: {
      dailySummary: "0 9 * * *",
      timezone: "UTC"
    },
    github: {
      defaultWorkdir: process.cwd()
    },
    telegram: {
      proactiveUserIds: ["1"]
    }
  }
};

const healthcheckResult: HealthcheckResult = {
  ok: true,
  checks: [{ name: "workspace root", status: "pass", detail: "/tmp" }]
};

void schedulerOptions;
void healthcheckResult;
