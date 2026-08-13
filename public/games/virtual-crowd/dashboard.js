(() => {
	const socket = io();
	const $ = (id) => document.getElementById(id);
	const controls = ["soundEnabled", "volume", "avatarScale", "avatarLimit", "lightIntensity", "lightSpeed", "showGuide", "showFeed"];
	let saveTimer = null;

	const defaults = { soundEnabled: true, volume: 0.55, avatarScale: 1, avatarLimit: 70, lightIntensity: 1, lightSpeed: 1, showGuide: true, showFeed: true };
	const saved = JSON.parse(localStorage.getItem("virtualCrowdControl") || "{}");
	const state = { ...defaults, ...saved };
	$("username").value = new URLSearchParams(location.search).get("id") || localStorage.getItem("virtualCrowdUsername") || $("username").value;

	function username() { return $("username").value.trim().replace(/^@/, "").toLowerCase(); }
	function overlayUrl() { return `${location.origin}/games/virtual-crowd/index.html?id=${encodeURIComponent(username())}`; }
	function refreshUrl() { $("overlayUrl").textContent = overlayUrl(); localStorage.setItem("virtualCrowdUsername", username()); }

	function applyStateToInputs() {
		for (const id of controls) {
			const element = $(id);
			if (element.type === "checkbox") element.checked = Boolean(state[id]);
			else element.value = state[id];
		}
		updateOutputs();
	}

	function updateOutputs() {
		$("volumeValue").value = `${Math.round($("volume").value * 100)}%`;
		$("scaleValue").value = `${Math.round($("avatarScale").value * 100)}%`;
		$("limitValue").value = $("avatarLimit").value;
		$("lightValue").value = `${Math.round($("lightIntensity").value * 100)}%`;
		$("speedValue").value = `${Math.round($("lightSpeed").value * 100)}%`;
	}

	function readSettings() {
		return {
			soundEnabled: $("soundEnabled").checked,
			volume: Number($("volume").value),
			avatarScale: Number($("avatarScale").value),
			avatarLimit: Number($("avatarLimit").value),
			lightIntensity: Number($("lightIntensity").value),
			lightSpeed: Number($("lightSpeed").value),
			showGuide: $("showGuide").checked,
			showFeed: $("showFeed").checked,
		};
	}

	function send(action, payload) {
		if (!username()) return notify("Hãy nhập username", true);
		socket.emit("virtual-crowd-control", { username: username(), action, payload }, (response) => {
			log(response?.ok ? `Đã gửi: ${action}` : `Lỗi: ${response?.message}`, !response?.ok);
		});
	}

	function sendSettings() {
		Object.assign(state, readSettings());
		localStorage.setItem("virtualCrowdControl", JSON.stringify(state));
		updateOutputs();
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => send("settings", state), 80);
	}

	function log(message, error = false) {
		const p = document.createElement("p");
		p.className = error ? "error" : "ok";
		p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
		$("activityLog").prepend(p);
	}
	function notify(message, error = false) { const toast = $("toast"); toast.textContent = message; toast.style.borderColor = error ? "#fe2c55" : "#25f4ee"; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 1800); }

	socket.on("connect", () => { $("serverStatus").textContent = "SERVER ONLINE"; $("serverStatus").className = "server-status online"; log("Đã kết nối server"); });
	socket.on("disconnect", () => { $("serverStatus").textContent = "SERVER OFFLINE"; $("serverStatus").className = "server-status offline"; log("Mất kết nối server", true); });
	$("username").addEventListener("input", refreshUrl);
	for (const id of controls) $(id).addEventListener("input", sendSettings);
	document.querySelectorAll("[data-test]").forEach((button) => button.addEventListener("click", () => { send("test", { type: button.dataset.test }); notify(`Đã chạy ${button.textContent.trim()}`); }));
	$("clearCrowd").addEventListener("click", () => { send("clear", {}); notify("Đã xóa sân khấu"); });
	$("copyUrl").addEventListener("click", async () => { await navigator.clipboard.writeText(overlayUrl()); notify("Đã sao chép URL"); });
	$("openOverlay").addEventListener("click", () => { window.open(overlayUrl(), "_blank"); setTimeout(sendSettings, 1200); });

	applyStateToInputs();
	refreshUrl();
	setTimeout(sendSettings, 400);
})();
