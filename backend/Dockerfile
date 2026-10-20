FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
COPY patches ./patches
RUN npm ci --include=dev && npm prune --omit=dev && npm cache clean --force

COPY src ./src

USER node
EXPOSE 5000
CMD ["node", "src/server.js"]
