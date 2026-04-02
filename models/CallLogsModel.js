import mongoose from "mongoose";

const callLogsSchema = new mongoose.Schema(
  {
    callerId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "callerModel",
    },

    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "receiverModel",
    },

    callerModel: {
      type: String,
      enum: ["User", "Agent"],
    },

    receiverModel: {
      type: String,
      enum: ["User", "Agent"],
    },

    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
    },
    queryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Query",
      required: true,
    },

    channelName: String,

    status: {
      type: String,
      enum: ["calling","ringing", "accepted", "rejected", "missed", "ended", "no-answer", "scheduled"],
      default: "calling",
    },

    startedAt: Date,
    endedAt: Date,

    duration: {
      type: Number,
      default: 0,
    },
    agoraToken: String,
  },
  { timestamps: true },
);

export default mongoose.model("CallLogs", callLogsSchema);
