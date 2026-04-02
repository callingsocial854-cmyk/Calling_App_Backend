import jwt from "jsonwebtoken";
import Agent from "../models/AgentModel.js";
import crypto from "crypto";
import Query from "../models/QueryModel.js";
import AgentProfile from "../models/AgentProfile.js";
import ChatRoom from "../models/ChatRoom.js";
import ChatMessage from "../models/ChatMessage.js";
import Subscription from "../models/SubscriptionModel.js";
import Transaction from "../models/TransactionModel.js";
import PurchaseSubscription from "../models/PurchaseSubscriptionModel.js";
import MediaControl from "../models/MediaControl.js";
import { Category, CategoryField } from "../models/CategoryModel.js";
import AgentReview from "../models/AgentReview.js";
import History from "../models/History.js";
import { Policy } from "../models/PolicyModel.js";
import { sendNotification } from "../utils/AddNotification.js";
import CallLogsModel from "../models/CallLogsModel.js";
import User from "../models/UserModel.js";
const incomingIcon = "http://157.66.191.24:4446/uploads/incoming.png";
const outgoingIcon = "http://157.66.191.24:4446/uploads/outgoing.png";
const missedIcon = "http://157.66.191.24:4446/uploads/missed.png";
const noSubscriptionIcon =
  "http://157.66.191.24:4446/uploads/no-subscription.png";
const callRejectedIcon = "http://157.66.191.24:4446/uploads/rejected.png";
const callIgnoredIcon = "http://157.66.191.24:4446/uploads/no-answer.png";

const convertTimeToMinutes = (timeStr) => {
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":");

  hours = parseInt(hours, 10);
  minutes = parseInt(minutes, 10);

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
};

const createCallSystemMessage = async ({
  roomId,
  senderId,
  senderType,
  text,
  isSystem,
  io,
  type,
  updateLastMessage = false,
}) => {
  let icon = "";
  if (type === "incoming") icon = incomingIcon;
  if (type === "outgoing") icon = outgoingIcon;
  if (type === "missed") icon = missedIcon;
  if (type === "noSubscription") icon = noSubscriptionIcon;
  if (type === "callRejected") icon = callRejectedIcon;
  if (type === "callIgnored") icon = callIgnoredIcon;

  let msg;

  if (updateLastMessage) {
    const lastMsg = await ChatMessage.findOne({
      roomId,
      $or: [
        { systemMsgForAgent: "Outgoing call" },
        { systemMsgForUser: "Outgoing call" },
      ],
    }).sort({ createdAt: -1 });

    const isOutgoingLastMsg =
      lastMsg &&
      (lastMsg.systemMsgForAgent === "Outgoing call" ||
        lastMsg.systemMsgForUser === "Outgoing call");

    if (isOutgoingLastMsg) {
      lastMsg.systemMsgForUser = isSystem ? text : "";
      lastMsg.systemMsgForAgent = !isSystem ? text : "";
      lastMsg.icon = icon;

      await lastMsg.save();
      msg = lastMsg;
    }
  }

  // fallback
  if (!msg) {
    msg = await ChatMessage.create({
      roomId,
      senderId,
      senderType,
      systemMsgForUser: isSystem ? text : "",
      systemMsgForAgent: !isSystem ? text : "",
      status: "seen",
      icon,
    });
  }

  const finalText =
  msg.systemMsgForUser || msg.systemMsgForAgent || text;

  const room = await ChatRoom.findByIdAndUpdate(
    roomId,
    {
      lastMessage: finalText,
      lastMessageId: msg._id,
      lastMessageTime: new Date(),
    },
    { new: true },
  ).populate("lastMessageId");

  io.to(roomId.toString()).emit("receiveMessage", msg);
  io.to(room.userId.toString()).emit("updateRoom", room);
  io.to(room.agentId.toString()).emit("updateRoom", room);

  return msg;
};

const generateJwtToken = (agent) => {
  console.log(agent);
  return jwt.sign(
    { id: agent._id, phone: agent.phone, role: agent.role },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
};

const generateSixDigitOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // Generates a random 4-digit number
};

const generateTransactionId = () => {
  const randomString = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 characters
  const formattedId = `QV${randomString.match(/.{1,2}/g).join("")}`; // PJ + split into 2-char groups
  return formattedId;
};

