/**
 * TikTokService.js
 * Manages TikTok Live connections for multiple streamers (Multi-tenant)
 *
 * IMPORTANT - DATA ISOLATION:
 * - Each streamer has their own Socket.io Room (Room ID = username)
 * - Data from Streamer A will NEVER be sent to Streamer B
 * - Uses io.to(username).emit() to send to the CORRECT room only
 *
 * @module services/TikTokService
 */

import {
	ControlEvent,
	TikTokLiveConnection,
	WebcastEvent,
} from "tiktok-live-connector";
import {
	normalizeChat,
	normalizeGift,
	normalizeLike,
	normalizeShare,
	normalizeUser,
} from "../lib/tiktokEventNormalizer.js";
import { getDelay, sleep } from "../lib/tiktokReconnectPolicy.js";

class TikTokService {
	constructor() {
		// Singleton pattern - ensure only one instance exists
		if (TikTokService.instance) {
			return TikTokService.instance;
		}
		TikTokService.instance = this;

		/**
		 * Map storing active TikTok connections
		 * @type {Map<string, {connection: WebcastPushConnection, lastActivity: number, ready: Promise<boolean>|null}>}
		 */
		this.connections = new Map();

		/**
		 * Map tracking client count per room
		 * @type {Map<string, number>}
		 */
		this.roomClients = new Map();

		/**
		 * Track reconnect state per username to avoid overlapping retries
		 * @type {Map<string, {attempting: boolean, attempt: number, delayMs: number, nextRetryAt: number, token: symbol}>}
		 */
		this.reconnectState = new Map();
		this.lastErrors = new Map();
		this.isShuttingDown = false;

		// Cleanup interval - check for inactive connections every minute
		this.cleanupInterval = setInterval(
			() => this.checkInactiveConnections(),
			60000,
		);
	}

	/**
	 * Connect to a streamer's TikTok Live
	 * IMPORTANT: If connection exists, reuse it. Do NOT create new one.
	 *
	 * @param {string} username - TikTok username (also used as Room ID)
	 * @param {import('socket.io').Server} io - Socket.io server instance
	 * @returns {Promise<boolean>} - Whether connection was successful
	 */
	async connect(username, io) {
		// Check if connection already exists
		if (this.connections.has(username)) {
			console.log(
				`[TikTokService] Reusing existing connection for: ${username}`,
			);
			const existing = this.connections.get(username);
			existing.lastActivity = Date.now();
			if (existing.ready) return existing.ready;
			return true;
		}

		console.log(`[TikTokService] Creating new connection for: ${username}`);
		console.log(`[TikTokService] Euler sign key: ${process.env.EULER_SIGN_API_KEY ? "configured" : "missing"}`);

		let resolveReady;
		const ready = new Promise((resolve) => {
			resolveReady = resolve;
		});

		try {
			// Create new TikTok Live connection
			const connection = new TikTokLiveConnection(username, {
				signApiKey: process.env.EULER_SIGN_API_KEY,
				processInitialData: true,
				enableExtendedGiftInfo: false,
			});

			// Store in Map
			this.connections.set(username, {
				connection: connection,
				lastActivity: Date.now(),
				ready,
			});

			// ==========================================
			// TIKTOK EVENT HANDLERS
			// All events use normalizers from tiktokEventNormalizer.js
			// ==========================================

			/** Handle Chat Messages */
			connection.on(WebcastEvent.CHAT, (data) => {
				this.updateActivity(username);
				const payload = normalizeChat(data);
				io.to(username).emit("tiktok_chat", payload);
			});

			/** Handle viewers entering the live room */
			connection.on(WebcastEvent.MEMBER, (data) => {
				this.updateActivity(username);
				io.to(username).emit("tiktok_member", {
					user: normalizeUser(data),
					timestamp: Date.now(),
				});
			});

			/** Handle Like Events */
			connection.on(WebcastEvent.LIKE, (data) => {
				this.updateActivity(username);
				const payload = normalizeLike(data);
				io.to(username).emit("tiktok_like", payload);
				console.log(
					`[${username}] Like: ${payload.likeCount} from ${payload.user.nickname}`,
				);
			});

			/** Handle Share Events */
			connection.on(WebcastEvent.SHARE, (data) => {
				this.updateActivity(username);
				const payload = normalizeShare(data);
				io.to(username).emit("tiktok_share", payload);
				console.log(`[${username}] Share from ${payload.user.nickname}`);
			});

			/** Handle Gift Events — single canonical emit, no legacy duplication */
			connection.on(WebcastEvent.GIFT, (data) => {
				this.updateActivity(username);
				const payload = normalizeGift(data);
				io.to(username).emit("tiktok_gift", payload);
				console.log(
					`[${username}] Gift: ${payload.giftName} x${payload.repeatCount} (${payload.giftType}, ${payload.giftValue}💎)`,
				);
			});

			// ==========================================
			// CONNECTION STATUS HANDLERS
			// ==========================================
			connection.on(ControlEvent.CONNECTED, (state) => {
				console.log(`[TikTokService] Connected to live: ${username}`);
				io.to(username).emit("tiktok_connected", {
					roomId: state.roomId,
					timestamp: Date.now(),
				});
			});

			connection.on(ControlEvent.DISCONNECTED, () => {
				console.log(`[TikTokService] Disconnected from: ${username}`);
				this.connections.delete(username);
				io.to(username).emit("tiktok_disconnected", {
					timestamp: Date.now(),
				});

				// Auto-reconnect if there are still clients in the room
				const clientCount = this.getClientCount(username);
				if (clientCount > 0 && !this.isShuttingDown) {
					this.waitForLive(username, io);
				}
			});

			connection.on(ControlEvent.ERROR, (err) => {
				console.error(`[TikTokService] Error for ${username}:`, err.message);
				io.to(username).emit("tiktok_error", {
					message: err.message,
					timestamp: Date.now(),
				});
			});

			// Establish connection
			await connection.connect();
			const active = this.connections.get(username);
			if (active?.connection === connection) active.ready = null;
			resolveReady(true);
			this.lastErrors.delete(username);
			this.reconnectState.delete(username);
			return true;
		} catch (error) {
			resolveReady(false);
			const message = error?.message || String(error || "Unknown TikTok connection error");
			console.error(
				`[TikTokService] Cannot connect to ${username}:`,
				message,
			);
			this.lastErrors.set(username, message);
			this.connections.delete(username);
			return false;
		}
	}

