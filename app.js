import { computeTeam, nextMatch } from "./rotation.js";

const app = document.getElementById("app");
const ROLE = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Suporte" };
const ROLE_ORDER = ["top", "jungle", "mid", "adc", "support"];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

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
  document.getElementById("foot").innerHTML =
    `Dados atualizados em ${esc(fmtDate(data.updatedAt))} · fonte <a href="https://cblow.xyz" target="_blank" rel="noopener">cblow.xyz</a>`;
}

function avatar(p, size = "") {
  const initial = esc((p.nick || "?").trim()[0]?.toUpperCase());
  return `<span class="av ${size}" data-i="${initial}">${
    p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ""
  }</span>`;
}

function playerCard(p, extra = "") {
  return `<li class="pcard ${extra}">
    ${avatar(p)}
    <span class="pname">${esc(p.nick)}</span>
    <span class="prole">${esc(ROLE[p.role] ?? p.role ?? "")}</span>
  </li>`;
}

function renderHome() {
  const rows = data.teams
    .map((t) => ({ t, r: computeTeam(t, data.matches, config) }))
    .sort((a, b) => b.t.wins - a.t.wins || a.t.losses - b.t.losses || a.t.name.localeCompare(b.t.name));

  app.innerHTML = `
    <h1 class="title">Quem precisa jogar?</h1>
    <p class="lead">Escolha um time para ver quem ainda está na fila do rodízio.</p>
    <ul class="teams">
      ${rows
        .map(({ t, r }) => {
          const s = STATE[r.state];
          const who =
            r.state === "obrigatorio"
              ? esc(r.pending[0].nick)
              : r.state === "volta-nova"
                ? "Fila cheia de novo"
                : `${r.pending.length} na fila`;
          return `<li><a class="tcard" href="#/time/${esc(t.slug)}">
            <span class="ttag">${esc(t.tag)}</span>
            <span class="tname">${esc(t.name)}</span>
            <span class="trec">${t.wins}V ${t.losses}D · volta ${r.cycleNumber}</span>
            <span class="badge ${s.cls}">${s.label}</span>
            <span class="twho">${who}</span>
          </a></li>`;
        })
        .join("")}
    </ul>`;
}