export const generateOtp = async (req, res) => {
  try {
    const { agentEmail, phone } = req.body;

    if (!agentEmail || !phone) {
      return res.status(400).json({
        status: false,
        message: "Email and Phone both are required",
      });
    }

    let agent = await Agent.findOne({
      $or: [{ agentEmail }, { phone }],
    });

    
    if (!agent) {
      agent = new Agent({
        agentEmail,
        phone,
        adminVerified: "pending",
      });
    }

    
    const emailOtp = generateSixDigitOtp();
    const phoneOtp = generateSixDigitOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    agent.emailOtp = emailOtp;
    agent.emailOtpExpiresAt = expiresAt;

    agent.phoneOtp = phoneOtp;
    agent.phoneOtpExpiresAt = expiresAt;

    await agent.save();

    return res.status(200).json({
      status: true,
      message: "OTP sent to Email and Phone successfully",
      emailOtp,
      phoneOtp,
    });
  } catch (err) {
    console.error("Error in generateOtp:", err);
    return res.status(500).json({ message: "Server Error", status: false });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { agentEmail, phone, emailOtp, phoneOtp, firebaseToken } = req.body;

    // Both OTP required
    if (!agentEmail || !phone || !emailOtp || !phoneOtp) {
      return res.status(400).json({
        status: false,
        message: "Email, Phone and both OTPs are required",
      });
    }

    const agent = await Agent.findOne({
      $or: [{ agentEmail }, { phone }],
    });

    if (!agent) {
      return res.status(404).json({
        status: false,
        message: "Agent not found",
      });
    }

    // EMAIL OTP VERIFY
    if (
      agent.emailOtp !== emailOtp ||
      new Date() > new Date(agent.emailOtpExpiresAt)
    ) {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired Email OTP",
      });
    }

    // PHONE OTP VERIFY
    if (
      agent.phoneOtp !== phoneOtp ||
      new Date() > new Date(agent.phoneOtpExpiresAt)
    ) {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired Phone OTP",
      });
    }

    // Both OTP verified
    agent.emailVerified = true;
    agent.phoneVerified = true;

    agent.emailOtp = null;
    agent.emailOtpExpiresAt = null;

    agent.phoneOtp = null;
    agent.phoneOtpExpiresAt = null;

    // Save firebase token
    if (firebaseToken) {
      agent.firebaseToken = firebaseToken;
    }

    await agent.save();

    // Generate auth token
    const token = generateJwtToken(agent);

    return res.status(200).json({
      status: true,
      message: "Both OTPs verified successfully",
      token,
      data: agent,
    });
  } catch (err) {
    console.error("Error in verifyOtp:", err);
    return res.status(500).json({ status: false, message: "Server Error" });
  }
};

export const resendAgentOtp = async (req, res) => {
  try {
    const { phone, agentEmail } = req.body;

    if (!phone && !agentEmail) {
      return res.status(400).json({
        message: "Either phone or email is required",
        status: false,
      });
    }

    let agent;
    if (phone) {
      agent = await Agent.findOne({ phone });
    } else {
      agent = await Agent.findOne({ agentEmail });
    }

    if (!agent) {
      return res.status(404).json({
        message: "Agent not found",
        status: false,
      });
    }

    const generatedOtp = generateSixDigitOtp();
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000);

    let otpType = "";
    if (phone) {
      agent.phoneOtp = generatedOtp;
      agent.phoneOtpExpiresAt = expiryTime;
      otpType = "phone";
    } else {
      agent.emailOtp = generatedOtp;
      agent.emailOtpExpiresAt = expiryTime;
      otpType = "email";
    }

    await agent.save();

    res.status(200).json({
      status: true,
      message: `${
        otpType === "phone" ? "Mobile" : "Email"
      } OTP resent successfully`,
      otp: generatedOtp,
      type: otpType,
    });
  } catch (error) {
    console.error("Error in resendAgentOtp:", error);
    res.status(500).json({
      status: false,
      message: "Server Error",
    });
  }
};

export const completeAgentRegistration = async (req, res) => {
  try {
    const {
      fullName,
      agentEmail,
      phone,
      sector,
      details,
      firebaseToken,
      aadharUniqueId,
      profileCreation,
      paymentId,
      paymentStatus = "success",
    } = req.body;

    const files = req.files;
    const profileImage = files?.profileImage?.[0]?.filename || "";

    // Validations
    if (!fullName || !agentEmail || !phone || !sector) {
      return res.status(400).json({
        message: "All fields are required",
        status: false,
      });
    }

    if (!aadharUniqueId) {
      return res.status(400).json({
        message: "Aadhar verification is required",
        status: false,
      });
    }

    if (!paymentId) {
      return res.status(400).json({
        message: "Payment ID is required",
        status: false,
      });
    }

    if (paymentStatus !== "success") {
      return res.status(400).json({
        message: "Payment failed. Please complete payment first.",
        status: false,
      });
    }

    // Find agent
    let agent = await Agent.findOne({ phone, phoneVerified: true });

    if (!agent) {
      return res.status(400).json({
        message: "Phone number not verified",
        status: false,
      });
    }

    // Update agent base data
    agent.fullName = fullName;
    agent.agentEmail = agentEmail;
    agent.profileImage = profileImage;
    agent.firebaseToken = firebaseToken || agent.firebaseToken;
    agent.aadharUniqueId = aadharUniqueId;

    await agent.save();

    // CREATE FIRST DEFAULT PROFILE
    const newProfile = await AgentProfile.create({
      agentId: agent._id,
      sector,
      details,
      profileCreation,
      paymentId,
      paymentStatus: "success",
      paymentDate: new Date(),
    });

    res.status(200).json({
      message:
        "Agent registration completed. Your first profile is pending admin approval.",
      status: true,
      data: {
        agent,
        profile: newProfile,
      },
    });
  } catch (error) {
    console.error("Error in completeAgentRegistration:", error);
    res.status(500).json({ message: "Server Error", status: false });
  }
};

