(() => {
	const config = window.CROWD_CONFIG;
	const engine = new CrowdEngine(config);
	const params = new URLSearchParams(location.search);
	const quality = ["low", "high"].includes(params.get("quality")) ? params.get("quality") : "balanced";
	const targetFrameMs = 1000 / (quality === "low" ? 24 : quality === "high" ? 60 : 30);
	const pixelBudget = quality === "low" ? 540 * 960 : quality === "high" ? Infinity : 720 * 1280;
	const initialVolume = Math.max(0, Math.min(1, Number(params.get("volume") ?? 0.55)));
	const soundFX = new CrowdSoundFX({ volume: initialVolume, enabled: params.get("sound") !== "0" });
	const runtime = { avatarScale: 1, lightIntensity: 1, lightSpeed: 1, showGuide: true, showFeed: true };
	const canvas = document.getElementById("stage");
	const ctx = canvas.getContext("2d");
	const status = document.getElementById("connection");
	const count = document.getElementById("viewerCount");
	const feed = document.getElementById("eventFeed");
	const empty = document.getElementById("emptyState");
	const guide = document.querySelector(".gift-guide");
	const soundToggle = document.getElementById("soundToggle");
	const backgroundMusic = document.getElementById("backgroundMusic");
	const helicopterAudio = document.getElementById("helicopterAudio");
	const heatValue = document.getElementById("heatValue");
	const heatFill = document.getElementById("heatFill");
	const hypeBanner = document.getElementById("hypeBanner");
	const momentCaption = document.getElementById("momentCaption");
	const characterImages = config.characters.map((src) => {
		const image = new Image();
		image.src = src;
		return image;
	});
	const clubBackground = new Image();
	clubBackground.src = "assets/backgrounds/club-main.webp";
	const backgroundCanvas = document.createElement("canvas");
	const backgroundCtx = backgroundCanvas.getContext("2d");
	clubBackground.onload = prepareBackground;
	guide.querySelectorAll(".gift-tile img").forEach((image) => {
		const showFallback = () => { image.hidden = true; image.nextElementSibling.hidden = false; };
		image.addEventListener("error", showFallback);
		if (image.complete && !image.naturalWidth) showFallback();
	});
	helicopterAudio.addEventListener("loadedmetadata", () => {
		if (!Number.isFinite(helicopterAudio.duration)) return;
		config.helicopterDurationMs = Math.round(helicopterAudio.duration * 1000);
		if (engine.focus?.variant === "helicopter" && !engine.focus.outro) {
			engine.focus.duration = config.helicopterDurationMs;
			engine.focus.until = engine.focus.startedAt + engine.focus.duration;
		}
	});
	helicopterAudio.addEventListener("ended", () => {
		engine.finishHelicopter();
		syncBackgroundMusic();
	});

	function updateSoundButton() {
		soundToggle.textContent = !soundFX.enabled ? "🔇 ĐÃ TẮT" : backgroundMusic.paused ? "▶ BẬT NHẠC" : "🔊 ÂM THANH";
		soundToggle.classList.toggle("muted", !soundFX.enabled);
	}

	function syncBackgroundMusic() {
		backgroundMusic.volume = soundFX.enabled ? soundFX.volume * (engine.focus?.variant === "helicopter" && !helicopterAudio.paused ? 0.08 : 0.35) : 0;
		if (!soundFX.enabled) {
			backgroundMusic.pause();
			helicopterAudio.pause();
			updateSoundButton();
			return;
		}
		backgroundMusic.play().then(updateSoundButton).catch(updateSoundButton);
	}

	function playHelicopter() {
		if (!soundFX.enabled) return;
		helicopterAudio.currentTime = 0;
		helicopterAudio.volume = Math.min(1, soundFX.volume * 0.8);
		helicopterAudio.play().then(syncBackgroundMusic).catch(syncBackgroundMusic);
	}
	soundToggle.addEventListener("click", () => {
		if (soundFX.enabled && backgroundMusic.paused) {
			soundFX.ensureContext();
			syncBackgroundMusic();
			return;
		}
		soundFX.setEnabled(!soundFX.enabled);
		syncBackgroundMusic();
		updateSoundButton();
	});
	updateSoundButton();
	setTimeout(syncBackgroundMusic, 0);
	document.addEventListener("pointerdown", () => {
		soundFX.ensureContext();
		syncBackgroundMusic();
	}, { once: true });
	let width = 0;
	let height = 0;
	let dpr = 1;
	let lastFrame = performance.now();
	let lastCount = -1;
	let djAnnouncement = null;

	function resize() {
		width = window.innerWidth;
		height = window.innerHeight;
		dpr = Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.5, Math.sqrt(pixelBudget / Math.max(1, width * height)));
		canvas.width = Math.max(1, Math.round(width * dpr));
		canvas.height = Math.max(1, Math.round(height * dpr));
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		prepareBackground();
	}

	function prepareBackground() {
		if (!width || !height) return;
		backgroundCanvas.width = canvas.width;
		backgroundCanvas.height = canvas.height;
		backgroundCtx.fillStyle = "#08030a";
		backgroundCtx.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
		if (clubBackground.naturalWidth) {
			const imageRatio = clubBackground.naturalWidth / clubBackground.naturalHeight;
			const viewRatio = width / height;
			let sw = clubBackground.naturalWidth;
			let sh = clubBackground.naturalHeight;
			let sx = 0;
			let sy = 0;
			if (imageRatio > viewRatio) { sw = sh * viewRatio; sx = (clubBackground.naturalWidth - sw) / 2; }
			else { sh = sw / viewRatio; sy = (clubBackground.naturalHeight - sh) / 2; }
			backgroundCtx.drawImage(clubBackground, sx, sy, sw, sh, 0, 0, backgroundCanvas.width, backgroundCanvas.height);
		}
		backgroundCtx.fillStyle = "rgba(9, 1, 12, .18)";
		backgroundCtx.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
	}
	window.addEventListener("resize", resize);
	resize();

	function addFeed(text, type = "normal") {
		const item = document.createElement("div");
		item.className = `feed-item ${type}`;
		item.textContent = text;
		feed.prepend(item);
		while (feed.children.length > 6) feed.lastElementChild.remove();
		setTimeout(() => item.remove(), 11000);
	}

	TikTokBridge.on("connected", () => {
		status.textContent = "LIVE ĐÃ KẾT NỐI";
		status.className = "status connected";
	});
	TikTokBridge.on("reconnecting", () => {
		status.textContent = "ĐANG CHỜ TIKTOK LIVE";
		status.className = "status waiting";
	});
	TikTokBridge.on("disconnected", () => {
		status.textContent = "MẤT KẾT NỐI";
		status.className = "status error";
	});
	TikTokBridge.on("error", (data) => {
		status.textContent = "LỖI KẾT NỐI";
		status.className = "status error";
		addFeed(data?.message || "Không thể kết nối TikTok", "gift");
	});
	TikTokBridge.on("member", (data) => {
		engine.handleMember(data);
		soundFX.member();
	});
	TikTokBridge.on("chat", (data) => {
		engine.handleChat(data);
		soundFX.chat();
		addFeed(`💬 ${data.user.nickname}: ${data.comment}`);
	});
	TikTokBridge.on("like", (data) => {
		engine.handleLike(data);
		soundFX.like();
	});
	TikTokBridge.on("share", (data) => {
		engine.handleShare(data);
		soundFX.share();
		addFeed(`📣 ${data.user.nickname} đã chia sẻ LIVE`);
	});
	TikTokBridge.on("gift", (data) => {
		engine.handleGift(data);
		addFeed(`${config.getGiftEmoji(data.giftName)} ${data.user.nickname} tặng ${data.giftName} ×${data.repeatCount}`, "gift");
	});
	TikTokBridge.on("control", ({ action, payload }) => {
		if (action === "settings") applyControlSettings(payload);
		if (action === "test") runControlTest(payload?.type);
		if (action === "clear") {
			engine.resetStage();
		}
	});

	function applyControlSettings(settings = {}) {
		if (typeof settings.soundEnabled === "boolean") soundFX.setEnabled(settings.soundEnabled);
		if (Number.isFinite(Number(settings.volume))) soundFX.setVolume(Number(settings.volume));
		syncBackgroundMusic();
		if (Number.isFinite(Number(settings.avatarScale))) runtime.avatarScale = Math.max(0.5, Math.min(2, Number(settings.avatarScale)));
		if (Number.isFinite(Number(settings.avatarLimit))) config.maxAvatars = Math.max(10, Math.min(150, Number(settings.avatarLimit)));
		if (Number.isFinite(Number(settings.lightIntensity))) runtime.lightIntensity = Math.max(0, Math.min(2, Number(settings.lightIntensity)));
		if (Number.isFinite(Number(settings.lightSpeed))) runtime.lightSpeed = Math.max(0.1, Math.min(3, Number(settings.lightSpeed)));
		if (typeof settings.showGuide === "boolean") runtime.showGuide = settings.showGuide;
		if (typeof settings.showFeed === "boolean") runtime.showFeed = settings.showFeed;
		guide.style.display = runtime.showGuide ? "block" : "none";
		feed.style.display = runtime.showFeed ? "flex" : "none";
		updateSoundButton();
	}

	let controlUserNumber = 0;
	function controlUser() {
		controlUserNumber += 1;
		return { uniqueId: `control_${controlUserNumber}`, nickname: `Test Viewer ${controlUserNumber}`, profilePictureUrl: "" };
	}
	function runControlTest(type) {
		const existing = [...engine.avatars.values()].at(-1);
		const user = existing ? { uniqueId: existing.uniqueId, nickname: existing.nickname, profilePictureUrl: existing.profilePictureUrl } : controlUser();
		if (type === "spawn") { const next = controlUser(); engine.handleMember({ user: next }); soundFX.member(); }
		if (type === "chat") { engine.handleChat({ user, comment: "Dashboard đang điều khiển tôi!" }); soundFX.chat(); }
		if (type === "like") { engine.handleLike({ user, likeCount: 12 }); soundFX.like(); }
		if (type === "share") { engine.handleShare({ user }); soundFX.share(); }
		if (type === "small-gift") engine.handleGift({ user, giftName: "Hoa hồng", giftValue: 1, repeatCount: 1 });
		if (type === "medium-gift") engine.handleGift({ user, giftName: "Bắn tim", giftValue: 5, repeatCount: 1 });
		if (type === "mega-gift") engine.handleGift({ user, giftName: "Bánh vòng", giftValue: 30, repeatCount: 1 });
	}

	function roundedRect(x, y, w, h, radius) {
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, radius);
	}

	function drawBackground(time) {
		const lightTime = time * runtime.lightSpeed;
		ctx.drawImage(backgroundCanvas, 0, 0, width, height);

		ctx.save();
		ctx.globalCompositeOperation = "screen";
		ctx.globalAlpha = runtime.lightIntensity;
		for (let i = 0; i < 8; i += 1) {
			const x = width * (0.08 + i * 0.12);
			const fixtureY = height * (0.08 + (i % 3) * 0.065);
			const speed = i % 2 ? 0.00075 : -0.00062;
			const targetX = width * 0.5 + Math.sin(lightTime * speed + i * 1.7) * width * 0.62;
			const targetY = height * (0.62 + (i % 2) * 0.2);
			const beam = ctx.createLinearGradient(x, fixtureY, targetX, targetY);
			beam.addColorStop(0, `${config.colors[i % config.colors.length]}b8`);
			beam.addColorStop(0.55, `${config.colors[i % config.colors.length]}38`);
			beam.addColorStop(1, `${config.colors[i % config.colors.length]}00`);
			ctx.fillStyle = beam;
			ctx.beginPath();
			ctx.moveTo(x - 5, fixtureY);
			ctx.lineTo(x + 5, fixtureY);
			ctx.lineTo(targetX + width * 0.075, targetY);
			ctx.lineTo(targetX - width * 0.075, targetY);
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = "#fff";
			ctx.shadowColor = config.colors[i % config.colors.length];
			ctx.shadowBlur = 18;
			ctx.beginPath();
			ctx.arc(x, fixtureY, 3.5, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.lineWidth = 1.5;
		for (let laser = 0; laser < 5; laser += 1) {
			ctx.strokeStyle = `${config.colors[(laser + 1) % config.colors.length]}70`;
			const y = height * (0.35 + laser * 0.09 + Math.sin(lightTime * 0.001 + laser) * 0.035);
			ctx.beginPath();
			ctx.moveTo(0, y + Math.sin(lightTime * 0.0014 + laser) * height * 0.06);
			ctx.lineTo(width, y - Math.sin(lightTime * 0.0011 + laser) * height * 0.06);
			ctx.stroke();
		}
		ctx.restore();

		const beat = Math.max(0, Math.sin(lightTime * 0.0065));
		if (beat > 0.94) {
			ctx.fillStyle = `rgba(255, 225, 245, ${(beat - 0.94) * 0.75})`;
			ctx.fillRect(0, 0, width, height);
		}
	}

	function getDjPlacements(leaderboard) {
		const compact = width < 700 || width / height < 0.8;
		const slots = compact
			? [
				{ x: 0.5, y: 0.42, scale: 1.28 },
				{ x: 0.25, y: 0.51, scale: 0.98 },
				{ x: 0.75, y: 0.51, scale: 0.98 },
				{ x: 0.15, y: 0.62, scale: 0.83 },
				{ x: 0.85, y: 0.62, scale: 0.83 },
			]
			: [
				{ x: 0.5, y: 0.48, scale: 1.32 },
				{ x: 0.31, y: 0.53, scale: 1.02 },
				{ x: 0.69, y: 0.53, scale: 1.02 },
				{ x: 0.15, y: 0.59, scale: 0.86 },
				{ x: 0.85, y: 0.59, scale: 0.86 },
			];
		return new Map(leaderboard.map((supporter, index) => [
			supporter.avatar.key,
			{ ...slots[index], rank: supporter.rank, role: supporter.role, total: supporter.total },
		]));
	}

	function drawDjStage(placements, time) {
		if (!placements.size) return;
		const pulse = 0.65 + Math.sin(time * 0.008) * 0.2;
		ctx.save();
		for (const placement of placements.values()) {
			const x = placement.x * width;
			const y = placement.y * height;
			const podiumW = Math.max(54, Math.min(width * 0.19, 150) * placement.scale);
			const podiumH = Math.max(20, height * 0.034);
			const rankColors = ["#ffd84d", "#25f4ee", "#fe2c55", "#a855f7", "#60a5fa"];
			const color = rankColors[placement.rank - 1];
			const gradient = ctx.createLinearGradient(x, y, x, y + podiumH);
			gradient.addColorStop(0, "rgba(22, 16, 42, .98)");
			gradient.addColorStop(1, "rgba(4, 6, 18, .98)");
			ctx.fillStyle = gradient;
			ctx.strokeStyle = color;
			ctx.shadowColor = color;
			ctx.shadowBlur = 12 + pulse * 12;
			ctx.lineWidth = placement.rank === 1 ? 3 : 2;
			roundedRect(x - podiumW / 2, y - 4, podiumW, podiumH, 9);
			ctx.fill();
			ctx.stroke();
			ctx.globalAlpha = pulse;
			ctx.beginPath();
			ctx.ellipse(x, y - 5, podiumW * 0.43, podiumH * 0.38, 0, 0, Math.PI * 2);
			ctx.stroke();
			ctx.globalAlpha = 1;
		}
		ctx.restore();
	}

	function drawDjWings(size, rank, time) {
		const colors = ["#fff2a8", "#9ffcff", "#ff9ec4", "#d8b4fe", "#93c5fd"];
		const color = colors[rank - 1] || colors.at(-1);
		const flap = 0.92 + Math.sin(time * 0.012 + rank) * 0.09;
		const wingScale = (rank === 1 ? 1.38 : 1.02) * flap;
		ctx.save();
		ctx.globalCompositeOperation = "screen";
		ctx.strokeStyle = color;
		ctx.fillStyle = `${color}40`;
		ctx.shadowColor = color;
		ctx.shadowBlur = rank === 1 ? 28 : 17;
		ctx.lineWidth = Math.max(2, size * 0.035);
		for (const side of [-1, 1]) {
			ctx.save();
			ctx.scale(side * wingScale, wingScale);
			for (let feather = 0; feather < 4; feather += 1) {
				const rise = size * (0.28 + feather * 0.13);
				const reach = size * (0.58 + feather * 0.12);
				ctx.beginPath();
				ctx.moveTo(size * 0.05, -size * 0.58);
				ctx.quadraticCurveTo(reach * 0.55, -size * 0.98 - rise * 0.2, reach, -size * 0.55 - rise);
				ctx.quadraticCurveTo(reach * 0.72, -size * 0.25 - rise * 0.18, size * 0.12, -size * 0.2);
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
			}
			ctx.restore();
		}
		ctx.restore();
	}

	function drawAvatar(avatar, time, isFocused, placement = null) {
		const positionX = placement?.x ?? avatar.x;
		const positionY = placement?.y ?? avatar.y;
		const depth = Math.max(0, Math.min(1, (positionY - 0.57) / 0.38));
		const baseSize = Math.max(52, Math.min(width, height) * (0.085 + depth * 0.045));
		const focusScale = isFocused ? 1.22 : 1;
		const ageScale = Math.min(1, (time - avatar.spawnedAt) / 280);
		const size = baseSize * focusScale * Math.max(0, ageScale) * runtime.avatarScale * (placement?.scale || 1);
		const x = positionX * width;
		const fallProgress = Math.max(0, (time - avatar.spawnedAt) / 850);
		const falling = !placement && avatar.spawnSource === "member" && fallProgress < 1;
		const fallOffset = falling ? -((1 - fallProgress) ** 2) * height * 0.85 : 0;
		const landingBounce = !placement && avatar.spawnSource === "member" && fallProgress >= 1 && fallProgress < 1.3 ? Math.sin((fallProgress - 1) * Math.PI / 0.3) * size * 0.08 : 0;
		const groundY = positionY * height + fallOffset - landingBounce;
		const dancePhase = time * 0.0075 + avatar.phase;
		let bob = Math.sin(dancePhase * 2) * size * 0.025;
		let danceX = 0;
		let scaleX = 1;
		let scaleY = 1;
		let rotation = 0;
		switch (avatar.characterIndex) {
			case 0:
				bob -= Math.max(0, Math.sin(dancePhase)) ** 2 * size * 0.14;
				rotation = Math.sin(dancePhase) * 0.07;
				break;
			case 1:
				danceX = Math.sin(dancePhase) * size * 0.13;
				rotation = Math.sin(dancePhase) * 0.13;
				break;
			case 2:
				scaleY = 0.92 + Math.abs(Math.sin(dancePhase)) * 0.12;
				scaleX = 1.08 - Math.abs(Math.sin(dancePhase)) * 0.08;
				rotation = Math.sin(dancePhase * 2) * 0.045;
				break;
			default:
				bob -= Math.abs(Math.sin(dancePhase * 0.75)) * size * 0.1;
				danceX = Math.sin(dancePhase * 0.75) * size * 0.08;
				rotation = -Math.sin(dancePhase * 0.75) * 0.1;
		}
		if (avatar.action === "jump") bob -= Math.abs(Math.sin(time * 0.012)) * size * 0.42;
		if (avatar.action === "dance") { rotation += Math.sin(time * 0.018) * 0.18; danceX *= 1.8; }
		if (avatar.action === "power") { bob -= Math.abs(Math.sin(time * 0.008)) * size * 0.2; scaleX *= 1.08; scaleY *= 1.08; }
		if (avatar.action === "helicopter") { bob = -size * 0.12 + Math.sin(time * 0.018) * size * 0.05; danceX = 0; scaleX = 1; scaleY = 1; rotation = (time - avatar.actionStartedAt) * 0.014; }
		const renderX = x + danceX;

		ctx.save();
		ctx.translate(renderX, groundY + bob);
		ctx.scale(avatar.direction * scaleX, scaleY);
		if (avatar.action === "helicopter") ctx.translate(0, -size * 0.5);
		ctx.rotate(rotation * avatar.direction);
		if (avatar.action === "helicopter") ctx.translate(0, size * 0.5);
		ctx.shadowColor = isFocused ? "#fbbf24" : "#000";
		ctx.shadowBlur = isFocused ? 28 : 12;
		ctx.globalAlpha = Math.min(1, ageScale);
		if (placement) drawDjWings(size, placement.rank, time);

		ctx.fillStyle = "rgba(0,0,0,.35)";
		ctx.beginPath();
		ctx.ellipse(0, size * 0.03, size * 0.42, size * 0.1, 0, 0, Math.PI * 2);
		ctx.fill();
		const sprite = characterImages[avatar.characterIndex];
		if (sprite?.complete && sprite.naturalWidth) {
			const aspect = sprite.naturalWidth / sprite.naturalHeight;
			ctx.drawImage(sprite, -size * aspect / 2, -size, size * aspect, size);
		}
		ctx.restore();

		if (avatar.imageLoaded) {
			const badge = Math.max(15, size * 0.15);
			ctx.save();
			ctx.beginPath();
			ctx.arc(renderX - size * 0.36, groundY - size * 0.72 + bob, badge, 0, Math.PI * 2);
			ctx.clip();
			ctx.drawImage(avatar.image, renderX - size * 0.36 - badge, groundY - size * 0.72 + bob - badge, badge * 2, badge * 2);
			ctx.restore();
			ctx.strokeStyle = isFocused ? "#fbbf24" : "#25f4ee";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(renderX - size * 0.36, groundY - size * 0.72 + bob, badge, 0, Math.PI * 2);
			ctx.stroke();
		}

		ctx.save();
		ctx.font = `800 ${Math.max(10, size * 0.18)}px system-ui`;
		ctx.textAlign = "center";
		const label = avatar.nickname.slice(0, 22);
		const labelW = Math.min(width * 0.28, ctx.measureText(label).width + 16);
		ctx.fillStyle = isFocused ? "rgba(94, 62, 5, .92)" : "rgba(3, 8, 18, .82)";
		roundedRect(renderX - labelW / 2, groundY + size * 0.08, labelW, Math.max(20, size * 0.22), 8);
		ctx.fill();
		ctx.fillStyle = "white";
		ctx.fillText(label, renderX, groundY + size * 0.235);
		if (placement) {
			const badgeY = groundY + size * 0.55;
			const badgeW = Math.max(84, size * 1.28);
			const rankColors = ["#ffe66d", "#25f4ee", "#fe7aa1", "#c4a1ff", "#93c5fd"];
			ctx.fillStyle = "rgba(20, 9, 36, .95)";
			ctx.strokeStyle = rankColors[placement.rank - 1];
			ctx.lineWidth = 2;
			roundedRect(renderX - badgeW / 2, badgeY - 12, badgeW, 20, 8);
			ctx.fill(); ctx.stroke();
			ctx.fillStyle = rankColors[placement.rank - 1];
			ctx.font = `800 ${Math.max(10, size * 0.15)}px system-ui`;
			ctx.fillText(`${placement.rank === 1 ? "👑" : "🎧"} ${placement.role} • ${placement.total}💎`, renderX, badgeY + 2, badgeW - 6);
		}
		ctx.restore();

		if (avatar.chat) drawChat(avatar, renderX, groundY - size * 1.12 + bob, size);
	}

	function drawChat(avatar, x, y, size) {
		ctx.save();
		ctx.font = `700 ${Math.max(11, size * 0.17)}px system-ui`;
		const message = avatar.chat;
		const maxW = Math.min(width * 0.38, 270);
		const lines = wrapText(message, maxW - 24);
		const lineH = Math.max(15, size * 0.22);
		const boxH = lines.length * lineH + 18;
		ctx.fillStyle = "rgba(255,255,255,.94)";
		roundedRect(x - maxW / 2, y - boxH, maxW, boxH, 12);
		ctx.fill();
		ctx.fillStyle = "#101827";
		ctx.textAlign = "center";
		lines.forEach((line, i) => ctx.fillText(line, x, y - boxH + 15 + (i + 1) * lineH - 6));
		ctx.restore();
	}

	function wrapText(text, maxWidth) {
		const words = text.split(/\s+/);
		const lines = [];
		let line = "";
		for (const word of words) {
			const test = line ? `${line} ${word}` : word;
			if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
			else line = test;
		}
		if (line) lines.push(line);
		return lines.slice(0, 3);
	}

	function drawGiftAura(focus, time, placement = null) {
		if (!focus) return;
		const x = (placement?.x ?? focus.avatar.x) * width;
		const y = (placement?.y ?? focus.avatar.y) * height;
		const radius = Math.min(width, height) * (focus.tier === "mega" ? 0.18 : 0.11);
		ctx.save();
		ctx.translate(x, y - radius * 0.35);
		ctx.globalAlpha = 0.7 + Math.sin(time * 0.01) * 0.18;
		ctx.strokeStyle = focus.tier === "mega" ? "#a855f7" : "#fbbf24";
		ctx.shadowColor = ctx.strokeStyle;
		ctx.shadowBlur = 22;
		ctx.lineWidth = Math.max(3, radius * 0.035);
		for (const side of [-1, 1]) {
			ctx.save();
			ctx.scale(side, 1);
			ctx.beginPath();
			ctx.moveTo(radius * 0.1, 0);
			ctx.quadraticCurveTo(radius * 0.65, -radius * 0.8, radius * 1.25, -radius * 0.35);
			ctx.quadraticCurveTo(radius * 0.72, -radius * 0.12, radius * 0.18, radius * 0.42);
			ctx.quadraticCurveTo(radius * 0.55, 0, radius * 0.92, -radius * 0.17);
			ctx.stroke();
			ctx.restore();
		}
		ctx.restore();
	}

	function drawSpotlight(moment, time, placement = null) {
		if (!moment || (moment.type === "gift" && moment.tier === "small")) return;
		const x = (placement?.x ?? moment.avatar.x) * width;
		const y = (placement?.y ?? moment.avatar.y) * height;
		ctx.save();
		ctx.globalCompositeOperation = "screen";
		const color = moment.type === "gift" && moment.tier === "mega" ? "168, 85, 247" : "255, 225, 130";
		for (const side of [-1, 1]) {
			const topX = x + side * width * 0.28;
			const beam = ctx.createLinearGradient(topX, 0, x, y);
			beam.addColorStop(0, `rgba(${color}, .05)`);
			beam.addColorStop(1, `rgba(${color}, ${0.28 + Math.sin(time * 0.012) * 0.06})`);
			ctx.fillStyle = beam;
			ctx.beginPath();
			ctx.moveTo(topX - 8, 0);
			ctx.lineTo(topX + 8, 0);
			ctx.lineTo(x + width * 0.09, y);
			ctx.lineTo(x - width * 0.09, y);
			ctx.fill();
		}
		ctx.restore();
	}

	function drawFocus(focus, time, placement = null) {
		if (!focus) return;
		const avatar = focus.avatar;
		const x = (placement?.x ?? avatar.x) * width;
		const y = (placement?.y ?? avatar.y) * height;
		ctx.save();
		ctx.globalCompositeOperation = "screen";
		const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.min(width, height) * 0.35);
		glow.addColorStop(0, "rgba(255, 220, 80, .36)");
		glow.addColorStop(1, "rgba(255, 220, 80, 0)");
		ctx.fillStyle = glow;
		ctx.fillRect(0, 0, width, height);
		ctx.restore();

		const compact = width < 700 || width / height < 0.75;
		const cardW = compact ? Math.min(width * 0.45, 520) : Math.min(width * 0.66, 520);
		const cardH = Math.max(72, height * 0.09);
		const cardX = width / 2 - cardW / 2;
		const cardY = height * (compact ? 0.29 : 0.1);
		ctx.save();
		const tierColor = focus.tier === "mega" ? "#a855f7" : focus.tier === "medium" ? "#25f4ee" : "#fbbf24";
		ctx.fillStyle = focus.tier === "mega" ? "rgba(28, 10, 43, .94)" : "rgba(25, 15, 7, .91)";
		ctx.strokeStyle = tierColor;
		ctx.lineWidth = 2;
		roundedRect(cardX, cardY, cardW, cardH, 18);
		ctx.fill(); ctx.stroke();
		ctx.textAlign = "center";
		ctx.font = `900 ${Math.max(18, cardH * 0.33)}px system-ui`;
		ctx.fillStyle = "white";
		ctx.fillText(`${focus.emoji} ${avatar.nickname}`, width / 2, cardY + cardH * 0.43, cardW - 20);
		ctx.font = `800 ${Math.max(12, cardH * 0.2)}px system-ui`;
		ctx.fillStyle = tierColor;
		ctx.fillText(`${focus.giftName} ×${focus.count}  •  ${focus.value} 💎`, width / 2, cardY + cardH * 0.75, cardW - 20);
		if (engine.giftQueue.length) {
			ctx.font = `700 ${Math.max(10, cardH * 0.15)}px system-ui`;
			ctx.fillStyle = "#cbd5e1";
			ctx.fillText(`+${engine.giftQueue.length} hiệu ứng đang chờ`, width / 2, cardY + cardH + 18);
		}
		ctx.restore();
	}

	function drawEffects(placements) {
		for (const effect of engine.effects) {
			const placement = effect.anchorKey ? placements.get(effect.anchorKey) : null;
			const effectX = placement ? placement.x + effect.x - effect.anchorX : effect.x;
			const effectY = placement ? placement.y + effect.y - effect.anchorY : effect.y;
			ctx.save();
			ctx.globalAlpha = Math.max(0, effect.life);
			if (effect.delay > 0) { ctx.restore(); continue; }
			if (effect.type === "float") {
				ctx.font = `${effect.size}px serif`;
				ctx.textAlign = "center";
				ctx.fillText(effect.symbol, effectX * width, effectY * height);
			} else if (effect.type === "ring") {
				ctx.strokeStyle = effect.color;
				ctx.shadowColor = effect.color;
				ctx.shadowBlur = 12;
				ctx.lineWidth = 4 * effect.life;
				ctx.beginPath();
				ctx.ellipse(effectX * width, effectY * height, (1 - effect.life) * width * 0.11, (1 - effect.life) * height * 0.035, 0, 0, Math.PI * 2);
				ctx.stroke();
			} else if (effect.type === "pyro") {
				ctx.strokeStyle = effect.color;
				ctx.shadowColor = effect.color;
				ctx.shadowBlur = 12;
				ctx.lineWidth = 2.5;
				ctx.beginPath();
				ctx.moveTo(effectX * width, effectY * height);
				ctx.lineTo((effectX - effect.vx * 0.1) * width, (effectY - effect.vy * 0.1) * height);
				ctx.stroke();
			} else {
				ctx.fillStyle = effect.color;
				ctx.shadowColor = effect.color;
				ctx.shadowBlur = 10;
				ctx.beginPath();
				ctx.arc(effectX * width, effectY * height, 2.5, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.restore();
		}
	}

	function drawDjAnnouncement(time) {
		if (!djAnnouncement || time >= djAnnouncement.until) return;
		const age = time - djAnnouncement.startedAt;
		const remaining = djAnnouncement.until - time;
		const enter = Math.min(1, age / 260);
		const leave = Math.min(1, remaining / 350);
		const scale = Math.min(enter, leave);
		const wobble = Math.sin(time * 0.02) * 0.025;
		const boxW = Math.min(width * 0.9, 760);
		const boxH = Math.max(62, height * 0.075);
		const x = width / 2;
		const y = height * 0.18;
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(wobble);
		ctx.scale(scale, scale);
		ctx.fillStyle = "rgba(40, 8, 48, .94)";
		ctx.strokeStyle = "#ffe66d";
		ctx.shadowColor = "#fe2c55";
		ctx.shadowBlur = 30;
		ctx.lineWidth = 3;
		roundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 18);
		ctx.fill(); ctx.stroke();
		ctx.fillStyle = "white";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = `900 ${Math.max(16, Math.min(30, boxH * 0.35))}px system-ui`;
		ctx.fillText(djAnnouncement.text, 0, 0, boxW - 24);
		ctx.restore();
	}

	function frame(time) {
		if (time - lastFrame < targetFrameMs - 1) {
			requestAnimationFrame(frame);
			return;
		}
		const dt = Math.min(0.05, (time - lastFrame) / 1000);
		lastFrame = time;
		engine.tick(dt);
		for (const announcement of engine.announcements.splice(0)) {
			if (announcement.type === "gift" && announcement.variant === "helicopter") playHelicopter();
			else if (announcement.type === "gift") soundFX.gift(announcement.tier);
			if (announcement.variant === "dj") soundFX.djBeat();
		}
		for (const event of engine.djEvents.splice(0)) {
			const text = event.text || `💨 ${event.avatar.nickname} rớt khỏi bàn DJ, xuống sàn quẩy tiếp!`;
			addFeed(text, "gift");
			if (event.type === "takeover" || event.type === "joined") {
				djAnnouncement = { text, startedAt: time, until: time + 3600 };
				soundFX.djBeat();
			}
		}
		const heat = Math.round(engine.heat / engine.heatTarget * 100);
		if (heatValue.textContent !== `${heat}%`) {
			heatValue.textContent = `${heat}%`;
			heatFill.style.width = `${heat}%`;
		}
		const moment = engine.moment?.type === "hype" ? engine.moment : engine.focus || engine.moment;
		if (moment?.variant === "helicopter" && moment.outro && !helicopterAudio.paused) helicopterAudio.pause();
		hypeBanner.textContent = engine.moment?.type === "hype" ? `🔥 ${engine.moment.text} 🔥` : "🔥 CẢ SÀN BÙNG NỔ! 🔥";
		hypeBanner.classList.toggle("visible", engine.hypeUntil > performance.now());
		momentCaption.textContent = moment?.type === "hype" ? "" : moment?.text || "";
		momentCaption.classList.toggle("visible", Boolean(moment && moment.type !== "hype"));
		ctx.clearRect(0, 0, width, height);
		drawBackground(time);
		const focused = moment?.avatar;
		const avatars = [...engine.avatars.values()].sort((a, b) => a.y - b.y);
		const djLeaderboard = engine.getDjLeaderboard();
		const djPlacements = getDjPlacements(djLeaderboard);
		const focusedPlacement = focused ? djPlacements.get(focused.key) : null;
		ctx.save();
		if (focused) {
			const age = Math.max(0, time - (moment.startedAt || time));
			let zoom = 1.5;
			if (moment.variant === "dj") zoom = 1.2 + Math.pow(Math.sin(Math.min(1, age / moment.duration) * Math.PI * 3), 2) * 0.65;
			else zoom = 1 + Math.min(1, age / 400) * 0.5;
			const easeOut = Math.min(1, Math.max(0, (moment.until - time) / 450));
			zoom = 1 + (zoom - 1) * easeOut;
			ctx.translate(width / 2, height * 0.68);
			ctx.scale(zoom, zoom);
			ctx.translate(
				-(focusedPlacement?.x ?? focused.x) * width,
				-(focusedPlacement?.y ?? focused.y) * height,
			);
		}
		drawDjStage(djPlacements, time);
		for (const avatar of avatars) {
			if (avatar !== focused && !djPlacements.has(avatar.key)) drawAvatar(avatar, time, false);
		}
		for (const supporter of djLeaderboard) {
			if (supporter.avatar !== focused) {
				drawAvatar(supporter.avatar, time, false, djPlacements.get(supporter.avatar.key));
			}
		}
		if (focused) {
			drawSpotlight(moment, time, focusedPlacement);
			if (moment.type === "gift") drawGiftAura(moment, time, focusedPlacement);
			drawAvatar(focused, time, true, focusedPlacement);
		}
		drawEffects(djPlacements);
		ctx.restore();
		if (moment?.type === "gift") {
			if (width >= 700) drawFocus(moment, time, focusedPlacement);
			if (moment.variant === "dj") soundFX.djBeat();
		}
		drawDjAnnouncement(time);

		if (avatars.length !== lastCount) {
			lastCount = avatars.length;
			count.textContent = `${avatars.length} NHÂN VẬT`;
			empty.classList.toggle("hidden", avatars.length > 0);
		}
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	if (params.get("demo") === "1") startDemo();
	function startDemo() {
		status.textContent = "CHẾ ĐỘ DEMO";
		status.className = "status connected";
		const names = ["Giang Byn", "Hùng Nas", "Ngọc Anh", "Minh Châu", "Bảo Trân", "Ken VN", "Linh Miu", "Nam Lee", "Mây", "Bin Bắp"];
		names.forEach((name, i) => setTimeout(() => {
			engine.handleMember({ user: { uniqueId: `demo_${i}`, nickname: name, profilePictureUrl: `https://i.pravatar.cc/100?img=${i + 10}` } });
			soundFX.member();
		}, i * 170));
		setInterval(() => {
			const i = Math.floor(Math.random() * names.length);
			const user = { uniqueId: `demo_${i}`, nickname: names[i], profilePictureUrl: `https://i.pravatar.cc/100?img=${i + 10}` };
			if (Math.random() < 0.32) {
				const giftChoice = Math.random();
				const gift = giftChoice < 0.25 ? { user, giftName: "Bánh vòng", giftValue: 30, repeatCount: 1 } : giftChoice < 0.55 ? { user, giftName: "Bắn tim", giftValue: 5, repeatCount: 1 } : { user, giftName: "Hoa hồng", giftValue: 1, repeatCount: 1 };
				engine.handleGift(gift);
			}
			else if (Math.random() < 0.5) { engine.handleChat({ user, comment: ["xin chào mọi người", "nhảy đi", "quẩy lên nào", "hello host ❤️"][i % 4] }); soundFX.chat(); }
			else { engine.handleLike({ user, likeCount: 5 }); soundFX.like(); }
		}, 1800);
	}
})();
