class CrowdEngine {
	constructor(config) {
		this.config = config;
		this.avatars = new Map();
		this.spawnQueue = [];
		this.effects = [];
		this.focus = null;
		this.giftQueue = [];
		this.lastSpawn = 0;
		this.heat = 0;
		this.hypeUntil = 0;
		this.pendingHype = null;
		this.heatCooldowns = new Map();
		this.giftStreaks = new Map();
		this.heatTarget = 50;
		this.moment = null;
		this.welcomeQueue = [];
		this.announcements = [];
	}

	addHeat(points, user, deferHype = false) {
		const now = performance.now();
		if (now < this.hypeUntil || this.pendingHype) return;
		this.heat = Math.min(this.heatTarget, this.heat + points);
		if (this.heat < this.heatTarget) return;
		this.pendingHype = this.avatars.get(this.userKey(user)) || null;
		if (!deferHype && !this.focus) this.startHype();
	}

	startHype() {
		const now = performance.now();
		const avatar = this.pendingHype;
		this.pendingHype = null;
		this.hypeUntil = now + 7000;
		this.moment = avatar ? { type: "hype", avatar, startedAt: now, until: this.hypeUntil, text: `${avatar.nickname} quẩy lên ae ơi!` } : null;
		if (avatar) this.announcements.push({ type: "hype", text: `${avatar.nickname} quẩy lên ae ơi!` });
		this.fireworks(9);
		this.pyroFountains();
		for (const avatar of this.avatars.values()) {
			avatar.action = "dance";
			avatar.actionUntil = this.hypeUntil;
		}
	}

	addActivityHeat(user, kind, points, cooldownMs) {
		const key = `${kind}:${this.userKey(user)}`;
		const now = performance.now();
		if (now < (this.heatCooldowns.get(key) || 0)) return;
		this.heatCooldowns.set(key, now + cooldownMs);
		this.addHeat(points, user);
	}

	resetStage() {
		this.avatars.clear();
		this.spawnQueue.length = 0;
		this.giftQueue.length = 0;
		this.effects.length = 0;
		this.focus = null;
		this.heat = 0;
		this.hypeUntil = 0;
		this.pendingHype = null;
		this.heatCooldowns.clear();
		this.giftStreaks.clear();
		this.moment = null;
		this.welcomeQueue.length = 0;
		this.announcements.length = 0;
	}

	userKey(user) {
		return String(user?.uniqueId || user?.nickname || "anonymous").toLowerCase();
	}

	queueUser(user, source = "member") {
		const key = this.userKey(user);
		if (!key || key === "anonymous") return null;
		const existing = this.avatars.get(key);
		if (existing) {
			existing.lastActive = performance.now();
			if (user.profilePictureUrl) existing.profilePictureUrl = user.profilePictureUrl;
			return existing;
		}
		if (!this.spawnQueue.some((item) => this.userKey(item.user) === key)) {
			this.spawnQueue.push({ user, source });
		}
		return null;
	}

	spawn(user, source = "activity") {
		const key = this.userKey(user);
		while (this.avatars.size >= this.config.maxAvatars) {
			const oldest = [...this.avatars.values()].sort((a, b) => a.lastActive - b.lastActive)[0];
			this.avatars.delete(oldest.key);
		}
		const seed = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
		const avatar = {
			key,
			uniqueId: user.uniqueId || key,
			nickname: user.nickname || user.uniqueId || "Viewer",
			profilePictureUrl: user.profilePictureUrl || "",
			image: null,
			imageLoaded: false,
			x: 0.08 + ((seed * 37) % 84) / 100,
			y: 0.6 + ((seed * 17) % 31) / 100,
			targetX: 0.1 + ((seed * 53) % 80) / 100,
			speed: 0.015 + (seed % 12) / 1000,
			direction: seed % 2 ? 1 : -1,
			phase: (seed % 100) / 10,
			color: this.config.colors[seed % this.config.colors.length],
			characterIndex: seed % this.config.characters.length,
			lastActive: performance.now(),
			chat: null,
			chatUntil: 0,
			likes: 0,
			hostBadge: false,
			spawnedAt: performance.now(),
			spawnSource: source,
			seenMember: source === "member",
			action: null,
			actionUntil: 0,
		};
		if (avatar.profilePictureUrl) this.loadImage(avatar);
		this.avatars.set(key, avatar);
		if (source === "member") this.welcomeQueue.push(avatar);
		return avatar;
	}

