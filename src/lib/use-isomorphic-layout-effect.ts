"use client";

import { useEffect, useLayoutEffect } from "react";

// SSR-safe layout-effect hook.
//   - Client: useLayoutEffect — synchronous, runs before paint. Right
//     hook for DOM measurements (getBBox, getBoundingClientRect) that
//     need to size siblings before the user sees them.
//   - Server: useEffect — no-op at SSR time. Avoids React's warning
//     about useLayoutEffect being a no-op on the server while still
//     keeping the hook callable in components rendered server-side.
//
// Standard pattern; promote to a shared file once a second component
// needs it (originally inlined in era-sparkline.tsx).
export const useIsomorphicLayoutEffect =
	typeof window !== "undefined" ? useLayoutEffect : useEffect;
