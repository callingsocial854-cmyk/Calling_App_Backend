import mongoose from "mongoose";

const querySchema = new mongoose.Schema(
  {
    queryId: { type: String, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    description: { type: String, required: true },
    startTime: { type: String, default: "12:00 PM" },
    endTime: { type: String, default: "05:00 PM" },
    industry: { type: String, required: true },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    acceptedAgents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Agent" }],
    rejectedAgents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Agent" }],
    followUpAt: {
      type: Date,
      default: null,
    },
    disabledCall: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
      },
    ],
    comments: [
      {
        text: {
          type: String,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true },
);

const Query = mongoose.model("Query", querySchema);
export default Query;