	/**
	 * Schedule auto-reconnect with exponential backoff.
	 * Retries indefinitely while at least one dashboard/overlay client is waiting.
	 * Skips if a reconnect loop is already running for this username.
	 *
	 * @param {string} username
	 * @param {import('socket.io').Server} io
	 * @private
	 */
	async _scheduleReconnect(username, io) {
		// Guard against overlapping reconnect loops
		const state = this.reconnectState.get(username);
		if (state?.attempting) return;

		let attempt = 0;
		const token = Symbol(username);
		this.reconnectState.set(username, {
			attempting: true,
			attempt,
			delayMs: 0,
			nextRetryAt: Date.now(),
			token,
		});

		while (!this.isShuttingDown) {
			// A deleted/replaced token cancels this particular retry loop.
			if (this.reconnectState.get(username)?.token !== token) return;

			// Bail if no clients remain (nobody watching → no point reconnecting)
			if (this.getClientCount(username) === 0) {
				console.log(
					`[TikTokService] Reconnect aborted for ${username}: 0 clients`,
				);
				this.reconnectState.delete(username);
				return;
			}

			// Bail if connection was re-established elsewhere
			if (this.connections.has(username)) {
				console.log(
					`[TikTokService] Reconnect aborted for ${username}: already connected`,
				);
				this.reconnectState.delete(username);
				return;
			}

			const delay = getDelay(attempt, { maxDelayMs: 15_000 });
			const retryState = {
				attempting: true,
				attempt: attempt + 1,
				delayMs: delay,
				nextRetryAt: Date.now() + delay,
				token,
			};
			this.reconnectState.set(username, retryState);
			console.log(
				`[TikTokService] Reconnect attempt ${attempt + 1} for ${username} in ${delay}ms`,
			);
			io.to(username).emit("tiktok_reconnecting", {
				attempt: attempt + 1,
				delayMs: delay,
				timestamp: Date.now(),
			});

			await sleep(delay);
			if (
				this.isShuttingDown ||
				this.reconnectState.get(username)?.token !== token
			) {
				return;
			}

			const ok = await this.connect(username, io);
			if (ok) {
				console.log(
					`[TikTokService] Reconnected to ${username} on attempt ${attempt + 1}`,
				);
				io.to(username).emit("room-joined", {
					room: username,
					message: `TikTok Live is now available: ${username}`,
				});
				return;
			}

			attempt++;
		}

		if (this.reconnectState.get(username)?.token === token) {
			this.reconnectState.delete(username);
		}
	}

