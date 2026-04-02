import { Policy, FAQ, Support } from "../models/PolicyModel.js";
import Admin from "../models/AdminModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import User from "../models/UserModel.js";
import Agent from "../models/AgentModel.js";
import { ContactUs } from "../models/WebsiteUi.js";
import Subscription from "../models/SubscriptionModel.js";
import Transaction from "../models/TransactionModel.js";
import AgentProfile from "../models/AgentProfile.js";
import mongoose from "mongoose";
import { Category, CategoryField } from "../models/CategoryModel.js";
import MediaControl from "../models/MediaControl.js";
import Query from "../models/QueryModel.js";
import AgentReview from "../models/AgentReview.js";

const generateJwtToken = (user) => {
  return jwt.sign(
    { id: user._id, phone: user.phone, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
};

export const adminSignup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin
    const admin = await Admin.create({ name, email, password: hashedPassword });

    res.status(201).json({
      message: "Admin registered successfully",
      admin: { id: admin._id, name: admin.name, email: admin.email },
      token: generateJwtToken(admin),
    });
  } catch (error) {
    console.error("Admin Signup Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if admin exists
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    res.status(200).json({
      message: "Admin logged in successfully",
      admin: { id: admin._id, name: admin.name, email: admin.email },
      token: generateJwtToken(admin),
    });
  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

export const getAdminDetail = async (req, res) => {
  try {
    const adminId = req.user.id;

    // Await the query to resolve
    const admin = await Admin.findById(adminId).select("-otp -otpExpiresAt");

    if (!admin) {
      return res.status(400).json({ message: "User not found", status: false });
    }

    res.status(200).json({
      message: "Admin data fetched successfully",
      status: true,
      data: admin,
    });
  } catch (error) {
    console.error("Error fetching admin details:", error);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};

export const resetAdminPassword = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { newPassword, confirmPassword } = req.body;

    if (!adminId || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "Admin ID, new password, and confirm password are required",
        status: false,
      });
    }

    // Find admin by ID
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res
        .status(404)
        .json({ message: "Admin not found", status: false });
    }

    // Check if newPassword and confirmPassword match
    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ message: "Passwords do not match", status: false });
    }

    // Check if new password is same as old password
    const isSamePassword = await bcrypt.compare(newPassword, admin.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: "New password cannot be the same as the old password",
        status: false,
      });
    }

    // Hash the new password
    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    res
      .status(200)
      .json({ message: "Password reset successful", status: true });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};

export const updateAdminDetail = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { name, email } = req.body;

    // Validate input
    if (!name || !email) {
      return res.status(400).json({
        message: "name, and email are required",
        status: false,
      });
    }

    // Find and update admin
    const updatedAdmin = await Admin.findByIdAndUpdate(
      adminId,
      { name, email },
      { new: true, select: "-password -otp -otpExpiresAt" },
    );

    if (!updatedAdmin) {
      return res
        .status(400)
        .json({ message: "Admin not found", status: false });
    }

    res.status(200).json({
      message: "Admin details updated successfully",
      status: true,
      data: updatedAdmin,
    });
  } catch (error) {
    console.error("Error updating admin details:", error);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", status } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    let searchFilter = { fullName: { $exists: true, $ne: "" } };
    if (search) {
      searchFilter = {
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { userEmail: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ],
      };
    }

    if (status !== undefined) {
      searchFilter.status = status === "true";
    }

    const users = await User.find(searchFilter)
      .select("-otp -otpExpiresAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const totalUsers = await User.countDocuments(searchFilter);

    res.status(200).json({
      message: "Users fetched successfully",
      status: true,
      data: users,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      message: "Internal Server Error",
      status: false,
      error: error.message,
    });
  }
};

