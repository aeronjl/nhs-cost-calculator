export const formatMoney = (
	amount: number,
	currency: "GBP" | "USD" = "GBP",
) => {
	const symbol = currency === "GBP" ? "£" : "$";
	return `${symbol}${Math.round(amount).toLocaleString()}`;
};

export function formatTime(totalMinutes: number): string {
	const totalSeconds = totalMinutes * 60;

	const years = Math.floor(totalSeconds / (525600 * 60));
	const months = Math.floor((totalSeconds % (525600 * 60)) / (43800 * 60));
	const weeks = Math.floor((totalSeconds % (43800 * 60)) / (10080 * 60));
	const days = Math.floor((totalSeconds % (10080 * 60)) / (1440 * 60));
	const hours = Math.floor((totalSeconds % (1440 * 60)) / (60 * 60));
	const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
	const seconds = Math.floor(totalSeconds % 60);

	if (years > 0) {
		if (months > 0)
			return `${years} year${years > 1 ? "s" : ""} and ${months} month${months > 1 ? "s" : ""}`;
		return `${years} year${years > 1 ? "s" : ""}`;
	}
	if (months > 0) {
		if (weeks > 0)
			return `${months} month${months > 1 ? "s" : ""} and ${weeks} week${weeks > 1 ? "s" : ""}`;
		return `${months} month${months > 1 ? "s" : ""}`;
	}
	if (weeks > 0) {
		if (days > 0)
			return `${weeks} week${weeks > 1 ? "s" : ""} and ${days} day${days > 1 ? "s" : ""}`;
		return `${weeks} week${weeks > 1 ? "s" : ""}`;
	}
	if (days > 0) {
		if (hours > 0)
			return `${days} day${days > 1 ? "s" : ""} and ${hours} hour${hours > 1 ? "s" : ""}`;
		return `${days} day${days > 1 ? "s" : ""}`;
	}
	if (hours > 0) {
		if (minutes > 0)
			return `${hours} hour${hours > 1 ? "s" : ""} and ${minutes} minute${minutes > 1 ? "s" : ""}`;
		return `${hours} hour${hours > 1 ? "s" : ""}`;
	}
	if (minutes > 0) {
		if (seconds > 0)
			return `${minutes} minute${minutes > 1 ? "s" : ""} and ${seconds} second${seconds > 1 ? "s" : ""}`;
		return `${minutes} minute${minutes > 1 ? "s" : ""}`;
	}
	return `${seconds} second${seconds > 1 ? "s" : ""}`;
}
