FROM node:18.12.0-alpine

# Copy package files first for better Docker layer caching
COPY ./package.json /opt/openai-slack-bot/
COPY ./yarn.lock /opt/openai-slack-bot/

WORKDIR /opt/openai-slack-bot

# Install all dependencies (including dev dependencies for TypeScript compilation)
RUN yarn install

# Copy configuration files
COPY ./tsconfig.json /opt/openai-slack-bot/
COPY ./jsconfig.json /opt/openai-slack-bot/

# Copy source code
COPY ./src /opt/openai-slack-bot/src

# Build TypeScript files
RUN yarn build

# Clean up dev dependencies after build to reduce image size
RUN yarn install --production && yarn cache clean

CMD ["yarn", "start:prod"]
