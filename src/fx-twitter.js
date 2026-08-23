const axios = require('axios');

const FX_API = "https://api.fxtwitter.com";
const FX_PROFILE_API = `${FX_API}/2/profile`;
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = "discord-js-bot (tweet notifier)";

/**
 * Fetches statuses posted after `sinceSeconds`, or the most recent page when that is null.
 * The endpoint answers 204 when nothing is newer, which is the usual case while polling.
 */
const fetchStatusesSince = async (handle, sinceSeconds, count) => {
    const params = {};

    if (sinceSeconds) {
        params.since = sinceSeconds;
    }

    if (count) {
        params.count = count;
    }

    const response = await axios.get(`${FX_PROFILE_API}/${encodeURIComponent(handle)}/statuses`, {
        params,
        timeout: REQUEST_TIMEOUT_MS,
        headers: {"User-Agent": USER_AGENT},
        // 204 means "nothing newer", not a failure. Anything else non-2xx should throw so the
        // caller's backoff kicks in.
        validateStatus: (status) => status === 204 || (status >= 200 && status < 300)
    });

    if (response.status === 204) {
        return [];
    }

    return response?.data?.results ?? [];
}

// Retweets carry the reposting account in `reposted_by`; replies carry `replying_to`. The endpoint
// omits replies unless asked for them and never injects the pinned tweet, so this is belt-and-braces.
const isOriginalPost = (status) => !status?.reposted_by && !status?.replying_to;

module.exports = {
    fetchStatusesSince,
    isOriginalPost
}
