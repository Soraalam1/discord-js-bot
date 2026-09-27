const axios = require("axios");
const {EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");
const {MENTIONABLE_ROLES} = require("./register-commands");

const DEFAULT_POLL_INTERVAL_MS = 60000;
const DEFAULT_YOUTUBE_MATCH_WINDOW_MIN = 60;
const MAX_BACKOFF_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
// A stream already this old on the first poll after startup is assumed to have been announced
// before the restart, so a redeploy mid-stream does not ping everyone again.
const RESTART_GRACE_MS = 10 * 60 * 1000;
// Twitch sometimes hands out a new stream ID after a dropped connection. Coming back inside this
// window updates the existing alert instead of pinging a second time.
const FLAP_WINDOW_MS = 10 * 60 * 1000;
// YouTube usually starts a minute or two after Twitch, so the alert goes out immediately and the
// YouTube link is edited in once it shows up.
const YOUTUBE_RETRY_INTERVAL_MS = 60000;
const YOUTUBE_MAX_RETRIES = 10;
// /live surfaces a single video, so the newest few feed entries are checked too, which catches a
// scheduled stream that /live is not showing yet. Each check downloads a full watch page.
const YOUTUBE_RSS_SCAN = 3;
// A desktop browser UA gets the full watch page. SOCS skips the EU cookie-consent interstitial.
const YOUTUBE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
    "Accept-Language": "en-US",
    Cookie: "SOCS=CAI"
};
// How far back to look for our own alert when adopting one after a restart.
const RECENT_MESSAGE_SCAN = 20;
const ROLE_NAME = "Stream Alerts";
const TWITCH_PURPLE = 0x9146FF;

