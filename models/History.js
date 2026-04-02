import mongoose from "mongoose";

const historySchema = new mongoose.Schema({
  queryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Query",
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatRoom",
  },
  msgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatMessage",
  },
  topUp: {
    type: String,
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent",
  },
  type: {
    type: String,
    enum: ["query", "call"],
  },
  status: {
    type: String,
    enum: ["incoming", "outgoing"],
  },
  remaining: {
    type: Number,
    default: 0,
  },
  duration: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const History = mongoose.model("History", historySchema);
export default History;
