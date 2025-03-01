const {twitterScraper} = require("./twitter");
const axios = require('axios');

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
        await message.suppressEmbeds(true);
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
        await message.suppressEmbeds();
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


    const tweetID = tweetURL.match(/\d+$/)[0];

    let videoWasFound = await scanTweetForVideo(tweetID);

    if (videoWasFound) {
        console.log(`twitter link with video found in #${message.channel.name}, reposting with vx`);
        console.log(tweetURL);
        return tweetURL;
    }

    return false;
}

const scanTweetForVideo = async (tweetID) => {

    return true;
    //TODO: Remove images and text maybe when embeds are ok again?

    let targetTweet;
    let video;

    try {
        targetTweet = await axios.get(`https://api.vxtwitter.com/Twitter/status/${tweetID}`);
    } catch (error) {
        console.log('Could not get tweet information from VX Twitter API: \n', error);
    }

    for (let media of targetTweet.data.media_extended) {
        console.log(media)
        if (media.type === 'video' || media.type === 'gif' || media.type === 'image') {
            // TODO: have it VX images for now, maybe remove it later?
            video = true;
            break;
        } else {
            console.log('video not found')
        }
    }

    return video;
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

    await webhook.send(URL).catch(err => console.error(err));
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

module.exports = {
    checkMessageAndVx
}

