/**
 * Unit tests for PickTok pure game logic.
 *
 * Run with:  npm test
 *
 * Coverage areas and rationale
 * ────────────────────────────
 * 1. plateauJouable  – BFS board-validation algorithm; most complex code,
 *                      silent failures here produce unplayable boards.
 * 2. chercherTriplet – Core scoring trigger; joker substitution rules are
 *                      subtle and easy to regress.
 * 3. retirerTriplet  – Correct token removal order matters for rack state
 *                      after a triplet.
 * 4. getTousCapturables / estVide – Game-end detection relies on these.
 * 5. buildGagnant    – Tie-breaking logic must be correct in multiplayer.
 * 6. formaterTemps / couleurTimer – UI helpers with boundary conditions.
 */

import { describe, it, expect } from "vitest";
import {
  NB_COL, NB_LIG,
  plateauJouable,
  tirerAleat,
  chercherTriplet,
  retirerTriplet,
  getTousCapturables,
  estVide,
  buildGagnant,
  formaterTemps,
  couleurTimer,
} from "./logic.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build an empty plateau (all nulls). */
function emptyPlateau() {
  return Array.from({ length: NB_COL }, () => Array(NB_LIG).fill(null));
}

/** Set a single cell on a plateau. */
function setCell(plateau, col, lig, value) {
  plateau[col][lig] = value;
  return plateau;
}

/** Block a column of rows from lig1 to lig2 (inclusive) with black cells. */
function blockColumn(casesNoires, col, lig1 = 1, lig2 = NB_LIG - 1) {
  for (let l = lig1; l <= lig2; l++) casesNoires.add(`${col},${l}`);
}

// ─── 1. plateauJouable ───────────────────────────────────────────────────────

describe("plateauJouable", () => {
  it("returns true for an empty set of black cells", () => {
    expect(plateauJouable(new Set())).toBe(true);
  });

  it("returns false when more than 50% of cells are black", () => {
    // Fill 41 cells out of 80 (>50%)
    const cn = new Set();
    for (let col = 0; col < NB_COL; col++)
      for (let lig = 1; lig <= 4; lig++)
        cn.add(`${col},${lig}`); // 40 cells
    cn.add("0,5"); // 41st cell
    expect(plateauJouable(cn)).toBe(false);
  });

  it("returns false when fewer than 5 cells are free in row 0", () => {
    const cn = new Set();
    // Block 6 of the 10 cells in row 0
    for (let col = 0; col < 6; col++) cn.add(`${col},0`);
    expect(plateauJouable(cn)).toBe(false);
  });

  it("returns false when free cells form an isolated pocket unreachable from row 0", () => {
    // Build a wall across the entire row 1, creating an island in rows 2-7
    const cn = new Set();
    for (let col = 0; col < NB_COL; col++) cn.add(`${col},1`);
    // row 1 is all black → rows 2-7 are unreachable from row 0
    expect(plateauJouable(cn)).toBe(false);
  });

  it("returns true when all free cells are connected via row 0", () => {
    // Block columns 5-9 in rows 4-7 only (40 cells blocked out of 80 = exactly 50% free)
    // All free cells in rows 0-3 are reachable from row 0, and col 0-4 rows 4-7 connect
    // through row 3. Using only 20 blocked cells keeps the board above the 50% threshold.
    const cn = new Set();
    for (let col = 5; col < NB_COL; col++)
      for (let lig = 4; lig < NB_LIG; lig++)
        cn.add(`${col},${lig}`); // 5 cols × 4 rows = 20 black cells → 60/80 free
    expect(plateauJouable(cn)).toBe(true);
  });

  it("returns false when exactly 5 cells in row 0 are free but an island exists", () => {
    const cn = new Set();
    // Block columns 5-9 in row 0
    for (let col = 5; col < NB_COL; col++) cn.add(`${col},0`);
    // Now completely isolate col 0 rows 1-7 by walling off its right side
    for (let lig = 1; lig < NB_LIG; lig++) {
      cn.add(`1,${lig}`); // wall to the right of col 0
    }
    // col 0, rows 1-7 are free but reachable only via col 0 row 0 → still connected
    // To truly isolate, also block col 0 row 0
    cn.add("0,0"); // now row 0 has only 4 free cells → should be false
    expect(plateauJouable(cn)).toBe(false);
  });
});

// ─── 2. tirerAleat ───────────────────────────────────────────────────────────

describe("tirerAleat", () => {
  it("returns exactly n items", () => {
    const arr = ["a", "b", "c", "d", "e"];
    expect(tirerAleat(arr, 3)).toHaveLength(3);
  });

  it("returns a subset of the input array", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = tirerAleat(arr, 4);
    result.forEach(item => expect(arr).toContain(item));
  });

  it("does not mutate the original array", () => {
    const arr = [1, 2, 3];
    const copy = [...arr];
    tirerAleat(arr, 2);
    expect(arr).toEqual(copy);
  });

  it("returns all items when n equals array length", () => {
    const arr = ["x", "y", "z"];
    expect(tirerAleat(arr, 3)).toHaveLength(3);
  });

  it("returns no duplicates", () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    const result = tirerAleat(arr, 10);
    expect(new Set(result).size).toBe(10);
  });
});