	loadImage(avatar) {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onload = () => { avatar.imageLoaded = true; };
		image.onerror = () => { avatar.imageLoaded = false; };
		image.src = avatar.profilePictureUrl;
		avatar.image = image;
	}

	getOrQueue(user, source) {
		return this.avatars.get(this.userKey(user)) || this.queueUser(user, source);
	}

	handleMember(data) {
		const existing = this.avatars.get(this.userKey(data.user));
		if (existing && !existing.seenMember) {
			existing.seenMember = true;
			existing.spawnSource = "member";
			existing.spawnedAt = performance.now();
			this.welcomeQueue.push(existing);
			return;
		}
		this.queueUser(data.user, "member");
	}

	handleChat(data) {
		let avatar = this.getOrQueue(data.user, "chat");
		if (!avatar) avatar = this.spawn(data.user);
		avatar.chat = String(data.comment || "").slice(0, 54);
		avatar.chatUntil = performance.now() + 5200;
		avatar.lastActive = performance.now();
		this.burst(avatar, "💬", 4);
		this.addActivityHeat(data.user, "chat", 8, 8000);
	}

	handleLike(data) {
		let avatar = this.getOrQueue(data.user, "like");
		if (!avatar) avatar = this.spawn(data.user);
		if (!avatar) return;
		avatar.likes += Number(data.likeCount) || 1;
		avatar.lastActive = performance.now();
		this.burst(avatar, "❤️", Math.min(8, 2 + Number(data.likeCount || 1)));
		this.addActivityHeat(data.user, "like", Math.min(12, Math.max(2, Math.ceil(Number(data.likeCount || 1) / 5))), 2500);
	}

	handleShare(data) {
		let avatar = this.getOrQueue(data.user, "share");
		if (!avatar) avatar = this.spawn(data.user);
		avatar.lastActive = performance.now();
		this.burst(avatar, "📣", 7);
		this.addActivityHeat(data.user, "share", 12, 30000);
	}

	handleGift(data) {
		let avatar = this.getOrQueue(data.user, "gift");
		if (!avatar) avatar = this.spawn(data.user);
		const unitValue = Math.max(1, Number(data.giftValue) || 1);
		const count = Math.max(1, Number(data.repeatCount) || 1);
		const value = unitValue * count;
		const streakKey = `${avatar.key}:${data.giftId || data.giftName || "gift"}`;
		const previous = this.giftStreaks.get(streakKey);
		const now = performance.now();
		const fresh = !previous || now - previous.at > 10000 || count === 1;
		const newCount = fresh ? count : Math.max(0, count - previous.count);
		this.giftStreaks.set(streakKey, { count, at: now });
		if (newCount) this.addHeat(Math.min(60, Math.ceil(Math.sqrt(unitValue) * 9 * newCount)), data.user, true);
		const tier = unitValue > 5 ? "mega" : unitValue === 5 ? "medium" : "small";
		const duration = tier === "mega" ? 6600 : tier === "medium" ? 3000 : 2700;
		if (tier === "mega") avatar.hostBadge = true;
		const gift = {
			type: "gift",
			avatar,
			giftName: data.giftName || "Gift",
			emoji: this.config.getGiftEmoji(data.giftName),
			count,
			value,
			unitValue,
			tier,
			duration,
			until: 0,
		};
		const matching = [this.focus, ...this.giftQueue].find((item) => item && item.avatar.key === avatar.key && item.giftName === gift.giftName);
		if (matching) {
			const oldTier = matching.tier;
			matching.count = Math.max(matching.count, count);
			matching.value = Math.max(matching.value, value);
			matching.tier = tier;
			matching.duration = matching.variant === "helicopter" ? this.config.helicopterDurationMs : duration;
			if (matching === this.focus) {
				if (matching.variant !== "helicopter") matching.until = Math.max(matching.until, performance.now() + (oldTier === matching.tier ? 1400 : matching.duration));
				matching.avatar.action = matching.variant === "helicopter" ? (matching.outro ? "dance" : "helicopter") : matching.tier === "mega" ? "power" : matching.tier === "medium" ? "dance" : "jump";
				matching.avatar.actionUntil = matching.until;
				if (oldTier !== matching.tier) {
					this.rings(matching.avatar, matching.tier === "mega" ? 4 : 2);
					this.fireworks(matching.tier === "mega" ? 8 : 3);
					if (matching.tier === "mega") this.pyroFountains();
				}
			}
		} else if (!this.focus && !this.hypeUntil) {
			this.startGift(gift);
		} else {
			this.giftQueue.push(gift);
		}
		avatar.lastActive = performance.now();
	}

