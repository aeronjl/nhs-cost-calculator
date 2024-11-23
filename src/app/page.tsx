import NHSSpendingCalculator from "./NHSSpendingCalculator";

export default function Home() {
	return (
		<div className="relative min-h-screen flex flex-col items-center justify-center">
			<div className="z-10">
				<NHSSpendingCalculator />
			</div>
		</div>
	);
}
