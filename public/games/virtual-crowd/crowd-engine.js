class CrowdEngine {
	constructor(config) {
		this.config = config;
		this.avatars = new Map();
		this.spawnQueue = [];
		this.effects = [];
		this.focus = null;
		this.giftQueue = [];
		this.lastSpawn = 0;
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

	spawn(user) {
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
			spawnedAt: performance.now(),
			action: null,
			actionUntil: 0,
		};
		if (avatar.profilePictureUrl) this.loadImage(avatar);
		this.avatars.set(key, avatar);
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
		this.queueUser(data.user, "member");
	}

	handleChat(data) {
		let avatar = this.getOrQueue(data.user, "chat");
		if (!avatar) avatar = this.spawn(data.user);
		avatar.chat = String(data.comment || "").slice(0, 54);
		avatar.chatUntil = performance.now() + 5200;
		avatar.lastActive = performance.now();
		this.burst(avatar, "💬", 4);
	}

	handleLike(data) {
		let avatar = this.getOrQueue(data.user, "like");
		if (!avatar && Number(data.likeCount) >= 3) avatar = this.spawn(data.user);
		if (!avatar) return;
		avatar.likes += Number(data.likeCount) || 1;
		avatar.lastActive = performance.now();
		this.burst(avatar, "❤️", Math.min(8, 2 + Number(data.likeCount || 1)));
	}

	handleShare(data) {
		let avatar = this.getOrQueue(data.user, "share");
		if (!avatar) avatar = this.spawn(data.user);
		avatar.lastActive = performance.now();
		this.burst(avatar, "📣", 7);
	}

	handleGift(data) {
		let avatar = this.getOrQueue(data.user, "gift");
		if (!avatar) avatar = this.spawn(data.user);
		const unitValue = Math.max(1, Number(data.giftValue) || 1);
		const count = Math.max(1, Number(data.repeatCount) || 1);
		const value = unitValue * count;
		const tier = value >= 100 ? "mega" : value >= 10 ? "medium" : "small";
		const duration = tier === "mega" ? 8000 : tier === "medium" ? 5600 : 3300;
		const gift = {
			avatar,
			giftName: data.giftName || "Gift",
			emoji: this.config.getGiftEmoji(data.giftName),
			count,
			value,
			tier,
			duration,
			until: 0,
		};
		const matching = [this.focus, ...this.giftQueue].find((item) => item && item.avatar.key === avatar.key && item.giftName === gift.giftName);
		if (matching) {
			matching.count = Math.max(matching.count, count);
			matching.value = Math.max(matching.value, value);
			matching.tier = matching.value >= 100 ? "mega" : matching.value >= 10 ? "medium" : "small";
			if (matching === this.focus) matching.until = Math.max(matching.until, performance.now() + 1400);
		} else if (!this.focus) {
			this.startGift(gift);
		} else {
			this.giftQueue.push(gift);
		}
		avatar.lastActive = performance.now();
	}

	startGift(gift) {
		gift.until = performance.now() + gift.duration;
		this.focus = gift;
		gift.avatar.action = gift.tier === "mega" ? "power" : gift.tier === "medium" ? "dance" : "jump";
		gift.avatar.actionUntil = gift.until;
		this.burst(gift.avatar, gift.emoji, Math.min(26, 7 + Math.ceil(Math.sqrt(gift.value))));
		this.rings(gift.avatar, gift.tier === "mega" ? 4 : 2);
		if (gift.tier !== "small") this.fireworks(gift.tier === "mega" ? 8 : 3);
		if (gift.tier === "mega") this.pyroFountains();
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
		const spawnGap = 1000 / this.config.spawnPerSecond;
		if (this.spawnQueue.length && now - this.lastSpawn >= spawnGap) {
			const next = this.spawnQueue.shift();
			if (!this.avatars.has(this.userKey(next.user))) this.spawn(next.user);
			this.lastSpawn = now;
		}
		for (const avatar of this.avatars.values()) {
			if (Math.abs(avatar.targetX - avatar.x) < 0.02 || Math.random() < 0.002) {
				avatar.targetX = 0.06 + Math.random() * 0.88;
			}
			avatar.direction = avatar.targetX >= avatar.x ? 1 : -1;
			avatar.x += avatar.direction * avatar.speed * dt;
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
		if (this.focus && now > this.focus.until) {
			this.focus.avatar.action = null;
			this.focus = null;
			const next = this.giftQueue.shift();
			if (next) this.startGift(next);
		}
		for (const avatar of this.avatars.values()) {
			if (now - avatar.lastActive > this.config.inactivityMs) this.avatars.delete(avatar.key);
		}
	}
}

window.CrowdEngine = CrowdEngine;
