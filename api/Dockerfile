# --- Compilation ------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Exécution --------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# --ignore-scripts : aucun script d'installation n'est exécuté dans l'image finale.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
# L'image tourne sans privilèges.
USER node
EXPOSE 3000
# Les migrations sont jouées au démarrage, une fois PostgreSQL déclaré sain par Compose.
CMD ["sh", "-c", "npx typeorm -d dist/database/data-source.js migration:run && node dist/main.js"]
