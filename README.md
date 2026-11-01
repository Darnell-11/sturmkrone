# Sturmkrone 2.0

Anime-Piratenabenteuer für Browser auf Handy und PC. Projektbriefing: [CLAUDE.md](CLAUDE.md) · Neuigkeiten: [CHANGELOG.md](CHANGELOG.md) · Lizenzen: [CREDITS.md](CREDITS.md)

## Auf dem eigenen PC starten

Einmalig nötig: [Node.js](https://nodejs.org) (LTS) und [Git](https://git-scm.com).

```bash
npm install
npm run dev
```

Danach im Browser `http://localhost:5173` öffnen. Im selben WLAN geht es auch am Handy: Die Adresse steht im Terminal unter „Network“.

## Weitere Befehle

| Befehl | Wirkung |
|---|---|
| `npm test` | automatische Tests |
| `npm run build` | fertige Version in `dist/` bauen |
| `npm run preview` | gebaute Version ansehen |
| `npm run icons` | App-Symbole aus `public/favicon.svg` neu erzeugen |

## Veröffentlichung

Jeder Push auf den Zweig `main` baut das Spiel und veröffentlicht es über GitHub Pages ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).
