const {Client: DiscordClient, IntentsBitField, AttachmentBuilder, EmbedBuilder} = require('discord.js');
require('dotenv').config();
const {checkMessageAndVx} = require("./vx-util");
const {handleReminder} = require("./reminder");
const {handleGameStart, handleAnswerAttempt} = require("./typing-games");
const { registerCommands } = require('./register-commands');
const {createPokemonImage} = require("./image-processor");


const client = new DiscordClient({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildPresences,
    ]
});

client.login(`${process.env.BOT_TOKEN}`).catch(error => console.log(error));

client.on("ready", async (client) => {
    await registerCommands();
    console.log(`${client.user.username} is ready!`);
});

client.on('interactionCreate', async (interaction) =>{
    if(!interaction.isChatInputCommand()) return
    handleGameStart(interaction);
    handleReminder(interaction);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) {
        return;
    }

    // instant
    handleReminder(message);
    handleAnswerAttempt(message);

    // if (message.cleanContent.toLowerCase().includes('j')) {
    //     let image = await createPokemonImage('', true);
    //     let attachment = new AttachmentBuilder(image, {name: 'pokemon.png'});
    //     let embed = new EmbedBuilder().setTitle(`It's **Pikachu!**`).setColor([255, 0, 0])
    //         .setDescription('description').setImage('attachment://pokemon.png').setTimestamp(new Date()).toJSON();
    //
    //     message.reply({embeds: [embed], files: [attachment]})
    // }

    // await
    await checkMessageAndVx(message);
});