export const loginAgent = async (req, res) => {
  try {
    const { phone, agentEmail, firebaseToken } = req.body;

    if (!phone && !agentEmail) {
      return res.status(400).json({
        status: false,
        message: "Phone or Email is required",
      });
    }

    // Find agent
    const agent = await Agent.findOne({
      $or: [{ phone }, { agentEmail }],
    });

    if (!agent) {
      return res.status(404).json({
        status: false,
        message: "Agent not found, please register first",
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    let sentTo = "";

    if (phone) {
      agent.phoneOtp = otp;
      agent.phoneOtpExpiresAt = expiry;
      sentTo = "phone";
    } else {
      agent.emailOtp = otp;
      agent.emailOtpExpiresAt = expiry;
      sentTo = "email";
    }

    agent.firebaseToken = firebaseToken || agent.firebaseToken;
    await agent.save();

    return res.status(200).json({
      status: true,
      message: `OTP sent successfully to your ${sentTo}`,
      otp,
    });
  } catch (error) {
    console.error("Error in loginAgent:", error);
    return res.status(500).json({ status: false, message: "Server Error" });
  }
};

export const verifyLoginOtp = async (req, res) => {
  try {
    const { phone, agentEmail, otp } = req.body;

    if (!otp || (!phone && !agentEmail)) {
      return res.status(400).json({
        status: false,
        message: "OTP and Phone/Email are required",
      });
    }

    // Find agent
    const agent = await Agent.findOne({
      $or: [{ phone }, { agentEmail }],
    });

    if (!agent) {
      return res.status(404).json({
        status: false,
        message: "Agent not found",
      });
    }

    // OTP validation
    let isValidOtp = false;

    if (
      phone &&
      agent.phoneOtp === otp &&
      new Date() < agent.phoneOtpExpiresAt
    ) {
      isValidOtp = true;
    }
    if (
      agentEmail &&
      agent.emailOtp === otp &&
      new Date() < agent.emailOtpExpiresAt
    ) {
      isValidOtp = true;
    }

    if (!isValidOtp) {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired OTP",
      });
    }

    // Check if agent has APPROVED profile
    const approvedProfile = await AgentProfile.findOne({
      agentId: agent._id,
      adminVerified: "approved",
    });

    // if (!approvedProfile) {
    //   return res.status(403).json({
    //     status: false,
    //     message:
    //       "Your profile is not approved yet. Please wait for admin approval.",
    //   });
    // }

    // Clear OTP
    agent.phoneOtp = null;
    agent.phoneOtpExpiresAt = null;
    agent.emailOtp = null;
    agent.emailOtpExpiresAt = null;
    await agent.save();

    const token = generateJwtToken(agent);

    return res.status(200).json({
      status: true,
      message: "Login successful",
      token,
      agent,
    });
  } catch (error) {
    console.error("Error in verifyLoginOtp:", error);
    return res.status(500).json({ status: false, message: "Server Error" });
  }
};

export const getAgentById = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized: Invalid or missing token",
      });
    }

    const agentId = req.user.id;

    const agent = await Agent.findById(agentId).select(
      "-otp -otpExpiresAt -__v",
    );

    if (!agent) {
      return res.status(404).json({
        status: false,
        message: "Agent not found",
      });
    }

    const purchase = await PurchaseSubscription.findOne({ agentId }).sort({
      createdAt: -1,
    });

    const profiles = await AgentProfile.find({ agentId }).select("-__v");

    const ratingStats = await AgentReview.aggregate([
      {
        $match: { agentId: agent._id },
      },
      {
        $group: {
          _id: "$agentId",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const averageRating =
      ratingStats.length > 0
        ? Number(ratingStats[0].averageRating.toFixed(1))
        : 0;

    const totalReviews =
      ratingStats.length > 0 ? ratingStats[0].totalReviews : 0;

    const reviews = await AgentReview.find({ agentId })
      .populate("userId", "fullName profileImage")
      .select("rating review createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Agent fetched successfully",
      data: {
        agent,
        profiles,
        subscription: purchase,
        rating: {
          averageRating,
          totalReviews,
        },
        reviews,
      },
    });
  } catch (error) {
    console.error("Error in getAgentById:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const updateAgentProfileImage = async (req, res) => {
  try {
    const agentId = req.agent?.id;

    if (!agentId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res
        .status(404)
        .json({ status: false, message: "Agent not found" });
    }

    const file = req.file || req.files?.profileImage?.[0];
    if (!file) {
      return res
        .status(400)
        .json({ status: false, message: "No profile image uploaded" });
    }

    agent.profileImage = file.filename;
    await agent.save();

    return res.status(200).json({
      status: true,
      message: "Profile image updated successfully",
      profileImage: agent.profileImage,
    });
  } catch (error) {
    console.error("Error updating profile image:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const createAdditionalProfile = async (req, res) => {
  try {
    const { agentId, sector, profileCreation, paymentId, paymentStatus } =
      req.body;

    if (paymentStatus !== "success") {
      return res.status(400).json({
        message: "Payment failed for this profile.",
        status: false,
      });
    }

    const profile = await AgentProfile.create({
      agentId,
      sector,
      profileCreation,
      paymentId,
      paymentStatus: "success",
      paymentDate: new Date(),
    });

    res.status(200).json({
      message: "New profile created successfully! Waiting for admin approval.",
      status: true,
      data: profile,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", status: false });
  }
};

export const getAllQuery = async (req, res) => {
  try {
    const agentId = req.user.id;
    const status = req.query.status || "Active";
    const queries = await Query.find({
      status,
      acceptedAgents: { $ne: agentId },
      rejectedAgents: { $ne: agentId },
    }).sort({ createdAt: -1 });
    if (!queries) {
      return res
        .status(404)
        .json({ status: false, message: "No queries found" });
    }
    res
      .status(200)
      .json({ queries, message: "Query fetch successfully", status: true });
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

export const acceptOrRejectQuery = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { queryId, action } = req.body;
    const agent = await Agent.findById(agentId);

    if (!queryId || !action) {
      return res.status(400).json({
        status: false,
        message: "queryId and action are required",
      });
    }

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({
        status: false,
        message: "Action must be accept or reject",
      });
    }

    const query = await Query.findById(queryId);
    if (!query) {
      return res.status(404).json({
        status: false,
        message: "Query not found",
      });
    }

    const userId = query.userId;

    // 🛑 Prevent duplicate actions
    if (
      query.acceptedAgents.includes(agentId) ||
      query.rejectedAgents.includes(agentId)
    ) {
      return res.status(400).json({
        status: false,
        message: "You already responded to this query",
      });
    }

    let room = null;

    // ================= ACCEPT FLOW =================
    if (action === "accept") {
      const subscription = await PurchaseSubscription.findOne({ agentId });

      if (!subscription || subscription.remaining_Count <= 0) {
        return res.status(403).json({
          status: false,
          message: "Your accept limit is over. Please recharge plan.",
        });
      }

      // ➖ reduce only on accept
      subscription.remaining_Count -= 1;
      await subscription.save();

      query.acceptedAgents.push(agentId);

      await History.create({
        queryId: query?._id,
        agentId,
        type: "query",
        remaining: subscription.remaining_Count,
      });

      // 💬 Create chat room
      room = await ChatRoom.findOneAndUpdate(
        { queryId, agentId },
        {
          userId,
          agentId,
          queryId,
          lastMessage: "Accepted",
        },
        { upsert: true, new: true },
      );

      // System message
      const systemMsgForUser = `Great news! ${agent.fullName} has accepted your query: "${query.description}". You can now chat or call to get help.`;
      const systemMsgForAgent = `You’ve successfully accepted the user’s query: "${query.description}". You may now start chatting or calling.`;

      await ChatMessage.create({
        roomId: room._id,
        senderId: agentId,
        senderType: "system",
        systemMsgForUser: systemMsgForUser,
        systemMsgForAgent: systemMsgForAgent,
        status: "sent",
      });
    }

    // ================= REJECT FLOW =================
    if (action === "reject") {
      query.rejectedAgents.push(agentId);
    }

    await query.save();

    res.status(200).json({
      status: true,
      message:
        action === "accept"
          ? "Query accepted successfully & chat room created"
          : "Query rejected successfully",
      query,
      room,
    });
  } catch (error) {
    console.error("Error in acceptOrRejectQuery:", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const getAgentAcceptedQueries = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { type, status } = req.query;
    const now = new Date();

    const queries = await Query.find({
      acceptedAgents: agentId,
    })
      .populate("userId")
      .sort({ createdAt: -1 });

    const result = [];

    for (const q of queries) {
      const room = await ChatRoom.findOne({
        agentId,
        queryId: q._id,
      }).populate({
        path: "lastMessageId",
        populate: {
          path: "mediaControls",
        },
      });

      let unreadCount = 0;

      if (room) {
        unreadCount = await ChatMessage.countDocuments({
          roomId: room._id,
          senderType: "user",
          status: { $ne: "seen" },
        });
      }

      // 🔥 check blocked
      const isBlockedByUser = q.userId?.blockedAgents
        ?.map((id) => id.toString())
        .includes(agentId.toString());

      // 🔥 effective status (agent POV)
      let effectiveStatus = q.status;

      if (isBlockedByUser) {
        effectiveStatus = "Inactive";
      }

      // ---------------- FILTERS ----------------

      // ✅ status filter (use effective status)
      if (status && effectiveStatus !== status) continue;

      // ✅ type filters
      if (type === "unread" && unreadCount === 0) continue;

      if (type === "followup" && !q.followUpAt) continue;

      if (type === "overdue" && (!q.followUpAt || q.followUpAt > now)) {
        continue;
      }

      // ✅ active/inactive split via type
      if (type === "active" && effectiveStatus !== "Active") continue;

      if (type === "inactive" && effectiveStatus !== "Inactive") continue;

      // ---------------- RESULT ----------------

      result.push({
        query: q,
        unreadCount,
        roomId: room ? room._id : null,
        lastMessageTime: room ? room.lastMessageTime : null,
        lastMessage: room ? room.lastMessage : null,
        followUpAt: q.followUpAt,
        isBlockedByUser: isBlockedByUser || false,
        effectiveStatus, // 👈 IMPORTANT
      });
    }

    return res.status(200).json({
      status: true,
      message: "Accepted queries fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Fetch Accepted Queries Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const setQueryFollowUp = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { queryId, followUpAt } = req.body;

    const query = await Query.findOne({
      _id: queryId,
      acceptedAgents: agentId,
    });

    if (!query) {
      return res.status(404).json({
        status: false,
        message: "Query not found or not accepted by you",
      });
    }

    query.followUpAt = followUpAt;
    await query.save();

    return res.status(200).json({
      status: true,
      message: "Follow-up time set successfully",
    });
  } catch (error) {
    console.error("Set FollowUp Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const getAllSubscription = async (req, res) => {
  try {
    const agentId = req.user.id;

    const { type } = req.query;

    if (type === "active") {
      const activeSubscription = await PurchaseSubscription.findOne({
        agentId,
      });

      if (!activeSubscription) {
        return res.status(404).json({
          status: false,
          message: "No active subscription found",
        });
      }

      return res.status(200).json({
        status: true,
        message: "Active subscription fetched successfully",
        data: activeSubscription,
      });
    }

    const filter = { isActive: true };
    if (type) filter.type = type;

    const subscription = await Subscription.find(filter).sort({
      createdAt: -1,
    });

    if (!subscription.length) {
      return res.status(404).json({
        status: false,
        message: "Subscription not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Subscription fetched successfully",
      data: subscription,
    });
  } catch (error) {
    console.error("Error in getAllSubscription:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const purchaseSubscription = async (req, res) => {
  try {
    const agentId = req.user.id;
    const {
      subscriptionPlanId,
      amount,
      paymentId,
      paymentStatus = "success",
    } = req.body;

    if (paymentStatus !== "success") {
      return res.status(400).json({
        status: false,
        message: "Payment not successful",
      });
    }

    const subscriptionPlan = await Subscription.findById(subscriptionPlanId);
    if (!subscriptionPlan) {
      return res.status(404).json({
        status: false,
        message: "Subscription plan not found",
      });
    }

    const planAccept = subscriptionPlan.Accept_Count;
    const planCall = subscriptionPlan.Call_Time;
    const planMedia = subscriptionPlan.Media_List;

    let purchase = await PurchaseSubscription.findOne({ agentId });

    // ================= SAFE TRANSACTION (NO DUPLICATE) =================
    await Transaction.updateOne(
      { transactionId: paymentId },
      {
        $setOnInsert: {
          userId: agentId,
          amount,
          type: "planPurchase",
          status: paymentStatus,
          transactionId: paymentId,
          description: `Subscription purchase (${subscriptionPlan.type})`,
        },
      },
      { upsert: true },
    );

    // ================= RENEW =================
    if (purchase) {
      const beforeRemaining = purchase.remaining_Count;

      purchase.accept_Count += planAccept;
      purchase.remaining_Count += planAccept;

      purchase.call_Time += planCall;
      purchase.remaining_Time += planCall;

      purchase.media_List += planMedia;
      purchase.remaining_Media += planMedia;

      purchase.amount += amount;
      purchase.paymentId = paymentId;
      purchase.paymentStatus = paymentStatus;
      purchase.paymentDate = new Date();

      await purchase.save();

      // HISTORY ENTRY
      if (
        subscriptionPlan.type === "TopUp" ||
        subscriptionPlan.type === "Packages"
      ) {
        await History.create({
          type: "call",
          agentId,
          topUp: subscriptionPlan.type,
          remaining: purchase.remaining_Time,
        });
      }

      if (
        subscriptionPlan.type === "QueryAccept" ||
        subscriptionPlan.type === "Packages"
      ) {
        await History.create({
          type: "query",
          agentId,
          topUp: subscriptionPlan.type,
          remaining: purchase.remaining_Count,
        });
      }

      return res.status(200).json({
        status: true,
        message: "Subscription renewed successfully",
        data: purchase,
      });
    }

    // ================= FIRST PURCHASE =================
    const newPurchase = await PurchaseSubscription.create({
      agentId,
      amount,
      accept_Count: planAccept,
      remaining_Count: planAccept,
      call_Time: planCall,
      remaining_Time: planCall,
      media_List: planMedia,
      remaining_Media: planMedia,
      paymentId,
      paymentStatus,
      paymentDate: new Date(),
    });

    // HISTORY ENTRY
    await History.create({
      type: subscriptionPlan.type === "TopUp" ? "call" : "query",
      agentId,
      topUp: subscriptionPlan.type,
      remaining: planAccept,
    });

    return res.status(201).json({
      status: true,
      message: "Subscription purchased successfully",
      data: newPurchase,
    });
  } catch (error) {
    console.error("Error in PurchaseSubscription:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const getAgentSubscription = async (req, res) => {
  try {
    const agentId = req.user.id;
    const subscription = await PurchaseSubscription.findOne({ agentId });
    if (!subscription) {
      return res.status(404).json({
        status: false,
        message: "Subscription not found",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Subscription fetched successfully",
      data: subscription,
    });
  } catch (error) {
    console.error("Error in getAgentSubscription:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const addMediaList = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { title, location, positions } = req.body;

    if (!title || !location) {
      return res.status(400).json({
        status: false,
        message: "Title and location are required",
      });
    }

    const purchase = await PurchaseSubscription.findOne({ agentId });
    if (!purchase) {
      return res.status(403).json({
        status: false,
        message: "No active subscription found",
      });
    }

    if (purchase.remaining_Media <= 0) {
      return res.status(403).json({
        status: false,
        message: "Your media limit is finished. Please purchase a new plan",
      });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({
        status: false,
        message: "At least one media file is required",
      });
    }

    // ðŸŸ¡ positions must be array (frontend se string ayegi â†’ parse)
    const parsedPositions = JSON.parse(positions);

    if (
      !Array.isArray(parsedPositions) ||
      parsedPositions.length !== files.length
    ) {
      return res.status(400).json({
        status: false,
        message: "Positions array must match number of files",
      });
    }

    // ðŸ‘‡ files + frontend positions merge
    const mediaFiles = files.map((f, index) => ({
      file: f.filename,
      position: parsedPositions[index],
    }));

    purchase.remaining_Media -= 1;
    await purchase.save();

    const newMedia = await MediaControl.create({
      agentId,
      title,
      location,
      mediaFiles,
      adminVerified: "pending",
    });

    return res.status(200).json({
      status: true,
      message: "Media added successfully and sent for admin approval",
      data: newMedia,
      updatedSubscription: purchase,
    });
  } catch (error) {
    console.error("Error in addMediaList:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getMediaList = async (req, res) => {
  try {
    const agentId = req.user.id;
    const search = req.query.search?.trim();

    let filter = { agentId };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    const mediaList = await MediaControl.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Media list fetched successfully",
      data: mediaList,
    });
  } catch (error) {
    console.error("Error in getMediaList:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const getApprovedMediaList = async (req, res) => {
  try {
    const agentId = req.user.id;
    const mediaList = await MediaControl.find({
      agentId,
      // adminVerified: "approved",
    });
    if (!mediaList) {
      return res.status(404).json({
        status: false,
        message: "Media list not found",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Media list fetched successfully",
      data: mediaList,
    });
  } catch (error) {
    console.error("Error in getApprovedMediaList:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getCategoriesInAgent = async (req, res) => {
  try {
    const categories = await Category.find({ categoryRole: "Agent" }).sort({
      createdAt: -1,
    });

    if (!categories) {
      return res
        .status(404)
        .json({ status: false, message: "Categories not found" });
    }

    res.json({
      status: true,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getFieldsByCategoryInAgent = async (req, res) => {
  try {
    const { categoryId } = req.query;

    const fields = await CategoryField.find({ categoryId }).sort({ order: 1 });

    if (!fields) {
      return res
        .status(404)
        .json({ status: false, message: "Fields not found" });
    }

    res.json({
      status: true,
      data: fields,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getQueryByIdInAgent = async (req, res) => {
  try {
    const { queryId } = req.query;
    const query = await Query.findById(queryId).populate("userId");
    if (!query) {
      return res
        .status(404)
        .json({ status: false, message: "Query not found" });
    }
    res.status(200).json({ status: true, data: query });
  } catch (error) {
    console.error("Error fetching query:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

// new work
export const clearChatInAgent = async (req, res) => {
  try {
    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).json({
        status: false,
        message: "roomId is required",
      });
    }

    const result = await ChatMessage.updateMany(
      { roomId },
      { $set: { isDeletedByAgent: true } },
    );

    res.status(200).json({
      status: true,
      message: "Chat cleared successfully",
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const getAllHistoryInAgent = async (req, res) => {
  try {
    const agentId = req.user.id;
    const type = req.query.type || "query";
    const history = await History.find({ agentId, type })
      .populate("msgId", "_id")
      .populate("roomId", "_id")
      .populate({
        path: "queryId",
        populate: {
          path: "userId",
          model: "User",
          select: "fullName profileImage",
        },
      })
      .sort({
        createdAt: -1,
      });
    if (!history) {
      return res
        .status(404)
        .json({ status: false, message: "History not found" });
    }
    res.status(200).json({ status: true, data: history });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

export const getPolicyByTypeInAgent = async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) {
      return res.status(400).json({
        status: false,
        message: "Policy type is required (about, terms, privacy)",
      });
    }
    const policy = await Policy.findOne({ type });
    if (!policy) {
      return res
        .status(404)
        .json({ status: false, message: "Policy not found" });
    }
    res.status(200).json({ status: true, data: policy });
  } catch (error) {
    console.error("Error fetching policy:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

export const getQueryFollowUps = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { type } = req.query;

    const now = new Date();

    let filter = {
      acceptedAgents: agentId,
      followUpAt: { $ne: null },
    };

    if (type === "upcoming") {
      filter.followUpAt = { $gte: now };
    }

    if (type === "overdue") {
      filter.followUpAt = { $lt: now };
    }

    const queries = await Query.find(filter)
      .populate("userId")
      .sort({ followUpAt: 1 });

    return res.status(200).json({
      status: true,
      data: queries,
    });
  } catch (error) {
    console.error("Get FollowUps Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const getScheduleCallQueries = async (req, res) => {
  try {
    const agentId = req.user.id;

    const queries = await Query.find({
      acceptedAgents: agentId,
      disabledCall: agentId,
    })
      .populate("userId")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      status: true,
      data: queries,
    });
  } catch (error) {
    console.error("Disabled Call Queries Error:", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const initiateCallInAgent = async (req, res) => {
  try {
    const callerId = req.user.id;
    const callerType = "Agent";
    const { receiverId, receiverType, channelName, token, roomId, queryId } =
      req.body;
    const io = req.app.get("io");

    if (
      !receiverId ||
      !receiverType ||
      !channelName ||
      !token ||
      !roomId ||
      !queryId
    ) {
      return res.status(400).json({
        status: false,
        message:
          "receiverId, receiverType, channelName, roomId, queryId and token are required",
      });
    }

    const caller = await Agent.findById(callerId);
    if (!caller) {
      return res.status(404).json({
        status: false,
        message: "Caller not found",
      });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        status: false,
        message: "Receiver not found",
      });
    }

    if (receiver?.isApp === false) {
      await createCallSystemMessage({
        roomId,
        senderId: callerId,
        senderType: "system",
        text: "App not download",
        isSystem: true,
        io,
        type: "outgoing",
      });
      return res.status(400).json({
        status: false,
        message: "User does not have the app installed",
      });
    }

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({
        status: false,
        message: "Room not found",
      });
    }

    const query = await Query.findById(room?.queryId);
    if (!query) {
      return res.status(404).json({
        status: false,
        message: "Query not found",
      });
    }

    const purchase = await PurchaseSubscription.findOne({ agentId: callerId });

    if (!purchase) {
      return res.status(400).json({
        status: false,
        message: "Subscription not found",
      });
    }

    if (!purchase?.remaining_Time || purchase.remaining_Time <= 0) {
      return res.status(400).json({
        status: false,
        message: "No remaining call time",
      });
    }

    if (query?.status === "Inactive") {
      return res.status(400).json({
        status: false,
        message: "User Query is inactive",
      });
    }

    if (query?.startTime && query?.endTime) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const startMinutes = convertTimeToMinutes(query.startTime);
      const endMinutes = convertTimeToMinutes(query.endTime);

      // handle normal + overnight time range
      const isWithinTime =
        startMinutes <= endMinutes
          ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
          : currentMinutes >= startMinutes || currentMinutes <= endMinutes;

      if (!isWithinTime) {
        const isDisabledBlocked = receiver?.disabledCall?.some(
          (id) => id.toString() === callerId.toString(),
        );

        if (!isDisabledBlocked) {
          return res.status(400).json({
            status: false,
            message: "Call is disabled for you outside active hours",
          });
        }
      }
    }

    if (
      receiver?.blockedAgents?.some(
        (id) => id.toString() === callerId.toString(),
      )
    ) {
      return res.status(400).json({
        status: false,
        message: "You are blocked by user",
      });
    }

    const call = new CallLogsModel({
      callerId,
      receiverId,
      callerModel: callerType,
      receiverModel: receiverType === "agent" ? "Agent" : "User",
      roomId,
      queryId,
      channelName,
      status: "ringing",
      startedAt: new Date(),
      agoraToken: token,
    });

    await call.save();

    await createCallSystemMessage({
      roomId,
      senderId: callerId,
      senderType: "agent",
      text: "Outgoing call",
      isSystem: false,
      io,
      type: "outgoing",
    });

    io.to(receiverId.toString()).emit("incomingCall", {
      ...call._doc,
      name: caller?.fullName,
    });

    const notificationSent = await sendNotification({
      firebaseToken: receiver?.firebaseToken,
      name: caller?.fullName,
      call,
    });

    if (notificationSent) {
      const updatedCall = await CallLogsModel.findByIdAndUpdate(
        call._id,
        { status: "ringing" },
        { new: true },
      );

      io.to(receiverId.toString()).emit("callStatusUpdated", updatedCall);
    }

    // if (!notificationSent) {
    //   await createCallSystemMessage({
    //     roomId,
    //     senderId: callerId,
    //     senderType: "agent",
    //     text: `${caller?.fullName} tried to reach you at ${new Date().toLocaleTimeString(
    //       "en-IN",
    //       {
    //         hour: "2-digit",
    //         minute: "2-digit",
    //       },
    //     )}`,
    //     isSystem: true,
    //     io,
    //     type: "missed",
    //   });

    //   await CallLogsModel.findByIdAndUpdate(call._id, {
    //     status: "no-answer",
    //   });

    //   return res.status(200).json({
    //     status: true,
    //     message: "Call logged but notification failed",
    //   });
    // }

    res.status(200).json({
      status: true,
      message: "Call initiated successfully",
      data: call,
    });
  } catch (error) {
    console.error("Initiate call error:", error);
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const acceptCallInAgent = async (req, res) => {
  try {
    const { callId } = req.body;
    const userId = req.user.id;
    const io = req.app.get("io");

    const call = await CallLogsModel.findById(callId);

    if (!call) {
      return res.status(404).json({
        status: false,
        message: "Call not found",
      });
    }

    if (call.status !== "ringing") {
      return res.status(400).json({
        status: false,
        message: "Call already handled",
      });
    }

    call.status = "accepted";
    await call.save();

    await createCallSystemMessage({
      roomId: call.roomId,
      senderId: userId,
      senderType: req.user.role === "Agent" ? "agent" : "user",
      text: "Call accepted",
      isSystem: true,
      io,
      type: "incoming",
    });

    io.to(call.callerId.toString()).emit("callAccepted", call);

    res.json({
      status: true,
      message: "Call accepted",
      data: call,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const rejectCallInAgent = async (req, res) => {
  try {
    const { callId, isQuick } = req.body;
    const userId = req.user.id;
    const io = req.app.get("io");

    const call = await CallLogsModel.findById(callId);

    if (!call) {
      return res.status(404).json({
        status: false,
        message: "Call not found",
      });
    }

    if (call.status !== "ringing") {
      return res.status(400).json({
        status: false,
        message: "Call already handled",
      });
    }

    call.status = "rejected";
    await call.save();

    await createCallSystemMessage({
      roomId: call.roomId,
      senderId: userId,
      senderType: req.user.role === "Agent" ? "agent" : "user",
      text: "No answer",
      isSystem: true,
      io,
      type: "callIgnored",
      updateLastMessage: true,
    });

    if (!isQuick) {
      await createCallSystemMessage({
        roomId: call.roomId,
        senderId: userId,
        senderType: req.user.role === "Agent" ? "agent" : "user",
        text: "Missed call",
        isSystem: false,
        io,
        type: "missed",
      });
    }

    io.to(call.callerId.toString()).emit("callRejected", call);

    res.json({
      status: true,
      message: "Call rejected",
      data: call,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const endCallInAgent = async (req, res) => {
  try {
    const { callId, duration, queryId, roomId } = req.body;
    const userId = req.user.id;
    const io = req.app.get("io");

    if (!callId || !duration || !queryId || !roomId) {
      return res.status(400).json({
        status: false,
        message: "callId, duration , queryId and roomId are required",
      });
    }

    const query = await Query.findById(queryId);

    if (!query) {
      return res.status(404).json({
        status: false,
        message: "Query not found",
      });
    }

    const call = await CallLogsModel.findById(callId).populate("roomId");

    const caller = await User.findById(call.callerId);

    if (!call) {
      return res.status(404).json({
        status: false,
        message: "Call not found",
      });
    }

    if (call.status === "ended") {
      return res.status(400).json({
        status: false,
        message: "Call already ended",
      });
    }

    let finalStatus = "ended";

    if (query?.followUpAt) {
      const now = new Date();
      const followUpTime = new Date(query.followUpAt);

      if (now <= followUpTime) {
        finalStatus = "scheduled";
        query.followUpAt = null;
        await query.save();
      }
    }

    call.status = finalStatus;
    call.endedAt = new Date();
    call.duration = duration;

    await call.save();
    let outgoingMsg, incomingMsg;

    const purchase = await PurchaseSubscription.findOne({ agentId: userId });

    let usedMinutes = 0;

    if (purchase) {
      usedMinutes = Math.floor(call.duration / 60);
      if (purchase.remaining_Time < usedMinutes) {
        return res.status(400).json({
          status: false,
          message: "Insufficient call balance",
        });
      }
      purchase.remaining_Time -= usedMinutes;
      await purchase.save();
    }

    if (call.callerModel === "Agent") {
      outgoingMsg = await createCallSystemMessage({
        roomId: call.roomId,
        senderId: userId,
        senderType: "user",
        text: `Outgoing call ${call.duration > 0 ? `(${call.duration}s)` : ""}`,
        isSystem: false,
        io,
        type: "outgoing",
      });

      incomingMsg = await createCallSystemMessage({
        roomId: call.roomId,
        senderId: userId,
        senderType: "user",
        text: `Incoming call ${call.duration > 0 ? `(${call.duration}s)` : ""}`,
        isSystem: true,
        io,
        type: "incoming",
      });
    }

    if (call.callerModel === "User") {
      outgoingMsg = await createCallSystemMessage({
        roomId: call.roomId,
        senderId: userId,
        senderType: "agent",
        text: `Incoming call ${call.duration > 0 ? `(${call.duration}s)` : ""}`,
        isSystem: false,
        io,
        type: "incoming",
      });

      incomingMsg = await createCallSystemMessage({
        roomId: call.roomId,
        senderId: userId,
        senderType: "user",
        text: `Outgoing call ${call.duration > 0 ? `(${call.duration}s)` : ""}`,
        isSystem: true,
        io,
        type: "outgoing",
        updateLastMessage: true,
      });
    }

    await History.create({
        queryId: queryId,
        agentId: userId,
        roomId: roomId,
        msgId: outgoingMsg ? outgoingMsg._id : incomingMsg._id,
        type: "call",
        duration: call.duration,
        remaining: purchase.remaining_Time,
        status: call.callerModel === "User" ? "incoming" : "outgoing",
      });

    io.to(call.callerId.toString()).emit("callEnded", call);
    io.to(call.receiverId.toString()).emit("callEnded", call);

    await sendNotification({
      firebaseToken: caller?.firebaseToken,
      name: "",
      call,
    });

    res.json({
      status: true,
      message: "Call ended",
      data: call,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const ignoreCallInAgent = async (req, res) => {
  try {
    const { callId } = req.body;
    const userId = req.user.id;
    const io = req.app.get("io");

    const call = await CallLogsModel.findById(callId);

    if (!call) {
      return res.status(404).json({
        status: false,
        message: "Call not found",
      });
    }

    if (call.status === "no-answer") {
      return res.status(400).json({
        status: false,
        message: "Call already ignored",
      });
    }

    call.status = "no-answer";
    await call.save();

    await createCallSystemMessage({
      roomId: call.roomId,
      senderId: userId,
      senderType: "agent",
      text: "Missed call",
      isSystem: false,
      io,
      type: "missed",
    });


    await createCallSystemMessage({
      roomId: call.roomId,
      senderId: userId,
      senderType: "agent",
      text: "No answer",
      isSystem: true,
      io,
      type: "callIgnored",
      updateLastMessage: true,
    });

    res.json({
      status: true,
      message: "no-answer",
      data: call,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const getAgentCallLogs = async (req, res) => {
  try {
    const agentId = req.user.id;
    const type = req.query.type || "all";

    let filter = {};

    if (type === "incoming") {
      filter = {
        receiverId: agentId,
        receiverModel: "Agent",
      };
    } else if (type === "outgoing") {
      filter = {
        callerId: agentId,
        callerModel: "Agent",
      };
    } else if (type === "missed") {
      filter = {
        receiverId: agentId,
        receiverModel: "Agent",
        status: "missed",
      };
    } else if (type === "scheduled") {
      filter = {
        receiverId: agentId,
        receiverModel: "Agent",
        status: "scheduled",
      };
    } else {
      filter = {
        $or: [
          { callerId: agentId, callerModel: "Agent" },
          { receiverId: agentId, receiverModel: "Agent" },
        ],
      };
    }

    const calls = await CallLogsModel.find(filter)
      .sort({ createdAt: -1 })
      .populate("callerId")
      .populate("receiverId")
      .populate("queryId");

    res.status(200).json({
      status: true,
      data: calls,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};
