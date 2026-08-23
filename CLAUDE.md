# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build step, no linter, and no test suite (`npm test` is a stub that exits 1).

```bash
npm install                 # install deps
node src/index.js           # run the bot (must be from repo root — see image-processor note)
node -c src/<file>.js       # syntax-check a single file; the closest thing to a test
docker build -t discord-js-bot . && docker run --env-file .env discord-js-bot
```

Verifying a change usually means running the bot against the real Discord guild and exercising the command in-server.

### Environment

`.env` (gitignored) supplies: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, plus `TWITTER_TARGET_USERNAME` and `DISCORD_TWEET_CHANNEL_ID` (leftovers from unfinished Twitter-monitor work).

### Deployment

Push to `master` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml): build → push to `ghcr.io/soraalam1/discord-js-bot` → SSH to the NAS at `/volume2/docker/discord-bot` → `docker compose pull && up -d`. The `docker-compose.yml` lives on the NAS, not in this repo. The image builds with `npm ci --only=production`, so a new dependency must be committed to **both** `package.json` and `package-lock.json` or the container will crash on startup even though it works locally.

## Architecture

Single-process discord.js v14 bot. [src/index.js](src/index.js) is the only entry point: it constructs the client, logs in, and wires every feature module directly to raw gateway events.

**There is no command router.** On each `interactionCreate`, *every* handler is invoked and each self-filters by `interaction.commandName` (`handleReminder` checks `=== 'remindme'`, `handleGameStart` matches against `GAME_LIST`, etc.). Same for `messageCreate`. Adding a feature therefore takes three edits: a new module exporting a handler, a call added to the relevant event in `index.js`, and a command definition in `register-commands.js`.

### Slash command registration

[src/register-commands.js](src/register-commands.js) registers on the `ready` event as **guild** commands scoped to `DISCORD_GUILD_ID` (instant propagation, no global cache delay). It also does double duty as role-ID resolution: `updateRoleValues` walks the live guild role cache at startup and fills in `ASSIGNABLE_ROLES[].value` (used as slash-command choice values) and the exported mutable `MENTIONABLE_ROLES` map (name → role ID, consumed by `typing-games.js` for `<@&id>` pings). Role names in those two arrays must match Discord role names **exactly**, or values stay `null` and mentions render broken.

### Games ([src/typing-games.js](src/typing-games.js))

All game state lives in module-level globals (`correctAnswer`, `leaderBoard`, `isGameOngoing`, …), so **only one game can run server-wide at a time** — enforced by the `isGameOngoing` guard. Round flow: `postReady` → `playRound` (dispatch on `commandName`) → `typeMessageAndSetAnswer` posts after a 5s typing delay and arms a 30s `setTimeout`; a correct answer arriving via `messageCreate` → `handleAnswerAttempt` clears that timeout, then `cleanDataForNextRound` + recursive `postReady`. Scoring is speed-based (faster = more of 100) plus 20 bonus points for each wrong guess that preceded the correct one.

Games pull from external APIs (`random-word-api.herokuapp.com`, `pokeapi.glitch.me`, `db.ygoprodeck.com`); an API failure ends the game early via `showAndResetLeaderboard`. Note the hardcoded fixes for Pokémon #112 (Rhydon) and #720 (Hoopa), whose names the Pokédex API returns wrong.

### Link rewriting ([src/vx-util.js](src/vx-util.js))

The most intricate module. On every message it maps `twitter.com`/`x.com` → `vxtwitter.com`, `tiktok.com` → `tiktokez.com`, `instagram.com` → `kkinstagram.com`, then:

1. Bails early if the user already used a fixed domain themselves.
2. For Twitter only, queries `api.vxtwitter.com` and reposts **only if** the tweet has media or is a quote-tweet.
3. Suppresses the embed on the original message — twice, the second time after a 6s `setTimeout`, as a workaround for embeds Discord attaches late.
4. Reposts the rewritten URL through a **throwaway channel webhook** created and deleted per message, impersonating the author with a mangled display name (`decideName` / `decideNameForTikTok` prefix `vx`/suffix `ez` according to the shape of the existing name).
5. Records original-message-ID → webhook-message-ID in an in-memory map capped at 10 entries, so `deleteVxLink` on `messageDelete` can remove the repost when the user deletes their original.

State is in-memory only — a restart drops the delete-tracking map.

### Image generation ([src/image-processor.js](src/image-processor.js))

`@napi-rs/canvas` composites the Pokémon sprite over `./img/pokemontemplate2.png` — a **relative** path, so the bot must be started with the repo root as cwd (the Dockerfile's `WORKDIR /app` satisfies this). "Who's that Pokémon?" silhouettes work by zeroing RGB while preserving the alpha channel.

## Known loose ends

- [src/twitter.js](src/twitter.js) exports a configured `@the-convocation/twitter-scraper` instance (routed through a corsproxy.io transform) but **nothing imports it**, and the package is present in `node_modules` yet missing from `package.json`. Wiring it into `index.js` without first adding the dependency will build fine locally and crash in Docker.
- `data/` exists but is empty and unused; there is no persistence layer anywhere in the bot.