const readIntEnv = (name, fallback) => {
    const parsed = Number.parseInt(process.env[name], 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

const readConfig = () => {
    const env = (name) => (process.env[name] || "").trim();
    const config = {
        twitchClientId: env("TWITCH_CLIENT_ID"),
        twitchClientSecret: env("TWITCH_CLIENT_SECRET"),
        twitchLogin: env("TWITCH_USERNAME").toLowerCase(),
        channelId: env("DISCORD_STREAM_ALERT_CHANNEL_ID"),
        youtubeChannelId: env("YOUTUBE_CHANNEL_ID"),
        pollIntervalMs: readIntEnv("TWITCH_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS),
        youtubeMatchWindowMs: readIntEnv("YOUTUBE_MATCH_WINDOW_MIN", DEFAULT_YOUTUBE_MATCH_WINDOW_MIN) * 60 * 1000
    };

    config.youtubeEnabled = Boolean(config.youtubeChannelId);
    return config;
}

// ── Twitch ───────────────────────────────────────────────────────────────────

let appToken = null;

const getAppToken = async (config, forceRefresh = false) => {
    if (!forceRefresh && appToken && Date.now() < appToken.expiresAt) {
        return appToken.value;
    }

    const response = await axios.post("https://id.twitch.tv/oauth2/token", null, {
        timeout: REQUEST_TIMEOUT_MS,
        params: {
            client_id: config.twitchClientId,
            client_secret: config.twitchClientSecret,
            grant_type: "client_credentials"
        }
    });

    // Refreshed a minute early so a poll never goes out with a token that expires mid-request.
    appToken = {
        value: response.data.access_token,
        expiresAt: Date.now() + (response.data.expires_in - 60) * 1000
    };

    return appToken.value;
}

const twitchGet = async (config, path, params) => {
    const request = async (token) => axios.get(`https://api.twitch.tv/helix/${path}`, {
        timeout: REQUEST_TIMEOUT_MS,
        params,
        headers: {
            "Client-Id": config.twitchClientId,
            Authorization: `Bearer ${token}`
        }
    });

    try {
        return (await request(await getAppToken(config))).data;
    } catch (error) {
        // Twitch can revoke app tokens early; one retry with a fresh token covers that.
        if (error.response?.status !== 401) {
            throw error;
        }

        return (await request(await getAppToken(config, true))).data;
    }
}

const fetchLiveStream = async (config) => {
    const data = await twitchGet(config, "streams", {user_login: config.twitchLogin});
    return data?.data?.[0] || null;
}

const fetchBoxArtUrl = async (config, gameId) => {
    if (!gameId) {
        return null;
    }

    try {
        const data = await twitchGet(config, "games", {id: gameId});
        const template = data?.data?.[0]?.box_art_url;
        return template ? template.replace("{width}x{height}", "570x760") : null;
    } catch (error) {
        console.error(`Stream monitor could not fetch box art for game ${gameId}:`, error.message);
        return null;
    }
}

// ── YouTube ──────────────────────────────────────────────────────────────────
// No Data API: new Google Cloud projects get a quota of 0 until they pass an audit. The public
// pages carry everything needed instead, so no key is involved.

const fetchYouTubePage = async (url) => {
    const response = await axios.get(url, {
        timeout: REQUEST_TIMEOUT_MS,
        responseType: "text",
        headers: YOUTUBE_HEADERS
    });

    return response.data;
}

// Only the video IDs are needed, so a regex stands in for an XML parser. Newest first.
const fetchRecentVideoIds = async (config) => {
    const xml = await fetchYouTubePage(`https://www.youtube.com/feeds/videos.xml?channel_id=${config.youtubeChannelId}`);
    return [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map(match => match[1]);
}

// A channel's /live page is canonicalised to the watch URL of its current (or next scheduled)
// stream, and to the channel itself when there is none.
const fetchLivePageVideoId = async (config) => {
    const html = await fetchYouTubePage(`https://www.youtube.com/channel/${config.youtubeChannelId}/live`);
    return html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1] || null;
}

// Returns null for a video that was never a live stream.
const fetchVideoStreamInfo = async (videoId) => {
    const html = await fetchYouTubePage(`https://www.youtube.com/watch?v=${videoId}`);
    const detailsJson = html.match(/"liveBroadcastDetails":(\{[^}]*\})/)?.[1];

    if (!detailsJson) {
        return null;
    }

    let details;
    try {
        details = JSON.parse(detailsJson);
    } catch (error) {
        return null;
    }

    const status = details.isLiveNow ? "live" : html.includes('"isUpcoming":true') ? "upcoming" : "ended";
    // Scheduled streams may only carry their start time on the offline slate, in Unix seconds.
    const scheduledSeconds = html.match(/"scheduledStartTime":"(\d+)"/)?.[1];
    const startMs = Date.parse(details.startTimestamp || "") || (scheduledSeconds ? Number(scheduledSeconds) * 1000 : NaN);

    return {id: videoId, status, startMs};
}

const toYouTubeLink = (video) => ({url: `https://www.youtube.com/watch?v=${video.id}`, status: video.status});

// Live beats upcoming, then whichever starts closest to the Twitch stream.
const pickMatchingVideo = (videos, twitchStartMs, windowMs) => {
    const match = videos
        .filter(video => (video.status === "live" || video.status === "upcoming") && Math.abs(video.startMs - twitchStartMs) <= windowMs)
        .sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === "live" ? -1 : 1;
            }

            return Math.abs(a.startMs - twitchStartMs) - Math.abs(b.startMs - twitchStartMs);
        })[0];

    return match ? toYouTubeLink(match) : null;
}

// Never throws: a YouTube problem must not block or break the Twitch alert.
const findYouTubeStream = async (config, announcement) => {
    if (!config.youtubeEnabled) {
        return null;
    }

    const twitchStartMs = Date.parse(announcement.stream.started_at);

    try {
        const videos = [];
        const liveId = await fetchLivePageVideoId(config);

        if (liveId) {
            const info = await fetchVideoStreamInfo(liveId);
            const match = info && pickMatchingVideo([info], twitchStartMs, config.youtubeMatchWindowMs);

            if (match) {
                return match;
            }
        }

        const recentIds = (await fetchRecentVideoIds(config)).filter(id => id !== liveId).slice(0, YOUTUBE_RSS_SCAN);

        for (const id of recentIds) {
            const info = await fetchVideoStreamInfo(id);

            if (info) {
                videos.push(info);
            }
        }

        return pickMatchingVideo(videos, twitchStartMs, config.youtubeMatchWindowMs);
    } catch (error) {
        console.error("Stream monitor YouTube lookup failed:", error.message);
        return null;
    }
}

// ── Discord ──────────────────────────────────────────────────────────────────

