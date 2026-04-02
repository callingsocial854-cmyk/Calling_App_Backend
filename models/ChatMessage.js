import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    senderType: {
      type: String,
      enum: ["user", "agent", "system"],
      required: true,
    },
    message: {
      type: String,
      default: "",
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      default: null,
    },
    systemMsgForUser: {
      type: String,
      default: "",
    },
    systemMsgForAgent: {
      type: String,
      default: "",
    },
    mediaControls: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MediaControl",
        default: null,
      },
    ],
    files: [
      {
        type: String,
        default: null,
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    seenAt: {
      type: Date,
      default: null,
    },

    isDeletedByUser: {
      type: Boolean,
      default: false,
    },
    isDeletedByAgent: {
      type: Boolean,
      default: false,
    },
    icon: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("ChatMessage", chatMessageSchema);
