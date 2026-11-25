FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends stockfish python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3001 STOCKFISH_PATH=/usr/games/stockfish DB_PATH=/data/dc-chess.db TRUST_PROXY=1 COOKIE_SECURE=1
EXPOSE 3001
CMD ["npm", "start"]
