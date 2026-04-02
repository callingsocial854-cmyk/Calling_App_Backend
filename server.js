import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import path from "path";
import admin from "firebase-admin";
import userRoutes from "./routes/userRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import chatSocket from "./sockets/chatSocket.js";
import { Server } from "socket.io";
import http from "http";


dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());
connectDB();

// Make uploads folder publicly accessible
const __dirname = path.resolve();
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Initialize Firebase
// const serviceAccount = path.join(__dirname, "firebase-service-account.json");

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// app.get("/", (req, res) => {
//   res.send("Seraphina Wealth API is running...");
// });

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
app.set("io", io);
chatSocket(io);

// Routes
app.use("/api/user", userRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/admin", adminRoutes);

// Serve main admin React build
const adminBuildPath = path.join(__dirname, "admin", "dist");
app.use("/admin", express.static(adminBuildPath));
app.get("/admin/*", (req, res) => {
  res.sendFile(path.join(adminBuildPath, "index.html"));
});


// Serve main user React build
const clientBuildPath = path.join(__dirname, "client", "dist");
app.use(express.static(clientBuildPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));



// Start Server
const PORT = process.env.PORT || 6009;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
