import ChatRoom from "../models/ChatRoom.js";
import Query from "../models/QueryModel.js";

export const createRoom = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { userId, queryId } = req.body;
    const query = await Query.findById(queryId);
    if (!query) {
      return res.status(404).json({ message: "Query not found" });
    }

    let existingRoom = await ChatRoom.findOne({ queryId });
    if (existingRoom) {
      return res.status(200).json({
        message: "Room already exists",
        status: true,
        data: existingRoom,
      });
    }

    const room = await ChatRoom.create({ userId, agentId, queryId });

    res
      .status(200)
      .json({ message: "Chat room created", status: true, data: room });
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ message: "Error creating/getting chat room", error: err });
  }
};

export const getUserRooms = async (req, res) => {
  try {
    const { userId } = req.query;
    const rooms = await ChatRoom.find({ userId })
      .populate("agentId", "fullName profileImage phone")
      .sort({ updatedAt: -1 });
    res.status(200).json({
      message: "Rooms fetched successfully",
      status: true,
      data: rooms,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching rooms", error: err });
  }
};

export const getAgentRooms = async (req, res) => {
  try {
    const agentId = req.user.id;
    const rooms = await ChatRoom.find({ agentId })
      .populate("userId", "fullName profileImage phone")
      .populate("queryId", "description")
      .sort({ updatedAt: -1 });
    res.status(200).json({
      message: "Agent rooms fetched successfully",
      status: true,
      rooms,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching rooms", error: err });
  }
};
