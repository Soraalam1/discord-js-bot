const axios = require('axios');

const FX_TWITTER_API = "https://api.fxtwitter.com/i/status" //constant
const TRANSLATE_TARGET_LANG = "en";

const messageIdToBotMessageIdMap = new Map();

const checkMessageAndVx = async (message) => {
    if (message.content.includes("vxtwitter.com/") || message.content.includes("fxtwitter.com/") || message.content.includes("sxtwitter.com/") || message.content.includes("vxtiktok.com/")) {
        console.log(`${message.author.username} used a fixed twitter link manually in ${message.channel.name}!`)
        return;
    }

    if (message.content.includes("ddinstagram.com/")) {
        console.log(`${message.author.username} used dd on their Instagram link manually in ${message.channel.name}!`)
        return;
    }

    let URL;

    if (message.content.includes("twitter.com/") || message.content.includes("://x.com/") || message.content.includes("://www.x.com/")) {
        URL = await vxTwitter(message);
    }

    if (message.content.includes("tiktok.com/")) {
        URL = vxTikTok(message);
    }

    if (message.content.includes("instagram.com/")) {
        URL = instaFix(message);
    }

    if (!URL) {
        return;
    }

    if (isSpoiler(message.cleanContent)) {
        URL = `||${URL}||`;
    }

    try {
        const fetchedMessage = await message.channel.messages.fetch(message.id, {cache: true}).catch(() => null);

        if (!fetchedMessage) {
            console.log(`Message with link from ${message.author.username} in #${message.channel.name} no longer exists, cannot suppress embed.`);
            return;  // Exit if the message doesn't exist
        }

        await fetchedMessage.suppressEmbeds(true);
    } catch (error) {
        console.error(`Could not suppress embed for original message in #${message.channel.name}`, message.cleanContent, error);
    }

    const discordProfile = await createDiscordProfileFromMessage(message, URL);

    try {
        await postWithWebhook(message, URL, discordProfile);
    } catch (error) {
        console.error(`Unable to post new link with webhook`, message.cleanContent);
    }

    // second suppression to see if it improves missed embeds
    setTimeout(async () => {
        try {
            // Attempt to fetch the message in case it was deleted
            const fetchedMessage = await message.channel.messages.fetch(message.id, {cache: true}).catch(() => null);

            if (!fetchedMessage) {
                console.log(`Message with link from ${message.author.username} in #${message.channel.name} no longer exists, cannot suppress embed.`);
                return;  // Exit if the message doesn't exist
            }

            await fetchedMessage.suppressEmbeds();
            console.log(`Successfully suppressed embed for message with link from ${message.author.username} in #${message.channel.name}.`);
        } catch (error) {
            console.error("Error while suppressing embed:", error);
        }
    }, 6000)
}

const removeParams = (message) => {
    if (message.includes("?")) {
        message = message.slice(0, message.indexOf('?'));
    }

    return message;
}

