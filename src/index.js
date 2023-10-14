const {Client: DiscordClient, IntentsBitField} = require('discord.js');
require('dotenv').config();
const {checkMessageAndVx} = require("./vx-util");
const {handleReminder} = require("./reminder");
const {handleGameStart, handleAnswerAttempt} = require("./typing-games");
const {handleUserRoleRequest} = require("./role-assignment");
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

client.login(`${process.env.DISCORD_BOT_TOKEN}`).catch(error => console.log(error));

client.on("ready", async (client) => {
    await registerCommands(client);
    console.log(`${client.user.username} is ready!`);
});

client.on('interactionCreate', async (interaction) =>{
    if(!interaction.isChatInputCommand()) return
    handleGameStart(interaction);
    handleUserRoleRequest(interaction);
    handleReminder(interaction);
});

client.on("messageCreate",  async (message) => {
    if (message.author.bot) {
        return;
    }

    handleReminder(message);
    await checkMessageAndVx(message);
    await handleAnswerAttempt(message);

});
