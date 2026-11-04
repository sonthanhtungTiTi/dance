class CrowdSoundFX {
	constructor({ volume = 0.55, enabled = true } = {}) {
		this.enabled = enabled;
		this.volume = Math.max(0, Math.min(1, volume));
		this.context = null;
		this.master = null;
		this.lastPlayed = new Map();
		if ("speechSynthesis" in window) window.speechSynthesis.cancel();
	}

	ensureContext() {
		if (!this.enabled) return null;
		if (!this.context) {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (!AudioContext) return null;
			this.context = new AudioContext();
			this.master = this.context.createGain();
			this.master.gain.value = this.volume;
			this.master.connect(this.context.destination);
		}
		if (this.context.state === "suspended") this.context.resume().catch(() => {});
		return this.context;
	}

	setEnabled(enabled) {
		this.enabled = Boolean(enabled);
		if (!this.enabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
		if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.015);
		if (this.enabled) this.ensureContext();
	}

	setVolume(volume) {
		this.volume = Math.max(0, Math.min(1, Number(volume) || 0));
		if (this.master && this.enabled) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
	}

	canPlay(key, gapMs) {
		const now = performance.now();
		if (now - (this.lastPlayed.get(key) || 0) < gapMs) return false;
		this.lastPlayed.set(key, now);
		return true;
	}

	tone({ frequency, endFrequency = frequency, delay = 0, duration = 0.12, volume = 0.12, type = "sine" }) {
		const context = this.ensureContext();
		if (!context) return;
		const start = context.currentTime + delay;
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = type;
		oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
		oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.018, duration / 3));
		gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		oscillator.connect(gain).connect(this.master);
		oscillator.start(start);
		oscillator.stop(start + duration + 0.02);
	}

	noise({ delay = 0, duration = 0.25, volume = 0.08, frequency = 1800, sweepTo = frequency }) {
		const context = this.ensureContext();
		if (!context) return;
		const length = Math.ceil(context.sampleRate * duration);
		const buffer = context.createBuffer(1, length, context.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
		const source = context.createBufferSource();
		const filter = context.createBiquadFilter();
		const gain = context.createGain();
		const start = context.currentTime + delay;
		filter.type = "bandpass";
		filter.Q.value = 1.2;
		filter.frequency.setValueAtTime(frequency, start);
		filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), start + duration);
		gain.gain.setValueAtTime(volume, start);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		source.buffer = buffer;
		source.connect(filter).connect(gain).connect(this.master);
		source.start(start);
	}

	member() {
		if (!this.canPlay("member", 110)) return;
		this.tone({ frequency: 620, endFrequency: 880, duration: 0.08, volume: 0.035, type: "triangle" });
	}

	chat() {
		if (!this.canPlay("chat", 170)) return;
		this.tone({ frequency: 760, endFrequency: 980, duration: 0.07, volume: 0.055, type: "square" });
		this.tone({ frequency: 980, endFrequency: 1180, delay: 0.075, duration: 0.065, volume: 0.045, type: "square" });
	}

	like() {
		if (!this.canPlay("like", 240)) return;
		this.tone({ frequency: 430, endFrequency: 920, duration: 0.11, volume: 0.055, type: "sine" });
	}

	share() {
		if (!this.canPlay("share", 500)) return;
		this.noise({ duration: 0.38, volume: 0.065, frequency: 350, sweepTo: 4200 });
		this.tone({ frequency: 520, endFrequency: 1040, delay: 0.12, duration: 0.2, volume: 0.06, type: "triangle" });
	}

	gift(tier = "small") {
		if (!this.canPlay(`gift-${tier}`, tier === "small" ? 180 : 350)) return;
		if (tier === "small") {
			[660, 880, 1100].forEach((frequency, index) => this.tone({ frequency, delay: index * 0.055, duration: 0.16, volume: 0.075, type: "triangle" }));
			return;
		}
		if (tier === "medium") {
			this.noise({ duration: 0.65, volume: 0.07, frequency: 300, sweepTo: 5200 });
			[440, 660, 880, 1320].forEach((frequency, index) => this.tone({ frequency, delay: 0.1 + index * 0.09, duration: 0.35, volume: 0.08, type: "sawtooth" }));
			return;
		}
		this.tone({ frequency: 95, endFrequency: 38, duration: 1.25, volume: 0.23, type: "sine" });
		this.noise({ delay: 0.08, duration: 1.1, volume: 0.13, frequency: 4500, sweepTo: 180 });
		[220, 330, 440, 660].forEach((frequency, index) => this.tone({ frequency, endFrequency: frequency * 1.5, delay: 0.12 + index * 0.11, duration: 0.65, volume: 0.1, type: "sawtooth" }));
		for (let i = 0; i < 4; i += 1) this.noise({ delay: 0.7 + i * 0.16, duration: 0.22, volume: 0.11, frequency: 2800, sweepTo: 700 });
	}

	djBeat() {
		if (!this.enabled || !this.canPlay("dj-beat", 450)) return;
		this.tone({ frequency: 95, endFrequency: 42, duration: 0.22, volume: 0.14, type: "sine" });
		this.noise({ delay: 0.23, duration: 0.09, volume: 0.035, frequency: 6000, sweepTo: 8000 });
	}

}

window.CrowdSoundFX = CrowdSoundFX;
