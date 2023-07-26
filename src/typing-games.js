const axios = require('axios');
const {EmbedBuilder, AttachmentBuilder} = require("discord.js");
const {createPokemonImage} = require("./image-processor");

const GAME_LIST = [
    {
        gameTitle: 'WordRace',
        commandName: 'wordrace',
        apiUri: 'https://random-word-api.herokuapp.com/word'
    },
    {
        gameTitle: 'Pokedex Reader',
        commandName: 'pokedex',
        apiUri: 'https://pokeapi.glitch.me/v1/pokemon'
    },
    {
        gameTitle: "Who's that Pokemon?",
        commandName: 'whosthatpokemon',
        apiUri: 'https://pokeapi.glitch.me/v1/pokemon'
    }
]

let correctAnswer;
let numberOfRounds = 0;
let isFirstReply = true;
let isGameOngoing = false;
let gameLocation;
let discordChannel;
let leaderBoard = [];
let currentGame;
let timeoutId;
let embedData = {
    question: {
        embed: undefined,
        attachment: undefined
    },
    answer: {
        embed: undefined,
        attachment: undefined
    }
};

const handleGameStart = async (interaction) => {
    GAME_LIST.forEach(gameChoice => {
        if (gameChoice.commandName === interaction.commandName) {
            currentGame = gameChoice;
        }
    })

    if (currentGame) {
        if (isGameOngoing) {
            interaction.reply(`WAIT! A game is going on right now in the ${gameLocation} chat!`);
            return;
        }
        isFirstReply = true;
        numberOfRounds = await interaction.options.get('rounds').value;
        discordChannel = await interaction.channel;


        await postReady(interaction);
    }
}

const postReady = async (interaction) => {
    if (numberOfRounds > 0) {
        isGameOngoing = true;
        if (interaction) {
            gameLocation = `<#${interaction.channelId}>`;
        }
        isFirstReply ? interaction.reply(`Get ready for the first round! There are ${numberOfRounds} rounds in this game! `) :
            discordChannel.send(`Get ready for next round in 5 seconds! There are ${numberOfRounds} rounds remaining!`);
        isFirstReply = false;
        await playRound();
        timeoutId = setTimeout(async () => {
            let answerWas = correctAnswer;
            correctAnswer = null;
            await discordChannel.send(`Nobody typed it in time. The correct answer was: **${answerWas}**!`)

            if (embedData.answer.embed) {
                await discordChannel.send({
                    embeds: [embedData.answer.embed.setTimestamp(new Date()).toJSON()],
                    files: [embedData.answer.attachment]
                })
            }

            cleanDataForNextRound();
            postReady();
        }, 30000)
    } else {
        showAndResetLeaderboard(`The game is done!`);
    }
}

const playRound = async () => {
    switch (currentGame.commandName) {
        case 'wordrace':
            await postWord();
            break;
        case 'pokedex':
            await postPokedexEntry();
            break;
        case 'whosthatpokemon':
            await postMysteryPokemon();
            break;
        default:
            break;
    }
}

const postPokedexEntry = async () => {
    let totalPokemonCount = await findTotalPokemonCount();
    console.log(totalPokemonCount)

    let randomPokemonNumber = getRandomInteger(1, totalPokemonCount);

    await axios.get(`${currentGame.apiUri}/${randomPokemonNumber}`).then(async response => {
        console.log(response.data[0].name)
        let pendingAnswer = removeUnnecessaryInfo(response.data[0].name);

        // Pokedex API has Rhydon's name wrong, hardcode fix
        if (randomPokemonNumber === 112) {
            pendingAnswer = 'Rhydon';
        }

        let message = `**Guess the Pokémon from this description:** \n*${response.data[0].description}*`;
        message = censorCorrectAnswerFromMessage(message, pendingAnswer, 'POKéMON');
        await buildPokemonEmbed(pendingAnswer, response.data[0].description, response.data[0].sprite, false);
        await typeMessageAndSetAnswer(message, pendingAnswer);
    }).catch(error => {
        showAndResetLeaderboard('The game is ending early due to an unexpected error.');
        console.log(error);
    });
}

const postMysteryPokemon = async () => {
    let totalPokemonCount = await findTotalPokemonCount();

    let randomPokemonNumber = getRandomInteger(1, totalPokemonCount);

    await axios.get(`${currentGame.apiUri}/${randomPokemonNumber}`).then(async response => {
        console.log(response.data[0].name)
        let pendingAnswer = removeUnnecessaryInfo(response.data[0].name);
        await buildPokemonEmbed(pendingAnswer, response.data[0].description, response.data[0].sprite, true);
        await typeMessageAndSetAnswer(null, pendingAnswer);
    }).catch(error => {
        showAndResetLeaderboard('The game is ending early due to an unexpected error.');
        console.log(error);
    });
}

const removeUnnecessaryInfo = (pendingAnswer) => {
    let answer = pendingAnswer.split(' - ');
    answer = answer[0].split('♂️');
    answer = answer[0].split('♀️');

    return answer[0];
}

const findTotalPokemonCount = async () => {
    let total;
    await axios.get(`${currentGame.apiUri}/counts`).then(response => {
        total = response.data.total;
    }).catch(error => {
        showAndResetLeaderboard('The game is ending early due to an unexpected error.');
        console.log(error);
    });

    return total;
}

