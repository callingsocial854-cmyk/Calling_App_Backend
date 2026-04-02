import mongoose from "mongoose";

const contactSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  reply: { type: String },
  repliedBy: { type: String },
  repliedAt: { type: Date },
  replied: {
    type: String,
    enum: ["Pending", "Replied"],
    default: "Pending",
  },
});

export default mongoose.model("Contact", contactSchema);
