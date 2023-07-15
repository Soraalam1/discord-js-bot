const {Client: DiscordClient, IntentsBitField} = require('discord.js');
require('dotenv').config();
const {checkMessageAndVx} = require("./vx-util");

const client = new DiscordClient({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent
    ]
});

client.login(`${process.env.BOT_TOKEN}`);

client.on("ready", (client) => {
    console.log(`${client.user.username} is ready!`);
});

client.on("messageCreate", async (message) => {
    // TODO: Twitter API is paywalled, need a workaround for checking for videos
    //await checkMessageAndVx(message);
});

