window.CROWD_CONFIG = {
	maxAvatars: 70,
	inactivityMs: 5 * 60 * 1000,
	spawnPerSecond: 8,
	colors: ["#25f4ee", "#fe2c55", "#a855f7", "#fbbf24", "#34d399", "#60a5fa"],
	characters: [
		"assets/characters/mushroom-red.png",
		"assets/characters/mushroom-cyan.png",
		"assets/characters/mushroom-purple.png",
		"assets/characters/mushroom-yellow.png",
	],
	giftEmoji: {
		rose: "🌹",
		"heart me": "💗",
		"finger heart": "🫰",
		perfume: "💐",
		doughnut: "🍩",
		cap: "🧢",
		"singing mic": "🎤",
		concert: "🎸",
		star: "⭐",
	},
	getGiftEmoji(name) {
		return this.giftEmoji[String(name || "").toLowerCase()] || "🎁";
	},
};
