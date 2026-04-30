import { describe, expect, it } from "vitest";
import { pointerToYearIndex } from "./year-focus";

const rect: DOMRect = {
	x: 0,
	y: 0,
	top: 0,
	left: 0,
	right: 320,
	bottom: 120,
	width: 320,
	height: 120,
	toJSON: () => ({}),
} as DOMRect;

describe("pointerToYearIndex", () => {
	it("maps the left edge to year 1", () => {
		expect(
			pointerToYearIndex({
				clientX: 0,
				rect,
				years: 5,
				padX: 0,
				innerWidth: 320,
				viewBoxWidth: 320,
			}),
		).toBe(1);
	});

	it("maps the right edge to year N", () => {
		expect(
			pointerToYearIndex({
				clientX: 320,
				rect,
				years: 5,
				padX: 0,
				innerWidth: 320,
				viewBoxWidth: 320,
			}),
		).toBe(5);
	});

	it("snaps to the nearest year in the middle", () => {
		// 320px / 4 segments = 80px per year. clientX=160 → ratio=0.5 → year 3.
		expect(
			pointerToYearIndex({
				clientX: 160,
				rect,
				years: 5,
				padX: 0,
				innerWidth: 320,
				viewBoxWidth: 320,
			}),
		).toBe(3);
	});

	it("respects horizontal padding", () => {
		// padX=12 in a 320 viewBox. clientX=12 should map to ratio=0 → year 1.
		expect(
			pointerToYearIndex({
				clientX: 12,
				rect,
				years: 5,
				padX: 12,
				innerWidth: 296,
				viewBoxWidth: 320,
			}),
		).toBe(1);
		// clientX=308 should map to ratio=1 → year 5.
		expect(
			pointerToYearIndex({
				clientX: 308,
				rect,
				years: 5,
				padX: 12,
				innerWidth: 296,
				viewBoxWidth: 320,
			}),
		).toBe(5);
	});

	it("clamps below year 1 to year 1", () => {
		expect(
			pointerToYearIndex({
				clientX: -100,
				rect,
				years: 5,
				padX: 0,
				innerWidth: 320,
				viewBoxWidth: 320,
			}),
		).toBe(1);
	});

	it("clamps above year N to year N", () => {
		expect(
			pointerToYearIndex({
				clientX: 9999,
				rect,
				years: 5,
				padX: 0,
				innerWidth: 320,
				viewBoxWidth: 320,
			}),
		).toBe(5);
	});

	it("returns null when years is zero", () => {
		expect(
			pointerToYearIndex({
				clientX: 100,
				rect,
				years: 0,
				padX: 0,
				innerWidth: 320,
				viewBoxWidth: 320,
			}),
		).toBeNull();
	});

	it("returns null when the rect has no width", () => {
		const zeroRect = { ...rect, width: 0 } as DOMRect;
		expect(
			pointerToYearIndex({
				clientX: 100,
				rect: zeroRect,
				years: 5,
				padX: 0,
				innerWidth: 320,
				viewBoxWidth: 320,
			}),
		).toBeNull();
	});
});