export const getUserDetailsById = async (req, res) => {
  try {
    const userId = req.query.id;
    const user = await User.findById(userId)
      .select("-otp -otpExpiresAt")
      .populate("favoriteAgents")
      .lean();
    const query = await Query.find({ userId }).lean();
    const agentReview = await AgentReview.find({ userId })
      .populate("agentId")
      .lean();
    if (!user) {
      return res.status(404).json({ message: "User not found", status: false });
    }
    res.status(200).json({
      message: "User details fetched successfully",
      status: true,
      data: { ...user, query, agentReview },
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};

export const getAllAgents = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", status } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    let match = {};

    if (search) {
      match.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { agentEmail: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    if (status !== undefined) {
      match.status = status === "true";
    }

    const agents = await Agent.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "agentprofiles",
          localField: "_id",
          foreignField: "agentId",
          as: "profiles",
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $project: {
          phoneOtp: 0,
          phoneOtpExpiresAt: 0,
          emailOtp: 0,
          emailOtpExpiresAt: 0,
        },
      },
    ]);

    const totalUsers = await Agent.countDocuments(match);

    res.status(200).json({
      message: "Agents fetched successfully",
      status: true,
      data: agents,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching Agents:", error);
    res.status(500).json({
      message: "Internal Server Error",
      status: false,
      error: error.message,
    });
  }
};

export const getAgentByIdInAdmin = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid Agent ID",
      });
    }

    const agentDetails = await Agent.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(id) },
      },

      // 🔹 Agent Profiles
      {
        $lookup: {
          from: "agentprofiles",
          localField: "_id",
          foreignField: "agentId",
          as: "profiles",
        },
      },

      // 🔹 Agent Media List
      {
        $lookup: {
          from: "mediacontrols",
          localField: "_id",
          foreignField: "agentId",
          as: "mediaList",
        },
      },

      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "userId",
          as: "transactions",
        }
      },

      // 🔹 Subscription / Purchase details
      {
        $lookup: {
          from: "purchasesubscriptions",
          localField: "_id",
          foreignField: "agentId",
          as: "subscription",
        },
      },

      // 🔹 Optional: single object instead of array
      {
        $addFields: {
          subscription: { $arrayElemAt: ["$subscription", 0] },
        },
      },

      // 🔹 Hide sensitive fields
      {
        $project: {
          phoneOtp: 0,
          phoneOtpExpiresAt: 0,
          emailOtp: 0,
          emailOtpExpiresAt: 0,
        },
      },
    ]);

    if (!agentDetails.length) {
      return res.status(404).json({
        status: false,
        message: "Agent not found",
      });
    }

    res.status(200).json({
      status: true,
      message: "Agent details with subscription fetched successfully",
      data: agentDetails[0],
    });
  } catch (error) {
    console.error("Error fetching agent by ID:", error);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


export const policyUpdate = async (req, res) => {
  try {
    const { type, content } = req.body;
    const image = req.files?.image?.[0]?.filename || "";

    if (!type || !content) {
      return res
        .status(400)
        .json({ message: "Type and content are required", status: false });
    }

    let policy = await Policy.findOne({ type });

    if (policy) {
      policy.content = content;
      if (image) {
        policy.image = image; // update image only if new one is uploaded
      }
      await policy.save();
      return res.status(200).json({
        message: "Policy updated successfully",
        status: true,
        policy,
      });
    } else {
      policy = new Policy({
        type,
        content,
        ...(image && { image }), // set image only if exists
      });
      await policy.save();
      return res.status(200).json({
        message: "Policy created successfully",
        status: true,
        policy,
      });
    }
  } catch (error) {
    console.error("Error updating policy:", error);
    res.status(500).json({
      message: "Internal Server Error",
      status: false,
      error: error.message,
    });
  }
};

export const getPolicy = async (req, res) => {
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

export const addFAQ = async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res
        .status(400)
        .json({ message: "Question and answer are required." });
    }

    const newFAQ = new FAQ({
      question,
      answer,
    });

    await newFAQ.save();

    res.status(200).json({ message: "FAQ added successfully", faq: newFAQ });
  } catch (error) {
    console.error("Error adding FAQ:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateFAQ = async (req, res) => {
  try {
    const { question, answer, isActive, id } = req.body;

    const updatedFAQ = await FAQ.findByIdAndUpdate(
      id,
      { question, answer, isActive },
      { new: true, runValidators: true },
    );

    if (!updatedFAQ) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    res
      .status(200)
      .json({ message: "FAQ updated successfully", faq: updatedFAQ });
  } catch (error) {
    console.error("Error updating FAQ:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllFAQs = async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ createdAt: -1 });
    res.status(200).json({ faqs, message: "FAQ fetch successfully" });
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getFAQById = async (req, res) => {
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

export const addOrUpdateContactUs = async (req, res) => {
  try {
    const { id, officeLocation, email, phone } = req.body;

    if (!officeLocation || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // If `id` is provided, update the existing document
    if (id) {
      const updatedContact = await ContactUs.findByIdAndUpdate(
        id,
        { officeLocation, email, phone },
        { new: true },
      );

      if (!updatedContact) {
        return res.status(404).json({
          success: false,
          message: "ContactUs not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "ContactUs updated successfully",
        data: updatedContact,
      });
    }

    // Check if a ContactUs document already exists
    const existing = await ContactUs.findOne();
    if (existing) {
      return res.status(400).json({
        success: false,
        message:
          "Only one ContactUs document is allowed. Please update the existing one.",
        data: existing,
      });
    }

    // Create new ContactUs document
    const newContactUs = new ContactUs({ officeLocation, email, phone });
    await newContactUs.save();

    res.status(200).json({
      success: true,
      message: "ContactUs added successfully",
      data: newContactUs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getContactUs = async (req, res) => {
  try {
    const contactUs = await ContactUs.findOne();
    res.status(200).json({ success: true, data: contactUs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createSubscriptionPlan = async (req, res) => {
  try {
    const { Accept_Count, Call_Time, Media_List, Price, isActive } = req.body;

    if (!Price) {
      return res.status(400).json({
        status: false,
        message: "Price is required",
      });
    }

    let type = "";

    if (Accept_Count && Call_Time && Media_List) {
      type = "Packages";
    } else if (Accept_Count) {
      type = "QueryAccept";
    } else if (Call_Time) {
      type = "TopUp";
    } else if (Media_List) {
      type = "MediaList";
    } else {
      return res.status(400).json({
        status: false,
        message: "Invalid subscription plan data",
      });
    }

    const newSubscriptionPlan = new Subscription({
      Accept_Count,
      Call_Time,
      Media_List,
      Price,
      isActive,
      type,
    });

    await newSubscriptionPlan.save();

    res.status(201).json({
      status: true,
      message: "Subscription plan created successfully",
      data: newSubscriptionPlan,
    });
  } catch (error) {
    console.error("Error creating subscription plan:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const getSubscriptionPlans = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", status } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // 📌 Fetch subscription plans
    const subscriptionPlans = await Subscription.find()
      .select("-otp -otpExpiresAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    // 📌 Count total
    const totalPlans = await Subscription.countDocuments();

    return res.status(200).json({
      message: "Subscription plans fetched successfully",
      status: true,
      data: subscriptionPlans,
      totalPlans,
      totalPages: Math.ceil(totalPlans / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    return res.status(500).json({
      message: "Internal server error",
      status: false,
      error: error.message,
    });
  }
};

export const getSubscriptionById = async (req, res) => {
  try {
    const { id } = req.query;
    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return res
        .status(404)
        .json({ message: "Subscription plan not found", status: false });
    }
    res.status(200).json({
      message: "Subscription plan fetched successfully",
      status: true,
    });
  } catch (error) {
    console.error("Error fetching subscription plan:", error);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

export const updateSubscriptionPlan = async (req, res) => {
  try {
    const { Accept_Count, Call_Time, Media_List, Price, isActive, id } =
      req.body;
    const updatedSubscriptionPlan = await Subscription.findByIdAndUpdate(
      id,
      { Accept_Count, Call_Time, Media_List, Price, isActive },
      { new: true },
    );
    if (!updatedSubscriptionPlan) {
      return res
        .status(404)
        .json({ message: "Subscription plan not found", status: false });
    }
    res.status(200).json({
      message: "Subscription plan updated successfully",
      status: true,
      updatedSubscriptionPlan,
    });
  } catch (error) {
    console.error("Error updating subscription plan:", error);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

export const deleteSubscriptionPlan = async (req, res) => {
  try {
    const { id } = req.query;
    const deletedSubscriptionPlan = await Subscription.findByIdAndDelete(id);
    if (!deletedSubscriptionPlan) {
      return res
        .status(404)
        .json({ message: "Subscription plan not found", status: false });
    }
    res.status(200).json({
      message: "Subscription plan deleted successfully",
      status: true,
    });
  } catch (error) {
    console.error("Error deleting subscription plan:", error);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

export const getAllTransaction = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", type } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let transactionFilter = {};

    if (search) {
      const regex = new RegExp(search, "i");
      const matchingUsers = await User.find().select("_id");

      const userIds = matchingUsers.map((user) => user._id);
      transactionFilter.userId = { $in: userIds };
    }

    if (type && ["planPurchase"].includes(type)) {
      transactionFilter.type = type;
    }

    // Count total
    const totalTransactions =
      await Transaction.countDocuments(transactionFilter);

    // Get paginated results
    const transactions = await Transaction.find(transactionFilter)
      .populate("userId")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return res.status(200).json({
      message: "Transaction history fetched successfully",
      status: true,
      totalTransactions,
      currentPage: pageNum,
      totalPages: Math.ceil(totalTransactions / limitNum),
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

export const updateAgentStatus = async (req, res) => {
  try {
    const { status, id } = req.body;
    const updatedAgent = await AgentProfile.findByIdAndUpdate(
      id,
      { adminVerified: status },
      { new: true },
    );
    if (!updatedAgent) {
      return res
        .status(404)
        .json({ message: "Agent not found", status: false });
    }
    res.status(200).json({
      message: "Agent status updated successfully",
      status: true,
      updatedAgent,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, status, categoryRole } = req.body;

    if (!name || !categoryRole) {
      return res.status(400).json({
        status: false,
        message: "Category name and role are required",
      });
    }

    const category = await Category.create({ name, status, categoryRole });

    res.status(201).json({
      status: true,
      data: category,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getCategories = async (req, res) => {
  try {
    const { role } = req.query;
    const categories = await Category.find({ categoryRole: role }).sort({ createdAt: -1 });

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

export const updateCategory = async (req, res) => {
  try {
    const { id, name, categoryRole } = req.body;
    const data = {
      name,
      categoryRole
     };

    const category = await Category.findByIdAndUpdate(id, data, {
      new: true,
    });

    if (!category) {
      return res
        .status(404)
        .json({ status: false, message: "Category not found" });
    }

    res.json({
      status: true,
      data: category,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.query;

    await Category.findByIdAndDelete(id);

    res.json({
      status: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const createCategoryField = async (req, res) => {
  try {
    const {
      categoryId,
      label,
      key,
      fieldType,
      options,
      isRequired,
      order,
      categoryFieldRole,
    } = req.body;

    if (!categoryId || !label || !key || !categoryFieldRole) {
      return res.status(400).json({
        status: false,
        message: "categoryId, label, key and categoryFieldRole are required",
      });
    }

    const field = await CategoryField.create({
      categoryId,
      label,
      key,
      fieldType,
      options,
      isRequired,
      order,
      categoryFieldRole,
    });

    res.status(201).json({
      status: true,
      data: field,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const getFieldsByCategory = async (req, res) => {
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

export const updateCategoryField = async (req, res) => {
  try {
    const { id } = req.body;

    const field = await CategoryField.findByIdAndUpdate(id, req.body, {
      new: true,
    });

    if (!field) {
      return res
        .status(404)
        .json({ status: false, message: "Field not found" });
    }

    res.json({
      status: true,
      data: field,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const deleteCategoryField = async (req, res) => {
  try {
    const { id } = req.query;

    await CategoryField.findByIdAndDelete(id);

    res.json({
      status: true,
      message: "Field deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

export const updateMediaListStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    const mediaList = await MediaControl.findByIdAndUpdate(
      id,
      { adminVerified: status },
      { new: true },
    );
    if (!mediaList) {
      return res
        .status(404)
        .json({ status: false, message: "Media list not found" });
    }
    res.status(200).json({
      status: true,
      message: "Media list status updated successfully",
      data: mediaList,
    });
  } catch (error) {
    console.error("Error updating media list status:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

export const getAllMediaList = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const filter = {};
    if (search && search.trim() !== "") {
      filter.title = {
        $regex: search,
        $options: "i",
      };
      filter.location = {
        $regex: search,
        $options: "i",
      };
    }

    // Count total
    const totalMediaList = await MediaControl.countDocuments();

    // Get paginated results
    const mediaList = await MediaControl.find()
      .populate("agentId")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return res.status(200).json({
      message: "MediaList fetched successfully",
      status: true,
      totalMediaList,
      currentPage: pageNum,
      totalPages: Math.ceil(totalMediaList / limitNum),
      data: mediaList,
    });
  } catch (error) {
    console.error("Error fetching mediaList history:", error);
    return res.status(500).json({
      message: "Server Error",
      status: false,
    });
  }
};

export const dashboardCount = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAgents = await Agent.countDocuments();
    const totalActiveQuery = await Query.countDocuments({ status: "Active" });
    const totalInactiveQuery = await Query.countDocuments({
      status: "Inactive",
    });
    const totalSupportQuery = await Support.countDocuments();
    const totalTransactions = await Transaction.find();
    return res.status(200).json({
      message: "Dashboard Count fetched successfully",
      status: true,
      data: {
        totalUsers,
        totalAgents,
        totalActiveQuery,
        totalInactiveQuery,
        totalSupportQuery,
        totalTransactions: totalTransactions.length,
        totalTransactionAmount: totalTransactions.reduce(
          (acc, curr) => acc + curr.amount,
          0,
        ),
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard count:", error);
    return res.status(500).json({
      message: "Server Error",
      status: false,
    });
  }
};
