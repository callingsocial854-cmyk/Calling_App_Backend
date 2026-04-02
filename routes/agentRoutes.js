import express from "express";
import {
  generateOtp,
  verifyOtp,
  resendAgentOtp,
  completeAgentRegistration,
  getAgentById,
  updateAgentProfileImage,
  getAllQuery,
  createAdditionalProfile,
  loginAgent,
  verifyLoginOtp,
  acceptOrRejectQuery,
  getAgentAcceptedQueries,
  purchaseSubscription,
  getAllSubscription,
  getAgentSubscription,
  addMediaList,
  getMediaList,
  getCategoriesInAgent,
  getFieldsByCategoryInAgent,
  getApprovedMediaList,
  setQueryFollowUp,
  getQueryByIdInAgent,
  clearChatInAgent,
  getAllHistoryInAgent,
  getPolicyByTypeInAgent,
  getQueryFollowUps,
  getScheduleCallQueries,
  initiateCallInAgent,
  acceptCallInAgent,
  rejectCallInAgent,
  endCallInAgent,
  getAgentCallLogs,
  ignoreCallInAgent,
} from "../controllers/agentController.js";

import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/authMiddleware.js";
import { uploadProfile } from "../middlewares/uploadMiddleware.js";
import {
  createRoom,
  getAgentRooms,
} from "../controllers/chatRoomController.js";
import { uploadMediaFiles } from "../middlewares/uploadMediaFiles.js";
import { addOrUpdateReview } from "../controllers/userController.js";
import { generateAgoraToken } from "../controllers/tokenController.js";

const router = express.Router();

/* ----------------------------------
   🔐 OTP & Registration
---------------------------------- */
router.post("/generateOtp", generateOtp);
router.post("/verifyOtp", verifyOtp);
router.post("/resendAgentOtp", resendAgentOtp);
router.post(
  "/completeAgentRegistration",
  uploadProfile.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "aadharFrontImage", maxCount: 1 },
    { name: "aadharBackImage", maxCount: 1 },
    { name: "panFrontImage", maxCount: 1 },
    { name: "panBackImage", maxCount: 1 },
  ]),
  completeAgentRegistration,
);
/* ----------------------------------
   👤 User Profile
---------------------------------- */
router.post(
  "/updateAgentProfileImage",
  authMiddleware,
  uploadProfile.fields([{ name: "profileImage", maxCount: 1 }]),
  updateAgentProfileImage,
);
router.get("/getAgentById", authMiddleware, getAgentById);
router.get("/getAllQuery", authMiddleware, getAllQuery);
router.post(
  "/createAdditionalProfile",
  authMiddleware,
  createAdditionalProfile,
);
router.post("/loginAgent", loginAgent);
router.post("/verifyLoginOtp", verifyLoginOtp);
router.post("/createRoom", authMiddleware, createRoom);
router.get("/getAgentRooms", authMiddleware, getAgentRooms);
router.post("/acceptOrRejectQuery", authMiddleware, acceptOrRejectQuery);
router.get("/getAgentAcceptedQueries", authMiddleware, getAgentAcceptedQueries);
router.post("/purchaseSubscription", authMiddleware, purchaseSubscription);
router.get("/getAgentSubscription", authMiddleware, getAgentSubscription);
router.get("/getAllSubscription", authMiddleware,  getAllSubscription);
router.post("/addMediaList", authMiddleware, uploadMediaFiles, addMediaList);
router.get("/getMediaList", authMiddleware, getMediaList);
router.get("/getCategoriesInAgent", authMiddleware, getCategoriesInAgent);
router.get(
  "/getFieldsByCategoryInAgent",
  authMiddleware,
  getFieldsByCategoryInAgent,
);
router.get("/getApprovedMediaList", authMiddleware, getApprovedMediaList);
router.post("/setQueryFollowUp", authMiddleware, setQueryFollowUp);
router.get("/getQueryByIdInAgent", authMiddleware, getQueryByIdInAgent);

// new work
router.post("/generateAgoraToken", authMiddleware, generateAgoraToken);
router.post("/clearChatInAgent", authMiddleware, clearChatInAgent);
router.get("/getAllHistoryInAgent", authMiddleware, getAllHistoryInAgent);
router.get("/getPolicyByTypeInAgent", getPolicyByTypeInAgent);
router.get("/getQueryFollowUps", authMiddleware, getQueryFollowUps);
router.get("/getScheduleCallQueries", authMiddleware, getScheduleCallQueries);
router.post("/initiateCallInAgent", authMiddleware, initiateCallInAgent);
router.post("/acceptCallInAgent", authMiddleware, acceptCallInAgent);
router.post("/rejectCallInAgent", authMiddleware, rejectCallInAgent);
router.post("/endCallInAgent", authMiddleware, endCallInAgent);

router.get("/getAgentCallLogs", authMiddleware, getAgentCallLogs);
router.post("/ignoreCallInAgent", authMiddleware, ignoreCallInAgent);


export default router;
