import mongoose from "mongoose";

const agentProfileSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
    },
    sector: { type: String, required: true },
    details: { type: Object, default: [] },
    profileCreation: { type: String },
    paymentId: { type: String },
    paymentStatus: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    paymentDate: { type: Date },
    adminVerified: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const AgentProfile = mongoose.model("AgentProfile", agentProfileSchema);
export default AgentProfile;
