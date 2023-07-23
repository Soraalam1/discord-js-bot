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
    {
        name: 'remindme',
        description: 'Set a reminder by specifying time or duration',
        options: [
            {
                name: 'reminder',
                description: 'The message you want to remind yourself with',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'time',
                description: 'Can be duration or specific time',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'timezone',
                description: 'Timezone for reminder',
                type: ApplicationCommandOptionType.String,
                required: false,
                choices:
                [
                    {
                        name: 'PST/PDT',
                        value: 'America/Los_Angeles'
                    },
                    {
                        name: 'MST/MDT',
                        value: 'America/Denver'
                    },
                    {
                        name: 'CST/CDT',
                        value: 'America/Chicago'
                    },
                    {
                        name: 'EST/EDT',
                        value: 'America/New_York'
                    },
                    {
                        name: 'LBT',
                        value: 'Asia/Beirut'
                    },
                    {
                        name: 'BST/GMT',
                        value: 'Europe/London'
                    }
                ],
            },
        ]
    }
];

const rest = new REST({version:'10'}).setToken(process.env.BOT_TOKEN);

const registerCommands = async () => {
    try {
        console.log('Registering slash commands...');

        await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
            { body: commands }
        )
        console.log('Slash commands were registered successfully!');
    } catch (error) {
        console.log(`There was an error: ${error}`);
    }
};

module.exports = { registerCommands };