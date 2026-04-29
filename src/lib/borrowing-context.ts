export type BorrowingFiscalEvent = "obr-scored" | "unscored" | "emergency";
export type BorrowingMonetaryBackstop = "none" | "qe-backstopped";
export type BorrowingDuration = "temporary" | "persistent";

export interface BorrowingScenarioContext {
	fiscalEvent?: BorrowingFiscalEvent;
	monetaryBackstop?: BorrowingMonetaryBackstop;
	duration?: BorrowingDuration;
}

export const BORROWING_FISCAL_EVENT_OPTIONS: readonly {
	id: BorrowingFiscalEvent;
	label: string;
}[] = [
	{ id: "obr-scored", label: "OBR-scored" },
	{ id: "unscored", label: "Unscored" },
	{ id: "emergency", label: "Emergency" },
];

export const BORROWING_MONETARY_BACKSTOP_OPTIONS: readonly {
	id: BorrowingMonetaryBackstop;
	label: string;
}[] = [
	{ id: "none", label: "No QE/backstop" },
	{ id: "qe-backstopped", label: "QE/backstopped" },
];

export const BORROWING_DURATION_OPTIONS: readonly {
	id: BorrowingDuration;
	label: string;
}[] = [
	{ id: "temporary", label: "Temporary" },
	{ id: "persistent", label: "Persistent" },
];

const FISCAL_EVENT_CODE: Record<BorrowingFiscalEvent, string> = {
	"obr-scored": "o",
	unscored: "u",
	emergency: "e",
};

const MONETARY_BACKSTOP_CODE: Record<BorrowingMonetaryBackstop, string> = {
	none: "n",
	"qe-backstopped": "q",
};

const DURATION_CODE: Record<BorrowingDuration, string> = {
	temporary: "t",
	persistent: "p",
};

const CODE_FISCAL_EVENT = Object.fromEntries(
	Object.entries(FISCAL_EVENT_CODE).map(([key, value]) => [value, key]),
) as Record<string, BorrowingFiscalEvent>;

const CODE_MONETARY_BACKSTOP = Object.fromEntries(
	Object.entries(MONETARY_BACKSTOP_CODE).map(([key, value]) => [value, key]),
) as Record<string, BorrowingMonetaryBackstop>;

const CODE_DURATION = Object.fromEntries(
	Object.entries(DURATION_CODE).map(([key, value]) => [value, key]),
) as Record<string, BorrowingDuration>;

const fiscalEventLabel = (id: BorrowingFiscalEvent): string =>
	BORROWING_FISCAL_EVENT_OPTIONS.find((option) => option.id === id)?.label ?? id;

const monetaryBackstopLabel = (id: BorrowingMonetaryBackstop): string =>
	BORROWING_MONETARY_BACKSTOP_OPTIONS.find((option) => option.id === id)
		?.label ?? id;

const durationLabel = (id: BorrowingDuration): string =>
	BORROWING_DURATION_OPTIONS.find((option) => option.id === id)?.label ?? id;

export const isBorrowingContextEmpty = (
	context: BorrowingScenarioContext | undefined,
): boolean =>
	!context ||
	(context.fiscalEvent === undefined &&
		context.monetaryBackstop === undefined &&
		context.duration === undefined);

export const serializeBorrowingContext = (
	context: BorrowingScenarioContext | undefined,
): string => {
	if (isBorrowingContextEmpty(context)) return "";
	const parts: string[] = [];
	if (context?.fiscalEvent) parts.push(FISCAL_EVENT_CODE[context.fiscalEvent]);
	if (context?.monetaryBackstop) {
		parts.push(MONETARY_BACKSTOP_CODE[context.monetaryBackstop]);
	}
	if (context?.duration) parts.push(DURATION_CODE[context.duration]);
	return parts.join("");
};

export const deserializeBorrowingContext = (
	encoded: string | undefined,
): BorrowingScenarioContext | undefined => {
	if (!encoded) return undefined;
	const context: BorrowingScenarioContext = {};
	for (const code of encoded) {
		if (CODE_FISCAL_EVENT[code]) {
			context.fiscalEvent = CODE_FISCAL_EVENT[code];
		} else if (CODE_MONETARY_BACKSTOP[code]) {
			context.monetaryBackstop = CODE_MONETARY_BACKSTOP[code];
		} else if (CODE_DURATION[code]) {
			context.duration = CODE_DURATION[code];
		}
	}
	return isBorrowingContextEmpty(context) ? undefined : context;
};

export const describeBorrowingContext = (
	context: BorrowingScenarioContext | undefined,
): string => {
	if (isBorrowingContextEmpty(context)) return "Inferred from market features";
	const parts: string[] = [];
	if (context?.fiscalEvent) parts.push(fiscalEventLabel(context.fiscalEvent));
	if (context?.monetaryBackstop) {
		parts.push(monetaryBackstopLabel(context.monetaryBackstop));
	}
	if (context?.duration) parts.push(durationLabel(context.duration));
	return parts.join(" / ");
};
