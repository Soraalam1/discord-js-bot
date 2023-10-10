require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType} = require('discord.js');

const ASSIGNABLE_ROLES = [
    {
        name: 'Straw Hats',
        value: null    
    },
    {
        name: 'Group Gamer',
        value: null    
    },
    {
        name: 'Stream Alerts',
        value: null    
    },
    {
        name: 'Watcher',
        value: null    
    },
    {
        name: 'Rando Gamer',
        value: null
    },
    {
        name: 'Smashers',
        value: null
    },
    {
        name: 'D&D',
        value: null    
    },
    {
        name: 'Street Fighters',
        value: null
    },
    {
        name: 'Iron Fists',
        value: null
    },
    {
        name: 'In-Births',
        value: null
    },
    {
        name: 'Gears',
        value: null
    },
    {
        name: 'Bot Games',
        value: null
    },
    {
        name: 'Pokemon Bot Games',
        value: null
    },
]

const MENTIONABLE_ROLES_LIST = [
   'Bot Games', 'Pokemon Bot Games', 'Stream Alerts'
]

let MENTIONABLE_ROLES = new Map();

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
                        name: 'EEST',
                        value: 'Asia/Beirut'
                    },
                    {
                        name: 'BST/GMT',
                        value: 'Europe/London'
                    }
                ],
            },
        ]
    },
    {
        name: 'pokedex',
        description: "Guess the Pokemon from reading it's Pokedex entry!",
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
        name: 'whosthatpokemon',
        description: "Guess the Pokemon from looking at a silhouette!",
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
        name: 'roleselect',
        description: 'Assign yourself a role within the server!',
        options: [
            {
                name: 'role',
                description: 'The role you would like to add or remove',
                type: ApplicationCommandOptionType.String,
                required: true,
                choices: ASSIGNABLE_ROLES,
            }
        ]
    }
];

const rest = new REST({version:'10'}).setToken(process.env.DISCORD_BOT_TOKEN);

const registerCommands = async (client) => {
    try {
        console.log('Registering slash commands...');
        updateRoleValues(client.guilds.cache.get(process.env.DISCORD_GUILD_ID).roles.cache);
        await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
            { body: commands }
        )
        console.log('Slash commands were registered successfully!');
    } catch (error) {
        console.log(`There was an error: ${error}`);
    }
};

const updateRoleValues = (serverRoles) =>{
    serverRoles.forEach(serverRole => {
        ASSIGNABLE_ROLES.forEach(assignableRole => {
            if(assignableRole.name === serverRole.name){
                assignableRole.value = serverRole.id;
            }
        });
    });
    serverRoles.forEach(serverRole => {
        MENTIONABLE_ROLES_LIST.forEach(mentionableRole => {
            if(mentionableRole.name === serverRole.name){
                // mentionableRole.id = serverRole.id;
                MENTIONABLE_ROLES.set(mentionableRole.name, serverRole.id);
            }
        });
    });
    console.log(ASSIGNABLE_ROLES, MENTIONABLE_ROLES);
}

module.exports = { registerCommands, MENTIONABLE_ROLES };
