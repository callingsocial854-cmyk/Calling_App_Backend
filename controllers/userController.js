import jwt from "jsonwebtoken";
import User from "../models/UserModel.js";
import crypto from "crypto";
import Transaction from "../models/TransactionModel.js";
import { Policy, FAQ, Support } from "../models/PolicyModel.js";
import Notification from "../models/NotificationModel.js";
import Contact from "../models/Contact.js";
import Query from "../models/QueryModel.js";
import admin from "../config/firebase.js";
import Agent from "../models/AgentModel.js";
import ChatMessage from "../models/ChatMessage.js";
import ChatRoom from "../models/ChatRoom.js";
import AgentProfile from "../models/AgentProfile.js";
import AgentReview from "../models/AgentReview.js";
import mongoose from "mongoose";
import { onlineAgents } from "../utils/onlineAgents.js";
import { Category, CategoryField } from "../models/CategoryModel.js";
import CallLogsModel from "../models/CallLogsModel.js";
import { sendNotification } from "../utils/AddNotification.js";
import PurchaseSubscription from "../models/PurchaseSubscriptionModel.js";
import History from "../models/History.js";
import { sendOTP } from "../utils/sendSMS.js";
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
      lastMsg.systemMsgForUser = !isSystem ? text : "";
      lastMsg.systemMsgForAgent = isSystem ? text : "";
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
      systemMsgForUser: !isSystem ? text : "",
      systemMsgForAgent: isSystem ? text : "",
      status: "seen",
      icon,
    });
  }

  const finalText = msg.systemMsgForUser || msg.systemMsgForAgent || text;

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

const generateJwtToken = (user) => {
  return jwt.sign(
    { id: user._id, phone: user.phone, role: user.role },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
};

const generateSixDigitOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // Generates a random 4-digit number
};

const generateQueryId = (name) => {
  return `${name}-${Math.floor(Math.random() * 100000)}`;
};

const emitUnreadCount = async ({ io, receiverId, receiverType }) => {
  try {
    let rooms = [];
    let queries = [];

    if (receiverType === "user") {
      queries = await Query.find({ userId: receiverId }).select(
        "_id acceptedAgents",
      );
      const queryIds = queries.map((q) => q._id);
      rooms = await ChatRoom.find({
        userId: receiverId,
        queryId: { $in: queryIds },
      }).select("_id queryId");
      const queryRoomMap = {};
      rooms.forEach((room) => {
        const qid = room.queryId.toString();
        if (!queryRoomMap[qid]) queryRoomMap[qid] = [];
        queryRoomMap[qid].push(room._id);
      });
      const result = [];
      for (const query of queries) {
        const qid = query._id.toString();
        const roomIds = queryRoomMap[qid] || [];
        let unreadCount = 0;
        if (roomIds.length > 0) {
          unreadCount = await ChatMessage.countDocuments({
            roomId: { $in: roomIds },
            senderType: "agent",
            status: { $ne: "seen" },
          });
        }
        result.push({
          queryId: query._id,
          unreadCount,
          totalAgents: query.acceptedAgents.length,
        });
      }
      io.to(receiverId.toString()).emit("getUnreadCountResponse", {
        status: true,
        data: result,
      });
    }
    if (receiverType === "agent") {
      rooms = await ChatRoom.find({
        agentId: receiverId,
      }).select("_id queryId");
      const queryRoomMap = {};
      rooms.forEach((room) => {
        const qid = room.queryId.toString();
        if (!queryRoomMap[qid]) queryRoomMap[qid] = [];
        queryRoomMap[qid].push(room._id);
      });
      const result = [];
      for (const qid of Object.keys(queryRoomMap)) {
        const roomIds = queryRoomMap[qid];
        const unreadCount = await ChatMessage.countDocuments({
          roomId: { $in: roomIds },
          senderType: "user",
          status: { $ne: "seen" },
        });
        result.push({
          queryId: qid,
          unreadCount,
        });
      }
      io.to(receiverId.toString()).emit("getUnreadCountResponse", {
        status: true,
        data: result,
      });
    }
  } catch (error) {
    console.log("emitUnreadCount error:", error);
  }
};

export const handleSendMessage = async ({
  io,
  roomId,
  senderId,
  senderType,
  message = "",
  mediaControlIds = [],
  files = [],
  replyToMessageId = null,
}) => {
  const newMsg = await ChatMessage.create({
    roomId,
    senderId,
    senderType,
    message,
    mediaControls: mediaControlIds,
    replyTo: replyToMessageId,
    files,
    status: "sent",
  });

  const updateQuery = {
    $set: {
      lastMessage:
        message ||
        (files.length || mediaControlIds.length
          ? "Attachment"
          : "Replied message"),
      lastMessageTime: new Date(),
      lastMessageId: newMsg._id,
    },
  };

  if (senderType === "user") {
    updateQuery.$inc = { unreadCountAgent: 1 };
    updateQuery.$set.unreadCountUser = 0;
  } else {
    updateQuery.$inc = { unreadCountUser: 1 };
    updateQuery.$set.unreadCountAgent = 0;
  }

  const room = await ChatRoom.findByIdAndUpdate(roomId, updateQuery, {
    new: true,
  });

  const receiverId =
    senderType === "user" ? room.agentId.toString() : room.userId.toString();

  const isOnline = io.sockets.adapter.rooms.has(receiverId);

  if (isOnline) {
    await ChatMessage.findByIdAndUpdate(newMsg._id, {
      status: "delivered",
      deliveredAt: new Date(),
    });

    newMsg.status = "delivered";
    newMsg.deliveredAt = new Date();
  }

  const populatedMsg = await ChatMessage.findById(newMsg._id)
    .populate("mediaControls")
    .populate({
      path: "replyTo",
      select: "message senderType createdAt mediaControls files",
      populate: {
        path: "mediaControls",
      },
    });

  io.to(roomId.toString()).emit("receiveMessage", populatedMsg);
  io.to(room.userId.toString()).emit("updateRoom", room);
  io.to(room.agentId.toString()).emit("updateRoom", room);

  if (senderType === "user") {
    await emitUnreadCount({
      io,
      receiverId: room.agentId,
      receiverType: "agent",
    });
  } else {
    await emitUnreadCount({
      io,
      receiverId: room.userId,
      receiverType: "user",
    });
  }

  return populatedMsg;
};

