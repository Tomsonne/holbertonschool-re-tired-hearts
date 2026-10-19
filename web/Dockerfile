# --- Compilation ------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Service des fichiers statiques ----------------------------------------
FROM nginx:1.27-alpine
# nginx sert l'application compilée et transmet /api à NestJS : une seule origine
# pour le navigateur, donc pas de CORS.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