	startGift(gift) {
		gift.startedAt = performance.now();
		gift.variant = gift.tier === "mega" ? (Math.random() < 0.5 ? "helicopter" : "dj") : null;
		if (gift.variant === "helicopter") gift.duration = this.config.helicopterDurationMs;
		gift.until = gift.startedAt + gift.duration;
		this.focus = gift;
		if (!this.hypeUntil) this.moment = null;
		const lines = ["cả sàn lên nhạc nào!", "lên sân khấu quẩy hết mình!", "DJ lên beat cho anh em nào!", "đêm nay cháy hết mình nhé!"];
		const text = gift.variant === "helicopter" ? `🚁 ${gift.avatar.nickname} cất cánh!` : gift.tier === "mega" ? `${gift.avatar.nickname}, ${lines[Math.floor(Math.random() * lines.length)]}` : gift.tier === "medium" ? `${gift.avatar.nickname}, ae quẩy lên nào!` : `${gift.avatar.nickname} quẩy lên ae ơi!`;
		gift.text = text;
		this.announcements.push({ type: "gift", tier: gift.tier, variant: gift.variant, text });
		gift.avatar.action = gift.variant === "helicopter" ? "helicopter" : gift.tier === "mega" ? "power" : gift.tier === "medium" ? "dance" : "jump";
		gift.avatar.actionStartedAt = gift.startedAt;
		gift.avatar.actionUntil = gift.until;
		this.burst(gift.avatar, gift.emoji, Math.min(26, 7 + Math.ceil(Math.sqrt(gift.value))));
		this.rings(gift.avatar, gift.tier === "mega" ? 4 : 2);
		if (gift.tier === "medium") this.fireworksAround(gift.avatar, 4);
		if (gift.variant === "dj") this.fireworksAround(gift.avatar, 8);
		if (gift.variant === "dj") this.pyroFountains();
	}

	finishHelicopter() {
		if (this.focus?.variant !== "helicopter" || this.focus.outro) return;
		this.focus.outro = true;
		this.focus.until = performance.now() + 1600;
		this.focus.text = `${this.focus.avatar.nickname}, lên ae lên lên!`;
		this.focus.avatar.action = "dance";
		this.focus.avatar.actionUntil = this.focus.until;
	}

	fireworksAround(avatar, count) {
		for (let i = 0; i < count; i += 1) {
			const angle = Math.PI * 2 * i / count;
			const x = avatar.x + Math.cos(angle) * 0.1;
			const y = avatar.y - 0.1 + Math.sin(angle) * 0.08;
			for (let p = 0; p < 14; p += 1) {
				const direction = Math.PI * 2 * p / 14;
				this.effects.push({ type: "spark", x, y, vx: Math.cos(direction) * 0.065, vy: Math.sin(direction) * 0.065, life: 1, color: this.config.colors[i % this.config.colors.length] });
			}
		}
	}

	burst(avatar, symbol, count) {
		for (let i = 0; i < count; i += 1) {
			this.effects.push({
				type: "float",
				symbol,
				x: avatar.x + (Math.random() - 0.5) * 0.05,
				y: avatar.y - 0.04,
				vx: (Math.random() - 0.5) * 0.045,
				vy: -0.05 - Math.random() * 0.05,
				life: 1,
				size: 18 + Math.random() * 22,
			});
		}
	}

	fireworks(count) {
		for (let i = 0; i < count; i += 1) {
			const x = 0.12 + Math.random() * 0.76;
			const y = 0.18 + Math.random() * 0.38;
			for (let p = 0; p < 18; p += 1) {
				const angle = (Math.PI * 2 * p) / 18;
				this.effects.push({ type: "spark", x, y, vx: Math.cos(angle) * 0.08, vy: Math.sin(angle) * 0.08, life: 1, color: this.config.colors[i % this.config.colors.length] });
			}
		}
	}