export const generateOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({
        message: "phone, is required",
        status: false,
      });
    }

    let user = await User.findOne({ phone });

    const generatedOtp = generateSixDigitOtp();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const response = await sendOTP({
      numbers: phone,
      var1: "User",
      var2: "Login",
      var3: generatedOtp,
      var4: "valid for 5 min",
    });

    if (
      !response.success ||
      !response.data ||
      response.data.status !== "Success"
    ) {
      return res.status(500).json({
        message: "Failed to send OTP",
        status: false,
      });
    }

    if (user) {
      user.otp = generatedOtp;
      user.otpExpiresAt = otpExpiresAt;
    } else {
      user = new User({
        phone,
        otp: generatedOtp,
        otpExpiresAt,
      });
    }

    await user.save();

    res.status(200).json({
      message: "OTP generated and sent successfully",
      status: true,
      otp: generatedOtp,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error", status: false });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const {
      phone,
      otp,
      firebaseToken,
      description,
      startTime,
      endTime,
      industry,
      isApp,
    } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        message: "phone and otp are required",
        status: false,
      });
    }

    const user = await User.findOne({ phone });

    if (!user || user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP", status: false });
    }

    if (new Date() > new Date(user.otpExpiresAt)) {
      return res.status(400).json({ message: "OTP expired", status: false });
    }

    user.otpExpiresAt = "";
    user.isVerified = true;
    user.isApp = isApp;
    if (firebaseToken) user.firebaseToken = firebaseToken;
    await user.save();

    const queryData = {
      userId: user._id,
    };

    if (description) queryData.description = description;
    if (startTime) queryData.startTime = startTime;
    if (endTime) queryData.endTime = endTime;
    if (industry) queryData.industry = industry;

    if (description || startTime || endTime) {
      const newQuery = new Query(queryData);
      await newQuery.save();
    }

    const token = generateJwtToken(user);

    res.status(200).json({
      message: "OTP verified successfully",
      status: true,
      token,
      data: user,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Server Error", status: false });
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({
        message: "phone are required",
        status: false,
      });
    }

    let user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: "User not found", status: false });
    }

    const generatedOtp = generateSixDigitOtp();

    const response = await sendOTP({
      numbers: phone,
      var1: "User",
      var2: "Login",
      var3: generatedOtp,
      var4: "valid for 5 min",
    });

    if (
      !response.success ||
      !response.data ||
      response.data.status !== "Success"
    ) {
      return res.status(500).json({
        message: "Failed to send OTP",
        status: false,
      });
    }

    user.otp = generatedOtp;
    user.otpExpiresAt = otpExpiresAt;

    await user.save();

    res.status(200).json({
      message: "OTP resent successfully",
      status: true,
      otp: generatedOtp,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", status: false });
  }
};

export const firebaseLogin = async (req, res) => {
  try {
    const { idToken, description, startTime, endTime, industry } = req.body;

    if (!idToken) {
      return res
        .status(400)
        .json({ status: false, message: "idToken required" });
    }
    const decoded = await admin.auth().verifyIdToken(idToken);
    const { email, displayName, picture } = decoded;

    let user = await User.findOne({ userEmail: email });

    if (!user) {
      user = new User({
        fullName: displayName || "",
        userEmail: email,
        profileImage: picture,
        isVerified: true,
      });
      await user.save();
      const queryData = {
        userId: user._id,
      };

      if (description) queryData.description = description;
      if (startTime) queryData.startTime = startTime;
      if (endTime) queryData.endTime = endTime;
      if (industry) queryData.industry = industry;

      if (description || startTime || endTime) {
        const newQuery = new Query(queryData);
        await newQuery.save();
      }
    }

    const token = generateJwtToken(user);

    res.status(200).json({
      status: true,
      message: "Firebase login successful",
      token,
      data: user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: "Firebase login failed" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { fullName, userEmail, dob, gender, phone, firebaseToken } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized", status: false });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found", status: false });
    }

    const files = req.files;
    const profileImage = files?.profileImage?.[0]?.filename;

    // Update only the fields that are provided
    if (fullName) user.fullName = fullName;
    if (dob) user.dob = dob;
    if (gender) user.gender = gender;
    if (userEmail) user.userEmail = userEmail;
    if (phone) user.phone = phone;
    if (firebaseToken) user.firebaseToken = firebaseToken;
    if (profileImage) user.profileImage = profileImage;

    await user.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      status: true,
      user,
    });
  } catch (error) {
    console.error("Error in updateProfile:", error);
    return res.status(500).json({
      message: "Server Error",
      status: false,
    });
  }
};

export const getUserById = async (req, res) => {
  try {
    const userId = req.user.id;
    let user = await User.findById(userId).select("-otp -otpExpiresAt");
    let totalActiveQueries = await Query.countDocuments({
      userId,
      status: "Active",
    });
    let totalInActiveQueries = await Query.countDocuments({
      userId,
      status: "Inactive",
    });
    if (!user) {
      return res.status(404).json({ message: "User not found", status: false });
    }
    const data = {
      user,
      totalActiveQueries,
      totalInActiveQueries,
    };

    res
      .status(200)
      .json({ message: "User fetched successfully", status: true, data });
  } catch (error) {
    res.status(500).json({ message: "Server Error", status: false });
  }
};