	/** Start waiting for a TikTok account to go Live without duplicating loops. */
	waitForLive(username, io) {
		void this._scheduleReconnect(username, io).catch((error) => {
			console.error(`[TikTokService] Retry loop failed for ${username}:`, error);
			this.reconnectState.delete(username);
			io.to(username).emit("tiktok_error", {
				message: error?.message || "TikTok reconnect loop failed",
				timestamp: Date.now(),
			});
		});
	}

	/** Return retry information safe to send to a newly joined client. */
	getReconnectStatus(username) {
		const state = this.reconnectState.get(username);
		if (!state?.attempting) return null;
		return {
			attempt: state.attempt,
			delayMs: Math.max(0, state.nextRetryAt - Date.now()),
			timestamp: Date.now(),
		};
	}

	/**
	 * Disconnect a streamer's TikTok connection
	 * @param {string} username - TikTok username
	 */
	disconnect(username) {
		// Cancel any pending reconnect
		this.reconnectState.delete(username);

		if (this.connections.has(username)) {
			const { connection } = this.connections.get(username);
			try {
				connection.disconnect();
			} catch (e) {
				// Ignore disconnect errors
			}
			this.connections.delete(username);
			console.log(`[TikTokService] Disconnected: ${username}`);
		}
	}

	shutdown() {
		this.isShuttingDown = true;
		clearInterval(this.cleanupInterval);
		for (const username of [...this.connections.keys()]) this.disconnect(username);
	}

	/**
	 * Update last activity timestamp for a connection
	 * @param {string} username - TikTok username
	 */
	updateActivity(username) {
		if (this.connections.has(username)) {
			this.connections.get(username).lastActivity = Date.now();
		}
	}

	/**
	 * Add a client to a room's count
	 * @param {string} username - Room ID (username)
	 */
	addClientToRoom(username) {
		const count = this.roomClients.get(username) || 0;
		this.roomClients.set(username, count + 1);
		console.log(`[TikTokService] Room ${username}: ${count + 1} clients`);
	}

	/**
	 * Remove a client from a room's count
	 * @param {string} username - Room ID (username)
	 */
	removeClientFromRoom(username) {
		const count = this.roomClients.get(username) || 0;
		if (count > 0) {
			this.roomClients.set(username, count - 1);
			console.log(`[TikTokService] Room ${username}: ${count - 1} clients`);
		}
	}

	/**
	 * Get client count for a room
	 * @param {string} username - Room ID
	 * @returns {number} Number of clients
	 */
	getClientCount(username) {
		return this.roomClients.get(username) || 0;
	}

	getLastError(username) {
		return this.lastErrors.get(username) || "";
	}

	/**
	 * Check and disconnect inactive connections
	 * AUTO-DISCONNECT after 5 minutes with no clients in room
	 * This helps free up server resources
	 */
	checkInactiveConnections() {
		const TIMEOUT = 5 * 60 * 1000; // 5 minutes
		const now = Date.now();

		for (const [username, data] of this.connections.entries()) {
			const clientCount = this.getClientCount(username);
			const timeSinceActivity = now - data.lastActivity;

			if (clientCount === 0 && timeSinceActivity > TIMEOUT) {
				console.log(
					`[TikTokService] Auto-disconnect ${username} (inactive ${Math.round(
						timeSinceActivity / 1000,
					)}s, 0 clients)`,
				);
				this.disconnect(username);
			}
		}
	}

	/**
	 * Get current service statistics
	 * @returns {{activeConnections: number, connections: string[], rooms: Object}}
	 */
	getStats() {
		return {
			activeConnections: this.connections.size,
			connections: Array.from(this.connections.keys()),
			rooms: Object.fromEntries(this.roomClients),
		};
	}
}

// Export singleton instance
export default new TikTokService();
