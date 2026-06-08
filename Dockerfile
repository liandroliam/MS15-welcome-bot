FROM node:22-alpine

RUN apk add --no-cache fontconfig ttf-dejavu

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

CMD ["node", "index.js"]