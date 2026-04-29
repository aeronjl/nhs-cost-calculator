// Manager for cross-sparkline tooltip dismissal. Each live EraSparkline
// instance registers its dismiss callback on mount, deregisters on
// unmount. When one sparkline shows a tooltip, it calls
// `dismissAllExcept(self)` to clear other charts.
//
// Lives in its own .ts file (rather than alongside the component .tsx)
// so the manager is testable without dragging JSX through Vite's
// import-analysis pipeline. Pure-function tests only — Vitest config
// doesn't include jsdom.
//
// Subtree isolation: wrap children in `<DismissManagerContext.Provider
// value={createDismissManager()}>` to give them their own dismissal
// scope. Modal dialogs, comparison views, etc. that shouldn't
// coordinate with the page underneath should use this. Default context
// value is the module-level singleton, so unwrapped use preserves the
// "one tooltip per page" behaviour.

import { createContext, useContext } from "react";

// Shape of a sparkline's persisted tooltip state. Identical to the
// ActiveTooltip type inside EraSparkline — duplicated here to avoid the
// component file (.tsx) needing to be the source of truth (the manager
// is .ts so we can test it without dragging JSX through the parser).
export interface PersistedTooltip {
	x: number;
	y: number;
	text: string;
}

export interface DismissManager {
	register: (cb: () => void) => void;
	deregister: (cb: () => void) => void;
	dismissAllExcept: (self: () => void) => void;
	// Cross-mount tooltip persistence: sparklines with a stable `id` save
	// their visible tooltip here on show, and restore on remount. Lets a
	// user mid-tooltip-inspection navigate away and return without losing
	// the tooltip. Without an id, sparklines behave per-mount (no
	// persistence) — which is the right default for ad-hoc charts.
	getTooltip: (id: string) => PersistedTooltip | null;
	setTooltip: (id: string, tooltip: PersistedTooltip | null) => void;
	size: () => number;
	clear: () => void;
}

export const createDismissManager = (): DismissManager => {
	const callbacks = new Set<() => void>();
	const tooltips = new Map<string, PersistedTooltip>();
	return {
		register: (cb) => {
			callbacks.add(cb);
		},
		deregister: (cb) => {
			callbacks.delete(cb);
		},
		dismissAllExcept: (self) => {
			for (const cb of callbacks) {
				if (cb !== self) cb();
			}
		},
		getTooltip: (id) => tooltips.get(id) ?? null,
		setTooltip: (id, tooltip) => {
			if (tooltip === null) tooltips.delete(id);
			else tooltips.set(id, tooltip);
		},
		size: () => callbacks.size,
		clear: () => {
			callbacks.clear();
			tooltips.clear();
		},
	};
};

// Singleton used as the default DismissManagerContext value. Exported
// so tests can verify it has the expected interface — though the bulk
// of testing is done against fresh manager instances via
// createDismissManager() to avoid coupling tests to module-load order.
export const tooltipDismissManager = createDismissManager();

// Context for cross-sparkline dismiss coordination. Default value is
// the module singleton — sparklines rendered without a Provider all
// coordinate via the same registry (the original behaviour). Wrap in
// `<DismissManagerContext.Provider value={createDismissManager()}>` to
// scope coordination to a subtree.
export const DismissManagerContext = createContext<DismissManager>(
	tooltipDismissManager,
);

export const useDismissManager = (): DismissManager =>
	useContext(DismissManagerContext);
