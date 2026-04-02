import pkg from "agora-access-token";
const { RtcTokenBuilder, RtcRole } = pkg;
import dotenv from "dotenv";
dotenv.config();

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_CERTIFICATE;

export const generateAgoraToken = (req, res) => {
  try {
    const agentId = req.user.id;
    const uid = 0;
    const { channelName } = req.body;
    const role = RtcRole.PUBLISHER;
    const expireTime = 600 * 600; // 600 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTime + expireTime;
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      role,
      privilegeExpireTime,
    );

    res.json({
      status: true,
      message: "Token generated successfully",
      token,
    });
  } catch (err) {
    res.status(500).json({ status: false, message: "Server Error" });
  }
};
