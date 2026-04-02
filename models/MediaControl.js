import mongoose from "mongoose";

const mediaControlSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    mediaFiles: [
      {
        file: { type: String, required: true },
        position: { type: Number, required: true },
      },
    ],
    adminVerified: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
  },
  { timestamps: true }
);

const MediaControl = mongoose.model("MediaControl", mediaControlSchema);
export default MediaControl;
