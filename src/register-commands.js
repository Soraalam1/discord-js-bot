require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType} = require('discord.js');

const commands = [
    {
        name: 'wordrace',
        description: 'Speed race with a random word!',
        options: [
            {
                name: 'rounds',
                description: 'The number of rounds',
                type: ApplicationCommandOptionType.Number,
                required: true,
                min_value: 1,
                max_value: 12,
            },
        ]
    },
];

const rest = new REST({version:'10'}).setToken(process.env.BOT_TOKEN);

const registerCommands = async () => {
    try {
        console.log('Registering slash commands...');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        )
        console.log('Slash commands were registered sucessfully!');
    } catch (error) {
        console.log(`There was an error: ${error}`);
    }
};

module.exports = { registerCommands };