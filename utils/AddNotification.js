import admin from "../config/firebase.js";
import Notification from "../models/NotificationModel.js";

export const addNotification = async (userId, title, body) => {
  try {
    const notification = new Notification({
      userId,
      title,
      body,
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error("Error saving notification:", error);
    throw error;
  }
};

export const sendNotification = async ({ firebaseToken, name, call }) => {
  try {
    if (!firebaseToken) {
      console.log("❌ No firebase token, skipping notification");
      return;
    }
    const message = {
      token: firebaseToken,
      data: {
        type: "incoming_call",
        callerName: String(name || ""),
        channelName: String(call?.channelName || ""),
        callName: String(call?.callName || ""),
        agoraToken: String(call?.agoraToken || ""),
        callerId: String(call?.callerId || ""),
        callerModel: String(call?.callerModel || ""),
      },
      android: {
        priority: "high",
      },
    };
    const response = await admin.messaging().send(message);
    console.log(response);
    console.log("✅ Call notification sent");
    return true;
  } catch (error) {
    console.error("❌ Firebase notification error:", error.message);
    return false;
  }
};
