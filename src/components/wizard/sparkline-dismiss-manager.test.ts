// Tests for the cross-sparkline tooltip dismiss-manager. Pure-function
// tests — Vitest config doesn't include jsdom, so we test the manager
// directly rather than rendering React. The component-level wiring
// (useEffect cleanup runs on unmount) is verified indirectly: as long
// as the manager's register/deregister round-trip is correct, the
// component's useEffect produces correct registry state.

import { describe, expect, it } from "vitest";
import { createDismissManager } from "./sparkline-dismiss-manager";

describe("DismissManager", () => {
	it("starts empty", () => {
		const m = createDismissManager();
		expect(m.size()).toBe(0);
	});

	it("register/deregister round-trip preserves emptiness", () => {
		const m = createDismissManager();
		const cb = () => {};
		m.register(cb);
		expect(m.size()).toBe(1);
		m.deregister(cb);
		expect(m.size()).toBe(0);
	});

	it("multiple registrations are de-duped (Set semantics)", () => {
		const m = createDismissManager();
		const cb = () => {};
		m.register(cb);
		m.register(cb);
		m.register(cb);
		expect(m.size()).toBe(1);
	});

	it("dismissAllExcept calls every registered callback except self", () => {
		const m = createDismissManager();
		let cb1Calls = 0;
		let cb2Calls = 0;
		let cb3Calls = 0;
		const cb1 = () => {
			cb1Calls++;
		};
		const cb2 = () => {
			cb2Calls++;
		};
		const cb3 = () => {
			cb3Calls++;
		};
		m.register(cb1);
		m.register(cb2);
		m.register(cb3);
		m.dismissAllExcept(cb2);
		expect(cb1Calls).toBe(1);
		expect(cb2Calls).toBe(0);
		expect(cb3Calls).toBe(1);
	});

	it("dismissAllExcept with empty registry is a no-op", () => {
		const m = createDismissManager();
		m.dismissAllExcept(() => {});
		expect(m.size()).toBe(0);
	});

	it("deregistering an unknown callback is a no-op", () => {
		const m = createDismissManager();
		const cb1 = () => {};
		const cb2 = () => {};
		m.register(cb1);
		m.deregister(cb2);
		expect(m.size()).toBe(1);
	});

	it("clear empties the registry (test-helper for cleanup verification)", () => {
		const m = createDismissManager();
		m.register(() => {});
		m.register(() => {});
		expect(m.size()).toBe(2);
		m.clear();
		expect(m.size()).toBe(0);
	});

	it("multiple manager instances are independent", () => {
		const m1 = createDismissManager();
		const m2 = createDismissManager();
		m1.register(() => {});
		expect(m1.size()).toBe(1);
		expect(m2.size()).toBe(0);
	});

	it("unmount-equivalent: register N + deregister N returns to empty", () => {
		const m = createDismissManager();
		const callbacks = Array.from({ length: 10 }, () => () => {});
		// Simulate 10 sparklines mounting
		for (const cb of callbacks) m.register(cb);
		expect(m.size()).toBe(10);
		// Simulate all 10 unmounting
		for (const cb of callbacks) m.deregister(cb);
		expect(m.size()).toBe(0);
	});
});

describe("DismissManager tooltip persistence (LLL)", () => {
	it("getTooltip returns null for an unknown id", () => {
		const m = createDismissManager();
		expect(m.getTooltip("nope")).toBe(null);
	});

	it("setTooltip then getTooltip round-trips", () => {
		const m = createDismissManager();
		const tooltip = { x: 50, y: 30, text: "hello" };
		m.setTooltip("a", tooltip);
		expect(m.getTooltip("a")).toEqual(tooltip);
	});

	it("setTooltip(id, null) clears the persisted tooltip", () => {
		const m = createDismissManager();
		m.setTooltip("a", { x: 1, y: 2, text: "x" });
		m.setTooltip("a", null);
		expect(m.getTooltip("a")).toBe(null);
	});

	it("multiple ids stored independently", () => {
		const m = createDismissManager();
		m.setTooltip("a", { x: 1, y: 1, text: "A" });
		m.setTooltip("b", { x: 2, y: 2, text: "B" });
		expect(m.getTooltip("a")?.text).toBe("A");
		expect(m.getTooltip("b")?.text).toBe("B");
	});

	it("clear() empties tooltip storage too (not just callbacks)", () => {
		const m = createDismissManager();
		m.register(() => {});
		m.setTooltip("a", { x: 1, y: 1, text: "x" });
		m.clear();
		expect(m.size()).toBe(0);
		expect(m.getTooltip("a")).toBe(null);
	});
});