const buildAlertPayload = (announcement) => {
    const {stream, boxArtUrl, youtube} = announcement;
    const twitchUrl = `https://twitch.tv/${stream.user_login}`;
    const watchLinks = [`[Twitch](${twitchUrl})`];

    if (youtube) {
        watchLinks.push(`[YouTube](${youtube.url})${youtube.status === "upcoming" ? " (starting soon)" : ""}`);
    }

    const embed = new EmbedBuilder()
        .setColor(TWITCH_PURPLE)
        .setAuthor({name: `${stream.user_name} is live on Twitch`, url: twitchUrl})
        .setTitle(stream.title || `${stream.user_name} is live!`)
        .setURL(twitchUrl)
        .addFields(
            {name: "Game", value: stream.game_name || "Unknown", inline: true},
            {name: "Watch", value: watchLinks.join(" • "), inline: true}
        )
        .setTimestamp(new Date(stream.started_at));

    // Box art rather than Twitch's live preview, which is a placeholder for the first few minutes.
    if (boxArtUrl) {
        embed.setImage(boxArtUrl);
    }

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Watch on Twitch").setURL(twitchUrl)
    );

    if (youtube) {
        buttons.addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Watch on YouTube").setURL(youtube.url)
        );
    }

    return {embeds: [embed], components: [buttons]};
}

const editAlert = async (announcement) => {
    try {
        await announcement.message.edit(buildAlertPayload(announcement));
    } catch (error) {
        console.error("Stream monitor could not edit its alert message:", error.message);
    }
}

const scheduleYouTubeFollowUp = (monitor, attempt = 1) => {
    clearTimeout(monitor.youtubeFollowUp);

    if (!monitor.config.youtubeEnabled) {
        return;
    }

    monitor.youtubeFollowUp = setTimeout(async () => {
        const announcement = monitor.announcement;

        // Stops once YouTube is found, the stream ends, or a different stream takes over.
        if (!announcement || announcement.youtube || monitor.currentStreamId !== announcement.stream.id) {
            return;
        }

        const youtube = await findYouTubeStream(monitor.config, announcement);

        if (youtube) {
            announcement.youtube = youtube;
            await editAlert(announcement);
            console.log(`Stream monitor added YouTube stream ${youtube.url} to the alert.`);
            return;
        }

        if (attempt < YOUTUBE_MAX_RETRIES) {
            scheduleYouTubeFollowUp(monitor, attempt + 1);
        } else {
            console.log("Stream monitor stopped looking for a YouTube stream, none matched.");
        }
    }, YOUTUBE_RETRY_INTERVAL_MS);
}

// `silent` renders the role mention without notifying anyone. A `youtube` option (including null)
// skips the lookup and uses that result instead.
const announce = async (monitor, stream, {silent = false, youtube} = {}) => {
    const announcement = {
        stream,
        message: null,
        boxArtUrl: await fetchBoxArtUrl(monitor.config, stream.game_id),
        youtube: null
    };
    announcement.youtube = youtube !== undefined ? youtube : await findYouTubeStream(monitor.config, announcement);

    const roleId = MENTIONABLE_ROLES.get(ROLE_NAME);

    if (!roleId) {
        console.error(`Stream monitor found no "${ROLE_NAME}" role, posting the alert without a ping.`);
    }

    const mention = roleId ? `<@&${roleId}> ` : "";
    announcement.message = await monitor.channel.send({
        content: `${mention}**${stream.user_name}** is live!`,
        allowedMentions: {roles: roleId && !silent ? [roleId] : []},
        ...buildAlertPayload(announcement)
    });
    monitor.announcement = announcement;

    console.log(`Stream monitor announced stream ${stream.id} in #${monitor.channel.name}${announcement.youtube ? ` with YouTube ${announcement.youtube.url}` : ""}.`);

    if (!announcement.youtube) {
        scheduleYouTubeFollowUp(monitor);
    }
}

// After a dropped connection the stream comes back under a new ID; refresh the existing alert
// with the new title/game instead of pinging again.
const refreshAlert = async (monitor, stream) => {
    const announcement = monitor.announcement;

    if (announcement.stream.game_id !== stream.game_id) {
        announcement.boxArtUrl = await fetchBoxArtUrl(monitor.config, stream.game_id);
    }

    announcement.stream = stream;
    await editAlert(announcement);
    console.log(`Stream monitor treated stream ${stream.id} as a reconnect and updated the existing alert.`);

    if (!announcement.youtube) {
        scheduleYouTubeFollowUp(monitor);
    }
}

