import NHSSpendingCalculator from "./NHSSpendingCalculator";
import PodcastAdvertisment from "./PodcastAdvertisment";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <NHSSpendingCalculator />
    </div>
  );
}
