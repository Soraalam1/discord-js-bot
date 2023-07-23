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
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildPresences,
    ]
});

client.login(`${process.env.BOT_TOKEN}`);

client.on("ready", async (client) => {
    await registerCommands();
    console.log(`${client.user.username} is ready!`);
});

client.on('interactionCreate', async (interaction) =>{
    if(!interaction.isChatInputCommand()) return
    await handleWordRace(interaction);
});

client.on("messageCreate", async (message) => {
    // instant
    handleReminder(message);
    handleCorrectWord(message);

    // await
    await checkMessageAndVx(message);
});
