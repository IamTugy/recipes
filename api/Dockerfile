FROM node:20-alpine AS builder
WORKDIR /app
COPY api/package*.json ./
RUN npm ci
COPY api/. .
COPY src/data/recipes ./recipe-data
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
ENV RECIPE_DATA_DIR=./recipe-data
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/recipe-data ./recipe-data
EXPOSE 80
CMD ["node", "dist/main.js"]