export const getPolicyByType = async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) {
      return res
        .status(400)
        .json({ message: "Policy type is required", status: false });
    }

    const policy = await Policy.findOne({ type });
    if (!policy) {
      return res
        .status(404)
        .json({ message: "Policy not found", status: false });
    }

    res
      .status(200)
      .json({ message: "Policy fetched successfully", status: true, policy });
  } catch (error) {
    console.error("Error fetching policy:", error);
    res.status(500).json({
      message: "Internal Server Error",
      status: false,
      error: error.message,
    });
  }
};

export const getFAQList = async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ createdAt: -1 });
    res.status(200).json({ faqs, message: "FAQ fetch successfully" });
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getFAQByFaqId = async (req, res) => {
  try {
    const { id } = req.query;
    const faq = await FAQ.findById(id);

    if (!faq) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    res.status(200).json({ faq, message: "FAQ fetch successfully" });
  } catch (error) {
    console.error("Error fetching FAQ:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found", status: false });
    }

    const transactions = await Transaction.find({ userId }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      message: "Transaction history fetched successfully",
      status: true,
      totalTransactions: transactions.length,
      data: transactions,
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    return res.status(500).json({
      message: "Server Error",
      status: false,
    });
  }
};

export const getNotificationsByUserId = async (req, res) => {
  const userId = req.user.id;
  try {
    const notifications = await Notification.find({ userId }).sort({
      createdAt: -1,
    }); // latest first
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateProfileImage = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const file = req.file || req.files?.profileImage?.[0];
    if (!file) {
      return res
        .status(400)
        .json({ status: false, message: "No profile image uploaded" });
    }

    user.profileImage = file.filename;
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Profile image updated successfully",
      profileImage: user.profileImage,
    });
  } catch (error) {
    console.error("Error updating profile image:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const createContact = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, message } = req.body;

    if (!firstName || !lastName || !phone || !email || !message) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const newContact = new Contact({
      firstName,
      lastName,
      phone,
      email,
      message,
    });
    await newContact.save();

    res
      .status(200)
      .json({ success: true, message: "Message submitted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: err.message });
  }
};

export const createQuery = async (req, res) => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found", status: false });
    }

    const { description, startTime, endTime, industry } = req.body;

    if (!description || !industry) {
      return res
        .status(400)
        .json({ message: "Description, industry is required" });
    }

    const queryId = generateQueryId(user.fullName);

    const newQuery = new Query({
      userId,
      description,
      startTime,
      endTime,
      industry,
      queryId,
    });
    await newQuery.save();

    res
      .status(200)
      .json({ message: "Query created successfully", status: true });
  } catch (error) {
    console.error("Error creating query:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const addCommentInQuery = async (req, res) => {
  try {
    const { comment, queryId } = req.body;
    const io = req.app.get("io");

    if (!comment || !queryId) {
      return res.status(400).json({
        message: "comment and queryId are required",
        status: false,
      });
    }

    const query = await Query.findById(queryId);

    if (!query) {
      return res.status(404).json({
        message: "Query not found",
        status: false,
      });
    }

    query.comments.push({
      text: comment,
      date: new Date(),
    });

    await query.save();

    for (const agentId of query.acceptedAgents) {
      const room = await ChatRoom.findOne({
        queryId: query._id,
        agentId,
      });

      if (!room) continue;

      const systemMsgForUser = `Your new comment has been added: "${comment}"`;
      const systemMsgForAgent = `The user added a new comment: "${comment}"`;

      const systemMessage = await ChatMessage.create({
        roomId: room._id,
        senderType: "system",
        systemMsgForUser,
        systemMsgForAgent,
        status: "sent",
      });

      io.to(room._id.toString()).emit("receiveMessage", systemMessage);
      io.to(agentId.toString()).emit("queryCommentAdded", {
        queryId,
        comment,
      });
    }
    return res.status(200).json({
      message: "Comment added successfully",
      status: true,
      data: query.comments,
    });
  } catch (error) {
    console.error("Error in addCommentInQuery:", error);
    return res.status(500).json({
      message: "Internal server error",
      status: false,
    });
  }
};

export const getQueries = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { search, status } = req.query;

    const baseFilter = { userId };
    if (status) baseFilter.status = status;

    const searchRegex = search ? new RegExp(search.trim(), "i") : null;

    // Ã°Å¸â€Â¹ Step 1: fetch queries
    const queries = await Query.find(baseFilter).sort({ createdAt: -1 }).lean();

    if (!queries.length) {
      return res.status(200).json({
        status: true,
        data: { queries: [] },
        message: "No queries found",
      });
    }

    const user = await User.findById(userId).select("fullName");

    const filteredQueries = [];

    for (const query of queries) {
      let matched = false;

      // Ã¢Å“â€¦ 1. Query-level search
      if (searchRegex) {
        if (
          searchRegex.test(query.description) ||
          searchRegex.test(query.industry)
        ) {
          matched = true;
        }
      } else {
        matched = true; // no search Ã¢â€ â€™ include all
      }

      // Ã¢Å“â€¦ 2. Agent fullName search
      if (!matched && searchRegex && query.acceptedAgents?.length) {
        const agentsCount = await Agent.countDocuments({
          _id: { $in: query.acceptedAgents },
          fullName: { $regex: searchRegex },
        });

        if (agentsCount > 0) matched = true;
      }

      // Ã¢Å“â€¦ 3. Message-level search
      if (!matched && searchRegex) {
        const rooms = await ChatRoom.find({
          queryId: query._id,
          userId,
        }).select("_id");

        if (rooms.length) {
          const roomIds = rooms.map((r) => r._id);

          const msgCount = await ChatMessage.countDocuments({
            roomId: { $in: roomIds },
            message: { $regex: searchRegex },
          });

          if (msgCount > 0) matched = true;
        }
      }

      if (matched) {
        filteredQueries.push(query);
      }
    }

    return res.status(200).json({
      status: true,
      data: {
        name: user?.fullName || "",
        queries: filteredQueries,
      },
      message: "Queries fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching queries:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const getQueryById = async (req, res) => {
  try {
    const { id } = req.query;
    const query = await Query.findById(id);
    if (!query) {
      return res
        .status(404)
        .json({ success: false, message: "Query not found" });
    }
    res.status(200).json({ success: true, data: query });
  } catch (error) {
    console.error("Error fetching query:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getAgentsForUserQuery = async (req, res) => {
  try {
    const userId = req.user.id;
    const { queryId, type = "all", search } = req.query;

    if (!queryId) {
      return res.status(400).json({
        status: false,
        message: "queryId is required",
      });
    }

    const searchRegex = search ? new RegExp(search.trim(), "i") : null;

    const user = await User.findById(userId).select("favoriteAgents");
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const query = await Query.findOne({ _id: queryId, userId }).lean();
    if (!query) {
      return res.status(404).json({
        status: false,
        message: "Query not found for this user",
      });
    }

    let agentIds = query.acceptedAgents || [];

    if (type === "favorite" || type === "favorite_unread") {
      agentIds = agentIds.filter((id) =>
        user.favoriteAgents.some((favId) => favId.toString() === id.toString()),
      );
    }

    if (!agentIds.length) {
      return res.status(200).json({
        status: true,
        message: "No agents found",
        data: [],
      });
    }

    const agents = await Agent.find({
      _id: { $in: agentIds },
    }).select(
      "fullName agentEmail phone profileImage sector avgRating isOnline lastSeen",
    );

    const result = [];

    for (const agent of agents) {
      const isFavorite = user.favoriteAgents.some(
        (id) => id.toString() === agent._id.toString(),
      );

      const room = await ChatRoom.findOne({
        queryId,
        agentId: agent._id,
        userId,
      }).populate({
        path: "lastMessageId",
        populate: {
          path: "mediaControls",
        },
      });

      let unreadCount = 0;
      let messageMatched = false;

      if (room) {
        unreadCount = await ChatMessage.countDocuments({
          roomId: room._id,
          senderType: "agent",
          status: { $ne: "seen" },
        });

        if (searchRegex) {
          const msgCount = await ChatMessage.countDocuments({
            roomId: room._id,
            message: { $regex: searchRegex },
          });
          messageMatched = msgCount > 0;
        }
      }

      const nameMatched = searchRegex ? searchRegex.test(agent.fullName) : true;

      if (searchRegex && !nameMatched && !messageMatched) {
        continue;
      }
      if (
        (type === "unread" || type === "favorite_unread") &&
        unreadCount === 0
      ) {
        continue;
      }

      const agentProfile = await AgentProfile.findOne({
        agentId: agent._id,
        paymentStatus: "success",
        adminVerified: "approved",
      })
        .sort({ createdAt: -1 })
        .select("sector details profileCreation paymentStatus adminVerified");

      result.push({
        agent,
        profile: agentProfile || null,
        roomId: room ? room._id : null,
        unreadCount,
        lastMessage: room?.lastMessage || null,
        lastMessageTime: room?.lastMessageTime || null,
        isFavorite,
        isOnline: agent.isOnline === true,
        lastSeen: agent.lastSeen || null,
        mediaControls: room?.lastMessageId?.mediaControls || [],
        files: room?.lastMessageId?.files || [],
      });
    }

    return res.status(200).json({
      status: true,
      message: "Agents fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("getAgentsForUserQuery Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const getAgentById = async (req, res) => {
  try {
    const { agentId } = req.query;
    const userId = req.user?.id;

    if (!agentId) {
      return res
        .status(400)
        .json({ status: false, message: "Agent ID is required" });
    }

    const agent = await Agent.findById(agentId).lean();
    if (!agent) {
      return res
        .status(404)
        .json({ status: false, message: "Agent not found" });
    }

    let isFavorite = false;
    let isCallDisabled = false;
    let isBlocked = false;

    if (userId) {
      const user = await User.findById(userId).select(
        "favoriteAgents disabledCall blockedAgents",
      );

      isFavorite = user?.favoriteAgents?.some(
        (id) => id.toString() === agentId.toString(),
      );

      isCallDisabled = user?.disabledCall?.some(
        (id) => id.toString() === agentId.toString(),
      );

      isBlocked = user?.blockedAgents?.some(
        (id) => id.toString() === agentId.toString(),
      );
    }

    const reviews = await AgentReview.find({ agentId })
      .populate("userId", "fullName profileImage")
      .sort({ createdAt: -1 })
      .lean();

    const reviewsWithFlag = reviews.map((review) => ({
      ...review,
      isMyReview: userId
        ? review.userId?._id.toString() === userId.toString()
        : false,
    }));

    res.status(200).json({
      status: true,
      data: {
        agent: {
          ...agent,
          isFavorite,
          isCallDisabled,
          isBlocked,
        },
        rating: {
          avgRating: agent.avgRating,
          totalReviews: agent.totalReviews,
        },
        reviews: reviewsWithFlag,
      },
    });
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const getAgentByIdInWeb = async (req, res) => {
  try {
    const { agentId, queryId } = req.query;
    const userId = req.user?.id;

    if (!agentId || !queryId) {
      return res.status(400).json({
        status: false,
        message: "agentId and queryId are required",
      });
    }

    // ðŸ”’ Check agent is accepted for this query
    const query = await Query.findOne({
      _id: queryId,
      acceptedAgents: agentId,
    });

    if (!query) {
      return res.status(403).json({
        status: false,
        message: "Agent not accepted for this query",
      });
    }

    const agent = await Agent.findById(agentId).lean();
    if (!agent) {
      return res.status(404).json({
        status: false,
        message: "Agent not found",
      });
    }

    let isFavorite = false;
    let isCallDisabled = false;
    let isBlocked = false;

    if (userId) {
      const user = await User.findById(userId).select(
        "favoriteAgents disabledCall blockedAgents",
      );

      isFavorite = user?.favoriteAgents?.includes(agent._id);
      isCallDisabled = user?.disabledCall?.includes(agent._id);
      isBlocked = user?.blockedAgents?.includes(agent._id);
    }

    const reviews = await AgentReview.find({ agentId })
      .populate("userId", "fullName profileImage")
      .sort({ createdAt: -1 })
      .lean();

    const reviewsWithFlag = reviews.map((r) => ({
      ...r,
      isMyReview: userId
        ? r.userId?._id.toString() === userId.toString()
        : false,
    }));

    res.status(200).json({
      status: true,
      data: {
        agent: {
          ...agent,
          isFavorite,
          isCallDisabled,
          isBlocked,
        },
        rating: {
          avgRating: agent.avgRating,
          totalReviews: agent.totalReviews,
        },
        reviews: reviewsWithFlag,
      },
    });
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const updateQueryStatus = async (req, res) => {
  try {
    const { queryId, status, startTime, endTime } = req.body;
    const io = req.app.get("io");

    if (!queryId) {
      return res.status(400).json({
        status: false,
        message: "queryId is required",
      });
    }

    const query = await Query.findById(queryId);

    if (!query) {
      return res.status(404).json({
        status: false,
        message: "Query not found",
      });
    }

    const oldStatus = query.status;
    const oldStartTime = query.startTime;
    const oldEndTime = query.endTime;

    if (status) query.status = status;
    if (startTime) query.startTime = startTime;
    if (endTime) query.endTime = endTime;

    await query.save();

    // 🔍 detect what changed
    const statusChanged = status && status !== oldStatus;
    const timeChanged =
      (startTime && startTime !== oldStartTime?.toString()) ||
      (endTime && endTime !== oldEndTime?.toString());

    for (const agentId of query.acceptedAgents) {
      const room = await ChatRoom.findOne({
        queryId: query._id,
        agentId,
      });

      if (!room) continue;

      let systemMsgForUser = null;
      let systemMsgForAgent = null;

      // ✅ status based message
      if (statusChanged) {
        if (status === "Active") {
          systemMsgForUser =
            "Your query is now active again. You can continue chatting with agents.";
          systemMsgForAgent =
            "The user has reactivated this query. You may continue assisting.";
        } else {
          systemMsgForUser =
            "You have marked this query as inactive. The chat is now closed.";
          systemMsgForAgent =
            "The user has marked this query as inactive. Chat is now closed.";
        }
      }

      // ⏰ time update message (only when time changes)
      if (timeChanged) {
        systemMsgForUser = "Your query schedule has been updated.";
        systemMsgForAgent = "The user has updated the query schedule time.";
      }

      // 🚫 nothing meaningful changed → skip message
      if (!systemMsgForUser && !systemMsgForAgent) continue;

      const systemMessage = await ChatMessage.create({
        roomId: room._id,
        senderType: "system",
        systemMsgForAgent,
        systemMsgForUser,
        status: "sent",
      });

      io.to(room._id.toString()).emit("receiveMessage", systemMessage);

      if (statusChanged) {
        io.to(agentId.toString()).emit("queryStatusUpdated", {
          queryId,
          status,
        });
      }
    }

    return res.status(200).json({
      status: true,
      message: "Query updated successfully",
    });
  } catch (error) {
    console.error("Error in updateQueryStatus:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const addOrRemoveFavoriteAgent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({
        status: false,
        message: "agentId is required",
      });
    }

    const agent = await Agent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        status: false,
        message: "Agent not found",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    if (user.favoriteAgents.includes(agentId)) {
      user.favoriteAgents = user.favoriteAgents.filter(
        (id) => id.toString() !== agentId,
      );
    } else {
      user.favoriteAgents.push(agentId);
    }

    await user.save();

    return res.status(200).json({
      status: true,
      message: "Favorite agent updated successfully",
    });
  } catch (error) {
    console.error("Error in addOrRemoveFavoriteAgent:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const updateAgentRating = async (agentId) => {
  const stats = await AgentReview.aggregate([
    {
      $match: {
        agentId: new mongoose.Types.ObjectId(agentId),
      },
    },
    {
      $group: {
        _id: "$agentId",
        avgRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await Agent.findByIdAndUpdate(agentId, {
      avgRating: Number(stats[0].avgRating.toFixed(1)),
      totalReviews: stats[0].totalReviews,
    });
  } else {
    await Agent.findByIdAndUpdate(agentId, {
      avgRating: 0,
      totalReviews: 0,
    });
  }
};

export const addOrUpdateReview = async (req, res) => {
  const { agentId, rating, review } = req.body;
  const userId = req.user.id;

  const existing = await AgentReview.findOne({ agentId, userId });

  if (existing) {
    existing.rating = rating;
    existing.review = review;
    await existing.save();
  } else {
    await AgentReview.create({ agentId, userId, rating, review });
  }

  await updateAgentRating(agentId);

  res.status(200).json({
    success: true,
    message: "Review submitted successfully",
  });
};

export const getInactiveQueryStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    const queries = await Query.find({ userId, status: "Inactive" }).sort({
      createdAt: -1,
    });
    const user = await User.findById(userId);
    if (!queries) {
      return res
        .status(404)
        .json({ success: false, message: "No queries found" });
    }
    res.status(200).json({
      status: true,
      data: {
        name: user?.fullName || "",
        queries: queries,
      },
      message: "Queries fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching queries:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getSearchQueries = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { search_query } = req.body;

    let filter = { userId };

    if (search_query) {
      filter.$or = [
        { description: { $regex: search_query, $options: "i" } },
        { industry: { $regex: search_query, $options: "i" } },
      ];
    }

    const queries = await Query.find(filter).sort({ createdAt: -1 });
    const user = await User.findById(userId).select("fullName");

    if (!queries || queries.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No matching queries found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        name: user?.fullName || "",
        total: queries.length,
        queries,
      },
      message: "Search results fetched successfully",
    });
  } catch (error) {
    console.error("Error searching queries:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getSearchInactiveQueries = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { search_query } = req.body;

    let filter = { userId, status: "Inactive" };

    if (search_query) {
      filter.$or = [
        { description: { $regex: search_query, $options: "i" } },
        { industry: { $regex: search_query, $options: "i" } },
      ];
    }

    const queries = await Query.find(filter).sort({ createdAt: -1 });
    const user = await User.findById(userId).select("fullName");

    if (!queries || queries.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No matching queries found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        name: user?.fullName || "",
        total: queries.length,
        queries,
      },
      message: "Search results fetched successfully",
    });
  } catch (error) {
    console.error("Error searching queries:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getSearchAgentsForUserQuery = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search_query } = req.body;

    if (!search_query) {
      return res.status(400).json({
        status: false,
        message: "search_query is required",
      });
    }

    const user = await User.findById(userId).select("favoriteAgents");
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // 1ÃƒÂ¯Ã‚Â¸Ã‚ÂÃƒÂ¢Ã†â€™Ã‚Â£ Get all user queries
    const queries = await Query.find({ userId }).select("acceptedAgents");

    if (!queries.length) {
      return res.status(404).json({
        status: false,
        message: "No queries found",
      });
    }

    // 2ÃƒÂ¯Ã‚Â¸Ã‚ÂÃƒÂ¢Ã†â€™Ã‚Â£ Collect all accepted agent IDs
    const agentIds = [
      ...new Set(queries.flatMap((q) => q.acceptedAgents || [])),
    ];

    if (!agentIds.length) {
      return res.status(404).json({
        status: false,
        message: "No accepted agents found",
      });
    }

    // 3ÃƒÂ¯Ã‚Â¸Ã‚ÂÃƒÂ¢Ã†â€™Ã‚Â£ Search agents by name
    const agents = await Agent.find({
      _id: { $in: agentIds },
      fullName: { $regex: search_query, $options: "i" },
    }).select("fullName agentEmail phone profileImage sector");

    const result = [];

    for (const agent of agents) {
      const isFavorite = user.favoriteAgents.some(
        (id) => id.toString() === agent._id.toString(),
      );

      const room = await ChatRoom.findOne({
        agentId: agent._id,
        userId,
      });

      let unreadCount = 0;
      if (room) {
        unreadCount = await ChatMessage.countDocuments({
          roomId: room._id,
          senderType: "agent",
          isRead: false,
        });
      }

      const agentProfile = await AgentProfile.findOne({
        agentId: agent._id,
        paymentStatus: "success",
        adminVerified: "approved",
      })
        .sort({ createdAt: -1 })
        .select("sector details profileCreation");

      result.push({
        agent,
        profile: agentProfile || null,
        roomId: room?._id || null,
        unreadCount,
        lastMessage: room?.lastMessage || null,
        isFavorite,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Agents fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("getSearchAgentsForUserQuery Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const getCategoriesInUser = async (req, res) => {
  try {
    const categories = await Category.find({ categoryRole: "User" }).sort({
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

export const getFieldsByCategoryInUser = async (req, res) => {
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

export const getMessagesByRoomId = async (req, res) => {
  try {
    const { roomId, queryId, search, page = 1, limit = 20 } = req.query;

    if (!roomId || !queryId) {
      return res.status(400).json({
        status: false,
        message: "roomId and queryId are required",
      });
    }

    const room = await ChatRoom.findOne({
      _id: roomId,
      queryId,
    });

    if (!room) {
      return res.status(403).json({
        status: false,
        message: "Room does not belong to this query",
      });
    }

    const filter = { roomId };

    if (search && search.trim() !== "") {
      filter.message = {
        $regex: search,
        $options: "i",
      };
    }

    const skip = (page - 1) * limit;

    const messages = await ChatMessage.find(filter)
      .populate("mediaControls")
      .populate({
        path: "replyTo",
        populate: { path: "mediaControls" },
      })
      .sort({ createdAt: -1 }) // newest first
      .skip(skip)
      .limit(Number(limit));

    const total = await ChatMessage.countDocuments(filter);

    res.json({
      status: true,
      data: messages.reverse(), // back to old → new for UI
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        hasMore: skip + messages.length < total,
      },
    });
  } catch (error) {
    console.error("getMessagesByRoomId error:", error);
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const toggleCallStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { agentId, roomId } = req.body;
    const io = req.app.get("io");

    if ((!agentId || !mongoose.Types.ObjectId.isValid(agentId), !roomId)) {
      return res.status(400).json({
        status: false,
        message: "Valid agentId and roomId is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const agentObjectId = agentId.toString();
    const room = await ChatRoom.findById(roomId);

    // ðŸ” Toggle logic
    const isDisabled = user.disabledCall
      .map((id) => id.toString())
      .includes(agentObjectId);

    let systemMsgForUser = "";
    let systemMsgForAgent = "";

    if (isDisabled) {
      user.disabledCall = user.disabledCall.filter(
        (id) => id.toString() !== agentObjectId,
      );

      systemMsgForUser = "You have enabled calls for this agent.";
      systemMsgForAgent = "The user has enabled calling for this chat.";
    } else {
      user.disabledCall.push(agentId);

      systemMsgForUser = "You have disabled calls from this agent.";
      systemMsgForAgent = "The user has disabled calling for this chat.";
    }

    let systemMessage = null;

    if (room) {
      systemMessage = await ChatMessage.create({
        roomId: room._id,
        senderType: "system",
        systemMsgForUser,
        systemMsgForAgent,
        status: "sent",
      });

      await ChatRoom.findByIdAndUpdate(roomId, {
        lastMessage: isDisabled ? "Calls enabled" : "Calls disabled",
        lastMessageTime: new Date(),
      });

      // ? realtime updates
      io.to(roomId.toString()).emit("receiveMessage", systemMessage);
      io.to(room.userId.toString()).emit("updateRoom");
      io.to(room.agentId.toString()).emit("updateRoom");
    }

    await user.save();

    res.json({
      status: true,
      message: isDisabled
        ? "Calls enabled for this agent"
        : "Calls disabled for this agent",
      data: {
        agentId,
        callEnabled: isDisabled,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const clearChatInUser = async (req, res) => {
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
      { $set: { isDeletedByUser: true } },
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

export const blockedAgent = async (req, res) => {
  try {
    const { agentId, roomId } = req.body;
    const io = req.app.get("io"); // ?? socket instance

    if (!agentId || !roomId) {
      return res.status(400).json({
        status: false,
        message: "agentId and roomId are required",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const agentObjectId = agentId.toString();
    const room = await ChatRoom.findById(roomId);

    const isBlocked = user.blockedAgents
      .map((id) => id.toString())
      .includes(agentObjectId);

    let systemMsgForUser = "";
    let systemMsgForAgent = "";

    if (!isBlocked) {
      // ?? BLOCK
      user.blockedAgents.push(agentId);

      systemMsgForUser =
        "You have blocked this agent. You will no longer receive messages or calls from them.";
      systemMsgForAgent =
        "The user has blocked this chat. You can no longer message or call this user.";
    } else {
      // ?? UNBLOCK
      user.blockedAgents = user.blockedAgents.filter(
        (id) => id.toString() !== agentObjectId,
      );

      systemMsgForUser =
        "You have unblocked this agent. You can now chat or call again.";
      systemMsgForAgent =
        "The user has unblocked the chat. You may now communicate again.";
    }

    let systemMessage = null;

    if (room) {
      systemMessage = await ChatMessage.create({
        roomId: room._id,
        senderType: "system",
        systemMsgForUser,
        systemMsgForAgent,
        status: "sent",
      });

      // ?? update last message in room
      await ChatRoom.findByIdAndUpdate(roomId, {
        lastMessage: isBlocked ? "Agent unblocked" : "Agent blocked",
        lastMessageTime: new Date(),
      });

      // ? REAL TIME EMIT
      io.to(roomId.toString()).emit("receiveMessage", systemMessage);
      io.to(room.userId.toString()).emit("updateRoom");
      io.to(room.agentId.toString()).emit("updateRoom");
    }

    await user.save();

    res.json({
      status: true,
      message: isBlocked
        ? "Agent unblocked successfully"
        : "Agent blocked successfully",
      blocked: !isBlocked,
    });
  } catch (error) {
    console.error("blockedAgent error:", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const addSupportMessage = async (req, res) => {
  try {
    const { name, email, subject, description } = req.body;

    if (!name || !email || !subject || !description) {
      return res.status(400).json({
        status: false,
        message: "message and roomId are required",
      });
    }

    const supportMessage = await Support.create({
      name,
      email,
      subject,
      description,
    });

    res.status(201).json({
      status: true,
      message: "Support message added successfully",
      data: supportMessage,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const sendMessageApi = async (req, res) => {
  try {
    const userId = req.user.id;
    const io = req.app.get("io");

    let { roomId, senderType, message = "", replyTo = null } = req.body;

    if (!roomId || !senderType) {
      return res.status(400).json({
        status: false,
        message: "roomId and senderType are required",
      });
    }

    replyTo = replyTo && replyTo.trim() !== "" ? replyTo : null;

    const files = Array.isArray(req.files)
      ? req.files.map((f) => f.filename)
      : req.files
        ? Object.values(req.files)
            .flat()
            .map((f) => f.filename)
        : [];

    const sentMsg = await handleSendMessage({
      io,
      roomId,
      senderId: userId,
      senderType,
      message,
      files,
      replyToMessageId: replyTo,
    });

    res.status(200).json({
      status: true,
      message: "Message sent successfully",
      data: sentMsg,
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

export const getUserMediaControls = async (req, res) => {
  try {
    const userId = req.user.id;
    const { queryId } = req.query;
    const rooms = await ChatRoom.find({ userId, queryId }).select("_id");
    const roomIds = rooms.map((r) => r._id);
    const mediaMessages = await ChatMessage.find({
      roomId: { $in: roomIds },
      senderType: "agent",
      mediaControls: { $exists: true, $ne: [] },
    })
      .populate("mediaControls")
      .populate({
        path: "senderId",
        model: "Agent",
        select: "fullName agentEmail phone",
      })
      .sort({ createdAt: -1 });

    if (!mediaMessages.length) {
      return res.status(404).json({
        status: false,
        message: "No media messages found",
      });
    }

    const resData = mediaMessages.map((m) => {
      return {
        mediaControls: m.mediaControls,
        senderId: m.senderId,
        createdAt: m.createdAt,
      };
    });

    res.json({
      status: true,
      data: resData,
    });
  } catch (err) {
    console.error("MediaControls API error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getRoomMediaControls = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.query;

    if (!roomId) {
      return res.status(400).json({
        status: false,
        message: "roomId is required",
      });
    }

    const roomExists = await ChatRoom.findOne({ _id: roomId, userId });

    if (!roomExists) {
      return res.status(403).json({
        status: false,
        message: "Unauthorized room access",
      });
    }

    const mediaMessages = await ChatMessage.find({
      roomId,
      senderType: "agent",
      mediaControls: { $exists: true, $ne: [] },
    })
      .populate("mediaControls")
      .populate({
        path: "senderId",
        model: "Agent",
        select: "fullName agentEmail phone",
      })
      .sort({ createdAt: -1 });

    if (!mediaMessages.length) {
      return res.status(404).json({
        status: false,
        message: "No media messages found for this room",
      });
    }

    const resData = mediaMessages.map((m) => ({
      mediaControls: m.mediaControls,
      senderId: m.senderId,
      createdAt: m.createdAt,
    }));

    res.json({
      status: true,
      message: "Media messages fetched successfully",
      data: resData,
    });
  } catch (err) {
    console.error("Room MediaControls API error:", err);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const initiateCallInUser = async (req, res) => {
  try {
    const callerId = req.user.id;
    const callerType = "User";
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

    const caller = await User.findById(callerId);
    if (!caller) {
      return res.status(404).json({
        status: false,
        message: "Caller not found",
      });
    }

    const receiver = await Agent.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        status: false,
        message: "Receiver not found",
      });
    }

    const purchase = await PurchaseSubscription.findOne({
      agentId: receiverId,
    });

    if (!purchase?.remaining_Time || purchase.remaining_Time <= 0) {
      await createCallSystemMessage({
        roomId,
        senderId: callerId,
        senderType: "user",
        text: `${caller.fullName} try to reach you but you have missed this call due to no balance.`,
        isSystem: true,
        io,
        type: "noSubscription",
      });

      return res.status(400).json({
        status: false,
        message: "Agent Subscription expired",
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

    if (query?.status === "Inactive") {
      return res.status(400).json({
        status: false,
        message: "Query is inactive",
      });
    }

    if (query?.startTime && query?.endTime) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const startMinutes = convertTimeToMinutes(query.startTime);
      const endMinutes = convertTimeToMinutes(query.endTime);
      const isActive =
        startMinutes <= endMinutes
          ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
          : currentMinutes >= startMinutes || currentMinutes <= endMinutes;

      if (!isActive) {
        if (!caller.disabledCall.includes(receiverId)) {
          caller.disabledCall.push(receiverId);
          await caller.save();
        }
      }
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
      senderType: "user",
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
      // io.to(callerId.toString()).emit("callStatusUpdated", updatedCall);
    }

    // if (!notificationSent) {
    //   await createCallSystemMessage({
    //     roomId,
    //     senderId: callerId,
    //     senderType: "user",
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

export const acceptCallInUser = async (req, res) => {
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
      isSystem: false,
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

export const rejectCallInUser = async (req, res) => {
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

    if (req.user.role === "User") {
      await User.findByIdAndUpdate(userId, {
        $pull: { disabledCall: call.receiverId },
      });
    }

    await createCallSystemMessage({
      roomId: call.roomId,
      senderId: call.receiverId,
      senderType: "agent",
      text: "Declined call",
      isSystem: true,
      io,
      updateLastMessage: true,
      type: "callRejected",
    });

    if (!isQuick) {
      await createCallSystemMessage({
        roomId: call.roomId,
        senderId: userId,
        senderType: req.user.role === "Agent" ? "agent" : "user",
        text: "Call rejected",
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

export const endCallInUser = async (req, res) => {
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

    const call = await CallLogsModel.findById(callId);

    const caller = await Agent.findById(call.callerId);

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

    call.status = "ended";
    call.endedAt = new Date();
    call.duration = duration || 0;

    const purchase = await PurchaseSubscription.findOne({
      agentId: call.callerModel === "Agent" ? call.callerId : call.receiverId,
    });

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

    await call.save();
    let outgoingMsg, incomingMsg;

    if (call.callerModel === "User") {
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

    if (call.callerModel === "Agent") {
      incomingMsg = await createCallSystemMessage({
        roomId: call.roomId,
        senderId: userId,
        senderType: "agent",
        text: `Incoming call ${call.duration > 0 ? `(${call.duration}s)` : ""}`,
        isSystem: false,
        io,
        type: "incoming",
      });

      outgoingMsg = await createCallSystemMessage({
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
      queryId: call.roomId?.queryId?.toString(),
      agentId:
        call.callerModel === "Agent"
          ? call.callerId
          : call.receiverId?.toString(),
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

export const ignoreCallInUser = async (req, res) => {
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
      senderType: "user",
      text: "Missed call",
      isSystem: false,
      io,
      type: "missed",
    });

    await createCallSystemMessage({
      roomId: call.roomId,
      senderId: userId,
      senderType: "user",
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

export const getUserCallLogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const type = req.query.type || "all";

    let filter = {};

    if (type === "incoming") {
      filter = {
        receiverId: userId,
        receiverModel: "User",
      };
    } else if (type === "outgoing") {
      filter = {
        callerId: userId,
        callerModel: "User",
      };
    } else if (type === "missed") {
      filter = {
        receiverId: userId,
        receiverModel: "User",
        status: "missed",
      };
    } else {
      filter = {
        $or: [
          { callerId: userId, callerModel: "User" },
          { receiverId: userId, receiverModel: "User" },
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
