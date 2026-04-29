// Behavioural elasticity per lever: closes the gap between HMRC's static
// "ready-reckoner" figures and OBR's dynamic-scored figures.
//
// The static figure (gbpPerUnit × magnitude) assumes no behavioural
// response. In reality, a higher tax rate causes some response — workers
// reduce hours, owner-managers shift income to dividends, capital gains
// realisations get deferred or moved offshore, profits shift between
// jurisdictions. OBR scores these responses; this calculator's static figure
// doesn't.
//
// The simplest credible model: a per-lever elasticity coefficient. At a 1pp
// move it's a small haircut; at 5pp+ moves it bites substantially. Linear
// approximation is fine in this range — economists fit non-linear models but
// the differences are small for everyday policy magnitudes.

export interface Elasticity {
	// Fractional yield reduction per absolute unit of magnitude. So 0.05 means
	// "at +1pp the haircut is 5%; at +5pp it's 25%; at +10pp it's 50%."
	// For non-pp levers (yr, k, p-per-litre, bn) the coefficient is interpreted
	// in those units.
	coefficient: number;
	// Human-readable explanation. Cite the OBR / IFS / HMRC source where the
	// coefficient came from, plus a note on why the lever has this elasticity
	// (avoidance route, behavioural channel).
	note: string;
	source?: { url: string; label: string };
}

// Apply the elasticity to a static £ delta. Returns the dynamic-adjusted
// delta. Capped at 95% haircut so extreme magnitudes don't flip the sign of
// the yield (the linear model breaks down at that scale anyway; methodology
// caveats name this on the lever).
export const dynamicAdjust = (
	staticDelta: number,
	elasticity: Elasticity | undefined,
	magnitude: number,
): number => {
	if (!elasticity) return staticDelta;
	const haircut = Math.min(0.95, elasticity.coefficient * Math.abs(magnitude));
	return staticDelta * (1 - haircut);
};

// Useful for the UI: the £ haircut applied to the static figure.
export const haircutAmount = (
	staticDelta: number,
	elasticity: Elasticity | undefined,
	magnitude: number,
): number => staticDelta - dynamicAdjust(staticDelta, elasticity, magnitude);

// Useful for the UI: the haircut as a fraction of the static (0..1).
// Returns 0 when no elasticity is set.
export const haircutFraction = (
	elasticity: Elasticity | undefined,
	magnitude: number,
): number => {
	if (!elasticity) return 0;
	return Math.min(0.95, elasticity.coefficient * Math.abs(magnitude));
};
