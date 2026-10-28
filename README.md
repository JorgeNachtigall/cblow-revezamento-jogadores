# CBLOW · Rodízio

> **Disclaimer:** feito em menos de 5 minutos. Tudo estático, sem backend, sem build, sem framework — porque sim. É pra ser simples e sem incomodação. Projeto de fã, não oficial.

Site estático (GitHub Pages) que mostra, para cada time do [CBLOW](https://cblow.xyz), quem ainda precisa ser escalado segundo a regra de rodízio:

- O elenco inteiro precisa jogar antes de uma escalação se repetir (regra 2.3).
- Enquanto houver gente na fila, a próxima escalação precisa ter **pelo menos um** deles; se sobrar só um, ele **joga obrigatoriamente**.
- Pé de Chumbo fica fora da conta (2.4). Quem saiu ou foi condenado na CPI sai da fila. Presidentes que jogam não contam.
- A fila zera nos playoffs (2.5).

## Como funciona

- `scripts/update-data.sh` baixa times, elencos e lineups de `https://api.cblow.xyz` e grava `data/cblow.json`.
  A API não libera CORS, então o site lê esse snapshot em vez de chamar a API direto.
- `.github/workflows/update-data.yml` roda o script a cada 30 min e commita se algo mudou.
- `rotation.js` tem toda a lógica do rodízio; `app.js` só desenha.
- `config.json` guarda o que a API não informa:
  - `entradas`: data em que um jogador entrou no elenco (quem chegou depois não trava a volta anterior). As datas atuais são estimadas — corrija se souber as reais.
  - `playoffs`: regex da fase ou id da primeira partida de playoffs, para zerar a fila.
  - `ausencias`: período em que um jogador não podia jogar. Nesse período o time não é cobrado por deixá-lo de fora, mas ele continua na fila. Se só ausentes sobraram na fila, a próxima volta começa em paralelo: quem joga a partir dali já conta nela.
  - `ignorar` e `naoContar`: exceções manuais (ex.: regra 3.2).

## Rodar localmente

```sh
./scripts/update-data.sh
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Publicar

1. Crie o repositório no GitHub e faça push.
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. Settings → Actions → General → Workflow permissions: *Read and write* (para o Action commitar os dados).