function renderStatus(r) {
  const pending = [...r.pending].sort(byRole);
  if (r.state === "obrigatorio") {
    return `<section class="status red">
      <p class="kicker">Precisa jogar obrigatoriamente</p>
      <ul class="plist big">${playerCard(pending[0], "must")}</ul>
      <p class="hint">É o último da fila desta volta. Depois que ele jogar, a fila recomeça com o elenco inteiro.</p>
    </section>`;
  }
  if (r.state === "pelo-menos-um") {
    return `<section class="status amber">
      <p class="kicker">Precisa escalar pelo menos 1 destes</p>
      <ul class="plist big">${pending.map((p) => playerCard(p)).join("")}</ul>
      <p class="hint">${pending.length} jogadores na fila. Colocando só eles, a volta fecha em no mínimo ${r.minGamesToClose} partida${r.minGamesToClose > 1 ? "s" : ""}.</p>
    </section>`;
  }
  if (r.state === "volta-nova") {
    return `<section class="status green">
      <p class="kicker">Volta nova${r.cycleStart === "playoffs" ? " — playoffs" : ""}</p>
      <p class="hint">${
        r.cycleStart === "playoffs"
          ? "A fila foi zerada para os playoffs."
          : "Todo o elenco já jogou na volta anterior, então a fila recomeçou."
      } Qualquer escalação vale, mas cada jogador escalado sai da fila.</p>
      <ul class="plist">${pending.map((p) => playerCard(p)).join("")}</ul>
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

function renderGame(g) {
  const flags = [];
  if (g.repeatedFrom) flags.push(`<span class="flag red">Repetiu a escalação da partida #${g.repeatedFrom}</span>`);
  else if (g.noNewPlayer) flags.push(`<span class="flag amber">Ninguém da fila entrou</span>`);
  if (g.shortHanded) flags.push(`<span class="flag muted">Jogou com ${g.lineup.length}</span>`);
  return `<li class="game">
    <div class="ghead">
      <a href="https://cblow.xyz/partidas/${g.matchId}" target="_blank" rel="noopener">#${g.matchId}</a>
      <span>${esc(g.stage)}${g.bestOf > 1 ? ` · jogo ${g.gameNumber}` : ""}</span>
      <span>vs <b>${esc(g.opponent.tag)}</b></span>
      <span class="res ${g.won ? "w" : "l"}">${g.won ? "V" : "D"}</span>
      <span class="muted">${esc(fmtDate(g.when))}${g.card ? ` · ${esc(g.card)}` : ""}</span>
    </div>
    <ul class="lineup">
      ${[...g.lineup]
        .sort(byRole)
        .map(
          (l) =>
            `<li class="chip ${l.tag}" title="${esc(TAG_TITLE[l.tag])}">${avatar(l, "sm")}<span>${esc(l.nick)}</span></li>`
        )
        .join("")}
    </ul>
    ${flags.length ? `<div class="flags">${flags.join("")}</div>` : ""}
  </li>`;
}

function renderTeam(slug) {
  const team = data.teams.find((t) => t.slug === slug);
  if (!team) {
    app.innerHTML = `<p>Time não encontrado. <a href="#/">Voltar</a></p>`;
    return;
  }
  const r = computeTeam(team, data.matches, config);
  const next = nextMatch(team, data.matches);
  const opp = next && (next.team1.id === team.id ? next.team2 : next.team1);

  app.innerHTML = `
    <a class="back" href="#/">← Times</a>
    <header class="thead">
      <span class="ttag">${esc(team.tag)}</span>
      <h1>${esc(team.name)}</h1>
      <p class="muted">${team.wins}V ${team.losses}D · volta ${r.cycleNumber} do rodízio${
        opp ? ` · próxima: vs <b>${esc(opp.name)}</b> ${next.status === "ao vivo" ? "(ao vivo)" : esc(fmtDate(next.scheduledAt))}` : ""
      }</p>
    </header>

    ${renderStatus(r)}

    <div class="cols">
      ${
        r.fixed.length
          ? `<section><h2>Sempre joga</h2><ul class="plist">${r.fixed.map((p) => playerCard(p, "fixed")).join("")}</ul></section>`
          : ""
      }
      ${
        r.played.length
          ? `<section><h2>Já jogaram nesta volta</h2><ul class="plist">${[...r.played].sort(byRole).map((p) => playerCard(p, "done")).join("")}</ul></section>`
          : ""
      }
      ${
        r.out.length
          ? `<section><h2>Fora do rodízio</h2><ul class="plist">${r.out
              .map(
                (p) =>
                  `<li class="pcard out">${avatar(p)}<span class="pname">${esc(p.nick)}</span><span class="prole">${esc(p.status.reason)}</span></li>`
              )
              .join("")}</ul></section>`
          : ""
      }
    </div>

    <section>
      <h2>Histórico de escalações</h2>
      <p class="legend">
        <span class="chip novo">saiu da fila</span>
        <span class="chip repetido">repetiu na volta</span>
        <span class="chip fixo">Pé de Chumbo</span>
        <span class="chip presidente">presidente</span>
      </p>
      ${[...r.cycles]
        .reverse()
        .filter((c) => c.games.length || c === r.cycles.at(-1))
        .map(
          (c) => `<div class="cycle">
            <h3>Volta ${c.number} ${c.closed ? `<span class="badge green">fechou</span>` : `<span class="badge amber">em andamento</span>`}${
              c.start === "playoffs" ? ` <span class="badge">playoffs</span>` : ""
            }</h3>
            ${c.games.length ? `<ol class="games">${[...c.games].reverse().map(renderGame).join("")}</ol>` : `<p class="muted">Nenhum jogo nesta volta ainda.</p>`}
          </div>`
        )
        .join("")}
    </section>`;
}

function route() {
  const m = location.hash.match(/^#\/time\/([\w-]+)/);
  if (m) renderTeam(m[1]);
  else renderHome();
  window.scrollTo(0, 0);
}

const rulesBtn = document.querySelector(".rules-btn");
rulesBtn.addEventListener("click", () => {
  const box = document.getElementById("rules");
  box.hidden = !box.hidden;
  rulesBtn.setAttribute("aria-expanded", String(!box.hidden));
});

load()
  .then(() => {
    window.addEventListener("hashchange", route);
    route();
  })
  .catch((e) => {
    app.innerHTML = `<p>Não deu pra carregar os dados (${esc(e.message)}).</p>`;
  });
