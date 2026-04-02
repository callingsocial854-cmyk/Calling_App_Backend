import jwt from "jsonwebtoken";
import ChatMessage from "../models/ChatMessage.js";
import ChatRoom from "../models/ChatRoom.js";
import AgentProfile from "../models/AgentProfile.js";
import Agent from "../models/AgentModel.js";
import Query from "../models/QueryModel.js";
import User from "../models/UserModel.js";
import AgentReview from "../models/AgentReview.js";

export default function chatSocket(io) {
  // ------------------------------
  // 🔐 JWT AUTH MIDDLEWARE
  // ------------------------------
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.headers?.token;
      if (!token) return next(new Error("No token provided"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded) return next(new Error("Invalid token"));
      socket.user = decoded;
      next();
    } catch (error) {
      console.log("Socket Auth Error:", error);
      next(new Error("Invalid token"));
    }
  });

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

  const markAllDeliveredForUser = async ({ userId, userType }) => {
    try {
      const oppositeType = userType === "user" ? "agent" : "user";

      const rooms = await ChatRoom.find(
        userType === "user" ? { userId } : { agentId: userId },
      ).select("_id");

      const roomIds = rooms.map((r) => r._id);

      if (!roomIds.length) return;

      const now = new Date();

      const updated = await ChatMessage.updateMany(
        {
          roomId: { $in: roomIds },
          senderType: oppositeType,
          status: "sent",
        },
        {
          $set: {
            status: "delivered",
            deliveredAt: now,
          },
        },
      );

      if (!updated.modifiedCount) return;

      for (const room of rooms) {
        io.to(room._id.toString()).emit("messagesDelivered", {
          roomId: room._id,
          deliveredAt: now,
        });
      }
    } catch (err) {
      console.log("markAllDelivered error:", err);
    }
  };

  const updateLastMessageAfterDelete = async (
    roomId,
    messageId,
    viewerType,
  ) => {
    const query = {
      roomId,
      message: { $ne: "This message was deleted" },
    };

    if (viewerType === "user") {
      query.isDeletedByUser = false;
    } else {
      query.isDeletedByAgent = false;
    }

    const lastMsg = await ChatMessage.findById(messageId)
      .sort({ createdAt: -1 })
      .populate("mediaControls");

    if (!lastMsg) {
      await ChatRoom.findByIdAndUpdate(roomId, {
        lastMessage: "",
        lastMessageId: null,
        lastMessageTime: null,
      });
      return;
    }

    const updatedRoom = await ChatRoom.findByIdAndUpdate(
      roomId,
      {
        lastMessage:
          lastMsg.message ||
          (lastMsg.mediaControls?.length ? "Media shared" : ""),
        lastMessageId: lastMsg._id,
        lastMessageTime: lastMsg.createdAt,
      },
      { new: true },
    );

    return updatedRoom;
  };

  // ------------------------------
  // 🟢 Connection
  // ------------------------------

  io.on("connection", (socket) => {
    console.log("🟢 New connection:", socket.id);
    // ------------------------------
    // 👤 USER ONLINE
    // ------------------------------
    socket.on("userOnline", async () => {
      const userId = socket.user.id.toString();
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeen: null,
      });

      socket.join(userId);

      await markAllDeliveredForUser({
        userId,
        userType: "user",
      });
      io.emit("userStatusUpdate", {
        userId,
        status: "online",
        lastSeen: null,
      });
    });

    // ------------------------------
    // 👨‍💼 AGENT ONLINE
    // ------------------------------
    socket.on("agentOnline", async () => {
      const agentId = socket.user.id;

      await Agent.findByIdAndUpdate(agentId, {
        isOnline: true,
        lastSeen: null,
      });

      socket.join(agentId.toString());

      await markAllDeliveredForUser({
        userId: agentId,
        userType: "agent",
      });

      io.emit("agentStatusUpdate", {
        agentId,
        status: "online",
        lastSeen: null,
      });
    });

    // ------------------------------
    // 2️⃣ JOIN A CHAT ROOM
    // ------------------------------
    socket.on("joinRoom", async (roomId) => {
      socket.join(roomId?.toString());

      const userType = socket.user.role === "Agent" ? "agent" : "user";
      const oppositeType = userType === "agent" ? "user" : "agent";

      const now = new Date();
      await ChatMessage.updateMany(
        {
          roomId,
          senderType: oppositeType,
          status: "sent",
        },
        {
          $set: {
            status: "delivered",
            deliveredAt: now,
          },
        },
      );

      io.to(roomId?.toString()).emit("messagesDelivered", {
        roomId,
        deliveredAt: now,
      });
      console.log(`Socket ${socket.id} joined room ${roomId}`);
    });

    // ------------------------------
    // 3️⃣ LEAVE A CHAT ROOM
    // ------------------------------
    socket.on("leaveRoom", (roomId) => {
      socket.leave(roomId?.toString());
      console.log(`Socket ${socket.id} left room ${roomId}`);
    });

    // ------------------------------
    // 6️⃣ GET MESSAGES BY ROOM ID (AGENT)
    // ------------------------------
    socket.on("getMessagesByRoomId", async ({ roomId }) => {
      try {
        const messages = await ChatMessage.find({ roomId })
          .populate({
            path: "mediaControls",
          })
          .populate({
            path: "replyTo",
            select: "message senderType createdAt mediaControls files",
            populate: {
              path: "mediaControls",
            },
          })
          .sort({ createdAt: 1 });

        socket.emit("messagesByRoomId", {
          status: true,
          roomId,
          messages,
        });
      } catch (error) {
        console.log("Get messages error:", error);

        socket.emit("messagesByRoomId", {
          status: false,
          roomId,
          message: "Failed to fetch messages",
        });
      }
    });

    // ------------------------------
    // 7️⃣ GET MESSAGES BY AGENT + QUERY (USER)
    // ------------------------------
    socket.on("getMessagesByAgent", async ({ agentId, queryId }, callback) => {
      try {
        const room = await ChatRoom.findOne({ agentId, queryId });

        if (!room) {
          return callback({ status: false, message: "Chat room not found" });
        }

        const messages = await ChatMessage.find({ roomId: room._id }).sort({
          createdAt: 1,
        });

        callback({ status: true, roomId: room._id, messages });
      } catch (error) {
        console.log("Get messages error:", error);
        callback({ status: false });
      }
    });

    // ------------------------------
    // 8️⃣ GET AGENTS FOR USER QUERY
    // ------------------------------
    socket.on("getAgentsForUserQuery", async ({ queryId, type }) => {
      try {
        const userId = socket.user.id;

        if (!queryId) {
          return socket.emit("agentsForUserQuery", {
            status: false,
            message: "queryId is required",
          });
        }

        const user = await User.findById(userId).select("favoriteAgents");
        if (!user) {
          return socket.emit("agentsForUserQuery", {
            status: false,
            message: "User not found",
          });
        }

        const query = await Query.findOne({ _id: queryId, userId });
        if (!query) {
          return socket.emit("agentsForUserQuery", {
            status: false,
            message: "Query not found for this user",
          });
        }

        const agents = await Agent.find({
          _id: { $in: query.acceptedAgents },
        }).select(
          "fullName agentEmail phone profileImage sector avgRating isOnline lastSeen",
        );

        const result = [];

        for (const agent of agents) {
          const isFavorite = user.favoriteAgents.some(
            (id) => id.toString() === agent._id.toString(),
          );

          // ⭐ FILTER: favorite
          if (type === "favorite" && !isFavorite) continue;

          const isOnline = agent.isOnline === true;
          const lastSeen = agent.lastSeen || null;

          const room = await ChatRoom.findOne({
            queryId,
            agentId: agent._id,
            userId,
          });

          let unreadCount = 0;
          if (room) {
            unreadCount = await ChatMessage.countDocuments({
              roomId: room._id,
              senderType: "agent",
              status: { $ne: "seen" },
            });
          }

          // 🔴 FILTER: unread
          if (type === "unread" && unreadCount === 0) continue;

          const agentProfile = await AgentProfile.findOne({
            agentId: agent._id,
            paymentStatus: "success",
            adminVerified: "approved",
          })
            .sort({ createdAt: -1 })
            .select(
              "sector details profileCreation paymentStatus adminVerified",
            );

          result.push({
            agent,
            profile: agentProfile || null,
            roomId: room?._id || null,
            unreadCount,
            lastMessage: room?.lastMessage || null,
            isFavorite,
            isOnline,
            lastSeen,
          });
        }

        socket.emit("agentsForUserQuery", {
          status: true,
          message:
            type === "unread"
              ? "Unread agents fetched successfully"
              : type === "favorite"
                ? "Favorite agents fetched successfully"
                : "Agents fetched successfully",
          data: result,
        });
      } catch (error) {
        console.log("Socket getAgentsForUserQuery error:", error);
        socket.emit("agentsForUserQuery", {
          status: false,
          message: "Server error",
        });
      }
    });

    // ------------------------------
    // 9️⃣ GET AGENT BY ID
    // ------------------------------
    socket.on("getAgentById", async ({ agentId }) => {
      try {
        const userId = socket.user?.id;

        if (!agentId) {
          return socket.emit("agentById", {
            status: false,
            message: "Agent ID is required",
          });
        }

        const agent = await Agent.findById(agentId).lean();
        if (!agent) {
          return socket.emit("agentById", {
            status: false,
            message: "Agent not found",
          });
        }

        let isFavorite = false;
        if (userId) {
          const user = await User.findById(userId).select("favoriteAgents");
          isFavorite = user?.favoriteAgents?.some(
            (id) => id.toString() === agentId.toString(),
          );
        }

        const isOnline = agent.isOnline === true;
        const lastSeen = agent.lastSeen || null;

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

        socket.emit("agentById", {
          status: true,
          data: {
            agent: {
              ...agent,
              isFavorite,
              isOnline,
              lastSeen,
            },
            rating: {
              avgRating: agent.avgRating,
              totalReviews: agent.totalReviews,
            },
            reviews: reviewsWithFlag,
          },
        });
      } catch (error) {
        console.log("Socket getAgentById error:", error);
        socket.emit("agentById", {
          status: false,
          message: "Internal server error",
        });
      }
    });

    // ------------------------------
    // 3️⃣ SEND MESSAGE
    // ------------------------------
    socket.on("sendMessage", async (data) => {
      const {
        roomId,
        senderType,
        message,
        mediaControlIds = [],
        replyToMessageId = null,
      } = data;
      const senderId = socket.user.id;
      try {
        const newMsg = await ChatMessage.create({
          roomId,
          senderId,
          senderType,
          message,
          mediaControls: mediaControlIds,
          replyTo: replyToMessageId,
          status: "sent",
        });

        const updateQuery = {
          $set: {
            lastMessage:
              message ||
              (mediaControlIds.length ? "Media shared" : "Replied message"),
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
        }).populate({
          path: "lastMessageId",
          populate: [
            { path: "mediaControls" },
            {
              path: "replyTo",
              populate: { path: "mediaControls" },
            },
          ],
        });

        const receiverId =
          senderType === "user"
            ? room.agentId.toString()
            : room.userId.toString();

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
      } catch (err) {
        console.log("❌ Message error:", err);
      }
    });

    socket.on("deleteMessage", async (data) => {
      const { messageId, deleteType } = data;
      const userId = socket.user.id;
      try {
        const msg = await ChatMessage.findById(messageId);
        if (!msg) return;

        if (deleteType === "everyone") {
          const diffMinutes = (Date.now() - msg.createdAt.getTime()) / 60000;

          if (diffMinutes > 60) {
            return socket.emit("deleteError", {
              message: "Delete time expired",
            });
          }
          msg.message = "This message was deleted";
          msg.mediaControls = [];
          msg.files = [];
          msg.replyTo = null;
          msg.status = "seen";
          await msg.save();
          const room = await ChatRoom.findById(msg.roomId);
          if (room?.lastMessageId?.toString() === msg._id.toString()) {
            const updated = await updateLastMessageAfterDelete(
              msg.roomId,
              msg._id,
              "user",
            );
            io.to(msg.roomId.toString()).emit("updateRoom", updated);
          }
          io.to(msg.roomId.toString()).emit("messageDeletedForEveryone", {
            messageId,
          });
          return;
        }

        if (deleteType === "me") {
          if (msg.senderType === "user") {
            msg.isDeletedByUser = true;
            await msg.save();

            const updated = await updateLastMessageAfterDelete(
              msg.roomId,
              msg._id,
              "user",
            );
            io.to(msg.roomId.toString()).emit("updateRoom", updated);
          } else {
            msg.isDeletedByAgent = true;
            await msg.save();
            const updated = await updateLastMessageAfterDelete(
              msg.roomId,
              msg._id,
              "agent",
            );
            io.to(msg.roomId.toString()).emit("updateRoom", updated);
          }

          socket.emit("messageDeletedForMe", {
            messageId,
          });
        }
      } catch (err) {
        console.log("❌ Delete message error:", err);
      }
    });

    // ------------------------------
    // 4️⃣ MARK AS READ
    // ------------------------------
    socket.on("markAsRead", async ({ roomId, readerType }) => {
      try {
        const now = new Date();
        const senderTypeToRead = readerType === "user" ? "agent" : "user";

        await ChatMessage.updateMany(
          {
            roomId,
            senderType: senderTypeToRead,
            status: { $ne: "seen" },
          },
          {
            $set: {
              status: "seen",
              seenAt: now,
            },
          },
        );

        // 2️⃣ Room unread count reset
        const update =
          readerType === "user"
            ? { unreadCountUser: 0 }
            : { unreadCountAgent: 0 };

        const room = await ChatRoom.findByIdAndUpdate(
          roomId,
          { $set: update },
          { new: true },
        ).populate({
          path: "lastMessageId",
          populate: [
            { path: "mediaControls" },
            {
              path: "replyTo",
              populate: { path: "mediaControls" },
            },
          ],
        });

        if (!room) return;

        const targetSocketId =
          readerType === "user"
            ? room.userId.toString()
            : room.agentId.toString();

        io.to(targetSocketId).emit("updateUnreadCount", {
          roomId,
          unreadCount:
            readerType === "user"
              ? room.unreadCountUser
              : room.unreadCountAgent,
        });

        io.to(roomId.toString()).emit("messageSeen", {
          roomId,
          seenAt: now,
          seenBy: readerType,
        });

        io.to(room.userId.toString()).emit("updateRoom", room);
        io.to(room.agentId.toString()).emit("updateRoom", room);
      } catch (error) {
        console.log("❌ markAsRead error:", error);
      }
    });

    // ------------------------------
    // 5️⃣ GET UNREAD COUNT
    // ------------------------------
    socket.on("getUnreadCount", async () => {
      try {
        const userId = socket.user.id;

        const queries = await Query.find({ userId })
          .select("_id acceptedAgents")
          .lean();

        if (!queries.length) {
          return socket.emit("getUnreadCountResponse", {
            status: true,
            data: [],
          });
        }

        const queryIds = queries.map((q) => q._id);

        const rooms = await ChatRoom.find({
          userId,
          queryId: { $in: queryIds },
        })
          .select("_id queryId")
          .lean();

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
            totalAgents: query.acceptedAgents?.length || 0,
          });
        }

        socket.emit("getUnreadCountResponse", {
          status: true,
          data: result,
        });
      } catch (error) {
        console.log("Socket getUnreadCount error:", error);
        socket.emit("getUnreadCountResponse", {
          status: false,
          message: "Failed to fetch unread count",
        });
      }
    });

    // ------------------------------
    // 🔴 DISCONNECT
    // ------------------------------
    socket.on("disconnect", async () => {
      try {
        if (!socket.user) return;
        const { id, role } = socket.user;
        const now = new Date();
        if (role === "Agent") {
          await Agent.findByIdAndUpdate(id, {
            isOnline: false,
            lastSeen: now,
          });

          io.emit("agentStatusUpdate", {
            agentId: id,
            status: "offline",
            lastSeen: now,
          });
        }

        if (role === "User") {
          await User.findByIdAndUpdate(id, {
            isOnline: false,
            lastSeen: now,
          });

          io.emit("userStatusUpdate", {
            userId: id,
            status: "offline",
            lastSeen: now,
          });
        }
      } catch (error) {
        console.error("Socket disconnect error:", error.message);
      }
    });
  });
}
