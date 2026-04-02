import express from "express";
import {
  policyUpdate,
  getPolicy,
  loginAdmin,
  adminSignup,
  getAdminDetail,
  resetAdminPassword,
  updateAdminDetail,
  addFAQ,
  updateFAQ,
  getAllFAQs,
  getFAQById,
  addOrUpdateContactUs,
  getContactUs,
  getAllUsers,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  getSubscriptionPlans,
  getSubscriptionById,
  deleteSubscriptionPlan,
  getAllTransaction,
  getAllAgents,
  getAgentByIdInAdmin,
  updateAgentStatus,
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  createCategoryField,
  getFieldsByCategory,
  updateCategoryField,
  deleteCategoryField,
  updateMediaListStatus,
  getAllMediaList,
  getUserDetailsById,
  dashboardCount,
} from "../controllers/adminController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { uploadProfile } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

/* ---------------------------------------------
 🔐 Admin Authentication
----------------------------------------------*/
router.post("/adminSignup", adminSignup);
router.post("/loginAdmin", loginAdmin);
router.get("/getAdminDetail", authMiddleware, getAdminDetail);
router.post("/resetAdminPassword", authMiddleware, resetAdminPassword);
router.post("/updateAdminDetail", authMiddleware, updateAdminDetail);

/* ---------------------------------------------
 📄 Privacy & Terms Policy
----------------------------------------------*/
router.post(
  "/policyUpdate",
  uploadProfile.fields([{ name: "image", maxCount: 1 }]),
  policyUpdate
);
router.get("/getPolicy", authMiddleware, getPolicy);

/* ---------------------------------------------
 ❓ FAQ Management
----------------------------------------------*/
router.post("/addFAQ", addFAQ);
router.post("/updateFAQ", authMiddleware, updateFAQ);
router.get("/getAllFAQs", authMiddleware, getAllFAQs);
router.get("/getFAQById", authMiddleware, getFAQById);

/* ---------------------------------------------
 👤 User Management
----------------------------------------------*/
router.get("/getAllUsers", authMiddleware, getAllUsers);

/* ---------------------------------------------
 📜 Agreement Content Management
----------------------------------------------*/

router.post("/addOrUpdateContactUs", authMiddleware, addOrUpdateContactUs);
router.get("/getContactUs", authMiddleware, getContactUs);

router.post("/createSubscriptionPlan", createSubscriptionPlan);
router.post("/updateSubscriptionPlan", authMiddleware, updateSubscriptionPlan);
router.get("/getSubscriptionPlans", authMiddleware, getSubscriptionPlans);
router.get("/getSubscriptionById", authMiddleware, getSubscriptionById);
router.delete(
  "/deleteSubscriptionPlan",
  authMiddleware,
  deleteSubscriptionPlan
);
router.get("/getAllTransaction", authMiddleware, getAllTransaction);
router.get("/getAllAgents", authMiddleware, getAllAgents);
router.get("/getAgentByIdInAdmin", authMiddleware, getAgentByIdInAdmin);
router.post("/updateAgentStatus", authMiddleware, updateAgentStatus);
router.post("/createCategory", authMiddleware, createCategory);
router.get("/getCategories", getCategories);
router.post("/updateCategory", authMiddleware, updateCategory);
router.delete("/deleteCategory", authMiddleware, deleteCategory);
router.post("/createCategoryField", authMiddleware, createCategoryField);
router.get("/getFieldsByCategory", getFieldsByCategory);
router.post("/updateCategoryField", authMiddleware, updateCategoryField);
router.delete("/deleteCategoryField", authMiddleware, deleteCategoryField);
router.post("/updateMediaListStatus", authMiddleware, updateMediaListStatus);
router.get("/getAllMediaList", authMiddleware, getAllMediaList);
router.get("/getUserDetailsById", authMiddleware, getUserDetailsById);
router.get("/dashboardCount", authMiddleware, dashboardCount);



export default router;
