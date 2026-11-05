/**
 * dashboard.js
 * Dashboard logic - Generate game overlay links
 *
 * Features:
 * - Game selection from grid
 * - Username validation
 * - Overlay URL generation
 * - Copy to clipboard
 *
 * @module dashboard
 */

document.addEventListener("DOMContentLoaded", () => {
	// ==========================================
	// DOM ELEMENTS
	// ==========================================
	const usernameInput = document.getElementById("username");
	const generateBtn = document.getElementById("generateBtn");
	const outputSection = document.getElementById("outputSection");
	const outputUrl = document.getElementById("outputUrl");
	const copyBtn = document.getElementById("copyBtn");
	const toast = document.getElementById("toast");
	const gameCards = document.querySelectorAll(".game-card[data-game]");
	const connectionStatus = document.getElementById("connectionStatus");
	const connectionStatusLabel = document.getElementById("connectionStatusLabel");
	const connectionStatusDetail = document.getElementById("connectionStatusDetail");
	const connectionStatusAccount = document.getElementById("connectionStatusAccount");

	// ==========================================
	// STATE
	// ==========================================
	let selectedGame = "horse-racing";
	let gameEntry = "index.html";
	let gameParam = "id";
	let statusSocket = null;
	let statusUsername = "";
	let generatedUsername = "";
	let connectionAttempt = 0;

	const statusClasses = [
		"idle",
		"connecting",
		"connected",
		"reconnecting",
		"disconnected",
		"error",
	];

	function setConnectionStatus(state, username = "", detail = "") {
		const labels = {
			idle: "Not connected",
			connecting: "Connecting to TikTok Live…",
			connected: "TikTok Live connected",
			reconnecting: "Waiting for TikTok Live…",
			disconnected: "TikTok Live disconnected",
			error: "Connection failed",
		};

		connectionStatus.classList.remove(...statusClasses);
		connectionStatus.classList.add(state);
		connectionStatusLabel.textContent = labels[state] || labels.idle;
		connectionStatusDetail.textContent = detail;
		connectionStatusAccount.textContent = username ? `@${username}` : "No account";
	}

	function stopConnectionCheck() {
		connectionAttempt += 1;
		if (statusSocket) statusSocket.disconnect();
		statusSocket = null;
		statusUsername = "";
	}

	function checkTikTokConnection(username) {
		stopConnectionCheck();
		statusUsername = username;
		const currentAttempt = connectionAttempt;

		setConnectionStatus(
			"connecting",
			username,
			"Checking whether this account is currently Live…",
		);

		if (typeof window.io !== "function") {
			setConnectionStatus(
				"error",
				username,
				"Cannot reach the realtime server. Reload the page and try again.",
			);
			return;
		}

		const socket = window.io();
		statusSocket = socket;
		const isCurrentAttempt = () =>
			currentAttempt === connectionAttempt && statusSocket === socket;

		socket.on("connect", () => {
			if (!isCurrentAttempt()) return;
			setConnectionStatus(
				"connecting",
				username,
				"Server connected. Waiting for TikTok Live…",
			);
			socket.emit("join-room", username);
		});

		socket.on("room-joined", (data) => {
			if (!isCurrentAttempt() || data?.room !== username) return;
			setConnectionStatus(
				"connected",
				username,
				"The project is receiving events from this TikTok Live account.",
			);
		});

		socket.on("tiktok_connected", () => {
			if (!isCurrentAttempt()) return;
			setConnectionStatus(
				"connected",
				username,
				"The project is receiving events from this TikTok Live account.",
			);
		});

		socket.on("tiktok_reconnecting", (data) => {
			if (!isCurrentAttempt()) return;
			setConnectionStatus(
				"reconnecting",
				username,
				`The server is checking automatically (attempt ${data?.attempt || 1}). You can go Live at any time.`,
			);
		});

		socket.on("tiktok_disconnected", () => {
			if (!isCurrentAttempt()) return;
			setConnectionStatus(
				"disconnected",
				username,
				"The Live connection ended. The server will try to reconnect.",
			);
		});

		const showConnectionError = (error) => {
			if (!isCurrentAttempt()) return;
			setConnectionStatus(
				"error",
				username,
				error?.message || "TikTok Live is unavailable for this account.",
			);
		};

		socket.on("tiktok_error", showConnectionError);
		socket.on("connection-error", showConnectionError);
		socket.on("connect_error", () => {
			showConnectionError({
				message: "Cannot connect to the project server. Please try again.",
			});
		});

		socket.on("disconnect", (reason) => {
			if (!isCurrentAttempt() || reason === "io client disconnect") return;
			setConnectionStatus(
				"disconnected",
				username,
				"Lost connection to the project server. Reconnecting automatically…",
			);
		});
	}

	// ==========================================
	// GAME SELECTION
	// Handle game card clicks
	// ==========================================
	gameCards.forEach((card) => {
		card.addEventListener("click", () => {
			// Deselect all cards
			gameCards.forEach((c) => c.classList.remove("selected"));
			// Select clicked card
			card.classList.add("selected");
			// Update state
			selectedGame = card.dataset.game;
			gameEntry = card.dataset.entry || "index.html";
			gameParam = card.dataset.param || "id";
			console.log(
				`Selected game: ${selectedGame} (${gameEntry}, ${gameParam})`,
			);
		});
	});

	// ==========================================
	// GENERATE LINK
	// Create overlay URL based on username and selected game
	// ==========================================
	generateBtn.addEventListener("click", () => {
		// Get and validate username
		const username = usernameInput.value.trim().toLowerCase();

		if (!username) {
			showToast("⚠️ Please enter your TikTok username!", "error");
			usernameInput.focus();
			return;
		}

		// Remove @ if present
		const cleanUsername = username.replace(/^@/, "");

		// Validate: only allow letters, numbers, underscore, and dots
		if (!/^[a-z0-9_.]+$/.test(cleanUsername)) {
			showToast(
				"⚠️ Username can only contain letters, numbers, _, and .",
				"error",
			);
			return;
		}

		/**
		 * GENERATE OVERLAY URL
		 *
		 * Format: /games/{game}/index.html?id={username}
		 *
		 * IMPORTANT:
		 * - Uses window.location.origin to support production deployment
		 * - Username will be used as Room ID for Socket.io
		 */
		const baseUrl = window.location.origin;
		const overlayUrl = `${baseUrl}/games/${selectedGame}/${gameEntry}?${gameParam}=${encodeURIComponent(cleanUsername)}`;

		// Show output section
		outputUrl.value = overlayUrl;
		outputSection.classList.add("visible");
		generatedUsername = cleanUsername;

		// Verify that this account is Live and show the active account/status.
		checkTikTokConnection(cleanUsername);

		// Scroll to output
		outputSection.scrollIntoView({ behavior: "smooth", block: "center" });

		// Button feedback
		generateBtn.textContent = "✅ Link Generated!";
		setTimeout(() => {
			generateBtn.textContent = "✨ Generate Game Link";
		}, 2000);

		console.log(`Generated overlay URL: ${overlayUrl}`);
	});

	// ==========================================
	// COPY TO CLIPBOARD
	// ==========================================
	copyBtn.addEventListener("click", async () => {
		const url = outputUrl.value;

		if (!url) return;

		try {
			await navigator.clipboard.writeText(url);
			showToast("✅ Link copied!", "success");

			// Button feedback
			copyBtn.textContent = "✅ Copied!";
			setTimeout(() => {
				copyBtn.textContent = "📋 Copy";
			}, 2000);
		} catch (err) {
			// Fallback for older browsers
			outputUrl.select();
			document.execCommand("copy");
			showToast("✅ Link copied!", "success");
		}
	});

	// ==========================================
	// ENTER KEY SUPPORT
	// Press Enter in input to generate
	// ==========================================
	usernameInput.addEventListener("keypress", (e) => {
		if (e.key === "Enter") {
			generateBtn.click();
		}
	});

	usernameInput.addEventListener("input", () => {
		const nextUsername = usernameInput.value
			.trim()
			.toLowerCase()
			.replace(/^@/, "");

		if (generatedUsername && nextUsername !== generatedUsername) {
			generatedUsername = "";
			outputUrl.value = "";
			outputSection.classList.remove("visible");
		}

		if (statusUsername && nextUsername !== statusUsername) {
			stopConnectionCheck();
			setConnectionStatus(
				"idle",
				"",
				"Username changed. Generate a new link to check this account.",
			);
		}
	});

	// ==========================================
	// TOAST NOTIFICATION
	// ==========================================
	function showToast(message, type = "success") {
		toast.textContent = message;

		// Style based on type
		if (type === "error") {
			toast.style.borderColor = "#fe2c55";
			toast.style.color = "#fe2c55";
		} else {
			toast.style.borderColor = "#25f4ee";
			toast.style.color = "#25f4ee";
		}

		// Show toast
		toast.classList.add("show");

		// Auto hide after 3s
		setTimeout(() => {
			toast.classList.remove("show");
		}, 3000);
	}

	// ==========================================
	// INITIALIZATION LOG
	// ==========================================
	console.log("🎮 TikTok Live Games Dashboard loaded");
	console.log(
		"Available games:",
		Array.from(gameCards).map((c) => c.dataset.game),
	);
});
