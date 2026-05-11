# THE ORB — Motor Astrológico v0.2

Motor astrológico completo em JavaScript puro. Zero dependências externas.

## Endpoints

- `GET  /health` — status do servidor
- `POST /chart` — mapa natal
- `POST /synastry` — sinastria entre dois mapas
- `POST /transits` — trânsitos sobre mapa natal
- `GET  /geocode?q=` — busca de cidade

## Rodar local

```bash
npm start
```

Servidor sobe em `http://localhost:3000`.

## Deploy

Pronto pra Railway, Fly.io, Render. Sem build step, sem dependências nativas.
A variável de ambiente `PORT` é lida automaticamente.

## Validação

134/134 testes batendo contra Astro-Seek:
- 60/60 posições planetárias
- 52/52 casas Placidus
- 78/78 aspectos de sinastria
- 22/23 trânsitos
