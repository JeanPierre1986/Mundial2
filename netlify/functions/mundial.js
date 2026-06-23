// netlify/functions/mundial.js
const API = "https://v3.football.api-sports.io";
const SEASON = 2026;
const LEAGUE = 1;

const TARGET = { ARG: "Argentina", FRA: "France", ESP: "Spain", ENG: "England" };
const DONE = new Set(["FT", "AET", "PEN"]);
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);

function roundIndex(round) {
  const r = (round || "").toLowerCase();
  if (r.includes("group")) return 0;
  if (r.includes("round of 32")) return 1;
  if (r.includes("round of 16")) return 2;
  if (r.includes("quarter")) return 3;
  if (r.includes("semi")) return 4;
  if (r.includes("3rd place") || r.includes("third place")) return 4;
  if (r.includes("final")) return 5;
  return 0;
}

async function call(path, key) {
  const res = await fetch(API + path, { headers: { "x-apisports-key": key } });
  return res.json();
}

exports.handler = async () => {
  const key = process.env.APISPORTS_KEY;
  const headers = { "content-type": "application/json", "cache-control": "public, max-age=120" };

  if (!key) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: "Falta APISPORTS_KEY", teams: {} }) };
  }

  try {
    const [standRes, fixRes] = await Promise.all([
      call(`/standings?league=${LEAGUE}&season=${SEASON}`, key),
      call(`/fixtures?league=${LEAGUE}&season=${SEASON}`, key),
    ]);

    const standings = standRes.response || [];
    const fixtures = fixRes.response || [];

    const stand = {};
    const groups = (standings[0] && standings[0].league && standings[0].league.standings) || [];
    groups.forEach((group) => {
      group.forEach((row) => {
        for (const k in TARGET) {
          if (row.team && row.team.name === TARGET[k]) {
            stand[k] = { id: row.team.id, points: row.points || 0, rank: row.rank || 9 };
          }
        }
      });
    });

    const teams = {};
    for (const k in TARGET) {
      const s = stand[k];
      if (!s) continue;
      const id = s.id;
      const mine = fixtures
        .filter((x) => x.teams.home.id === id || x.teams.away.id === id)
        .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
      const sideOf = (x) => (x.teams.home.id === id ? "home" : "away");
      const oppOf = (x) => (x.teams.home.id === id ? x.teams.away : x.teams.home);
      const wonOf = (x) => x.teams[sideOf(x)].winner === true;
      const lostOf = (x) => x.teams[sideOf(x)].winner === false;
      const done = mine.filter((x) => DONE.has(x.fixture.status.short));
      const koDone = done.filter((x) => roundIndex(x.league.round) > 0);
      const reached = mine.reduce((m, x) => Math.max(m, roundIndex(x.league.round)), 0);
      const liveNow = mine.some((x) => LIVE.has(x.fixture.status.short));
      let stage = 0, alive = true;
      const finalWon = done.some((x) => roundIndex(x.league.round) === 5 && wonOf(x));
      if (finalWon) { stage = 6; alive = true; }
      else {
        const lostKO = koDone.filter(lostOf).sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
        if (lostKO.length) { alive = false; stage = roundIndex(lostKO[lostKO.length - 1].league.round); }
        else {
          stage = reached; alive = true;
          if (stage === 0) {
            const groupDone = done.filter((x) => roundIndex(x.league.round) === 0).length;
            const hasKO = mine.some((x) => roundIndex(x.league.round) > 0);
            if (groupDone >= 3 && !hasKO) alive = false;
          }
        }
      }
      let status = "none";
      if (alive && stage === 6) status = "win";
      else if (liveNow) status = "live";
      else if (alive && stage === 0) status = s.rank === 1 ? "lead" : s.rank <= 2 ? "up" : "none";
      const parts = [];
      const last = done[done.length - 1];
      if (last) {
        const side = sideOf(last);
        const gf = side === "home" ? last.goals.home : last.goals.away;
        const ga = side === "home" ? last.goals.away : last.goals.home;
        const verb = wonOf(last) ? "Ganó" : lostOf(last) ? "Perdió" : "Empató";
        const prep = wonOf(last) ? "a" : "con";
        parts.push(`${verb} ${gf}-${ga} ${prep} ${oppOf(last).name}`);
      }
      const next = mine.find((x) => x.fixture.status.short === "NS");
      if (next) parts.push(`próx. vs ${oppOf(next).name}`);
      teams[k] = { pts: s.points, stage, alive, status, note: parts.join(" · ") || "—" };
    }

    const out = { updated: new Date().toISOString(), teams };
    if (Object.keys(teams).length === 0) {
      out.debug = {
        standings: { results: standRes.results, errors: standRes.errors },
        fixtures: { results: fixRes.results, errors: fixRes.errors },
      };
    }
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: String(e), teams: {} }) };
  }
};
