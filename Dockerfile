FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 PAYMENT_MODE=disabled
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3001
CMD ["node", "backend/src/index.js"]
