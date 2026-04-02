import express from "express";
import {
  generateOtp,
  verifyOtp,
  resendOtp,
  getUserById,
  getPolicyByType,
  getFAQList,
  getFAQByFaqId,
  getTransactionHistory,
  getNotificationsByUserId,
  updateProfileImage,
  updateProfile,
  createQuery,
  addCommentInQuery,
  getQueries,
  firebaseLogin,
  getAgentsForUserQuery,
  getQueryById,
  updateQueryStatus,
  addOrRemoveFavoriteAgent,
  getAgentById,
  addOrUpdateReview,
  getInactiveQueryStatus,
  getSearchQueries,
  getSearchInactiveQueries,
  getSearchAgentsForUserQuery,
  getCategoriesInUser,
  getFieldsByCategoryInUser,
  getMessagesByRoomId,
  toggleCallStatus,
  clearChatInUser,
  blockedAgent,
  addSupportMessage,
  getAgentByIdInWeb,
  sendMessageApi,
  getUserMediaControls,
  getRoomMediaControls,
  initiateCallInUser,
  acceptCallInUser,
  rejectCallInUser,
  endCallInUser,
  getUserCallLogs,
  ignoreCallInUser,
} from "../controllers/userController.js";
import { uploadMediaFiles } from "../middlewares/uploadMediaFiles.js";

import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/authMiddleware.js";
import { uploadProfile } from "../middlewares/uploadMiddleware.js";
import { generateAgoraToken } from "../controllers/tokenController.js";

const router = express.Router();

/* ----------------------------------
   🔐 OTP & Registration
---------------------------------- */
router.post("/generateOtp", generateOtp);
router.post("/verifyOtp", verifyOtp);
router.post("/resendOtp", resendOtp);
router.post("/socialLogin", firebaseLogin);

/* ----------------------------------
   👤 User Profile
---------------------------------- */
router.post(
  "/updateProfileImage",
  authMiddleware,
  uploadProfile.fields([{ name: "profileImage", maxCount: 1 }]),
  updateProfileImage,
);
router.get("/getUserById", authMiddleware, getUserById);
router.post(
  "/updateProfile",
  uploadProfile.fields([{ name: "profileImage", maxCount: 1 }]),
  authMiddleware,
  updateProfile,
);

/* ----------------------------------
   💰 Wallet & Transactions
---------------------------------- */
router.get("/getTransactionHistory", authMiddleware, getTransactionHistory);

/* ----------------------------------
   🔔 Notifications
---------------------------------- */
router.get(
  "/getNotificationsByUserId",
  authMiddleware,
  getNotificationsByUserId,
);

/* ----------------------------------
   📃 Policy & FAQ
---------------------------------- */
router.get("/getPolicyByType", getPolicyByType);
router.get("/getFAQList", getFAQList);
router.get("/getFAQByFaqId", getFAQByFaqId);

router.post("/createQuery", authMiddleware, createQuery);
router.post("/addCommentInQuery", authMiddleware, addCommentInQuery);
router.get("/getQueries", authMiddleware, getQueries);
router.get("/getAgentsForUserQuery", authMiddleware, getAgentsForUserQuery);
router.get("/getQueryById", authMiddleware, getQueryById);
router.post("/updateQueryStatus", authMiddleware, updateQueryStatus);
router.post(
  "/addOrRemoveFavoriteAgent",
  authMiddleware,
  addOrRemoveFavoriteAgent,
);
router.get("/getAgentById", authMiddleware, getAgentById);
router.post("/addOrUpdateReview", authMiddleware, addOrUpdateReview);
router.get("/getInactiveQueryStatus", authMiddleware, getInactiveQueryStatus);
router.post("/getSearchQueries", authMiddleware, getSearchQueries);
router.post(
  "/getSearchInactiveQueries",
  authMiddleware,
  getSearchInactiveQueries,
);
router.post(
  "/getSearchAgentsForUserQuery",
  authMiddleware,
  getSearchAgentsForUserQuery,
);
router.get("/getCategoriesInUser", getCategoriesInUser);
router.get("/getFieldsByCategoryInUser", getFieldsByCategoryInUser);
router.get("/getMessagesByRoomId", getMessagesByRoomId);
router.post("/toggleCallStatus", authMiddleware, toggleCallStatus);
router.post("/clearChatInUser", authMiddleware, clearChatInUser);
router.post("/blockedAgent", authMiddleware, blockedAgent);
router.post("/addSupportMessage", authMiddleware, addSupportMessage);
router.get("/getAgentByIdInWeb", authMiddleware, getAgentByIdInWeb);

router.post(
  "/sendMessageApi",
  authMiddleware,
  uploadMediaFiles,
  sendMessageApi,
);
router.get("/getUserMediaControls", authMiddleware, getUserMediaControls);
router.get("/getRoomMediaControls", authMiddleware, getRoomMediaControls);
router.post("/initiateCallInUser", authMiddleware, initiateCallInUser);
router.post("/acceptCallInUser", authMiddleware, acceptCallInUser);
router.post("/rejectCallInUser", authMiddleware, rejectCallInUser);
router.post("/endCallInUser", authMiddleware, endCallInUser);
router.post("/generateAgoraToken", authMiddleware, generateAgoraToken);

router.get("/getUserCallLogs", authMiddleware, getUserCallLogs);
router.post("/ignoreCallInUser", authMiddleware, ignoreCallInUser);


export default router;
