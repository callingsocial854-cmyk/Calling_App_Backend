import cron from "node-cron";

// Every day at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Running expireOldPlans...");
});
