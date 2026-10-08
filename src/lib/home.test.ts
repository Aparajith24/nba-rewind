import { describe, expect, it } from "vitest";

import { decadeOf, formatGame } from "./eras";

describe("homepage labels", () => {
  it("spells out the round and game", () => {
    expect(formatGame("1998 Finals G6")).toEqual(["1998 NBA Finals, Game 6", "1998 FINALS"]);
    expect(formatGame("2019 ECSF G7")).toEqual(["2019 East Semifinals, Game 7", "2019 EAST SEMIS"]);
    expect(formatGame("1999 ECR1 G5")).toEqual(["1999 East First Round, Game 5", "1999 EAST R1"]);
  });

  it("groups moments by the decade of the playoffs they happened in", () => {
    expect(decadeOf(1997)).toBe("1990s");
    expect(decadeOf(2000)).toBe("2000s");
    expect(decadeOf(2019)).toBe("2010s");
    expect(decadeOf(2026)).toBe("2020s");
  });
});
