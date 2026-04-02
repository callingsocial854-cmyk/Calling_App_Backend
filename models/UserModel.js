import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
      default: "Dummy",
    },

    userEmail: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true, // allows multiple null values
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please use a valid email address",
      ],
    },

    dob: {
      type: String,
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      default: "Male",
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          return /^[6-9]\d{9}$/.test(v);
        },
        message: "Phone must be a valid 10-digit Indian number",
      },
    },

    profileImage: {
      type: String,
      default:
        "https://cdn.pixabay.com/photo/2023/02/18/11/00/icon-7797704_640.png",
    },

    otp: {
      type: String,
    },

    otpExpiresAt: {
      type: Date,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    firebaseToken: {
      type: String,
      default: null,
    },

    favoriteAgents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
      },
    ],

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
      enum: ["User", "Admin"],
      default: "User",
    },

    disabledCall: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
      },
    ],

    blockedAgents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
      },
    ],

    isApp: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ userEmail: 1 });

userSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.model("User", userSchema);

export default User;