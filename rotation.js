// Lógica do rodízio do CBLOW (regras 2.3, 2.4, 2.5 e 3.2).
//
// Uma "volta" começa com todo o elenco pendente. Cada jogo, quem jogou sai da lista de
// pendentes. Quando ninguém mais está pendente a volta fecha e a próxima começa do zero.
// Como a escalação só pode se repetir depois que todo mundo jogou, enquanto houver
// pendentes a próxima lineup precisa ter pelo menos um deles; se sobrar só um, ele é obrigatório.

const SLOTS = 5;

const matchTime = (m) => new Date(m.scheduledAt).getTime();

export function classify(player, config) {
  if (player.peDeChumbo) return { kind: "fixo", reason: "Pé de Chumbo — nunca sai (regra 2.4)" };
  if (player.quit) return { kind: "fora", reason: `Saiu do campeonato${player.quitStamp ? ` — ${player.quitStamp}` : ""}` };
  if (player.cpiVerdict === "culpado") return { kind: "fora", reason: `CPI: culpado${player.cpiStamp ? ` — ${player.cpiStamp}` : ""}` };
  if (config.ignorar?.slugs?.includes(player.slug)) return { kind: "fora", reason: "Ignorado no config.json" };
  return { kind: "rodizio" };
}

function isPlayoffMatch(match, config) {
  const p = config.playoffs ?? {};
  if (p.primeiraPartidaId != null && match.id === p.primeiraPartidaId) return true;
  return p.fasePattern ? new RegExp(p.fasePattern, "i").test(match.stage ?? "") : false;
}

