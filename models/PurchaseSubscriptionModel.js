import mongoose from "mongoose";

const purchaseSubscriptionSchema = new mongoose.Schema(
    {
        agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
        amount: { type: Number, required: true },
        accept_Count: { type: Number, required: true },
        remaining_Count: { type: Number, required: true },
        call_Time: { type: Number, required: true },
        remaining_Time: { type: Number, required: true },
        media_List: { type: Number, required: true },
        remaining_Media: { type: Number, required: true },
        paymentId: { type: String, required: true },
        paymentStatus: {
            type: String,
            enum: ["pending", "success", "failed"],
            default: "pending",
        },
        paymentDate: { type: Date },
    },
    { timestamps: true }
);

const PurchaseSubscription = mongoose.model(
    "PurchaseSubscription",
    purchaseSubscriptionSchema
);
export default PurchaseSubscription;