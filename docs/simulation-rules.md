# Simulation rules

The basketball rules the simulation follows, and why. The code in `src/engine/` implements these; every adjustable number lives in `src/engine/tuning.ts`. Numbers there marked START are first guesses, to be tuned once no-swap simulations can be checked against how real games ended.

## The moment

- **A moment starts at the last dead ball before the famous play**: after the free throws, timeout or substitutions, not at the instant of the shot. The sim plays out the whole sequence, so a swap can change who shoots, who rebounds and who's open. (How the start is found automatically is in the README.)
- **No swap means no change: you watch what really happened.** The real play-by-play from the moment's start to the end of the game is replayed on the court, substitutions and overtime included. History can only change if you change something.
- **With a swap, the sim plays the moment out**, to the end of the game, overtime included. **History changed means the real loser wins the game.** For Ray Allen's corner three, any Spurs win (regulation or overtime) changes history; any Heat win keeps it.

## The players

Each swap picks a player and a season. The sim needs that player's *playoff* version of that season.

- **Blend by sample size.** His profile is a blend of his real playoff stats that season and a projection from his regular season, trusting each by how much data backs it. A full playoff run means essentially his real playoff stats. One hot game means mostly his regular season. No playoff games means a pure projection: what if Jordan's Bulls had beaten the Pistons? The app never says a profile is projected.
- **Projection** = regular season × how the league changed in that season's playoffs × his personal step-up.
  - The league change is measured on the *same playoff teams'* regular season vs. playoffs. Over 30 seasons, playoff teams scored fewer points per game in the playoffs every single season, about 4.3% fewer: ~2.4% from slower pace and ~1.7% from lower efficiency (defense tightens).
  - His step-up is how much more (or less) than the league he changed in his other playoff runs. Closer seasons count more, and it's trusted by how many playoff minutes back it up. It covers usage, shooting and defense (steals, blocks, defensive rebounding, defensive rating).
- **Surprise element.** Each timeline gives every player a small random shooting swing, bigger for players with little playoff history, capped at ±5 percentage points. A small hot sample can show up as a hot hand in some timelines without taking over.

## Who shoots

- **Usage first, with a hot hand.** Stars get the ball, and a player who's shooting well *that game* (from play-by-play, up to the moment) gets it somewhat more often. The boost grows with the number of shots behind it, so 8 of 10 counts more than 2 of 2. Research on whether shooters actually stay hot is mixed, so the hot hand mostly decides who gets the ball; whether it goes in is mostly his normal ability with only a small bump.
- **A swapped-in player comes in neutral.** He didn't play in that game, so he has no hot hand either way.
- **From where:** his own mix of shots by zone. When only a three will do (down 3 with one possession left, or down 4+ at the very end), only threes.
- **Does it go in:** his playoff make rate from that zone, adjusted for the defenders on the floor.

## Late-game decisions

- **Fouling follows what NBA teams actually do.**
  - **Up 3 on defense:** never foul with more than 10 seconds left; sometimes (~15%) at 6–10 seconds; often (~50%) at 6 or fewer. That averages near the ~34% of the time NBA teams foul up 3 in the final 10 seconds ([ESPN, 2026](https://www.espn.com/nba/story/_/id/48582233/nba-playoffs-2026-foul-3-san-antonio-spurs-portland-trail-blazers-impact)). Fouling only beats playing defense with about 9 seconds or less left ([McFarlane, 2019](https://journals.sagepub.com/doi/full/10.3233/JSA-180231)), and coaches commonly use a 5–6 second rule ([ESPN TrueHoop](https://www.espn.com/blog/truehoop/post/_/id/6992/up-three-without-the-ball-to-foul-or-not-new-insight)). Fouling earlier is risky: the trailing team makes both free throws, fouls back, and gets another chance at a tying three.
  - **Trailing late, the other team has the ball:** foul to stop the clock when the game clock is under the shot clock and the deficit is still reachable.
  - **Up big:** just defend.
- **Offensive rebounds depend on the score and who got it.** Need a three → kick it out. Otherwise a big man under the rim puts it back, and anyone else resets the offense. (Crowding around the rebounder will matter once the sim tracks court positions.)
- **Timeouts** start from each team's real count at the moment (by that era's rules). A trailing or tied team uses one late to advance the ball past half court. Each overtime adds 2.
- **Clock management:** a trailing team pushes the ball up and shoots leaving time for a rebound or a foul; a tied team holds for the last shot; a leading team runs the clock and dribbles it out when the game clock is shorter than the shot clock.

## Rules of the era

Each season's rules come from `public/data/leagues/{season}.json`, for example the 14-second shot clock reset after offensive rebounds (from 2018–19) and the 22-foot three-point line all the way around in 1996–97.