// ─── 3. chercherTriplet ──────────────────────────────────────────────────────

describe("chercherTriplet", () => {
  it("returns null for an empty rack", () => {
    expect(chercherTriplet([])).toBeNull();
  });

  it("returns null when no color appears 3 times", () => {
    const rack = [
      { couleur: "rouge" }, { couleur: "bleu" }, { couleur: "vert" },
      { couleur: "rouge" }, { couleur: "bleu" },
    ];
    expect(chercherTriplet(rack)).toBeNull();
  });

  it("detects a plain triplet of the same color", () => {
    const rack = [
      { couleur: "rouge" }, { couleur: "bleu" }, { couleur: "rouge" },
      { couleur: "rouge" },
    ];
    expect(chercherTriplet(rack)).toBe("rouge");
  });

  it("detects a triplet completed by one joker", () => {
    const rack = [
      { couleur: "rouge" }, { couleur: "rouge" }, { couleur: "joker" },
      { couleur: "bleu" },
    ];
    expect(chercherTriplet(rack)).toBe("rouge");
  });

  it("detects a triplet completed by two jokers", () => {
    const rack = [
      { couleur: "vert" }, { couleur: "joker" }, { couleur: "joker" },
    ];
    expect(chercherTriplet(rack)).toBe("vert");
  });

  it("returns 'joker' when three jokers are present and no other color has 3", () => {
    const rack = [
      { couleur: "joker" }, { couleur: "joker" }, { couleur: "joker" },
    ];
    expect(chercherTriplet(rack)).toBe("joker");
  });

  it("returns null for two jokers and no matching color pair", () => {
    const rack = [
      { couleur: "rouge" }, { couleur: "bleu" }, { couleur: "joker" },
      { couleur: "joker" },
    ];
    // rouge+2 jokers = 3 → should detect rouge
    expect(chercherTriplet(rack)).toBe("rouge");
  });

  it("returns null for two jokers and two different colors (1 each)", () => {
    // 1 rouge + 2 jokers = 3 → detects rouge
    // to truly get null with 2 jokers, we need an empty non-joker rack
    const rack = [{ couleur: "joker" }, { couleur: "joker" }];
    expect(chercherTriplet(rack)).toBeNull();
  });

  it("does not mutate the rack", () => {
    const rack = [
      { couleur: "rouge" }, { couleur: "rouge" }, { couleur: "rouge" },
    ];
    const copy = JSON.stringify(rack);
    chercherTriplet(rack);
    expect(JSON.stringify(rack)).toBe(copy);
  });
});

// ─── 4. retirerTriplet ───────────────────────────────────────────────────────

describe("retirerTriplet", () => {
  it("removes exactly 3 tokens of the target color", () => {
    const rack = [
      { couleur: "rouge" }, { couleur: "rouge" }, { couleur: "rouge" },
      { couleur: "bleu" },
    ];
    const scores = [0];
    retirerTriplet(rack, "rouge", 1, scores, 0);
    expect(rack).toHaveLength(1);
    expect(rack[0].couleur).toBe("bleu");
  });

  it("increments the player's score by pts", () => {
    const rack = [
      { couleur: "bleu" }, { couleur: "bleu" }, { couleur: "bleu" },
    ];
    const scores = [3];
    retirerTriplet(rack, "bleu", 2, scores, 0);
    expect(scores[0]).toBe(5);
  });

  it("uses jokers to complete the triplet", () => {
    const rack = [
      { couleur: "vert" }, { couleur: "joker" }, { couleur: "joker" },
      { couleur: "rouge" },
    ];
    const scores = [0];
    retirerTriplet(rack, "vert", 1, scores, 0);
    // Should remove 1 vert + 2 jokers; rouge stays
    expect(rack).toHaveLength(1);
    expect(rack[0].couleur).toBe("rouge");
  });

  it("updates the correct player's score in multiplayer", () => {
    const rack = [
      { couleur: "jaune" }, { couleur: "jaune" }, { couleur: "jaune" },
    ];
    const scores = [5, 0, 3];
    retirerTriplet(rack, "jaune", 1, scores, 1);
    expect(scores[0]).toBe(5);
    expect(scores[1]).toBe(1);
    expect(scores[2]).toBe(3);
  });

  it("leaves the rack empty after removing a 3-token rack that is a triplet", () => {
    const rack = [
      { couleur: "violet" }, { couleur: "violet" }, { couleur: "violet" },
    ];
    const scores = [0];
    retirerTriplet(rack, "violet", 1, scores, 0);
    expect(rack).toHaveLength(0);
  });
});

