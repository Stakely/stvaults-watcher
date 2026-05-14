FROM node:24-alpine

WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY src ./src

RUN chown -R node:node /app

ENV NODE_ENV=production

USER node
CMD ["node", "src/index.js"]