// After a restart, looks for an alert this bot already posted for the current stream, so a
// redeploy right after going live neither double-pings nor loses the YouTube edit.
const findExistingAlert = async (monitor, stream) => {
    const startedAtMs = Date.parse(stream.started_at);

    try {
        const messages = await monitor.channel.messages.fetch({limit: RECENT_MESSAGE_SCAN});
        const message = messages.find(message =>
            message.author.id === monitor.channel.client.user.id &&
            message.embeds[0]?.timestamp &&
            Date.parse(message.embeds[0].timestamp) === startedAtMs
        );

        if (!message) {
            return null;
        }

        const youtubeUrl = message.components[0]?.components.find(button => button.url?.includes("youtube.com"))?.url;

        return {
            stream,
            message,
            boxArtUrl: message.embeds[0].image?.url || null,
            youtube: youtubeUrl ? {url: youtubeUrl, status: "live"} : null
        };
    } catch (error) {
        console.error("Stream monitor could not scan for an existing alert:", error.message);
        return null;
    }
}

const pollOnce = async (monitor) => {
    const stream = await fetchLiveStream(monitor.config);
    const isFirstPoll = monitor.isFirstPoll;
    monitor.isFirstPoll = false;

    if (!stream) {
        if (monitor.currentStreamId !== null) {
            console.log(`Stream monitor saw ${monitor.config.twitchLogin} go offline.`);
            monitor.currentStreamId = null;
            monitor.lastOfflineAt = Date.now();
        }

        return;
    }

    if (stream.id === monitor.currentStreamId) {
        return;
    }

    monitor.currentStreamId = stream.id;

    if (isFirstPoll) {
        const existing = await findExistingAlert(monitor, stream);

        if (existing) {
            monitor.announcement = existing;
            console.log(`Stream monitor adopted its existing alert for stream ${stream.id}.`);

            if (!existing.youtube) {
                scheduleYouTubeFollowUp(monitor);
            }

            return;
        }

        if (Date.now() - Date.parse(stream.started_at) > RESTART_GRACE_MS) {
            console.log(`Stream monitor started mid-stream (${stream.id}), not announcing it.`);
            return;
        }
    }

    const isReconnect = monitor.announcement && monitor.lastOfflineAt !== null && Date.now() - monitor.lastOfflineAt < FLAP_WINDOW_MS;

    if (isReconnect) {
        await refreshAlert(monitor, stream);
        return;
    }

    try {
        await announce(monitor, stream);
    } catch (error) {
        // Forget the stream so the next poll retries the alert instead of treating it as sent.
        monitor.currentStreamId = null;
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY TEST CODE — delete this whole block (and its call in
// startStreamMonitor, marked the same way) once local testing is done.
//
// Set STREAM_MONITOR_TEST_TWITCH_LOGIN in .env to a Twitch channel and the bot
// posts one alert for it on startup, through the real embed + posting path.
// The role mention renders but pings no one. If the channel is offline, the
// alert uses its current channel info (title/game) as if it had just gone live,
// and links the YouTube channel's most recent live stream.
// STREAM_MONITOR_TEST_YOUTUBE_CHANNEL_ID optionally overrides YOUTUBE_CHANNEL_ID.
// Unset (the default) it does nothing, so it stays inert on the NAS.
// ─────────────────────────────────────────────────────────────────────────────

// Channel info is what Twitch shows for the next/last stream, and has every field the embed uses.
const buildOfflineTestStream = async (config) => {
    const user = (await twitchGet(config, "users", {login: config.twitchLogin}))?.data?.[0];

    if (!user) {
        return null;
    }

    const channel = (await twitchGet(config, "channels", {broadcaster_id: user.id}))?.data?.[0];

    return {
        id: `test-${Date.now()}`,
        user_login: user.login,
        user_name: user.display_name,
        game_id: channel?.game_id || "",
        game_name: channel?.game_name || "",
        title: channel?.title || "",
        started_at: new Date().toISOString()
    };
}

// The channel's newest video that was a live stream, whether it is live, scheduled or finished.
// The feed only holds the latest 15 videos, so an older stream is not found.
const findLastYouTubeStream = async (config) => {
    for (const id of await fetchRecentVideoIds(config)) {
        const info = await fetchVideoStreamInfo(id);

        if (info) {
            return toYouTubeLink(info);
        }
    }

    return null;
}

const postTestAlert = async (monitor) => {
    const testLogin = (process.env.STREAM_MONITOR_TEST_TWITCH_LOGIN || "").trim().toLowerCase();

    if (!testLogin) {
        return;
    }

    const youtubeChannelId = (process.env.STREAM_MONITOR_TEST_YOUTUBE_CHANNEL_ID || "").trim() || monitor.config.youtubeChannelId;
    const config = {
        ...monitor.config,
        twitchLogin: testLogin,
        youtubeChannelId,
        youtubeEnabled: Boolean(youtubeChannelId)
    };

    try {
        const liveStream = await fetchLiveStream(config);
        const stream = liveStream || await buildOfflineTestStream(config);

        if (!stream) {
            console.log(`[TEST] Twitch has no user named ${testLogin}.`);
            return;
        }

        let youtube = null;

        if (config.youtubeEnabled) {
            try {
                youtube = await findLastYouTubeStream(config);
            } catch (error) {
                console.error("[TEST] YouTube lookup failed:", error.message);
            }
        }

        // A separate monitor object, so the test never touches the real monitor's state.
        const testMonitor = {...monitor, config, currentStreamId: stream.id, announcement: null, youtubeFollowUp: null};
        console.log(`[TEST] Posting an alert for twitch.tv/${testLogin} (${liveStream ? "live" : "offline, using channel info"}) in #${monitor.channel.name}, YouTube: ${youtube ? `${youtube.url} (${youtube.status})` : "none found"}.`);
        await announce(testMonitor, stream, {silent: true, youtube});
        console.log("[TEST] Done. Remove STREAM_MONITOR_TEST_TWITCH_LOGIN to disable.");
    } catch (error) {
        console.error(`[TEST] Failed to post a test alert for ${testLogin}:`, error.response?.data?.message || error.message);
    }
}
// ─────────────────────── END TEMPORARY TEST CODE ─────────────────────────────

const startStreamMonitor = async (client) => {
    const config = readConfig();

    if (!config.twitchClientId || !config.twitchClientSecret || !config.twitchLogin || !config.channelId) {
        console.log("Stream monitor disabled, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_USERNAME or DISCORD_STREAM_ALERT_CHANNEL_ID is not set.");
        return;
    }

    let channel;
    try {
        channel = await client.channels.fetch(config.channelId);
    } catch (error) {
        console.error(`Stream monitor could not fetch channel ${config.channelId}, disabling it.`, error);
        return;
    }

    if (!channel || !channel.isTextBased()) {
        console.error(`Stream monitor found no text channel for ID ${config.channelId}, disabling it.`);
        return;
    }

    const monitor = {
        config,
        channel,
        isFirstPoll: true,
        currentStreamId: null,
        lastOfflineAt: null,
        announcement: null,
        youtubeFollowUp: null,
        consecutiveFailures: 0
    };

    // Self-scheduling rather than setInterval so a slow or hung fetch can never stack up.
    const scheduleNextPoll = (delay) => {
        setTimeout(async () => {
            try {
                await pollOnce(monitor);
                monitor.consecutiveFailures = 0;
            } catch (error) {
                monitor.consecutiveFailures++;
                console.error(`Stream monitor poll ${monitor.consecutiveFailures} failed:`, error.response?.data?.message || error.message);
            }

            const backoff = Math.min(config.pollIntervalMs * Math.pow(2, monitor.consecutiveFailures), MAX_BACKOFF_MS);
            scheduleNextPoll(monitor.consecutiveFailures === 0 ? config.pollIntervalMs : backoff);
        }, delay);
    }

    console.log(`Stream monitor watching twitch.tv/${config.twitchLogin} in #${channel.name} every ${config.pollIntervalMs}ms${config.youtubeEnabled ? ", with YouTube lookup" : ", YouTube lookup disabled"}.`);
    scheduleNextPoll(0);

    // TEMPORARY TEST CODE — delete this line with the postTestAlert block above.
    await postTestAlert(monitor);
}

module.exports = {
    startStreamMonitor
}
