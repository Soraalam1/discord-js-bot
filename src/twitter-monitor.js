const {fetchStatusesSince, isOriginalPost} = require("./fx-twitter");

const DEFAULT_POLL_INTERVAL_MS = 60000;
const DEFAULT_MAX_TWEET_AGE_MS = 15 * 60 * 1000;
const TWEETS_PER_POLL = 20;
const MAX_POSTS_PER_POLL = 3;
const MAX_BACKOFF_MS = 10 * 60 * 1000;
// FxTwitter renders a translated embed when the URL ends in a language code, and its translated
// embed still shows the original text alongside it. English is the only target we want.
const TRANSLATE_TO = "en";
// Discord rejects webhook names containing these, and caps them at 80 characters.
const FORBIDDEN_WEBHOOK_WORDS = /clyde|discord/gi;
const MAX_WEBHOOK_NAME = 80;

// Each watched account gets its own suffix. "" is the original single-account config.
const WATCH_SUFFIXES = ["", "_2", "_3"];

const readIntEnv = (name, fallback) => {
    const parsed = Number.parseInt(process.env[name], 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

const toBigIntId = (id) => {
    try {
        return BigInt(id);
    } catch (error) {
        console.error(`Tweet monitor got an unparseable tweet ID: ${id}`);
        return null;
    }
}

const readWatchConfigs = () => {
    const configs = [];

    for (const suffix of WATCH_SUFFIXES) {
        const username = (process.env[`TWITTER_TARGET_USERNAME${suffix}`] || "").trim();

        if (!username) {
            continue;
        }

        // Falls back to the primary channel so a second account can share it without extra config.
        const channelId = (process.env[`DISCORD_TWEET_CHANNEL_ID${suffix}`] || process.env.DISCORD_TWEET_CHANNEL_ID || "").trim();

        if (!channelId) {
            console.log(`Tweet monitor skipping @${username}, no channel ID is configured for it.`);
            continue;
        }

        configs.push({
            username: username.replace(/^@/, ""),
            channelId
        });
    }

    return configs;
}

// Retweets and replies are dropped; the endpoint never injects the pinned tweet, so there is no
// pin case to handle here.
const collectOriginalTweets = async (watch) => {
    const statuses = await fetchStatusesSince(watch.config.username, watch.lastSeenTimestamp, TWEETS_PER_POLL);
    const tweets = [];
    // Tracked across *every* status, retweets and replies included, so `since` advances past them
    // too. Advancing only past qualifying posts would refetch the same retweets on every poll.
    let newestTimestamp = null;

    for (const status of statuses) {
        if (status.created_timestamp && (newestTimestamp === null || status.created_timestamp > newestTimestamp)) {
            newestTimestamp = status.created_timestamp;
        }

        if (!isOriginalPost(status)) {
            continue;
        }

        const id = toBigIntId(status.id);

        if (id === null || !status.created_timestamp) {
            continue;
        }

        tweets.push({
            id,
            lang: status.lang,
            author: status.author || null,
            timestamp: status.created_timestamp,
            timeParsed: new Date(status.created_timestamp * 1000)
        });
    }

    return {tweets, newestTimestamp};
}

// FxTwitter renders a translated embed when the URL ends in a language code, so anything not
// already in the target language gets the suffix. Same mechanism vx-util uses for pasted links.
const buildTweetUrl = (watch, tweet) => {
    const url = `https://fxtwitter.com/${watch.config.username}/status/${tweet.id}`;

    if (!tweet.lang || tweet.lang === TRANSLATE_TO) {
        return url;
    }

    return `${url}/${TRANSLATE_TO}`;
}

const buildWebhookProfile = (watch, tweet) => {
    const author = tweet.author || {};
    // Display name, not the handle. Falls back to the handle if it is missing or sanitises away.
    const name = (author.name || "").replace(FORBIDDEN_WEBHOOK_WORDS, "").trim().slice(0, MAX_WEBHOOK_NAME);

    return {
        name: name || watch.config.username,
        avatar: author.avatar_url || undefined
    };
}

// Impersonates the tweeting account, the same throwaway-webhook approach vx-util uses for pasted
// links. Falls back to a plain channel message so a webhook failure never loses a notification.
const postAsAccount = async (watch, url, profile) => {
    let webhook;

    try {
        webhook = await watch.channel.createWebhook(profile);
        await webhook.send(url);
    } catch (error) {
        console.error(`Tweet monitor could not post through a webhook in #${watch.channel.name}, falling back to a plain message:`, error.message);

        if (!webhook) {
            await watch.channel.send(url);
        }
    } finally {
        if (webhook) {
            await webhook.delete().catch(error => console.error(`Tweet monitor could not clean up its webhook in #${watch.channel.name}:`, error.message));
        }
    }
}

const pollOnce = async (watch, maxTweetAgeMs) => {
    const {username} = watch.config;
    const isSeeding = watch.lastSeenTimestamp === null;
    const {tweets, newestTimestamp} = await collectOriginalTweets(watch);

    // Park the cursor one second behind the newest post. The endpoint filters strictly
    // (`created_timestamp > since`), so parking it *on* the newest timestamp would permanently
    // hide any sibling posted within that same second. Re-fetching the boundary second costs one
    // already-seen status per poll, and lastSeenId discards it below.
    const cursor = newestTimestamp === null ? null : newestTimestamp - 1;

    if (cursor !== null && (watch.lastSeenTimestamp === null || cursor > watch.lastSeenTimestamp)) {
        watch.lastSeenTimestamp = cursor;
    }

    const previousId = watch.lastSeenId;
    const newestId = tweets.reduce((newest, tweet) => (newest === null || tweet.id > newest ? tweet.id : newest), null);

    if (newestId !== null && (watch.lastSeenId === null || newestId > watch.lastSeenId)) {
        watch.lastSeenId = newestId;
    }

    // The first poll after startup only establishes a baseline. There is no persistence in this
    // bot, so without this a restart would repost whatever the timeline still shows.
    if (isSeeding) {
        // An account with no qualifying posts yet still needs a cursor, or `since` stays unset.
        if (watch.lastSeenTimestamp === null) {
            watch.lastSeenTimestamp = Math.floor(Date.now() / 1000);
        }

        console.log(`Tweet monitor seeded on @${username} at tweet ${newestId ?? "(none)"}, watching for new posts.`);
        return;
    }

    // `since` already filters server-side; the ID check breaks ties inside the same second.
    const unseen = tweets
        .filter(tweet => previousId === null || tweet.id > previousId)
        .sort((a, b) => (a.id < b.id ? -1 : 1));

    if (unseen.length === 0) {
        return;
    }

    const now = Date.now();
    const fresh = unseen.filter(tweet => {
        const postedAt = tweet.timeParsed ? tweet.timeParsed.getTime() : null;

        if (postedAt === null) {
            console.log(`Tweet monitor skipping tweet ${tweet.id} from @${username}, it has no timestamp.`);
            return false;
        }

        if (now - postedAt > maxTweetAgeMs) {
            console.log(`Tweet monitor skipping tweet ${tweet.id} from @${username}, it is older than the freshness window.`);
            return false;
        }

        return true;
    });

    // A thread posted all at once should not flood the channel. Anything over the cap is dropped
    // rather than queued, since by the next poll it would no longer be a new-tweet alert.
    if (fresh.length > MAX_POSTS_PER_POLL) {
        console.log(`Tweet monitor found ${fresh.length} new tweets from @${username}, posting only the oldest ${MAX_POSTS_PER_POLL}.`);
    }

    for (const tweet of fresh.slice(0, MAX_POSTS_PER_POLL)) {
        const url = buildTweetUrl(watch, tweet);
        await postAsAccount(watch, url, buildWebhookProfile(watch, tweet));
        const translated = url.endsWith(`/${TRANSLATE_TO}`) ? ` (translated from ${tweet.lang})` : "";
        console.log(`Tweet monitor posted new tweet ${tweet.id} from @${username} in #${watch.channel.name}${translated}.`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY TEST CODE — delete this whole block (and its call in
// startTweetMonitor, marked the same way) once local testing is done.
//
// Set TWEET_MONITOR_TEST_TWEET_ID in .env to a tweet ID and the bot will post
// that tweet once on startup, through the real webhook + translation path.
// Unset (the default) it does nothing, so it stays inert on the NAS.
// ─────────────────────────────────────────────────────────────────────────────
const postTestTweet = async (watch) => {
    const testTweetId = (process.env.TWEET_MONITOR_TEST_TWEET_ID || "").trim();

    if (!testTweetId) {
        return;
    }

    const axios = require("axios");

    try {
        const response = await axios.get(`https://api.fxtwitter.com/i/status/${testTweetId}`, {
            timeout: 10000,
            headers: {"User-Agent": "discord-js-bot (tweet notifier)"}
        });

        const status = response?.data?.tweet;

        if (!status) {
            console.log(`[TEST] Could not fetch tweet ${testTweetId}.`);
            return;
        }

        const handle = status.author?.screen_name || watch.config.username;
        const needsTranslation = status.lang && status.lang !== TRANSLATE_TO;
        const url = `https://fxtwitter.com/${handle}/status/${status.id}${needsTranslation ? `/${TRANSLATE_TO}` : ""}`;
        const profile = buildWebhookProfile(watch, {author: status.author});

        console.log(`[TEST] Posting ${url} as "${profile.name}" in #${watch.channel.name}`);
        await postAsAccount(watch, url, profile);
        console.log(`[TEST] Done. Remove TWEET_MONITOR_TEST_TWEET_ID to disable.`);
    } catch (error) {
        console.error(`[TEST] Failed to post test tweet ${testTweetId}:`, error.message);
    }
}
// ─────────────────────── END TEMPORARY TEST CODE ─────────────────────────────

const startWatch = (watch, pollIntervalMs, maxTweetAgeMs) => {
    // Self-scheduling rather than setInterval so a slow or hung fetch can never stack up.
    const scheduleNextPoll = (delay) => {
        setTimeout(async () => {
            try {
                await pollOnce(watch, maxTweetAgeMs);
                watch.consecutiveFailures = 0;
            } catch (error) {
                watch.consecutiveFailures++;
                console.error(`Tweet monitor poll ${watch.consecutiveFailures} failed for @${watch.config.username}:`, error.message);
            }

            const backoff = Math.min(pollIntervalMs * Math.pow(2, watch.consecutiveFailures), MAX_BACKOFF_MS);
            scheduleNextPoll(watch.consecutiveFailures === 0 ? pollIntervalMs : backoff);
        }, delay);
    }

    scheduleNextPoll(0);
}

const startTweetMonitor = async (client) => {
    const configs = readWatchConfigs();

    if (configs.length === 0) {
        console.log("Tweet monitor disabled, TWITTER_TARGET_USERNAME or DISCORD_TWEET_CHANNEL_ID is not set.");
        return;
    }

    const pollIntervalMs = readIntEnv("TWITTER_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS);
    const maxTweetAgeMs = readIntEnv("MAX_TWEET_AGE_MS", DEFAULT_MAX_TWEET_AGE_MS);
    let isFirstWatch = true; // TEMPORARY TEST CODE

    for (const config of configs) {
        let channel;
        try {
            channel = await client.channels.fetch(config.channelId);
        } catch (error) {
            console.error(`Tweet monitor could not fetch channel ${config.channelId} for @${config.username}, skipping it.`, error);
            continue;
        }

        if (!channel || !channel.isTextBased()) {
            console.error(`Tweet monitor found no text channel for ID ${config.channelId}, skipping @${config.username}.`);
            continue;
        }

        // Every watched account keeps its own cursors and failure count so one account going
        // quiet or erroring can never affect another.
        const watch = {
            config,
            channel,
            lastSeenId: null,
            lastSeenTimestamp: null,
            consecutiveFailures: 0
        };

        console.log(`Tweet monitor watching @${config.username} in #${channel.name} every ${pollIntervalMs}ms, translating non-${TRANSLATE_TO} tweets.`);
        startWatch(watch, pollIntervalMs, maxTweetAgeMs);

        // TEMPORARY TEST CODE — delete this line with the postTestTweet block above.
        if (isFirstWatch) {
            isFirstWatch = false;
            await postTestTweet(watch);
        }
    }
}

module.exports = {
    startTweetMonitor
}
