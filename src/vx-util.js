const axios = require('axios');

const VX_TWITTER_API = "https://api.vxtwitter.com/Twitter/status"

const messageIdToBotMessageIdMap = new Map();

const checkMessageAndVx = async (message) => {
    if (message.content.includes("vxtwitter.com/") || message.content.includes("fxtwitter.com/") || message.content.includes("sxtwitter.com/") || message.content.includes("vxtiktok.com/")) {
        console.log(`${message.author.username} used vx on their link manually in ${message.channel.name}!`)
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
            console.log(`Message with link from ${message.author.username} no longer exists, cannot suppress embed.`);
            return;  // Exit if the message doesn't exist
        }

        await fetchedMessage.suppressEmbeds(true);
    } catch (error) {
        console.error(`Could not suppress embed for original message`, message.cleanContent, error);
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
                console.log(`Message with link from ${message.author.username} no longer exists, cannot suppress embed.`);
                return;  // Exit if the message doesn't exist
            }

            await fetchedMessage.suppressEmbeds();
            console.log(`Successfully suppressed embed for message with link from ${message.author.username}.`);
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

    let fixedMessage = message.cleanContent.replace("twitter.com/", "vxtwitter.com/");
    fixedMessage = fixedMessage.replace("x.com/", "vxtwitter.com/");

    try {
        tweetURL = fixedMessage.match(/(https?:\/\/(.+?\.)?vxtwitter\.com(\/[A-Za-z0-9\-\._~:\/\?#\[\]@!$&'\(\)\*\+,;\=]*)?)/)[1];
    } catch (error) {
        console.error(`Could not get tweet URL using RegEx from message: ${fixedMessage}`, error);
        return;
    }

    tweetURL = removeParams(tweetURL);


    const tweetID = tweetURL.match(/(?<=\/status\/)\d+/)[0];

    let mediaWasFound = await scanTweetForMedia(tweetID);

    if (mediaWasFound) {
        console.log(`twitter link with media found in #${message.channel.name}, reposting with vx`);
        console.log(tweetURL);
        return tweetURL;
    }

    return false;
}

const scanTweetForMedia = async (tweetID) => {
    let targetTweet;

    try {
        targetTweet = await axios.get(`${VX_TWITTER_API}/${tweetID}`);
    } catch (error) {
        console.log('Could not get tweet information from VX Twitter API: \n', error);
    }

    return targetTweet?.data?.hasMedia;
}


const vxTikTok = (message) => {
    let fixedMessage = message.cleanContent.replace("tiktok.com/", "vxtiktok.com/");
    console.log(`tiktok link found in #${message.channel.name}, reposting with vx`);
    console.log(fixedMessage);

    let tiktokURL;

    try {
        tiktokURL = fixedMessage.match(/(https?:\/\/(.+?\.)?vxtiktok\.com(\/[A-Za-z0-9\-\._~:\/\?#\[\]@!$&'\(\)\*\+,;\=]*)?)/)[1];
        tiktokURL = removeParams(tiktokURL);
        return tiktokURL;
    } catch (error) {
        console.error(`Could not get tiktok URL using RegEx from message: ${fixedMessage}`, error);
    }
}

const instaFix = (message) => {
    let fixedMessage = message.cleanContent.replace("instagram.com/", "ddinstagram.com/");
    console.log(`Instagram link found in #${message.channel.name}, reposting with dd`);
    console.log(fixedMessage);

    let instaURL;

    try {
        instaURL = fixedMessage.match(/(https?:\/\/(.+?\.)?ddinstagram\.com(\/[A-Za-z0-9\-\._~:\/\?#\[\]@!$&'\(\)\*\+,;\=]*)?)/)[1];
        instaURL = removeParams(instaURL);
        return instaURL;
    } catch (error) {
        console.error(`Could not get Instagram URL using RegEx from message: ${fixedMessage}`, error);
    }
}

const decideName = (username, URL) => {
    if (URL.includes('instagram.com/')) {
        return decideNameForInsta(username);
    }

    if (username.includes("[4spg]")) {
        username = username.replaceAll('[4spg]', '[Vxvx]');
    } else if (username.includes(" | ")) {
        username = `VX | ${username}`;
    } else if (username.includes(" ")) {
        username = `vx ${username.substring(username.indexOf(' ') + 1)}`
    } else if (username.includes("_")) {
        username = `vx_${username}`;
    } else if (username.includes("-")) {
        username = `vx-${username}`;
    } else {
        username = `vx${username}`;
    }

    return username;
}

const decideNameForInsta = (username) => {
    if (username.includes("[4spg]")) {
        username = username.replaceAll('[4spg]', '[Dddd]');
    } else if (username.includes(" | ")) {
        username = `DD | ${username}`;
    } else if (username.includes(" ")) {
        username = `dd ${username.substring(username.indexOf(' ') + 1)}`;
    } else if (username.includes("_")) {
        username = `dd_${username}`;
    } else if (username.includes("-")) {
        username = `dd-${username}`;
    } else {
        username = `dd${username}`;
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
        console.log(`Message with link from ${message.author.username} has been deleted, deleting bot message.`)
        const botMessageId = messageIdToBotMessageIdMap.get(message.id);
        try {
            // Fetch bot's associated message in map
            const fetchedBotMessage = await message.channel.messages.fetch(botMessageId);

            await fetchedBotMessage.delete();
            messageIdToBotMessageIdMap.delete(message.id);
            console.log(`Bot message with ID ${botMessageId} has been deleted.`);
        } catch (error) {
            console.error(`Could not delete message with ID ${botMessageId}: `, error);
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

