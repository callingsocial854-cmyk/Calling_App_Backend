import mongoose from "mongoose";

const agentReviewSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    review: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

agentReviewSchema.index({ agentId: 1, userId: 1 }, { unique: true });

const AgentReview = mongoose.model("AgentReview", agentReviewSchema);
export default AgentReview;
