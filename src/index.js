const {Client: DiscordClient, IntentsBitField} = require('discord.js');
require('dotenv').config();
const {checkMessageAndVx} = require("./vx-util");
const {handleReminder} = require("./reminder");
const {handleWordRace, handleCorrectWord} = require("./wordrace");
const { registerCommands } = require('./register-commands');


const client = new DiscordClient({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent
    ]
});

client.login(`${process.env.BOT_TOKEN}`);

client.on("ready", async (client) => {
    await registerCommands();
    console.log(`${client.user.username} is ready!`);
});

client.on('interactionCreate',(interaction) =>{
    if(!interaction.isChatInputCommand()) return
    console.log(interaction);
    handleWordRace(interaction);
});

client.on("messageCreate", async (message) => {
    // TODO: Twitter API is paywalled, need a workaround for checking for videos
    //await checkMessageAndVx(message);
    handleReminder(message);
    handleCorrectWord(message);
    
});
