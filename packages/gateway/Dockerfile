FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/gateway/package.json packages/gateway/package.json

RUN npm install

COPY packages/shared packages/shared
COPY packages/gateway packages/gateway

RUN npm run build --workspace @share-mem/shared && npm run build --workspace @share-mem/gateway

ENV GATEWAY_PORT=8787
ENV SPACE_DIR=/space

EXPOSE 8787

CMD ["node", "packages/gateway/dist/index.js"]
