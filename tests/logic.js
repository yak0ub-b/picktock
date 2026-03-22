/**
 * Pure game logic extracted from index.html for unit testing.
 *
 * These functions have no DOM dependencies and can be tested in isolation.
 * The long-term goal is to move these directly into index.html as ES module
 * imports so this file stays the single source of truth.
 */

export const NB_COL = 10;
export const NB_LIG = 8;
export const TAILLE_RAT = 5;
export const BONUS_VIDE = 20;
export const COULEURS = ["rouge", "bleu", "vert", "jaune", "violet"];

// ── Board validation (BFS) ───────────────────────────────────────────────────

export function plateauJouable(casesN) {
  const total = NB_COL * NB_LIG;
  const libres = total - casesN.size;
  if (libres < total * 0.5) return false;

  let lig0 = 0;
  for (let col = 0; col < NB_COL; col++)
    if (!casesN.has(col + ",0")) lig0++;
  if (lig0 < 5) return false;

  // BFS from row 0
  const depart = [];
  for (let col = 0; col < NB_COL; col++)
    if (!casesN.has(col + ",0")) depart.push(col + ",0");

  const visites = new Set(depart);
  const file = [...depart];
  while (file.length > 0) {
    const pos = file.pop();
    const [c, l] = pos.split(",").map(Number);
    for (const [dc, dl] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nc = c + dc, nl = l + dl;
      if (nc >= 0 && nc < NB_COL && nl >= 0 && nl < NB_LIG) {
        const k = nc + "," + nl;
        if (!casesN.has(k) && !visites.has(k)) {
          visites.add(k);
          file.push(k);
        }
      }
    }
  }
  return visites.size >= libres;
}

// ── Random draw ──────────────────────────────────────────────────────────────

export function tirerAleat(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ── Triplet detection ────────────────────────────────────────────────────────

export function chercherTriplet(rack) {
  const jokers = rack.filter(j => j.couleur === "joker").length;
  const cpt = {};
  for (const j of rack) {
    if (j.couleur === "joker") continue;
    cpt[j.couleur] = (cpt[j.couleur] || 0) + 1;
    if (cpt[j.couleur] + jokers >= 3) return j.couleur;
  }
  if (jokers >= 3) return "joker";
  return null;
}

// ── Triplet removal ──────────────────────────────────────────────────────────

/**
 * Removes 3 tokens of `couleur` from `rack` (jokers fill in as needed)
 * and adds `pts` to `scores[joueurActif]`.
 *
 * `scores` and `joueurActif` are passed explicitly so the function
 * can be tested without global state.
 */
export function retirerTriplet(rack, couleur, pts, scores, joueurActif) {
  let n = 0;
  const nouveau = rack.filter(j => {
    if (n < 3 && (j.couleur === couleur || j.couleur === "joker")) { n++; return false; }
    return true;
  });
  rack.length = 0;
  rack.push(...nouveau);
  scores[joueurActif] += pts;
}

// ── Board helpers ────────────────────────────────────────────────────────────

export function getTousCapturables(plateau) {
  const res = [];
  for (let col = 0; col < NB_COL; col++)
    for (let lig = 0; lig < NB_LIG; lig++)
      if (plateau[col][lig] && plateau[col][lig].capturable)
        res.push([col, lig]);
  return res;
}

export function estVide(plateau) {
  for (let col = 0; col < NB_COL; col++)
    for (let lig = 0; lig < NB_LIG; lig++)
      if (plateau[col][lig]) return false;
  return true;
}

// ── Scoring helpers ──────────────────────────────────────────────────────────

export function buildGagnant(scores, nbJoueurs) {
  const max = Math.max(...scores.slice(0, nbJoueurs));
  const gagnants = [];
  for (let i = 0; i < nbJoueurs; i++)
    if (scores[i] === max) gagnants.push("Joueur " + (i + 1));
  return gagnants.length === 1
    ? gagnants[0] + " gagne !"
    : "Égalité entre " + gagnants.join(" et ") + " !";
}

// ── Timer helpers ────────────────────────────────────────────────────────────

export function formaterTemps(s) {
  s = Math.ceil(Math.max(0, s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function couleurTimer(s) {
  if (s <= 30) return "#e74c3c";
  if (s <= 60) return "#f1c40f";
  return "#ecf0f1";
}
