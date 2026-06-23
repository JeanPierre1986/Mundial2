// netlify/functions/mundial.js
const API = "https://api.football-data.org/v4";
const TARGET = { ARG: "ARG", FRA: "FRA", ESP: "ESP", ENG: "ENG" };

const FINISHED = "FINISHED";
const LIVE = new Set(["IN_PLAY", "PAUSED"]);
const UPCOMING = new Set(["TIMED", "SCHEDULED"]);

function stageIndex(stage) {
  const s = (stage || "").toUpperCase();
  if (s.includes("GROUP")) return 0;
  if (s.includes("LAST_32") || s.includes("ROUND_OF_32")) return 1;
  if (s.includes("LAST_16") || s.includes("ROUND_OF_16")) return 2;
  if (s.includes("QUARTER")) return 3;
  if (s.includes("SEMI")) return 4;
  if (s.includes("THIRD")) return 4;
  if (s.includes("FINAL")) return 5;
  return 0;
}

function resultFor(m, isHome) {
  const w = m.score && m.score.winner;
  if (w === "HOME_TEAM") return isHome ? "W" : "L";
  if (w === "AWAY_TEAM") return isHome ? "L" : "W";
  const pen = m.score && m.score.penalties;
  if (pen && pen.home != null && pen.away != null) {
    const mine = isHome ? pen.home : pen.away;
    const opp = isHome ? pen.away : pen.home;
    if (mine > opp) return "W";
    if (mine < opp) return "L";
  }
  return "D";
}

exports.handler = async () => {
  const token = process.env.FOOTBALL_DATA_TOKEN || process.env.APISPORTS_KEY;
  const headers = { "content-type": "application/json", "cache-control": "public, max-age=120" };
  if (!token) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: "Falta el token", teams: {} }) };
  }

  try {
    const res = await fetch(`${API}/competitions/WC/matches`, { headers: { "X-Auth-Token": token } });
    const data = await res.json();
    const matches = data.matches || [];

    if (!matches.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ updated: new Date().toISOString(), teams: {}, debug: { status: res.status, message: data.message, errorCode: data.errorCode } }) };
    }

    const idByTla = {};
    const groupByTla = {};
    matches.forEach((m) => {
      [m.homeTeam, m.awayTeam].forEach((t) => {
        if (t && t.tla) {
          idByTla[t.tla] = t.id;
          if (m.stage && m.stage.toUpperCase().includes("GROUP") && m.group) groupByTla[t.tla] = m.group;
        }
      });
    });

    const ptsByTla = {};
    const add = (t, p) => { if (t && t.tla) ptsByTla[t.tla] = (ptsByTla[t.tla] || 0) + p; };
    matches.forEach((m) => {
      if (!(m.stage && m.stage.toUpperCase().includes("GROUP")) || m.status !== FINISHED) return;
      const w = m.score.winner;
      if (w === "HOME_TEAM") { add(m.homeTeam, 3); add(m.awayTeam, 0); }
      else if (w === "AWAY_TEAM") { add(m.awayTeam, 3); add(m.homeTeam, 0); }
      else { add(m.homeTeam, 1); add(m.awayTeam, 1); }
    });

    const teams = {};
    for (const k in TARGET) {
      const tla = TARGET[k];
      const id = idByTla[tla];
      if (id == null) continue;

      const mine = matches.filter((m) => (m.homeTeam && m.homeTeam.id === id) || (m.awayTeam && m.awayTeam.id === id)).sort((x, y) => new Date(x.utcDate) - new Date(y.utcDate));
      const isHome = (m) => m.homeTeam.id === id;
      const oppName = (m) => (isHome(m) ? m.awayTeam.name || m.awayTeam.tla : m.homeTeam.name || m.homeTeam.tla);

      const done = mine.filter((m) => m.status === FINISHED);
      const reached = mine.reduce((mx, m) => Math.max(mx, stageIndex(m.stage)), 0);
      const liveNow = mine.some((m) => LIVE.has(m.status));
      const groupPts = ptsByTla[tla] || 0;

      let stage = 0, alive = true;
      const finalWon = done.some((m) => stageIndex(m.stage) === 5 && resultFor(m, isHome(m)) === "W");
      if (finalWon) { stage = 6; alive = true; }
      else {
        const koLost = done.filter((m) => stageIndex(m.stage) > 0 && resultFor(m, isHome(m)) === "L").sort((x, y) => new Date(x.utcDate) - new Date(y.utcDate));
        if (koLost.length) { alive = false; stage = stageIndex(koLost[koLost.length - 1].stage); }
        else { stage = reached; alive = true; }
      }

      let rank = 9;
      const grp = groupByTla[tla];
      if (grp) {
        const inGroup = Object.keys(groupByTla).filter((t) => groupByTla[t] === grp);
        const sorted = inGroup.map((t) => ({ t, p: ptsByTla[t] || 0 })).sort((a, b) => b.p - a.p);
        rank = sorted.findIndex((o) => o.t === tla) + 1;
      }

      let status = "none";
      if (alive && stage === 6) status = "win";
      else if (liveNow) status = "live";
      else if (alive && stage === 0) status = rank === 1 ? "lead" : rank <= 2 ? "up" : "none";

      const parts = [];
      const last = done[done.length - 1];
      if (last) {
        const home = isHome(last);
        const ft = last.score.fullTime || {};
        const gf = home ? ft.home : ft.away;
        const ga = home ? ft.away : ft.home;
        const r = resultFor(last, home);
        const verb = r === "W" ? "Ganó" : r === "L" ? "Perdió" : "Empató";
        const prep = r === "W" ? "a" : "con";
        parts.push(`${verb} ${gf}-${ga} ${prep} ${oppName(last)}`);
      }
      const next = mine.find((m) => UPCOMING.has(m.status));
      if (next) parts.push(`próx. vs ${oppName(next)}`);

      teams[k] = { pts: groupPts, stage, alive, status, note: parts.join(" · ") || "—" };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ updated: new Date().toISOString(), teams }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: String(e), teams: {} }) };
  }
};
