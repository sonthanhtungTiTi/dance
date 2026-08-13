/**
 * tiktokEventNormalizer.js
 * Pure functions that normalize raw tiktok-live-connector payloads
 * into a consistent shape for downstream consumers (games, bridge, debug).
 *
 * @module lib/tiktokEventNormalizer
 */

/**
 * Extract consistent user object from raw TikTok data.
 * @param {Object} raw - Raw event data from tiktok-live-connector
 * @returns {{uniqueId: string, nickname: string, profilePictureUrl: string}}
 */
export function normalizeUser(raw) {
	const user = raw?.user || raw || {};
	return {
		uniqueId: user.uniqueId || user.displayId || "",
		nickname: user.nickname || user.uniqueId || user.displayId || "Anonymous",
		profilePictureUrl:
			user.profilePictureUrl || user.avatarThumb?.urlList?.[0] || "",
	};
}

/**
 * Normalize chat event.
 * @param {Object} raw - Raw chat event
 * @returns {{user: Object, comment: string, timestamp: number}}
 */
export function normalizeChat(raw) {
	return {
		user: normalizeUser(raw),
		comment: (raw.comment || raw.content || "").toLowerCase().trim(),
		timestamp: Date.now(),
	};
}

/**
 * Normalize like event.
 * @param {Object} raw - Raw like event
 * @returns {{user: Object, likeCount: number, totalLikeCount: number, timestamp: number}}
 */
export function normalizeLike(raw) {
	return {
		user: normalizeUser(raw),
		likeCount: raw.likeCount || raw.count || 0,
		totalLikeCount: raw.totalLikeCount || Number(raw.total) || 0,
		timestamp: Date.now(),
	};
}

/**
 * Normalize share event.
 * @param {Object} raw - Raw social event (filtered for shares only)
 * @returns {{user: Object, timestamp: number}}
 */
export function normalizeShare(raw) {
	return {
		user: normalizeUser(raw),
		timestamp: Date.now(),
	};
}

/**
 * Categorize gift by diamond value.
 * @param {number} value - Diamond count
 * @returns {"small"|"medium"|"large"}
 */
export function categorizeGift(value) {
	if (value >= 100) return "large";
	if (value >= 10) return "medium";
	return "small";
}

/**
 * Normalize gift event — the canonical shape for all consumers.
 * Adds giftId which was previously missing.
 *
 * @param {Object} raw - Raw gift event from tiktok-live-connector
 * @returns {{user: Object, giftId: number, giftName: string, giftValue: number, repeatCount: number, giftType: string, timestamp: number}}
 */
export function normalizeGift(raw) {
	const giftInfo = raw.extendedGiftInfo || raw.gift || raw.giftDetails || {};
	const giftValue =
		raw.diamondCount || giftInfo.diamondCount || raw.giftValue || 1;
	return {
		user: normalizeUser(raw),
		giftId: Number(raw.giftId || giftInfo.id) || 0,
		giftName: raw.giftName || giftInfo.giftName || giftInfo.name || "Unknown Gift",
		giftValue,
		repeatCount: raw.repeatCount || 1,
		giftType: categorizeGift(giftValue),
		timestamp: Date.now(),
	};
}
