export function formatMoney(amount: number): string {
	return new Intl.NumberFormat("en-GB", {
		style: "currency",
		currency: "GBP",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

export function formatTime(totalMinutes: number): string {
	const years = Math.floor(totalMinutes / 525600);
	const months = Math.floor((totalMinutes % 525600) / 43800);
	const weeks = Math.floor((totalMinutes % 43800) / 10080);
	const days = Math.floor((totalMinutes % 10080) / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const minutes = Math.floor(totalMinutes % 60);

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
	return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}
