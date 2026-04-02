import mongoose from "mongoose";

const agentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },

    agentEmail: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please use a valid email address",
      ],
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator: function (v) {
          return !v || /^[6-9]\d{9}$/.test(v);
        },
        message: "Phone must be a valid 10-digit Indian number",
      },
    },

    aadharUniqueId: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^\d{12}$/.test(v);
        },
        message: "Aadhar must be a valid 12-digit number",
      },
    },

    profileImage: {
      type: String,
      default: "",
    },

    avgRating: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be below 0"],
      max: [5, "Rating cannot exceed 5"],
    },

    totalReviews: {
      type: Number,
      default: 0,
      min: [0, "Reviews cannot be negative"],
    },

    phoneOtp: {
      type: String,
    },

    phoneOtpExpiresAt: {
      type: Date,
    },

    emailOtp: {
      type: String,
    },

    emailOtpExpiresAt: {
      type: Date,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    firebaseToken: {
      type: String,
      default: null,
    },

    isOnline: {
      type: Boolean,
      default: false,
    },

    lastSeen: {
      type: Date,
      default: null,
    },

    role: {
      type: String,
      enum: ["Agent", "Admin"],
      default: "Agent",
    },
  },
  { timestamps: true }
);

agentSchema.index({ phone: 1 }, { unique: true, sparse: true });
agentSchema.index({ agentEmail: 1 }, { unique: true, sparse: true });

agentSchema.index({ phoneOtpExpiresAt: 1 }, { expireAfterSeconds: 0 });
agentSchema.index({ emailOtpExpiresAt: 1 }, { expireAfterSeconds: 0 });

const Agent = mongoose.model("Agent", agentSchema);

export default Agent;