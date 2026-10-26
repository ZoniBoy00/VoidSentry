FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile --production

COPY . .

USER node

# The bot has no HTTP port; "healthy" means the Node process is running.
# Use a restart policy so crashes (the bot exits on uncaught exceptions) are recovered:
#   docker run --restart unless-stopped --env-file .env voidsentry
CMD ["node", "index.js"]
