FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY server.ts ./
COPY tsconfig.json ./

# tsx is needed at runtime to execute server.ts
RUN npm install tsx

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "--import", "tsx", "server.ts"]
