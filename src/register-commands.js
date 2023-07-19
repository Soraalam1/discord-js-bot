require('dotenv').config();
const { REST, Routes} = require('discord.js');

const commands = [
    {
        name: 'wordrace',
        description: 'Speed race with a random word!',
    },
];

const rest = new REST({version:'10'}).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('Registering slash comands...');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        )
        console.log('Slash commands were registered sucessfully!');
    } catch (error) {
        console.log(`There was an error: ${error}`);
    }
})();