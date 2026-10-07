import { getMomentCandidates } from "@/lib/moments";
import { MomentWall } from "@/ui/MomentWall";

export default function Home() {
  const moments = getMomentCandidates();
  const ready = moments.filter((m) => m.id !== null).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold sm:text-5xl">Rewrite history.</h1>
        <p className="max-w-xl text-muted">
          Pick one of the greatest playoff moments since 1997. Swap in any player from any season. Run it thousands of
          times and see if history changes.
        </p>
        <p className="font-mono text-xs text-muted">
          {ready} of {moments.length} moments ready
        </p>
      </div>
      <MomentWall moments={moments} />
    </div>
  );
}