export function computeTeam(team, matches, config, now = Date.now()) {
  const entradas = config.entradas ?? {};
  const naoContar = new Set((config.naoContar?.itens ?? []).map((i) => `${i.partidaId}:${i.jogo}:${i.slug}`));

  const players = team.players.map((p) => ({ ...p, status: classify(p, config) }));
  const byId = new Map(players.map((p) => [p.id, p]));
  const entryTime = (p) => (entradas[p.slug] ? new Date(entradas[p.slug]).getTime() : -Infinity);
  // Quem saiu do campeonato conta no rodízio até a data de saída
  const exitTime = (p) => {
    if (p.status.kind === "rodizio") return Infinity;
    if (p.quit && p.quitAt && !p.peDeChumbo && p.cpiVerdict !== "culpado") return new Date(p.quitAt).getTime();
    return -Infinity;
  };
  const eligibleAt = (t) => players.filter((p) => entryTime(p) <= t && t < exitTime(p));
  const ausencias = config.ausencias?.itens ?? [];
  const absentAt = (p, t) =>
    ausencias.some((a) => a.slug === p.slug && new Date(a.de).getTime() <= t && t < new Date(a.ate).getTime());

  const teamMatches = matches
    .filter((m) => m.games?.length && (m.team1.id === team.id || m.team2.id === team.id))
    .sort((a, b) => matchTime(a) - matchTime(b) || a.id - b.id);

  const cycles = [];
  let cur = newCycle(1, "inicio");
  let playoffsStarted = false;

  for (const match of teamMatches) {
    if (!playoffsStarted && isPlayoffMatch(match, config)) {
      playoffsStarted = true;
      if (cur.games.length) cycles.push(cur);
      cur = newCycle(cycles.length + 1, "playoffs");
    }
    const t = matchTime(match);
    const opponent = match.team1.id === team.id ? match.team2 : match.team1;

    for (const game of [...match.games].sort((a, b) => a.number - b.number)) {
      const lines = game.lines.filter((l) => l.teamId === team.id);
      const eligible = eligibleAt(t);
      const pendingBefore = eligible.filter((p) => !cur.played.has(p.id));

      const lineup = lines.map((l) => {
        const roster = byId.get(l.player.id);
        const ignored = naoContar.has(`${match.id}:${game.number}:${l.player.slug}`);
        let tag;
        if (l.player.president) tag = "presidente";
        else if (!roster) tag = "ex-elenco";
        else if (roster.status.kind === "fixo") tag = "fixo";
        else if (ignored) tag = "nao-conta";
        else if (pendingBefore.some((p) => p.id === roster.id)) tag = "novo";
        else if (eligible.some((p) => p.id === roster.id)) tag = "repetido";
        else tag = "fora";
        return { ...l.player, champion: l.champion, tag };
      });

      for (const l of lineup) if (l.tag === "novo" || l.tag === "repetido") cur.played.add(l.id);

      const entered = lineup.filter((l) => l.tag === "novo");
      // Quem estava ausente não é cobrado neste jogo, mas segue na fila
      const absent = pendingBefore.filter((p) => absentAt(p, t));
      const owed = pendingBefore.filter((p) => !absentAt(p, t));
      // Só ausentes na fila: para quem está disponível a volta já fechou, então a próxima
      // começa em paralelo enquanto a atual segue aberta para os ausentes
      if (owed.length === 0 && absent.length > 0 && !cur.ahead) cur.ahead = { played: new Set(), games: [] };
      const key = lineupKey(lineup);
      const sameAs = [...cur.priorGames, ...cur.games].find((g) => lineupKey(g.lineup) === key);
      cur.games.push({
        matchId: match.id,
        stage: match.stage,
        gameNumber: game.number,
        bestOf: match.bestOf,
        when: match.scheduledAt,
        opponent,
        won: game.winnerId === team.id,
        card: (match.team1.id === team.id ? game.card1 : game.card2)?.name ?? null,
        lineup,
        pendingBefore: pendingBefore.map((p) => p.id),
        // Fila no momento do jogo, com o que aconteceu com cada um
        queue: pendingBefore.map((p) => ({
          id: p.id,
          nick: p.nick,
          avatarUrl: p.avatarUrl,
          role: p.role,
          status: entered.some((l) => l.id === p.id) ? "entrou" : absentAt(p, t) ? "ausente" : "ficou",
        })),
        // Tinha gente pendente e ninguém dela entrou
        noNewPlayer: owed.length > 0 && entered.length === 0,
        // Regra 2.3 ao pé da letra: mesma escalação de um jogo anterior desta volta
        repeatedFrom: sameAs && owed.length > 0 ? { opponent: sameAs.opponent, when: sameAs.when, gameNumber: sameAs.gameNumber, bestOf: sameAs.bestOf } : null,
        shortHanded: lineup.length < SLOTS,
        // Quem estava na fila quando a regra foi quebrada
        shouldHavePlayed: entered.length === 0 ? owed.map((p) => p.nick) : [],
        // Ausências que livraram o time de uma cobrança neste jogo
        excused: entered.length === 0 ? absent.map((p) => p.nick) : [],
        countsAhead: !!cur.ahead,
      });
      if (cur.ahead) {
        // Quem saiu da fila da volta atual neste jogo não conta para a volta paralela
        for (const l of lineup) if (l.tag === "repetido") cur.ahead.played.add(l.id);
        cur.ahead.games.push(cur.games.at(-1));
      }

      if (eligible.every((p) => cur.played.has(p.id))) {
        cur.closed = true;
        cycles.push(cur);
        const ahead = cur.ahead;
        cur = newCycle(cycles.length + 1, "fechou");
        if (ahead) {
          cur.played = ahead.played;
          cur.priorGames = ahead.games;
        }
      }
    }
  }
  if (!cur.closed) cycles.push(cur);

  const current = cycles[cycles.length - 1];
  const eligibleNow = eligibleAt(now);
  const pending = eligibleNow.filter((p) => !current.played.has(p.id));
  const played = eligibleNow.filter((p) => current.played.has(p.id));
  const fixed = players.filter((p) => p.status.kind === "fixo");
  const slotsForRotation = SLOTS - fixed.length;

  let state;
  if (pending.length === 0) state = "livre";
  else if (pending.length === 1) state = "obrigatorio";
  else if (pending.length === eligibleNow.length) state = "volta-nova";
  else state = "pelo-menos-um";

  return {
    team,
    players,
    fixed,
    out: players.filter((p) => p.status.kind === "fora"),
    eligible: eligibleNow,
    pending,
    played,
    state,
    cycleNumber: current.number,
    cycleStart: current.start,
    playoffsStarted,
    // Mínimo de partidas pra zerar a fila, se colocar só pendentes em campo
    minGamesToClose: pending.length ? Math.ceil(pending.length / Math.max(slotsForRotation, 1)) : 0,
    cycles,
    lastLineup: cycles.flatMap((c) => c.games).at(-1)?.lineup ?? [],
  };
}

function lineupKey(lineup) {
  return lineup.filter((l) => l.tag !== "presidente").map((l) => l.id).sort((a, b) => a - b).join(",");
}

function newCycle(number, start) {
  return { number, start, played: new Set(), games: [], priorGames: [], ahead: null, closed: false };
}

export function nextMatch(team, matches) {
  return matches
    .filter((m) => !m.games?.length && m.status !== "finalizada" && (m.team1.id === team.id || m.team2.id === team.id))
    .sort((a, b) => matchTime(a) - matchTime(b))[0] ?? null;
}
