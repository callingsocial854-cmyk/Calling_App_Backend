export const expireOldPlans = async () => {
  try {
    const now = new Date();

    console.log(`[Cron] ✅ Expired plans updated: ${result.modifiedCount}`);
  } catch (error) {
    console.error("[Cron] ❌ Error updating expired plans:", error);
  }
};
