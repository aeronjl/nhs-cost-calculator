// A `Methodology` is what we attach to any figure on the page that the user
// might want to interrogate. It goes beyond a source URL: it names what the
// figure measures, lists alternative measures (so users see the framing
// choice), gives a plausible range where one applies, and surfaces the
// honest caveats most calculators bury.
//
// Every `MethodologyPopover` in the UI consumes one of these objects.

export interface MethodologyAlternative {
	label: string;
	value?: number;
	note: string;
}

export interface MethodologyRange {
	low: number;
	high: number;
	note: string;
}

export interface Methodology {
	source: { url: string; label: string };
	asOf: string; // YYYY-MM
	measure: string; // What this number actually measures, in plain English.
	alternatives?: MethodologyAlternative[];
	range?: MethodologyRange;
	caveat?: string;
}