const buildPokemonEmbed = async (pokemonName, pokemonDescription, imageUrl, needsSilhouette = false) => {
    if (needsSilhouette) {
        let image = await createPokemonImage(imageUrl, true)
        let mysteryEmbed = new EmbedBuilder().setTitle(`Who's that Pokémon?`).setColor([255, 0, 0])
            .setImage('attachment://hiddenpokemon.png');


        let attachment = new AttachmentBuilder(image, {name: 'hiddenpokemon.png'});

        embedData.question.embed = mysteryEmbed;
        embedData.question.attachment = attachment;
    }

    let image = await createPokemonImage(imageUrl, false);
    let attachment = new AttachmentBuilder(image, {name: 'pokemon.png'});


    let revealedEmbed = new EmbedBuilder().setTitle(`It's **${pokemonName}!**`).setColor([255, 0, 0])
        .setDescription(pokemonDescription).setImage('attachment://pokemon.png');

    embedData.answer.embed = revealedEmbed;
    embedData.answer.attachment = attachment;
}

const postWord = async () => {
    try {
        await axios.get(currentGame.apiUri).then(response => {
            let pendingAnswer = response.data[0];
            console.log(response.data[0])
            const message = (bubbleFormatter(response.data[0]));
            console.log(message);
            typeMessageAndSetAnswer(message, pendingAnswer);
        })
    } catch (error) {
        showAndResetLeaderboard('The game is ending early due to an unexpected error.');
        console.log(error);
    }
}

const typeMessageAndSetAnswer = async (message, answer) => {
    await discordChannel.sendTyping();
    setTimeout(async () => {
        await discordChannel.sendTyping();

        embedData.question.embed ? discordChannel.send({
                embeds: [embedData.question.embed.setTimestamp(new Date()).toJSON()],
                files: [embedData.question.attachment]
            }) :
            discordChannel.send(`${message}`);

        correctAnswer = answer;
    }, 5000)
}


const bubbleFormatter = (word) => {
    let bubbleWord = '';
    for (let i = 0; i < word.length; i++) {
        let letter = `:regional_indicator_${word[i]}:`
        bubbleWord = bubbleWord.concat(" ", letter);
    }
    return bubbleWord;
}

function censorCorrectAnswerFromMessage(message, answer, replaceWith) {
    let regex = new RegExp(answer, 'gi');
    return message.replace(regex, replaceWith);

}

function getRandomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const createPlayerEntry = (author, points = 1) => {
    const player = {
        player: author,
        points: points
    }
    return player
}

const addPoint = (message) => {
    let playerOnBoard = false;
    leaderBoard.forEach(rank => {
        if (rank.player == message.author) {
            playerOnBoard = true;
            rank.points++;
        }
    });
    if (!playerOnBoard) {
        leaderBoard.push(createPlayerEntry(message.author));
    }
}

const showAndResetLeaderboard = (message) => {
    discordChannel.send(message);

    if (leaderBoard.length < 1) {
        discordChannel.send('Nobody earned any points at all. Try harder!');
        leaderBoard = [];
        currentGame = null;
        isGameOngoing = false;
        return;
    }

    leaderBoard.sort((a, b) => {
        return b.points - a.points
    });
    let winnerString = `:first_place:<@${leaderBoard[0].player.id}> ${leaderBoard[0].points} points\n`;

    if (leaderBoard[1]) {
        winnerString = winnerString.concat(`:second_place:<@${leaderBoard[1].player.id}> ${leaderBoard[1].points} points\n`)
    }

    if (leaderBoard[2]) {
        winnerString = winnerString.concat(`:third_place:<@${leaderBoard[2].player.id}> ${leaderBoard[2].points} points\n`)
    }

    const resultsEmbed = {
        title: `**${currentGame.gameTitle}** Results`,
        fields: [

            {
                name: 'Winners',
                value: winnerString,
            },
        ],
        timestamp: new Date().toISOString(),
    };
    discordChannel.send({embeds: [resultsEmbed]});

    discordChannel.send(`Congrats <@${leaderBoard[0].player.id}> on winning!`);

    leaderBoard = [];
    currentGame = null;
    isGameOngoing = false;
}

const handleAnswerAttempt = async (message) => {
    if (correctAnswer) {
        if (message.content.toLowerCase() === correctAnswer.toLowerCase() && `<#${message.channel.id}>` === gameLocation) {
            let answerWas = correctAnswer;
            correctAnswer = null;
            clearTimeout(timeoutId);
            addPoint(message);

            await message.reply(`Congrats ${message.author} you were first to send the correct answer of **${answerWas}**!`);

            if (embedData.answer.embed) {
                await message.channel.send({
                    embeds: [embedData.answer.embed.setTimestamp(new Date()).toJSON()],
                    files: [embedData.answer.attachment]
                })
            }

            cleanDataForNextRound();
            postReady();
        } else if (`<#${message.channel.id}>` === gameLocation) {
            message.react(`❌`).catch(err => console.error(err));
        }
    }
}

const cleanDataForNextRound = () => {
    correctAnswer = null;
    embedData = {
        question: {
            embed: undefined,
            attachment: undefined
        },
        answer: {
            embed: undefined,
            attachment: undefined
        }};
    numberOfRounds--;
}


module.exports = {handleGameStart, handleAnswerAttempt};
