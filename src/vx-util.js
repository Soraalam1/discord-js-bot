const {TwitterApi} = require('twitter-api-v2');

const twitter = new TwitterApi(`${process.env.TWITTER_API_KEY}`);

const checkMessageAndVx = async (message) => {
    if (message.author.bot) {
        return;
    }

    if (message.content.includes("vxtwitter.com/") || message.content.includes("fxtwitter.com/") || message.content.includes("sxtwitter.com/") || message.content.includes("vxtiktok.com/")) {
        console.log(`${message.author.username} used vx on their link manually in ${message.channel.name}!`)
        return;
    }

    if (message.content.includes("ddinstagram.com/")) {
        console.log(`${message.author.username} used dd on their Instagram link manually in ${message.channel.name}!`)
        return;
    }

    let URL;

    if (!message.content.includes("vxtwitter.com/") && message.content.includes("twitter.com/")) {
        URL = await vxTwitter(message);
    }

    if (!message.content.includes("vxtiktok.com/") && message.content.includes("tiktok.com/")) {
        URL = vxTikTok(message);
    }

    if (!message.content.includes("ddinstagram.com/") && message.content.includes("instagram.com/")) {
        URL = instaFix(message);
    }

    if (URL) {
        try {
            await message.suppressEmbeds();
        } catch (error) {
            console.error(`Could not suppress embed for original message`, message.cleanContent);
        }
    } else {
        return;
    }

    if (isSpoiler(message.cleanContent)) {
        URL = `||${URL}||`;
    }

    const discordProfile = await createDiscordProfileFromMessage(message, URL);

    try {
        await postWithWebhook(message, URL, discordProfile);
    } catch (error) {
        console.error(`Unable to post new link with webhook`, message.cleanContent);
    }
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
    try {
        tweetURL = fixedMessage.match(/(https?:\/\/(.+?\.)?vxtwitter\.com(\/[A-Za-z0-9\-\._~:\/\?#\[\]@!$&'\(\)\*\+,;\=]*)?)/)[1];
    } catch (error) {
        console.error(`Could not get tweet URL using RegEx from message: ${fixedMessage}`, error);
        return;
    }

    tweetURL = removeParams(tweetURL);

    const tweetID = tweetURL.match(/\d+$/)[0];

    let tweet;
    let media = false;

    tweet = await getTweet(tweetID).catch(err => console.error(err));

    if (tweet?.data?.referenced_tweets) {
        let quoteTweet;

        for (let refTweet of tweet?.data?.referenced_tweets) {
            if (refTweet?.type === 'quoted') {
                let quoteTweetID = refTweet.id;
                quoteTweet = await getTweet(quoteTweetID).catch(err => console.error(err));
                if (quoteTweet?.includes?.media) {
                    for (let mediaObj of quoteTweet?.includes?.media) {
                        if (mediaObj.type === "video" || mediaObj.type === "animated_gif") {
                            console.log(`Quoted tweet with video found in #${message.channel.name}, reposting with vx`);
                            console.log(tweetURL);
                            media = true;
                        }
                    }
                }
            }
        }
    }

    if (tweet?.includes?.media) {
        for (let mediaObj of tweet?.includes?.media) {
            if (mediaObj.type === "video" || mediaObj.type === "animated_gif") {
                console.log(`tweet with video found in #${message.channel.name}, reposting with vx`);
                console.log(tweetURL);
                media = true;
            }
        }
    }

    if (media) {
        return tweetURL;
    }

    return false;
}

const getTweet = async (tweetID) => {
    try {
        return await twitter.v2.singleTweet(tweetID, {
            expansions: [
                'attachments.media_keys',
                "referenced_tweets.id"
            ],
            "tweet.fields": ['attachments'],
            "media.fields": ["duration_ms"]
        });
    } catch (error) {
        console.error(`Error during twitter API call`, error);
    }
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
        name: guildMember?.nickname ? decideName(guildMember.nickname, URL) : decideName(message.author.username, URL),
        avatar: guildMember?.avatarURL() ? guildMember.avatarURL() : message.author.displayAvatarURL()
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

