import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    Accept_Count: { type: Number, default: 0 },
    Call_Time: { type: Number, default: 0 },
    Media_List: { type: Number, default: 0 },
    Price: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    type: {
      type: String,
      enum: ["TopUp", "QueryAccept", "MediaList", "Packages"],
    },
  },
  { timestamps: true },
);

const Subscription = mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
