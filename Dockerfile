# Sturmkrone MMO-Relay-Server (4.8B) – schlankes Abbild ohne fremde Pakete.
# Der Server lädt die Spiel-Regeln direkt aus src/ (Node streift die TypeScript-Typen selbst ab), darum kommen server/ und src/ mit.
#
#   docker build -t sturmkrone-mmo .
#   docker run -p 8787:8787 --env-file .env sturmkrone-mmo
#
# Für GitHub Pages (https) braucht der Server eine wss://-Adresse: hinter einem Hoster mit TLS (Render, Fly.io, Railway …) oder einem Tunnel.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    ALLOWED_ORIGINS=*

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY src ./src

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["node", "server/mmoRelayServer.mjs"]
