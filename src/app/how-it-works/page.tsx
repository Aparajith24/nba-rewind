import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { clutchUsage, hotHandBoost } from "@/engine/profile";
import { TUNING } from "@/engine/tuning";
import { getHomeData, searchItems } from "@/lib/home";
import { ExpandAll, OpenOnHash } from "@/ui/Collapsibles";
import { TopNav } from "@/ui/home/TopNav";

/**
 * How a swap works, in plain language, with the formulas and every adjustable setting.
 * All numbers come straight from the engine (src/engine/tuning.ts and its functions),
 * so this page can't drift out of date when the simulation is tuned.
 */

export const metadata: Metadata = {
  title: "How it works · NBA Rewind",
  description: "How a swap works: where moments start, how players are rated, how each possession plays out, and every setting the simulation uses.",
};

const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
const range = ([a, b]: readonly [number, number], unit = "s") => `${a}–${b}${unit}`;

/** A collapsible section: title and a one-line summary until it's opened. */
function Section({ id, title, summary, open = false, children }: { id: string; title: string; summary: string; open?: boolean; children: ReactNode }) {
  return (
    <details id={id} data-section open={open} className="group scroll-mt-24 rounded-2xl border border-border bg-surface/40">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg font-semibold tracking-tight sm:text-xl">{title}</span>
          <span className="text-sm text-muted">{summary}</span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted transition group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <div className="flex max-w-3xl flex-col gap-4 px-5 pb-6 leading-relaxed text-foreground/85 sm:px-6">{children}</div>
    </details>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <pre className="overflow-x-auto rounded-xl border border-border bg-surface px-5 py-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground">{children}</pre>;
}

function Example({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border px-5 py-4 text-sm text-muted">{children}</div>;
}

type Param = { name: string; value: string; does: string; start?: boolean };

function ParamTable({ rows }: { rows: Param[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Setting</th>
            <th className="px-4 py-3 font-medium">Value</th>
            <th className="px-4 py-3 font-medium">What it does</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border align-top">
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                {r.value}
                {r.start ? <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] tracking-wider text-muted">STARTING VALUE</span> : null}
              </td>
              <td className="px-4 py-3 text-foreground/80">{r.does}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SECTIONS = [
  ["start", "Where a moment starts"],
  ["real", "No swap: what really happened"],
  ["player", "Your player's playoff version"],
  ["surprise", "The surprise element"],
  ["possession", "How each possession plays out"],
  ["late", "Late-game decisions"],
  ["results", "How results are counted"],
  ["settings", "Every setting"],
] as const;

export default function HowItWorksPage() {
  const { cards } = getHomeData();
  const T = TUNING;
  const h = T.hotHand;
  const f = T.fouling;

  // Worked examples, computed with the engine's own numbers and functions.
  const trust = (minutes: number) => minutes / (minutes + T.playoffTrustMinutes);
  const hotSmall = hotHandBoost({ fgm: 2, fga: 2, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 4 }, 0.45);
  const hotBig = hotHandBoost({ fgm: 8, fga: 10, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 16 }, 0.45);
  const hotCold = hotHandBoost({ fgm: 1, fga: 5, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 2 }, 0.45);
  const swing = (shots: number) => (T.surpriseMaxPoints * T.surpriseHalfShots) / (T.surpriseHalfShots + shots);
  const zoneBlend = (made: number, att: number, prior: number) => (made + prior * T.zoneTrustAttempts) / (att + T.zoneTrustAttempts);
  const lebronClutch = clutchUsage({ clutchUsage: 0.43, clutchMinutes: 126, offensiveLift: 15.4, liftSource: "on/off" }, 0.31);
  const pm = T.playmaking;
  // LeBron 2015-16 (+15.4 per 100) out for a player whose team scored 2 per 100 worse with him (−2), league ~105 per 100.
  const change = (-2 - 15.4) / 105;
  const playmaking = (assisted: number) => Math.min(pm.clamp[1], Math.max(pm.clamp[0], 1 + pm.strength * change * (assisted / pm.typicalAssistedShare)));

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav items={searchItems(cards)} active="how" />
      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-3 pb-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">How it works</h1>
          <p className="max-w-3xl text-lg text-foreground/80">
            What happens when you swap a player into a moment: how we set the scene, how we turn a player-season into a playoff version of him, how each
            possession plays out, and every number the simulation uses. No code, just the basketball and the arithmetic.
          </p>
          <OpenOnHash />
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <nav className="flex flex-wrap gap-2">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:border-foreground/50 hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
          <ExpandAll />
          </div>
        </div>

        <Section id="start" title="Where a moment starts" summary="The last dead ball before the famous play, rebuilt from the real play-by-play." open>
          <p>
            Every moment starts at <strong>the last dead ball before the famous play</strong>: after the free throws, the timeout, or the substitutions,
            not at the instant of the shot. That way the whole sequence plays out, so your swap can change who shoots, who rebounds, and who&apos;s open.
          </p>
          <Example>
            Ray Allen&apos;s corner three went in with 5.2 seconds left, but the moment starts at 19.4 seconds: Heat down 3, Heat ball, right after
            Kawhi Leonard&apos;s free throws. LeBron&apos;s miss and Chris Bosh&apos;s offensive rebound are part of the moment.
          </Example>
          <p>
            The score, clock, who has the ball, and the ten players on the floor all come from the real play-by-play. The play-by-play never says who
            was on the floor, only who checked in and out, so we work it out: a player started a quarter if he shows up in it before he ever checks in.
            If it&apos;s ever ambiguous, we stop and check instead of guessing.
          </p>
        </Section>

        <Section id="real" title="No swap: what really happened" summary="No swap means you watch the real ending, play by play.">
          <p>
            History can only change if you change something. With no swap, you watch <strong>the real ending</strong>, play by play from the real
            play-by-play: every shot, rebound, foul, substitution, and overtime, ending on the real final score.
          </p>
        </Section>

        <Section id="player" title="Your player's playoff version" summary="His real playoff stats, blended with a projection from his regular season.">
          <p>
            You pick a player and a season. Every moment is a playoff moment, so the sim needs <strong>his playoff version of that season</strong>.
            Some seasons have a full playoff run behind them, some have one game, some have none (his team missed, or he was hurt). We blend what he
            actually did in the playoffs with a projection from his regular season, trusting each by how much data backs it.
          </p>
          <Formula>
            {`playoff version = trust × his real playoff stats  +  (1 − trust) × his projection

trust = his playoff minutes ÷ (his playoff minutes + ${T.playoffTrustMinutes})`}
          </Formula>
          <Example>
            A full playoff run of 700 minutes: trust = {pct(trust(700))}, so it&apos;s mostly what he really did. One game of 40 minutes: trust ={" "}
            {pct(trust(40))}, so mostly his regular season. No playoff games: trust = 0%, a pure projection. What if Jordan&apos;s Bulls had beaten the
            Pistons?
          </Example>

          <h3 className="pt-2 text-lg font-semibold text-foreground">The projection from his regular season</h3>
          <Formula>
            {`projection = his regular season
           × how the league changed in that season's playoffs
           × his personal step-up from his other playoff runs`}
          </Formula>
          <p>
            <strong>How the league changes:</strong> we compare the <em>same playoff teams</em> in their own regular season against their playoffs.
            Over 30 seasons, they scored fewer points per game in the playoffs every single season, about 4.3% fewer: roughly 2.4% from a slower pace
            and 1.7% from tighter defense.
          </p>
          <p>
            <strong>His personal step-up:</strong> some players rise in the playoffs and some fade. We measure how much more (or less) than the league
            each player changed in his other playoff runs, with seasons closer to the one you picked counting more. It&apos;s trusted by how many
            playoff minutes back it up (half-trusted at {T.stepUpTrustMinutes} minutes), and anything beyond {T.stepUpClamp[0]}× to {T.stepUpClamp[1]}×
            is treated as noise.
          </p>
          <Formula>
            {`his step-up = (his playoff number ÷ his regular-season number) ÷ (the league's same change)

1.00 = he changed exactly as much as everyone else
1.10 = he stepped up 10% beyond the league`}
          </Formula>
          <Example>
            Jalen Brunson in 2023–24 took 35.2% of the Knicks&apos; plays in the playoffs vs. 31.1% in the regular season: a 1.13 step-up in usage.
            Ray Allen in 2012–13 shot about the same in the playoffs while the league got 3% worse: a 1.03 step-up in shooting.
          </Example>

          <h3 className="pt-2 text-lg font-semibold text-foreground">Shooting by zone</h3>
          <p>
            Every shot comes from one of seven zones (at the rim, in the paint, mid-range, left corner three, right corner three, above-the-break
            three, backcourt heave). A player&apos;s make rate in each zone leans on his actual shots there, and on a broader average when he has few. For his
            regular season, that average is what the season&apos;s <em>fringe players</em> (under 500 minutes) did, not the league average:
            barely playing is itself evidence of a weaker player. His playoff numbers lean on his projection from the regular season.
          </p>
          <Formula>
            {`zone make % = (his makes + ${T.zoneTrustAttempts} × the broader average) ÷ (his attempts + ${T.zoneTrustAttempts})`}
          </Formula>
          <Example>
            A player who went 2 for 2 from the left corner, where the broader average is 38%, is treated as a {pct(zoneBlend(2, 2, 0.38))} shooter
            there, not 100%. At 40 for 100 he&apos;s {pct(zoneBlend(40, 100, 0.38))}: his own numbers dominate.
          </Example>
        </Section>

        <Section id="surprise" title="The surprise element" summary="A small random shooting swing, bigger for players with little playoff history.">
          <p>
            Big moments aren&apos;t that predictable. In each simulated timeline, every player gets a small random swing on his shooting, bigger when
            he has little playoff history behind him, and capped at ±{T.surpriseMaxPoints * 100} percentage points. A player with a small hot sample can
            show up hot in some timelines without taking over.
          </p>
          <Formula>{`typical swing = ${T.surpriseMaxPoints * 100} points × ${T.surpriseHalfShots} ÷ (${T.surpriseHalfShots} + his playoff shots)`}</Formula>
          <Example>
            No playoff shots: swings up to about ±{(swing(0) * 100).toFixed(1)} points. 40 playoff shots: about ±{(swing(40) * 100).toFixed(1)}. 300
            playoff shots: about ±{(swing(300) * 100).toFixed(1)}.
          </Example>
        </Section>

        <Section id="possession" title="How each possession plays out" summary="Seven steps, from the foul decision to the rebound.">
          <p>The sim plays possession by possession until the game is decided, overtime included. Each possession goes like this:</p>
          <ol className="flex list-decimal flex-col gap-3 pl-6">
            <li>
              <strong>The defense decides whether to foul</strong> (see late-game decisions below).
            </li>
            <li>
              <strong>Getting into the offense.</strong> Bringing it up from the backcourt takes {range(T.time.bringUpBackcourt)}; a trailing team
              late in the game pushes it in {range(T.time.urgentBringUp)}. After a timeout late in the game, the ball is advanced and the inbound takes{" "}
              {range(T.time.inboundFrontcourt)}. With under {T.heaveSeconds}s left and no time to cross half court, it&apos;s a heave.
            </li>
            <li>
              <strong>Who shoots.</strong> Stars get the ball, and a player who&apos;s hot <em>that game</em> gets it a bit more:
              <Formula>
                {`his chance to take the shot  ∝  his usage × his hot hand

hot hand = 1 + ${h.strength} × (his shooting this game − his usual shooting) × (shots ÷ (shots + ${h.halfShots}))
           kept between ${h.minBoost}× and ${h.maxBoost}×`}
              </Formula>
              <strong>In crunch time, stars take over.</strong> In the last {T.clutch.seconds / 60} minutes of the 4th quarter or overtime with the
              score within {T.clutch.margin} (the NBA&apos;s &quot;clutch&quot; definition), &quot;his usage&quot; becomes his real clutch usage that
              season, trusted by his clutch minutes, and his regular-season usage when there isn&apos;t enough:
              <Formula>
                {`crunch-time usage = trust × his clutch usage + (1 − trust) × his regular-season usage

trust = his clutch minutes ÷ (his clutch minutes + ${T.clutch.trustMinutes})`}
              </Formula>
              <Example>
                For a 45% shooter: 2 for 2 tonight → ×{hotSmall.toFixed(2)}. 8 for 10 → ×{hotBig.toFixed(2)} (more shots, more trust). 1 for 5 → ×
                {hotCold.toFixed(2)}. The player you swap in comes in neutral (×1.00), since he didn&apos;t play in that game. Research on whether
                shooters actually stay hot is mixed, so the hot hand mostly decides who gets the ball; it only nudges whether it goes in (by{" "}
                {h.makeBump} × the boost above 1).
              </Example>
              <strong>The last shot goes to the top option.</strong> In the final {T.lastShot.seconds}s of the 4th quarter or overtime with the score
              within {T.lastShot.margin}, the share is sharpened so the best scorer takes most of the looks:
              <Formula>{`his chance to take the last shot  ∝  his usage^${T.lastShot.usagePower} × his hot hand`}</Formula>
              <Example>
                Usages of 33%, 20%, 18%, 16% and 13% normally give the top option a third of the shots. Squared, he takes about half, and the 13%
                player drops to 8%.
              </Example>
              <Example>
                LeBron James in 2015–16 used 31% of the Cavs&apos; plays normally and 43% in 126 clutch minutes, so in crunch time the sim gives him{" "}
                {pct(lebronClutch, 1)}. Tristan Thompson fell from his usual share to 9% in the clutch.
              </Example>
            </li>
            <li>
              <strong>From where.</strong> His own mix of shots by zone. When only a three will do (down 3 with one possession left, or down 4+ at the
              very end), only threes, and the ball goes more to players who take threes.
            </li>
            <li>
              <strong>Does it go in.</strong>
              <Formula>
                {`make chance = his zone make % × the defense on the floor (+ hot-hand nudge + surprise swing)

defense on the floor = (${T.matchupWeight} × his own defender's points allowed per 100
                        + ${1 - T.matchupWeight} × the other four's average) ÷ the league's,
                        kept between ${T.defenseClamp[0]} and ${T.defenseClamp[1]}`}
              </Formula>
              His own defender is matched by listed position: each five is sorted from guards to centers and paired off in that order. The player you
              swap in takes over the role, and the matchup, of the man he replaced.
              Good defenses push the make chance down by up to {pct(1 - T.defenseClamp[0])}; bad ones push it up by up to{" "}
              {pct(T.defenseClamp[1] - 1)}.
              <p className="pt-3">
                <strong>Playmaking.</strong> Take a creator off the floor and two things happen: the team scores less, and everyone else&apos;s shots
                get harder because the defense isn&apos;t focused on him anymore. Every player-season has an <em>offensive lift</em>: how many more
                points per 100 possessions his team scored with him on the floor than off it (the NBA&apos;s on/off splits, from 2007–08; estimated
                from his own usage, efficiency and passing before that). With no swap, nothing changes.
              </p>
              <Formula>
                {`change = (lift of the player coming in − lift of the player going out) ÷ the league's points per 100

teammate's make chance × (1 + ${pm.strength} × change × (his share of assisted makes ÷ ${pm.typicalAssistedShare}))
                         kept between ${pm.clamp[0]}× and ${pm.clamp[1]}×`}
              </Formula>
              <Example>
                Swap out LeBron James 2015–16 (the Cavs scored 114.0 per 100 with him, 98.6 without: +15.4) for a player at −2. A spot-up shooter
                with 90% of his makes assisted shoots ×{playmaking(0.9).toFixed(2)}; a self-creator at 40% assisted shoots ×
                {playmaking(0.4).toFixed(2)}. The player you swap in keeps his own shooting.
              </Example>
            </li>
            <li>
              <strong>Fouls and turnovers.</strong> A shot draws a foul based on how often he gets to the line; threes draw fouls far less (×
              {T.threeFoulFactor}). Fouled on a make is an and-one. Turnovers happen at the team&apos;s usual rate, and {pct(T.stealShare)} of them are
              steals.
            </li>
            <li>
              <strong>Rebounds.</strong>
              <Formula>{`offense gets the rebound = their five's offensive rebounding ÷ (their five's offensive + the defense's defensive rebounding)`}</Formula>
              After an offensive rebound, the score decides: if they need a three, they kick it out; otherwise a big man under the rim puts it back
              (a player is a &quot;big&quot; if at least {pct(T.bigRestrictedAreaShare)} of his shots come at the rim), and anyone else resets the
              offense. On a missed last free throw, the offense gets it back {pct(T.freeThrowOrebChance)} of the time.
            </li>
          </ol>
        </Section>

        <Section id="late" title="Late-game decisions" summary="Fouling, clock management, timeouts, and the rules of the era.">
          <p>
            &quot;Late&quot; means the last {T.lateGameSeconds / 60} minutes of the 4th quarter or overtime. Fouling follows what NBA teams actually do:
          </p>
          <ParamTable
            rows={[
              { name: "Up 3, more than 10s left", value: "Never foul", does: "Play defense. Fouling early lets them make both, foul back, and get another shot at a tying three." },
              { name: `Up 3, ${f.upThreeLateWindow}–${f.upThreeMidWindow}s left`, value: pct(f.upThreeMidChance), does: "Sometimes foul to take away the tying three." },
              { name: `Up 3, ${f.upThreeLateWindow}s or less`, value: pct(f.upThreeLateChance), does: "Often foul. Overall this lands near the ~34% NBA teams foul up 3 in the final 10 seconds." },
              { name: "Trailing, other team has the ball", value: "Foul", does: `When the game clock is under the shot clock (they can just hold it) and the deficit is still reachable, within the last ${f.trailingWindow}s.` },
              { name: "Up big", value: "Defend", does: "No reason to foul." },
            ]}
          />
          <p>
            <strong>Clock management:</strong> a trailing team works {range(T.time.trailingWork)} after crossing half court and shoots leaving{" "}
            {range(T.time.trailingReserve)} for a rebound or a foul. A tied team holds for the last shot, shooting with {range(T.time.lastShotLeft)}{" "}
            left. A leading team runs the shot clock down to {range(T.time.leadingShotClockLeft)}, and dribbles it out when the game clock is shorter
            than the shot clock.
          </p>
          <p>
            <strong>Timeouts</strong> start from each team&apos;s real count at that moment, by that era&apos;s rules. A trailing or tied team uses one
            late to advance the ball past half court. Each overtime adds 2.
          </p>
          <p>
            <strong>Rules of the era</strong> come with each season: for example, the shot clock resets to 14 after an offensive rebound from 2018–19
            on, and in 1996–97 the three-point line was 22 feet all the way around.
          </p>
        </Section>

        <Section id="results" title="How results are counted" summary="History changed means the real loser wins, compared against the real lineup.">
          <p>
            Every timeline plays to the end of the game, up to {T.maxOvertimes} overtimes. <strong>History changed means the team that really lost wins.</strong>{" "}
            For Ray Allen&apos;s moment, any Spurs win changes history; any Heat win keeps it.
          </p>
          <p>
            Some real endings were long shots, so luck alone can change history in a lot of timelines. That&apos;s why every run also simulates{" "}
            <strong>the real lineup</strong> with the same random draws, and shows the difference: that difference is what your swap did.
          </p>
          <p>
            Every timeline is seeded: the same moment, the same swap and the same seed always play out exactly the same way.
          </p>
        </Section>

        <Section id="settings" title="Every setting" summary="Every adjustable number, explained.">
          <p>
            Every adjustable number the simulation uses. The ones marked <span className="rounded border border-border px-1.5 py-0.5 text-[10px] tracking-wider text-muted">STARTING VALUE</span>{" "}
            are first guesses that will be tuned by checking no-swap simulations against how real games ended.
          </p>
          <ParamTable
            rows={[
              { name: "Playoff trust", value: `${T.playoffTrustMinutes} min`, does: "Playoff minutes at which his real playoff stats and his projection count equally.", start: true },
              { name: "Zone trust", value: `${T.zoneTrustAttempts} shots`, does: "Shots from a zone at which his own make rate and the broader average count equally.", start: true },
              { name: "Step-up trust", value: `${T.stepUpTrustMinutes} min`, does: "Playoff minutes at which his personal step-up is half-trusted.", start: true },
              { name: "Step-up limits", value: `${T.stepUpClamp[0]}×–${T.stepUpClamp[1]}×`, does: "Step-ups outside this range are treated as noise.", start: true },
              { name: "Surprise swing", value: `±${T.surpriseMaxPoints * 100} pts`, does: "Largest random shooting swing a player can get in a timeline." },
              { name: "Surprise half-point", value: `${T.surpriseHalfShots} shots`, does: "Playoff shots at which the swing is half its largest.", start: true },
              { name: "Hot-hand strength", value: `${h.strength}`, does: "How much shooting above or below his usual tonight shifts his share of shots.", start: true },
              { name: "Hot-hand half-point", value: `${h.halfShots} shots`, does: "Shots tonight at which the hot-hand signal is half-trusted.", start: true },
              { name: "Hot-hand limits", value: `${h.minBoost}×–${h.maxBoost}×`, does: "A nudge, so stars still lead.", start: true },
              { name: "Hot-hand make nudge", value: `${h.makeBump}`, does: "How much the hot hand shifts whether it goes in.", start: true },
              { name: "Crunch time", value: `${T.clutch.seconds / 60} min, within ${T.clutch.margin}`, does: "When clutch usage takes over (the NBA's clutch definition)." },
              { name: "Clutch trust", value: `${T.clutch.trustMinutes} min`, does: "Clutch minutes at which his clutch usage and his regular-season usage count equally.", start: true },
              { name: "Playmaking strength", value: `${pm.strength}`, does: "How strongly a change in the lineup's offensive lift moves teammates' shooting.", start: true },
              { name: "Typical assisted share", value: pct(pm.typicalAssistedShare), does: "Players assisted more often than this rely more on creators.", start: true },
              { name: "Playmaking limits", value: `${pm.clamp[0]}×–${pm.clamp[1]}×`, does: "Most a teammate's shooting can move from a swap.", start: true },
              { name: "Matchup weight", value: pct(T.matchupWeight), does: "Share of the defense that comes from the shooter's own defender.", start: true },
              { name: "Last-shot takeover", value: `${T.lastShot.seconds}s, within ${T.lastShot.margin}`, does: `When shot share follows usage^${T.lastShot.usagePower}, so the top option takes over.`, start: true },
              { name: "Defense limits", value: `${T.defenseClamp[0]}–${T.defenseClamp[1]}`, does: "Most the defense on the floor can move make chances.", start: true },
              { name: "Late game", value: `${T.lateGameSeconds}s`, does: "When late-game rules (fouling, timeouts, clock management) kick in." },
              { name: "Heave", value: `${T.heaveSeconds}s`, does: "Below this, with no time to cross half court, it's a heave." },
              { name: "Threes fouled", value: `×${T.threeFoulFactor}`, does: "How much less often a three draws a shooting foul than a two.", start: true },
              { name: "And-one", value: `×${T.andOneMakeFactor}`, does: "Make chance when fouled on the shot, relative to unfouled.", start: true },
              { name: "Steals", value: pct(T.stealShare), does: "Share of turnovers that are steals (the ball stays live).", start: true },
              { name: "Free-throw rebound", value: pct(T.freeThrowOrebChance), does: "Offense gets a missed last free throw back.", start: true },
              { name: "Big man", value: pct(T.bigRestrictedAreaShare), does: "Share of shots at the rim that makes a rebounder a putback threat.", start: true },
              { name: "Overtimes", value: `${T.maxOvertimes}`, does: "Most overtimes a timeline can go." },
              { name: "Bring-up (backcourt)", value: range(T.time.bringUpBackcourt), does: "Time to get the ball past half court.", start: true },
              { name: "Bring-up (trailing late)", value: range(T.time.urgentBringUp), does: "Same, when they're hurrying.", start: true },
              { name: "Inbound (frontcourt)", value: range(T.time.inboundFrontcourt), does: "After a timeout advances the ball.", start: true },
              { name: "Normal possession", value: range(T.time.normalPossession), does: "How long a possession runs before a shot.", start: true },
              { name: "Trailing work / reserve", value: `${range(T.time.trailingWork)} / ${range(T.time.trailingReserve)}`, does: "Trailing late: time spent before shooting, and time left for a rebound or foul.", start: true },
              { name: "Last shot", value: range(T.time.lastShotLeft), does: "Tied late: shoot with this much left.", start: true },
              { name: "Leading: shot clock left", value: range(T.time.leadingShotClockLeft), does: "Leading late: shoot with this much on the shot clock.", start: true },
              { name: "Intentional foul", value: range(T.time.intentionalFoul), does: "Time it takes to commit a foul.", start: true },
              { name: "Putback / kick-out", value: `${range(T.time.putback)} / ${range(T.time.kickOut)}`, does: "After an offensive rebound.", start: true },
              { name: "Rebound gather", value: range(T.time.reboundGather), does: "Time for the ball to come down.", start: true },
            ]}
          />
          <p className="text-sm text-muted">
            Want the full technical version? The engine is open source, and every calculation is documented with formulas and real examples in the
            project README.{" "}
            <Link href="/moments/" className="underline underline-offset-4 hover:text-foreground">
              Or go try a swap →
            </Link>
          </p>
        </Section>
      </main>
      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted sm:px-8">
        Stats from stats.nba.com via nba_api. Logos and headshots are the property of the NBA and its teams. Not affiliated with the NBA.
      </footer>
    </div>
  );
}
