import { computeTeam, nextMatch } from "./rotation.js";

const app = document.getElementById("app");
const ROLE = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Suporte" };
const ROLE_ORDER = ["top", "jungle", "mid", "adc", "support"];
const LOGO = (slug) => `https://cblow.xyz/times/${encodeURIComponent(slug)}.webp`;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const fmtDay = (iso) => {
  const d = new Date(iso);
  const wd = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
};

const byRole = (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.nick.localeCompare(b.nick);

const STATE = {
  obrigatorio: { label: "Obrigatório", cls: "red" },
  "pelo-menos-um": { label: "Pelo menos 1", cls: "amber" },
  "volta-nova": { label: "Volta nova", cls: "green" },
  livre: { label: "Livre", cls: "green" },
};

let data, config;

async function load() {
  const [d, c] = await Promise.all([
    fetch("data/cblow.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("config.json", { cache: "no-cache" }).then((r) => r.json()),
  ]);
  data = d;
  config = c;
  document.getElementById("updated").textContent = `Atualizado em ${fmtDate(data.updatedAt)}`;
}

const logo = (team, cls = "") =>
  `<img class="logo ${cls}" src="${LOGO(team.slug)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;

function portrait(p, { note = "", cls = "" } = {}) {
  const initial = esc((p.nick || "?").trim()[0]?.toUpperCase());
  return `<li class="pc ${cls}">
    <div class="pc-img" data-i="${initial}">
      ${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
      ${p.role ? `<span class="pc-role">${esc(ROLE[p.role] ?? p.role)}</span>` : ""}
      ${note ? `<span class="pc-note">${esc(note)}</span>` : ""}
    </div>
    <div class="pc-name" title="${esc(p.nick)}">${esc(p.nick)}</div>
  </li>`;
}

function panel(title, body, { right = "", cls = "" } = {}) {
  return `<section class="panel ${cls}">
    <div class="panel-head"><h2>${title}</h2>${right}</div>
    ${body}
  </section>`;
}

function renderHome() {
  const rows = data.teams
    .map((t) => ({ t, r: computeTeam(t, data.matches, config) }))
    .sort((a, b) => b.t.wins - a.t.wins || a.t.losses - b.t.losses || a.t.name.localeCompare(b.t.name));

  app.innerHTML = `
    <section class="hero">
      <div class="hero-in">
        <h1>Rodízio</h1>
        <p class="hero-sub">Quem precisa ser escalado</p>
        <p class="hero-text">O elenco inteiro precisa jogar antes de uma escalação se repetir. Escolha um time para ver quem ainda está na fila.</p>
      </div>
      <span class="hero-ghost" aria-hidden="true">CBLOW</span>
    </section>

    <div class="wrap">
      ${panel(
        "Times",
        `<ul class="teams">
          ${rows
            .map(({ t, r }) => {
              const s = STATE[r.state];
              const who =
                r.state === "obrigatorio"
                  ? `<b>${esc(r.pending[0].nick)}</b>`
                  : r.state === "volta-nova"
                    ? "Fila cheia de novo"
                    : `${r.pending.length} na fila`;
              return `<li><a class="tcard" href="#/time/${esc(t.slug)}">
                ${logo(t)}
                <span class="tinfo">
                  <span class="tname">${esc(t.name)}</span>
                  <span class="tmeta">${t.wins}V – ${t.losses}D · volta ${r.cycleNumber}</span>
                </span>
                <span class="tstate">
                  <span class="tag ${s.cls}">${s.label}</span>
                  <span class="twho">${who}</span>
                </span>
              </a></li>`;
            })
            .join("")}
        </ul>`,
        { right: `<a class="more" href="#/regras">Como funciona</a>` }
      )}
    </div>`;
}

function renderRules() {
  app.innerHTML = `
    <section class="thero"><div class="thero-in"><div><h1>Regras</h1><p class="muted">Rodízio de elenco e escalação</p></div></div></section>
    <div class="wrap narrow">
      ${panel(
        "Como o site calcula",
        `<ol class="rules">
          <li>O elenco inteiro precisa jogar pelo menos uma partida antes de uma escalação se repetir <small>(regra 2.3)</small>.</li>
          <li>Enquanto houver gente na fila, a próxima escalação precisa ter <b>pelo menos um</b> jogador dela. Quando só sobra um, ele <b class="c-red">joga obrigatoriamente</b>.</li>
          <li>Quando todo mundo já jogou, a volta fecha e a fila recomeça com o elenco inteiro.</li>
          <li>O Pé de Chumbo nunca sai e fica fora da conta <small>(regra 2.4)</small>.</li>
          <li>Quem saiu do campeonato ou foi condenado na CPI sai da fila. Presidentes que jogam (ex.: Invasão de Yuumi) não contam.</li>
          <li>Se uma carta tirou um jogador que acabou de entrar, ele não aparece na lineup e continua na fila <small>(regra 3.2)</small>.</li>
          <li>A fila zera para o início dos Playoffs <small>(regra 2.5)</small>.</li>
        </ol>
        <p class="muted small">Ajustes manuais (datas de entrada de jogadores, playoffs) ficam no <code>config.json</code> do repositório.</p>`
      )}
      ${panel("Texto oficial", `<pre class="rules-text">${esc(data.rules ?? "")}</pre>`)}
    </div>`;
}

function renderStatus(r) {
  const pending = [...r.pending].sort(byRole);
  if (r.state === "obrigatorio") {
    return `<section class="status red">
      <p class="kicker">Precisa jogar obrigatoriamente</p>
      <ul class="pgrid">${portrait(pending[0], { cls: "must", note: "Obrigatório" })}</ul>
      <p class="hint">É o último da fila desta volta. Depois que ele jogar, a fila recomeça com o elenco inteiro.</p>
    </section>`;
  }
  if (r.state === "pelo-menos-um") {
    return `<section class="status amber">
      <p class="kicker">Precisa escalar pelo menos 1 destes</p>
      <ul class="pgrid">${pending.map((p) => portrait(p, { cls: "pending" })).join("")}</ul>
      <p class="hint">${pending.length} jogadores na fila. Colocando só eles, a volta fecha em no mínimo ${r.minGamesToClose} partida${r.minGamesToClose > 1 ? "s" : ""}.</p>
    </section>`;
  }
  if (r.state === "volta-nova") {
    return `<section class="status green">
      <p class="kicker">Volta nova${r.cycleStart === "playoffs" ? " · playoffs" : ""}</p>
      <p class="hint top">${
        r.cycleStart === "playoffs"
          ? "A fila foi zerada para os playoffs."
          : "Todo o elenco já jogou na volta anterior, então a fila recomeçou."
      } Qualquer escalação vale, e cada jogador escalado sai da fila.</p>
      <ul class="pgrid">${pending.map((p) => portrait(p)).join("")}</ul>
    </section>`;
  }
  return `<section class="status green"><p class="kicker">Sem pendências</p></section>`;
}

const TAG_TITLE = {
  novo: "Saiu da fila neste jogo",
  repetido: "Já tinha jogado nesta volta",
  fixo: "Pé de Chumbo",
  presidente: "Presidente — não conta",
  "ex-elenco": "Não está mais no elenco",
  fora: "Fora do rodízio",
  "nao-conta": "Não conta (regra 3.2, config.json)",
};

function renderGame(g, team) {
  const flags = [];
  if (g.repeatedFrom) flags.push(`<span class="flag red">Repetiu a escalação do jogo vs ${esc(g.repeatedFrom.opponent.name)} (${esc(fmtDay(g.repeatedFrom.when))}${g.repeatedFrom.bestOf > 1 ? `, jogo ${g.repeatedFrom.gameNumber}` : ""}) de maneira indevida</span>`);
  else if (g.noNewPlayer) flags.push(`<span class="flag amber">Ninguém da fila entrou</span>`);
  if (g.shortHanded) flags.push(`<span class="flag">Jogou com ${g.lineup.length}</span>`);
  return `<li class="game">
    <div class="ghead">
      <span class="gdate">${esc(fmtDay(g.when))}</span>
      <span class="gvs">
        <span class="res ${g.won ? "w" : "l"}">${g.won ? "V" : "D"}</span>
        <span class="vs">vs</span>
        ${logo(g.opponent, "sm")}
        <span class="gopp">${esc(g.opponent.name)}</span>
      </span>
      <span class="gstage">${esc(g.stage)}${g.bestOf > 1 ? ` · jogo ${g.gameNumber}` : ""}${g.card ? ` · ${esc(g.card)}` : ""}</span>
      <a class="btn" href="https://cblow.xyz/partidas/${g.matchId}" target="_blank" rel="noopener">Ver detalhes →</a>
    </div>
    <ul class="lineup">
      ${[...g.lineup]
        .sort(byRole)
        .map(
          (l) =>
            `<li class="chip ${l.tag}" title="${esc(TAG_TITLE[l.tag])}">${
              l.avatarUrl ? `<img src="${esc(l.avatarUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ""
            }<span>${esc(l.nick)}</span></li>`
        )
        .join("")}
    </ul>
    ${flags.length ? `<div class="flags">${flags.join("")}</div>` : ""}
  </li>`;
}

function renderTeam(slug) {
  const team = data.teams.find((t) => t.slug === slug);
  if (!team) {
    app.innerHTML = `<div class="wrap"><p>Time não encontrado. <a href="#/">Voltar</a></p></div>`;
    return;
  }
  const r = computeTeam(team, data.matches, config);
  const next = nextMatch(team, data.matches);
  const opp = next && (next.team1.id === team.id ? next.team2 : next.team1);
  const presidents = (team.presidents ?? []).map((p) => p.name);

  const side = [
    r.fixed.length &&
      panel("Sempre joga", `<ul class="pgrid sm">${r.fixed.map((p) => portrait(p, { cls: "fixed", note: "Pé de Chumbo" })).join("")}</ul>`),
    r.played.length &&
      panel(
        "Já jogaram nesta volta",
        `<ul class="pgrid sm">${[...r.played].sort(byRole).map((p) => portrait(p, { cls: "done" })).join("")}</ul>`
      ),
    r.out.length &&
      panel(
        "Fora do rodízio",
        `<ul class="pgrid sm">${r.out.map((p) => portrait(p, { cls: "out", note: p.status.reason.split(" — ")[0] })).join("")}</ul>`
      ),
  ]
    .filter(Boolean)
    .join("");

  const history = [...r.cycles]
    .reverse()
    .filter((c) => c.games.length || c === r.cycles.at(-1))
    .map(
      (c) => `<div class="cycle">
        <h3>Volta ${c.number} ${c.closed ? `<span class="tag green">Fechou</span>` : `<span class="tag amber">Em andamento</span>`}${
          c.start === "playoffs" ? ` <span class="tag">Playoffs</span>` : ""
        }</h3>
        ${
          c.games.length
            ? `<ol class="games">${[...c.games].reverse().map((g) => renderGame(g, team)).join("")}</ol>`
            : `<p class="muted small">Nenhum jogo nesta volta ainda.</p>`
        }
      </div>`
    )
    .join("");

  app.innerHTML = `
    <section class="thero">
      <div class="thero-in">
        <div class="thero-main">
          ${logo(team, "lg")}
          <div>
            <h1>${esc(team.name)}</h1>
            <p class="muted">${presidents.length ? `Presidentes ${esc(presidents.join(" e "))}` : ""}${
              opp
                ? `${presidents.length ? " · " : ""}Próxima: vs ${esc(opp.name)} ${next.status === "ao vivo" ? "(ao vivo)" : `· ${esc(fmtDate(next.scheduledAt))}`}`
                : ""
            }</p>
          </div>
        </div>
        <dl class="stats">
          <div><dt>Volta</dt><dd>${r.cycleNumber}</dd></div>
          <div><dt>Na fila</dt><dd>${r.pending.length}</dd></div>
          <div><dt>Vitórias</dt><dd>${team.wins}</dd></div>
          <div><dt>Derrotas</dt><dd>${team.losses}</dd></div>
        </dl>
      </div>
    </section>

    <div class="wrap">
      <a class="back" href="#/">← Times</a>
      ${renderStatus(r)}
      <div class="grid">
        <div class="col-side">${side}</div>
        <div class="col-main">
          ${panel(
            "Histórico de escalações",
            `<p class="legend">
              <span class="chip novo"><span>Saiu da fila</span></span>
              <span class="chip repetido"><span>Repetiu na volta</span></span>
              <span class="chip fixo"><span>Pé de Chumbo</span></span>
              <span class="chip presidente"><span>Presidente / ex-elenco</span></span>
            </p>${history}`
          )}
        </div>
      </div>
    </div>`;
}

function route() {
  const m = location.hash.match(/^#\/time\/([\w-]+)/);
  const page = m ? "times" : location.hash === "#/regras" ? "regras" : "times";
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === page));
  if (m) renderTeam(m[1]);
  else if (location.hash === "#/regras") renderRules();
  else renderHome();
  window.scrollTo(0, 0);
}

load()
  .then(() => {
    window.addEventListener("hashchange", route);
    route();
  })
  .catch((e) => {
    app.innerHTML = `<div class="wrap"><p>Não deu pra carregar os dados (${esc(e.message)}).</p></div>`;
  });