	rings(avatar, count) {
		for (let i = 0; i < count; i += 1) {
			this.effects.push({ type: "ring", x: avatar.x, y: avatar.y - 0.04, life: 1, delay: i * 0.18, color: this.config.colors[i % this.config.colors.length] });
		}
	}

	pyroFountains() {
		for (const originX of [0.12, 0.27, 0.73, 0.88]) {
			for (let i = 0; i < 34; i += 1) {
				this.effects.push({
					type: "pyro",
					x: originX,
					y: 0.72,
					vx: (Math.random() - 0.5) * 0.055,
					vy: -0.2 - Math.random() * 0.2,
					life: 1,
					color: Math.random() > 0.45 ? "#ffd166" : "#ffffff",
				});
			}
		}
	}

	tick(dt) {
		const now = performance.now();
		if (this.hypeUntil && now >= this.hypeUntil) {
			this.hypeUntil = 0;
			this.heat = 0;
			if (!this.focus && this.giftQueue.length) this.startGift(this.giftQueue.shift());
		}
		for (const [key, until] of this.heatCooldowns) if (until < now) this.heatCooldowns.delete(key);
		for (const [key, streak] of this.giftStreaks) if (now - streak.at > 10000) this.giftStreaks.delete(key);
		const spawnGap = 1000 / this.config.spawnPerSecond;
		if (this.spawnQueue.length && now - this.lastSpawn >= spawnGap) {
			const next = this.spawnQueue.shift();
			if (!this.avatars.has(this.userKey(next.user))) this.spawn(next.user, next.source);
			this.lastSpawn = now;
		}
		for (const avatar of this.avatars.values()) {
			if (Math.abs(avatar.targetX - avatar.x) < 0.02 || Math.random() < 0.002) {
				avatar.targetX = 0.06 + Math.random() * 0.88;
			}
			avatar.direction = avatar.targetX >= avatar.x ? 1 : -1;
			if (now - avatar.spawnedAt > 850) avatar.x += avatar.direction * avatar.speed * dt;
			if (now > avatar.chatUntil) avatar.chat = null;
		}
		for (const effect of this.effects) {
			if (effect.type !== "ring") {
				effect.x += effect.vx * dt;
				effect.y += effect.vy * dt;
			}
			if (effect.type === "spark" || effect.type === "pyro") effect.vy += 0.18 * dt;
			if (effect.delay > 0) effect.delay -= dt;
			else effect.life -= (effect.type === "spark" ? 0.8 : effect.type === "pyro" ? 0.58 : effect.type === "ring" ? 0.72 : 0.45) * dt;
		}
		this.effects = this.effects.filter((effect) => effect.life > 0);
		if (this.effects.length > 480) this.effects.splice(0, this.effects.length - 480);
		if (this.focus?.variant === "helicopter" && !this.focus.outro && now >= this.focus.until) this.finishHelicopter();
		if (this.focus && now > this.focus.until) {
			if (now >= this.hypeUntil) this.focus.avatar.action = null;
			this.focus = null;
			if (this.pendingHype) this.startHype();
			else {
				const next = this.giftQueue.shift();
				if (next) this.startGift(next);
			}
		}
		if (this.moment && now > this.moment.until) this.moment = null;
		if (!this.focus && !this.moment && !this.hypeUntil && this.welcomeQueue.length) {
			const avatar = this.welcomeQueue.shift();
			if (this.avatars.get(avatar.key) === avatar) {
				this.moment = { type: "welcome", avatar, startedAt: now, until: now + 2700, text: `${avatar.nickname} cùng quẩy nào anh em ơi!` };
				this.announcements.push({ type: "welcome", text: `${avatar.nickname} cùng quẩy nào anh em ơi!` });
			}
		}
		for (const avatar of this.avatars.values()) {
			if (now - avatar.lastActive > this.config.inactivityMs) this.avatars.delete(avatar.key);
			else if (avatar.action && now > avatar.actionUntil && avatar !== this.focus?.avatar) avatar.action = null;
		}
	}
}

window.CrowdEngine = CrowdEngine;
