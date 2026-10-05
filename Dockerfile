# Papercliped bridge — runs on any Docker host (Render free web service, Fly, Koyeb, a VPS).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY package.json ./
USER node
EXPOSE 10000
# Render injects PORT (default 10000); the bridge binds 0.0.0.0 when PORT is set.
CMD ["node", "dist/http.js"]
