FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src

RUN chown -R node:node /app

ENV NODE_ENV=production

USER node
CMD ["node", "src/index.js"]