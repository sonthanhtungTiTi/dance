/**
 * server.js
 * Main entry point - Express + Socket.io Server
 *
 * MULTI-TENANT ARCHITECTURE:
 * - Each streamer = 1 isolated Socket.io Room
 * - Room ID = TikTok username
 * - Data isolation: Streamer A cannot see Streamer B's data
 *
 * @module server
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import tiktokService from "./services/TikTokService.js";

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==========================================
// SERVER INITIALIZATION
// ==========================================
const app = express();
const server = createServer(app);

// Socket.io with CORS enabled for development
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;
const virtualCrowdSettings = new Map();

// ==========================================
// MIDDLEWARE & STATIC FILES
// ==========================================

// Serve static files from public directory
app.use(express.static(join(__dirname, "../public")));

// Parse JSON body
app.use(express.json());

// ==========================================
// API ROUTES
// ==========================================

/**
 * Health check endpoint
 * @route GET /api/health
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    stats: tiktokService.getStats(),
  });
});

/**
 * Get connection statistics
 * @route GET /api/stats
 */
app.get("/api/stats", (req, res) => {
  res.json(tiktokService.getStats());
});

// ==========================================
// SOCKET.IO - REALTIME CONNECTION HANDLING
// ==========================================

io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  /**
   * JOIN ROOM HANDLER
   *
   * IMPORTANT - DATA ISOLATION:
   * - Each client joins a room based on streamer's username
   * - Client only receives events from their subscribed streamer
   * - Ensures data isolation between different streamers
   */
  socket.on("join-room", async (username) => {
    // Validate username
    if (!username || typeof username !== "string") {
      socket.emit("error", { message: "Invalid username" });
      return;
    }

    // Normalize username (lowercase, trimmed)
    const normalizedUsername = username.toLowerCase().trim();

    // Store username in socket instance for disconnect handling
    socket.tiktokUsername = normalizedUsername;

    // Join Socket.io room
    socket.join(normalizedUsername);
    console.log(`[Socket] ${socket.id} joined room: ${normalizedUsername}`);

    // Update room client tracking
		tiktokService.addClientToRoom(normalizedUsername);

		const savedCrowdSettings = virtualCrowdSettings.get(normalizedUsername);
		if (savedCrowdSettings) {
			socket.emit("virtual_crowd_control", {
				action: "settings",
				payload: savedCrowdSettings,
				timestamp: Date.now(),
			});
		}

    // Connect to TikTok Live (reuses existing connection if available)
    try {
      const connected = await tiktokService.connect(normalizedUsername, io);
      if (connected) {
        socket.emit("room-joined", {
          room: normalizedUsername,
          message: `Joined room: ${normalizedUsername}`,
        });
      } else {
        socket.emit("connection-error", {
          message: `Cannot connect to ${normalizedUsername}'s live. Make sure they are currently streaming!`,
        });
      }
    } catch (error) {
      console.error(`[Socket] Error connecting to TikTok: ${error.message}`);
      socket.emit("connection-error", {
        message: error.message,
      });
    }
  });

  /**
   * LEAVE ROOM HANDLER
   */
  socket.on("leave-room", (username) => {
    if (username) {
      const normalizedUsername = username.toLowerCase().trim();
      socket.leave(normalizedUsername);
      tiktokService.removeClientFromRoom(normalizedUsername);
      console.log(`[Socket] ${socket.id} left room: ${normalizedUsername}`);
    }
  });

  /**
   * DISCONNECT HANDLER
   *
   * When client disconnects, update room count.
   * If room is empty for too long, TikTokService will auto-disconnect.
   */
  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);

    if (socket.tiktokUsername) {
      tiktokService.removeClientFromRoom(socket.tiktokUsername);
    }
  });

  /**
   * Debug: Ping-pong for connection testing
   */
	socket.on("ping", () => {
		socket.emit("pong", { timestamp: Date.now() });
	});

	/** Local control dashboard → Virtual Crowd overlay */
	socket.on("virtual-crowd-control", (message, acknowledge) => {
		const username = String(message?.username || "").toLowerCase().trim();
		const allowedActions = new Set(["settings", "test", "clear"]);
		if (!username || !allowedActions.has(message?.action)) {
			if (typeof acknowledge === "function") acknowledge({ ok: false, message: "Invalid control message" });
			return;
		}
		if (message.action === "settings") virtualCrowdSettings.set(username, message.payload || {});
		io.to(username).emit("virtual_crowd_control", {
			action: message.action,
			payload: message.payload || {},
			timestamp: Date.now(),
		});
		if (typeof acknowledge === "function") acknowledge({ ok: true });
	});
});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {
  console.log(`
    TikTok Live Games - Open Source Platform
    Server running at: → http://localhost:${PORT}
    `);
});

// Graceful shutdown handler
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...");

  // Disconnect all TikTok connections
	tiktokService.shutdown();

  server.close(() => {
    console.log("[Server] Goodbye!");
    process.exit(0);
  });
});
