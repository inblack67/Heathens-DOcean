FROM node:14

WORKDIR /apps/heathens

COPY . .

RUN yarn

RUN yarn build

ENV NODE_ENV=develpment

CMD [ "node", "dist/index.js" ]

USER node
