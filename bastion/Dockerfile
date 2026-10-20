FROM node:20-alpine

RUN apk add --no-cache openssh-server mariadb-client bash shadow

WORKDIR /app
COPY backend/package*.json ./
COPY backend/patches ./patches
RUN npm ci --include=dev && npm prune --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY bastion/entrypoint.sh /bastion/entrypoint.sh

EXPOSE 22
CMD ["sh", "/bastion/entrypoint.sh"]
