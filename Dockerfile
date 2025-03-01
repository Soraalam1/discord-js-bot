FROM node:latest

#ARG DISCORD_BOT_TOKEN
#ARG DISCORD_GUILD_ID
#ARG DISCORD_CLIENT_ID

# Set env variables
#ENV DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
#ENV DISCORD_GUILD_ID=$DISCORD_GUILD_ID
#ENV DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID

# Mount imported secrets to Dockerfile ENV variables
RUN --mount=type=secret,id=DISCORD_BOT_TOKEN,env=DISCORD_BOT_TOKEN \
    --mount=type=secret,id=DISCORD_GUILD_ID,env=DISCORD_GUILD_ID \
    --mount=type=secret,id=DISCORD_CLIENT_ID,env=DISCORD_CLIENT_ID

# Create the directory!
RUN mkdir -p /usr/src/bot

WORKDIR /usr/src/bot

# Copy and install our precious bot
COPY . /usr/src/bot
RUN npm install

# Start me!
CMD ["node", "src/index.js"]