const vxTwitter = async (message) => {
    let tweetURL;

    let fixedMessage = message.cleanContent.replace("twitter.com/", "fxtwitter.com/");
    fixedMessage = fixedMessage.replace("x.com/", "fxtwitter.com/");

    try {
        tweetURL = fixedMessage.match(/(https?:\/\/(.+?\.)?fxtwitter\.com(\/[A-Za-z0-9\-\._~:\/\?#\[\]@!$&'\(\)\*\+,;\=]*)?)/)[1];
    } catch (error) {
        console.error(`Could not get tweet URL using RegEx from message: ${fixedMessage}`, error);
        return;
    }

    tweetURL = removeParams(tweetURL);


    const tweetID = tweetURL.match(/(?<=\/status\/)\d+/)[0];

    const {hasMediaOrQuote, lang} = await inspectTweet(tweetID);
    const needsTranslation = !!lang && lang !== TRANSLATE_TARGET_LANG;

    // Media and quotes are reposted because Discord renders them poorly; foreign-language tweets
    // are reposted for the translated embed, whether or not they carry media.
    if (!hasMediaOrQuote && !needsTranslation) {
        return false;
    }

    if (needsTranslation) {
        // FxTwitter renders a translated embed when the URL ends in a language code.
        tweetURL = withTranslationSuffix(tweetURL);
    }

    const reason = hasMediaOrQuote
        ? (needsTranslation ? `media and "${lang}" text` : "media")
        : `"${lang}" text`;

    console.log(`twitter link with ${reason} found in #${message.channel.name}, reposting with fx`);
    console.log(tweetURL);

    return tweetURL;
}

// Appending blindly would corrupt links carrying extra path segments (".../status/123/photo/1"),
// so the suffix is applied to the "/status/<id>" portion only.
const withTranslationSuffix = (tweetURL) => {
    const statusMatch = tweetURL.match(/^(.*\/status\/\d+)/);

    return statusMatch ? `${statusMatch[1]}/${TRANSLATE_TARGET_LANG}` : tweetURL;
}

// One request answers both questions: whether the tweet is worth reposting, and what language it
// is in. Returning them together keeps this to a single API call per link.
const inspectTweet = async (tweetID) => {
    let targetTweet;

    try {
        targetTweet = await axios.get(`${FX_TWITTER_API}/${tweetID}`);
    } catch (error) {
        console.log('Could not get tweet information from FX Twitter API: \n', error);
    }

    const tweet = targetTweet?.data?.tweet;

    return {
        hasMediaOrQuote: !!tweet?.media?.all?.length || !!tweet?.quote,
        lang: tweet?.lang ?? null
    };
}


const vxTikTok = (message) => {
    let fixedMessage = message.cleanContent.replace("tiktok.com/", "tiktokez.com/");
    console.log(`tiktok link found in #${message.channel.name}, reposting with tiktokez`);
    console.log(fixedMessage);

    let tiktokURL;

    try {
        tiktokURL = fixedMessage.match(/(https?:\/\/(.+?\.)?tiktokez\.com(\/[A-Za-z0-9\-\._~:\/\?#\[\]@!$&'\(\)\*\+,;\=]*)?)/)[1];
        tiktokURL = removeParams(tiktokURL);
        return tiktokURL;
    } catch (error) {
        console.error(`Could not get tiktok URL using RegEx from message: ${fixedMessage}`, error);
    }
}

const instaFix = (message) => {
    let fixedMessage = message.cleanContent.replace("instagram.com/", "kkinstagram.com/");
    console.log(`Instagram link found in #${message.channel.name}, reposting with dd`);
    console.log(fixedMessage);

    let instaURL;

    try {
        instaURL = fixedMessage.match(/(https?:\/\/(.+?\.)?kkinstagram\.com(\/[A-Za-z0-9\-\._~:\/\?#\[\]@!$&'\(\)\*\+,;\=]*)?)/)[1];
        instaURL = removeParams(instaURL);
        return instaURL;
    } catch (error) {
        console.error(`Could not get Instagram URL using RegEx from message: ${fixedMessage}`, error);
    }
}

const decideName = (username, URL) => {
    if (URL.includes('tiktok')) {
        return decideNameForTikTok(username);
    }

    if (username.includes("[4spg]")) {
        username = username.replaceAll('[4spg]', '[Fxfx]');
    } else if (username.includes(" | ")) {
        username = `FX | ${username}`;
    } else if (username.includes(" ")) {
        username = `fx ${username.substring(username.indexOf(' ') + 1)}`
    } else if (username.includes("_")) {
        username = `fx_${username}`;
    } else if (username.includes("-")) {
        username = `fx-${username}`;
    } else {
        username = `fx${username}`;
    }

    return username;
}

const decideNameForTikTok = (username) => {
    if (username.includes("[4spg]")) {
        username = username.replaceAll('[4spg]', '[EZ]');
    } else if (username.includes(" | ")) {
        username = `${username} | EZ`;
    } else if (username.includes(" ")) {
        username = `ez ${username.substring(username.indexOf(' ') + 1)}`;
    } else if (username.includes("_")) {
        username = `ez_${username}`;
    } else if (username.includes("-")) {
        username = `ez-${username}`;
    } else {
        username = `${username}ez`;
    }

    return username;
}

const createDiscordProfileFromMessage = async (message, URL) => {
    let guildMember;
    try {
        guildMember = await message.guild.members.fetch(message?.author);
    } catch (message) {
        console.error(`Could not fetch guild member for message author`, message?.author);
    }

    return {
        name: message.member?.displayName ? decideName(message.member.displayName, URL) : decideName(message.author.username, URL),
        avatar: message.member?.avatarURL() ? message.member?.avatarURL() : message.author.displayAvatarURL()
    };
}

const postWithWebhook = async (message, URL, discordProfile) => {
    const webhook = await message.channel.createWebhook(discordProfile).catch(err => console.error(err));

    const webhookMessage = await webhook.send(URL).catch(err => console.error(err));
    messageIdToBotMessageIdMap.set(message.id, webhookMessage.id);
    checkMapSize();
    await webhook.delete().catch(err => console.error(err));
}

const isSpoiler = (string) => {
    if (string.includes("||")) {
        let substring = string.slice(string.indexOf("||"));
        if (substring.includes("||")) {
            return true;
        }
    }
    return false;
}

const deleteVxLink = async (message) => {
    if (messageIdToBotMessageIdMap.has(message.id)) {
        console.log(`Message with link from ${message.author.username} in #${message.channel.name} has been deleted, deleting bot message.`)
        const botMessageId = messageIdToBotMessageIdMap.get(message.id);
        try {
            // Fetch bot's associated message in map
            const fetchedBotMessage = await message.channel.messages.fetch(botMessageId);

            await fetchedBotMessage.delete();
            messageIdToBotMessageIdMap.delete(message.id);
            console.log(`Bot message with ID ${botMessageId} in #${message.channel.name} has been deleted.`);
        } catch (error) {
            console.error(`Could not delete message with ID ${botMessageId} in #${message.channel.name}: `, error);
        }
    }
}

const checkMapSize = () => {
    if (messageIdToBotMessageIdMap.size > 10) {
        const oldestKey = messageIdToBotMessageIdMap.keys().next().value;
        messageIdToBotMessageIdMap.delete(oldestKey);
    }
}

module.exports = {
    checkMessageAndVx,
    deleteVxLink
}

