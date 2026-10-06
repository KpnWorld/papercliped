# Papercliped bridge + website — runs on any Docker host (Render free web service, Fly, Koyeb, a VPS).

# 1. The bridge (TypeScript → dist/)
FROM node:22-alpine AS bridge
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build && npm prune --omit=dev

# 2. The website (web/ → web/dist). It reads CHANGELOG.md, site/ and a few shared modules in src/ at build time.
FROM node:22-alpine AS website
WORKDIR /app
COPY web/package*.json ./web/
RUN npm --prefix web ci
COPY CHANGELOG.md ./
COPY site ./site
COPY src/site/markdown.ts ./src/site/markdown.ts
COPY src/public-api/types.ts ./src/public-api/types.ts
COPY src/web/csp.ts ./src/web/csp.ts
COPY web ./web
RUN npm --prefix web run build

# 3. Runtime: only what the bridge needs, plus the built website.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=bridge /app/node_modules ./node_modules
COPY --from=bridge /app/dist ./dist
COPY --from=bridge /app/migrations ./migrations
COPY --from=website /app/web/dist ./web/dist
COPY site ./site
COPY package.json ./
USER node
EXPOSE 10000
# Render injects PORT (default 10000); the bridge binds 0.0.0.0 when PORT is set. The website is found at /app/web/dist.
CMD ["node", "dist/http.js"]
