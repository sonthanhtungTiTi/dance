(() => {
	const config = window.CROWD_CONFIG;
	const engine = new CrowdEngine(config);
	const params = new URLSearchParams(location.search);
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
	const characterImages = config.characters.map((src) => {
		const image = new Image();
		image.src = src;
		return image;
	});
	const clubBackground = new Image();
	clubBackground.src = "assets/backgrounds/club-main.webp";

	function updateSoundButton() {
		soundToggle.textContent = soundFX.enabled ? "🔊 ÂM THANH" : "🔇 ĐÃ TẮT";
		soundToggle.classList.toggle("muted", !soundFX.enabled);
	}
	soundToggle.addEventListener("click", () => {
		soundFX.setEnabled(!soundFX.enabled);
		updateSoundButton();
	});
	updateSoundButton();
	document.addEventListener("pointerdown", () => soundFX.ensureContext(), { once: true });
	let width = 0;
	let height = 0;
	let dpr = 1;
	let lastFrame = performance.now();
	let lastCount = -1;

	function resize() {
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		width = window.innerWidth;
		height = window.innerHeight;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
		status.textContent = "ĐANG KẾT NỐI LẠI";
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
		soundFX.gift(giftTier(data));
		addFeed(`${config.getGiftEmoji(data.giftName)} ${data.user.nickname} tặng ${data.giftName} ×${data.repeatCount}`, "gift");
	});
	TikTokBridge.on("control", ({ action, payload }) => {
		if (action === "settings") applyControlSettings(payload);
		if (action === "test") runControlTest(payload?.type);
		if (action === "clear") {
			engine.avatars.clear();
			engine.spawnQueue.length = 0;
			engine.giftQueue.length = 0;
			engine.effects.length = 0;
			engine.focus = null;
		}
	});

	function applyControlSettings(settings = {}) {
		if (typeof settings.soundEnabled === "boolean") soundFX.setEnabled(settings.soundEnabled);
		if (Number.isFinite(Number(settings.volume))) soundFX.setVolume(Number(settings.volume));
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
		if (type === "small-gift") { const gift = { user, giftName: "Rose", giftValue: 1, repeatCount: 1 }; engine.handleGift(gift); soundFX.gift("small"); }
		if (type === "medium-gift") { const gift = { user, giftName: "Singing Mic", giftValue: 20, repeatCount: 1 }; engine.handleGift(gift); soundFX.gift("medium"); }
		if (type === "mega-gift") { const gift = { user, giftName: "Concert", giftValue: 199, repeatCount: 1 }; engine.handleGift(gift); soundFX.gift("mega"); }
	}

	function giftTier(data) {
		const total = Math.max(1, Number(data.giftValue) || 1) * Math.max(1, Number(data.repeatCount) || 1);
		return total >= 100 ? "mega" : total >= 10 ? "medium" : "small";
	}

	function roundedRect(x, y, w, h, radius) {
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, radius);
	}

	function drawBackground(time) {
		const lightTime = time * runtime.lightSpeed;
		ctx.fillStyle = "#08030a";
		ctx.fillRect(0, 0, width, height);
		if (clubBackground.complete && clubBackground.naturalWidth) {
			const imageRatio = clubBackground.naturalWidth / clubBackground.naturalHeight;
			const viewRatio = width / height;
			let sw = clubBackground.naturalWidth;
			let sh = clubBackground.naturalHeight;
			let sx = 0;
			let sy = 0;
			if (imageRatio > viewRatio) { sw = sh * viewRatio; sx = (clubBackground.naturalWidth - sw) / 2; }
			else { sh = sw / viewRatio; sy = (clubBackground.naturalHeight - sh) / 2; }
			ctx.drawImage(clubBackground, sx, sy, sw, sh, 0, 0, width, height);
		}
		ctx.fillStyle = "rgba(9, 1, 12, .18)";
		ctx.fillRect(0, 0, width, height);

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

	function drawAvatar(avatar, time, isFocused) {
		const depth = Math.max(0, Math.min(1, (avatar.y - 0.57) / 0.38));
		const baseSize = Math.max(52, Math.min(width, height) * (0.085 + depth * 0.045));
		const focusScale = isFocused ? 1.48 : 1;
		const ageScale = Math.min(1, (time - avatar.spawnedAt) / 280);
		const size = baseSize * focusScale * Math.max(0, ageScale) * runtime.avatarScale;
		const x = avatar.x * width;
		const groundY = avatar.y * height;
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
		const renderX = x + danceX;

		ctx.save();
		ctx.translate(renderX, groundY + bob);
		ctx.scale(avatar.direction * scaleX, scaleY);
		ctx.rotate(rotation * avatar.direction);
		ctx.shadowColor = isFocused ? "#fbbf24" : "#000";
		ctx.shadowBlur = isFocused ? 28 : 12;
		ctx.globalAlpha = Math.min(1, ageScale);

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

	function drawGiftAura(focus, time) {
		if (!focus) return;
		const x = focus.avatar.x * width;
		const y = focus.avatar.y * height;
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

	function drawFocus(focus, time) {
		if (!focus) return;
		const avatar = focus.avatar;
		const x = avatar.x * width;
		const y = avatar.y * height;
		ctx.save();
		ctx.globalCompositeOperation = "screen";
		const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.min(width, height) * 0.35);
		glow.addColorStop(0, "rgba(255, 220, 80, .36)");
		glow.addColorStop(1, "rgba(255, 220, 80, 0)");
		ctx.fillStyle = glow;
		ctx.fillRect(0, 0, width, height);
		ctx.restore();

		const cardW = Math.min(width * 0.66, 520);
		const cardH = Math.max(72, height * 0.09);
		const cardX = width / 2 - cardW / 2;
		const cardY = height * 0.1;
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
		ctx.fillText(`${focus.emoji} ${avatar.nickname}`, width / 2, cardY + cardH * 0.43);
		ctx.font = `800 ${Math.max(12, cardH * 0.2)}px system-ui`;
		ctx.fillStyle = tierColor;
		ctx.fillText(`${focus.giftName} ×${focus.count}  •  ${focus.value} 💎`, width / 2, cardY + cardH * 0.75);
		if (engine.giftQueue.length) {
			ctx.font = `700 ${Math.max(10, cardH * 0.15)}px system-ui`;
			ctx.fillStyle = "#cbd5e1";
			ctx.fillText(`+${engine.giftQueue.length} hiệu ứng đang chờ`, width / 2, cardY + cardH + 18);
		}
		ctx.restore();
	}

	function drawEffects() {
		for (const effect of engine.effects) {
			ctx.save();
			ctx.globalAlpha = Math.max(0, effect.life);
			if (effect.delay > 0) { ctx.restore(); continue; }
			if (effect.type === "float") {
				ctx.font = `${effect.size}px serif`;
				ctx.textAlign = "center";
				ctx.fillText(effect.symbol, effect.x * width, effect.y * height);
			} else if (effect.type === "ring") {
				ctx.strokeStyle = effect.color;
				ctx.shadowColor = effect.color;
				ctx.shadowBlur = 12;
				ctx.lineWidth = 4 * effect.life;
				ctx.beginPath();
				ctx.ellipse(effect.x * width, effect.y * height, (1 - effect.life) * width * 0.11, (1 - effect.life) * height * 0.035, 0, 0, Math.PI * 2);
				ctx.stroke();
			} else if (effect.type === "pyro") {
				ctx.strokeStyle = effect.color;
				ctx.shadowColor = effect.color;
				ctx.shadowBlur = 12;
				ctx.lineWidth = 2.5;
				ctx.beginPath();
				ctx.moveTo(effect.x * width, effect.y * height);
				ctx.lineTo((effect.x - effect.vx * 0.1) * width, (effect.y - effect.vy * 0.1) * height);
				ctx.stroke();
			} else {
				ctx.fillStyle = effect.color;
				ctx.shadowColor = effect.color;
				ctx.shadowBlur = 10;
				ctx.beginPath();
				ctx.arc(effect.x * width, effect.y * height, 2.5, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.restore();
		}
	}

	function frame(time) {
		const dt = Math.min(0.04, (time - lastFrame) / 1000);
		lastFrame = time;
		engine.tick(dt);
		ctx.clearRect(0, 0, width, height);
		drawBackground(time);
		const focused = engine.focus?.avatar;
		const avatars = [...engine.avatars.values()].sort((a, b) => a.y - b.y);
		for (const avatar of avatars) if (avatar !== focused) drawAvatar(avatar, time, false);
		if (focused) {
			drawGiftAura(engine.focus, time);
			drawAvatar(focused, time, true);
		}
		drawEffects();
		drawFocus(engine.focus, time);

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
				const mega = Math.random() < 0.3;
				const gift = { user, giftName: mega ? "Concert" : "Rose", giftValue: mega ? 199 : 1, repeatCount: 1 };
				engine.handleGift(gift);
				soundFX.gift(giftTier(gift));
			}
			else if (Math.random() < 0.5) { engine.handleChat({ user, comment: ["xin chào mọi người", "nhảy đi", "quẩy lên nào", "hello host ❤️"][i % 4] }); soundFX.chat(); }
			else { engine.handleLike({ user, likeCount: 5 }); soundFX.like(); }
		}, 1800);
	}
})();