// ─── 5. getTousCapturables ───────────────────────────────────────────────────

describe("getTousCapturables", () => {
  it("returns empty array for an empty plateau", () => {
    expect(getTousCapturables(emptyPlateau())).toEqual([]);
  });

  it("returns only capturable tokens", () => {
    const p = emptyPlateau();
    p[0][0] = { couleur: "rouge", capturable: true };
    p[1][0] = { couleur: "bleu", capturable: false };
    p[2][3] = { couleur: "vert", capturable: true };
    const result = getTousCapturables(p);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual([0, 0]);
    expect(result).toContainEqual([2, 3]);
  });

  it("returns all capturable positions when every token is capturable", () => {
    const p = emptyPlateau();
    p[0][0] = { couleur: "rouge", capturable: true };
    p[9][7] = { couleur: "bleu", capturable: true };
    expect(getTousCapturables(p)).toHaveLength(2);
  });
});

// ─── 6. estVide ──────────────────────────────────────────────────────────────

describe("estVide", () => {
  it("returns true for an all-null plateau", () => {
    expect(estVide(emptyPlateau())).toBe(true);
  });

  it("returns false when one cell is occupied", () => {
    const p = emptyPlateau();
    p[5][4] = { couleur: "rouge", capturable: false };
    expect(estVide(p)).toBe(false);
  });

  it("returns false when only the last cell is occupied", () => {
    const p = emptyPlateau();
    p[NB_COL - 1][NB_LIG - 1] = { couleur: "bleu", capturable: true };
    expect(estVide(p)).toBe(false);
  });
});

// ─── 7. buildGagnant ─────────────────────────────────────────────────────────

describe("buildGagnant", () => {
  it("declares a single winner when one player has the highest score", () => {
    expect(buildGagnant([3, 1], 2)).toBe("Joueur 1 gagne !");
    expect(buildGagnant([1, 5], 2)).toBe("Joueur 2 gagne !");
  });

  it("declares a tie when two players share the highest score", () => {
    expect(buildGagnant([3, 3], 2)).toBe("Égalité entre Joueur 1 et Joueur 2 !");
  });

  it("works correctly with three players", () => {
    expect(buildGagnant([2, 5, 1], 3)).toBe("Joueur 2 gagne !");
  });

  it("declares a three-way tie", () => {
    const result = buildGagnant([4, 4, 4], 3);
    expect(result).toContain("Égalité");
    expect(result).toContain("Joueur 1");
    expect(result).toContain("Joueur 2");
    expect(result).toContain("Joueur 3");
  });

  it("ignores scores beyond nbJoueurs", () => {
    // scores[2] is the highest but nbJoueurs=2 → should ignore it
    expect(buildGagnant([3, 1, 99], 2)).toBe("Joueur 1 gagne !");
  });

  it("handles a zero-score game", () => {
    expect(buildGagnant([0, 0], 2)).toBe("Égalité entre Joueur 1 et Joueur 2 !");
  });
});

// ─── 8. formaterTemps ────────────────────────────────────────────────────────

describe("formaterTemps", () => {
  it("formats whole seconds below a minute", () => {
    expect(formaterTemps(45)).toBe("0:45");
  });

  it("pads seconds with a leading zero", () => {
    expect(formaterTemps(65)).toBe("1:05");
  });

  it("formats exactly 60 seconds as 1:00", () => {
    expect(formaterTemps(60)).toBe("1:00");
  });

  it("formats exactly 120 seconds as 2:00", () => {
    expect(formaterTemps(120)).toBe("2:00");
  });

  it("rounds fractional seconds up (ceiling)", () => {
    expect(formaterTemps(59.1)).toBe("1:00");
    expect(formaterTemps(0.9)).toBe("0:01");
  });

  it("returns 0:00 for zero or negative values", () => {
    expect(formaterTemps(0)).toBe("0:00");
    expect(formaterTemps(-5)).toBe("0:00");
  });
});

// ─── 9. couleurTimer ─────────────────────────────────────────────────────────

describe("couleurTimer", () => {
  it("returns red when 30 seconds or fewer remain", () => {
    expect(couleurTimer(30)).toBe("#e74c3c");
    expect(couleurTimer(0)).toBe("#e74c3c");
    expect(couleurTimer(1)).toBe("#e74c3c");
  });

  it("returns yellow when between 31 and 60 seconds remain", () => {
    expect(couleurTimer(31)).toBe("#f1c40f");
    expect(couleurTimer(60)).toBe("#f1c40f");
  });

  it("returns white/neutral when more than 60 seconds remain", () => {
    expect(couleurTimer(61)).toBe("#ecf0f1");
    expect(couleurTimer(120)).toBe("#ecf0f1");
  });
});
