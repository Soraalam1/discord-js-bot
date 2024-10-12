const {Client: DiscordClient, IntentsBitField, Partials} = require('discord.js');
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
    ],
    partials: [Partials.Message, Partials.Channel] // Enables partial messages, channels, and reactions
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(error => console.log(error));

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

client.on("messageDelete", async (message) => {
    console.log("Function is running");
    if (message.author.bot) {
        console.log("Bot is author; ending function")
        return;
    }

    //I don't think the code below actually does anything tbh but if the bot starts crashing for vx-delete, try uncommenting this to see if it fixes anything
    //
    //if (message.partial) {
    //    console.log("Partial message found.")
    //    try {
    //        await message.fetch();
    //        console.log("Message fetched")
    //    }
    //    catch (error) {
    //        console.error("Could not fetch partial message: ", error);
    //        return;
    //    }
    //}

    await checkMessageAndVx(message, deleted = true);
})
