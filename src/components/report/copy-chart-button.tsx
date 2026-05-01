"use client";

import { Camera, Check, AlertCircle, Loader2 } from "lucide-react";
import { type RefObject, useRef, useState } from "react";
import { toCanvas } from "html-to-image";
import { cn } from "@/lib/utils";

// Per-chart "Save as PNG" button. Captures the referenced container with
// `html-to-image`, then post-processes the resulting canvas to stamp a
// footer strip with site name + scenario URL so the export carries
// provenance even when shared without context.
//
// Why a per-chart button: the OG card already covers the whole-scenario
// share story. This is for "I want this *one* chart in a slide / Slack
// thread / blog post" — the unit of journalism is often a single fan
// chart or signature, not the entire report.

interface Props {
	targetRef: RefObject<HTMLElement | null>;
	chartTitle: string;
	className?: string;
}

const FOOTER_HEIGHT = 44;
const FOOTER_PADDING_X = 24;
const FOOTER_TEXT_COLOR = "#475569";
const FOOTER_BG = "#f1f5f9";

const slugify = (s: string): string =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);

const stripHash = (url: string): string => {
	const idx = url.indexOf("#");
	return idx === -1 ? url : url.slice(0, idx);
};

const buildFooterText = (chartTitle: string): string => {
	if (typeof window === "undefined") return chartTitle;
	const url = stripHash(window.location.href);
	const date = new Date().toISOString().slice(0, 10);
	return `${chartTitle} · NHSCostCalculator.com · ${date} · ${url}`;
};

const buildFilename = (chartTitle: string): string => {
	const date = new Date().toISOString().slice(0, 10);
	const slug = slugify(chartTitle) || "chart";
	return `${slug}-${date}.png`;
};

const downloadBlob = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const renderFooterStrip = (
	ctx: CanvasRenderingContext2D,
	width: number,
	imageHeight: number,
	text: string,
) => {
	ctx.fillStyle = FOOTER_BG;
	ctx.fillRect(0, imageHeight, width, FOOTER_HEIGHT);
	ctx.fillStyle = FOOTER_TEXT_COLOR;
	ctx.font =
		"500 14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
	ctx.textBaseline = "middle";
	const maxWidth = width - FOOTER_PADDING_X * 2;
	let displayText = text;
	const measure = ctx.measureText(displayText).width;
	if (measure > maxWidth) {
		// Trim from the URL end, prefer to keep the chart-title prefix.
		while (
			displayText.length > 12 &&
			ctx.measureText(`${displayText}…`).width > maxWidth
		) {
			displayText = displayText.slice(0, -1);
		}
		displayText = `${displayText}…`;
	}
	ctx.fillText(displayText, FOOTER_PADDING_X, imageHeight + FOOTER_HEIGHT / 2);
};

const captureChart = async (
	target: HTMLElement,
	chartTitle: string,
): Promise<Blob> => {
	const baseCanvas = await toCanvas(target, {
		pixelRatio: 2,
		cacheBust: true,
		backgroundColor: "#ffffff",
	});
	const finalCanvas = document.createElement("canvas");
	finalCanvas.width = baseCanvas.width;
	finalCanvas.height = baseCanvas.height + FOOTER_HEIGHT * 2;
	const ctx = finalCanvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D context unavailable");
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
	ctx.drawImage(baseCanvas, 0, 0);
	renderFooterStrip(
		ctx,
		finalCanvas.width,
		baseCanvas.height,
		buildFooterText(chartTitle),
	);
	return new Promise<Blob>((resolve, reject) => {
		finalCanvas.toBlob(
			(blob) =>
				blob ? resolve(blob) : reject(new Error("toBlob returned null")),
			"image/png",
		);
	});
};

type ButtonState = "idle" | "saving" | "saved" | "error";

const STATE_RESET_MS = 1800;

export function CopyChartButton({ targetRef, chartTitle, className }: Props) {
	const [state, setState] = useState<ButtonState>("idle");
	const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const onClick = async () => {
		const target = targetRef.current;
		if (!target) return;
		if (resetTimer.current) clearTimeout(resetTimer.current);
		setState("saving");
		try {
			const blob = await captureChart(target, chartTitle);
			downloadBlob(blob, buildFilename(chartTitle));
			setState("saved");
		} catch {
			setState("error");
		}
		resetTimer.current = setTimeout(() => setState("idle"), STATE_RESET_MS);
	};

	const Icon =
		state === "saving"
			? Loader2
			: state === "saved"
				? Check
				: state === "error"
					? AlertCircle
					: Camera;
	const label =
		state === "saving"
			? "Saving"
			: state === "saved"
				? "Saved"
				: state === "error"
					? "Failed"
					: "Save as PNG";

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={state === "saving"}
			aria-label={`Save ${chartTitle} as PNG`}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait",
				state === "saved" && "border-blue-200 bg-blue-50 text-blue-700",
				state === "error" && "border-red-200 bg-red-50 text-red-700",
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				className={cn("size-3", state === "saving" && "animate-spin")}
			/>
			<span>{label}</span>
		</button>
	);
}
