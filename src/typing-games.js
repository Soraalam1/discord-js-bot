const axios = require('axios');
const {EmbedBuilder, AttachmentBuilder} = require("discord.js");
const {createPokemonImage} = require("./image-processor");
const {MENTIONABLE_ROLES} = require("./register-commands");

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
    },
    {
        gameTitle: "What's that Yu-Gi-Oh! Card?",
        commandName: 'yugioh',
        apiUri: 'https://db.ygoprodeck.com/api/v7'
    },
]

const POKEMON_GEN_MAP = {
    1: [1, 151],
    2: [152, 251],
    3: [252, 386],
    4: [387, 493],
    5: [494, 649],
    6: [650, 721],
    7: [722, 807]
}

let correctAnswer;
let numberOfRounds = 0;
let genRestriction = null;
let isFirstReply = true;
let isGameOngoing = false;
let gameLocation;
let discordChannel;
let leaderBoard = [];
let currentGame;
let timeoutId;
let questionTime;
let answerTime;
let answerSpeed;
let answerPoints;
let bonusPoints = 0;
let incorrectCount = 0;
let previousMonster = [];
let embedData = {
    question: {
        embed: null,
        attachment: null
    },
    answer: {
        embed: null,
        attachment: null
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
        if (currentGame.commandName === 'pokedex' || currentGame.commandName === 'whosthatpokemon') {
            try {
                genRestriction = await interaction.options.get('gen').value;
            } catch (error) {
                genRestriction = null;
            }
        }
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
        if (isFirstReply) {
            notifyForFirstRound(interaction);
        } else {
            if (numberOfRounds > 1)
                discordChannel.send(`Get ready for next round in 5 seconds! There are ${numberOfRounds} rounds remaining!`);
            else
                discordChannel.send(`Get ready for the **FINAL ROUND** in 5 seconds!`);
        }
//        isFirstReply ? interaction.reply(`Get ready for the first round! There are ${numberOfRounds} rounds in this game! `) :
//            discordChannel.send(`Get ready for next round in 5 seconds! There are ${numberOfRounds} rounds remaining!`);
        isFirstReply = false;
        await playRound();
        timeoutId = setTimeout(async () => {
            let answerWas = correctAnswer;
            correctAnswer = null;
            if (incorrectCount === 1) {
                await discordChannel.send(`Nobody typed it in time, and there was only ${incorrectCount} incorrect guess. The correct answer was: **${answerWas}**!`)

            }
            await discordChannel.send(`Nobody typed it in time, and there were ${incorrectCount} incorrect guesses. The correct answer was: **${answerWas}**!`)

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

const notifyForFirstRound = (interaction) => {
    if (currentGame.commandName === 'whosthatpokemon' || currentGame.commandName === 'pokedex') {
        let genInfo = '';
        if (genRestriction) {
            genInfo = `This game will be **Gen ${genRestriction} Pokemon** only.`
        }
        if (numberOfRounds > 1) {
            interaction.reply(`<@&${MENTIONABLE_ROLES.get('Pokemon Bot Games')}> <@&${MENTIONABLE_ROLES.get('Bot Games')}>, get ready for the first round! There are ${numberOfRounds} rounds in this game! ${genInfo}`);
        } else {
            interaction.reply(`<@&${MENTIONABLE_ROLES.get('Pokemon Bot Games')}> <@&${MENTIONABLE_ROLES.get('Bot Games')}>, get ready! There is only ${numberOfRounds} round in this game! ${genInfo}`);
        }
    } else {
        if (numberOfRounds > 1) {
            interaction.reply(`<@&${MENTIONABLE_ROLES.get('Bot Games')}>, get ready for the first round! There are ${numberOfRounds} rounds in this game!`);
        } else {
            interaction.reply(`<@&${MENTIONABLE_ROLES.get('Bot Games')}>, get ready! There is only ${numberOfRounds} round in this game!`);
        }
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
        case 'yugioh':
            await postYuGiOhCard();
            break;
        default:
            break;
    }
}

const postYuGiOhCard = async () => {
    await axios.get(`${currentGame.apiUri}/randomcard.php`).then(async response => {
        console.log(response.data.data[0])
        let retrievedCard = response.data.data[0];
        let pendingAnswer = retrievedCard.name;
        let croppedImageUrl = retrievedCard.card_images[0].image_url_cropped;
        let fullCardImageUrl = retrievedCard.card_images[0].image_url;

        console.log(pendingAnswer)

        buildYuGiOhEmbeds(pendingAnswer, croppedImageUrl, fullCardImageUrl, retrievedCard.desc);
        await typeMessageAndSetAnswer(null, pendingAnswer);
    })
}

const buildYuGiOhEmbeds = (cardTitle, croppedImageUrl, fullCardImageUrl, cardDescription) => {
    let mysteryEmbed = new EmbedBuilder().setTitle(`Name this Yu-Gi-Oh! card`).setColor([55, 82, 135])
        .setImage(croppedImageUrl);


    let mysteryAttachment = new AttachmentBuilder(croppedImageUrl, {name: 'mystery-card.png'});

    embedData.question.embed = mysteryEmbed;
    //embedData.question.attachment = mysteryAttachment;

    let answerAttachment = new AttachmentBuilder(fullCardImageUrl, {name: 'revealed-card.png'});

    embedData.answer.embed = new EmbedBuilder().setTitle(`The answer was **${cardTitle}!**`).setColor([55, 82, 135])
        .setDescription(cardDescription).setImage(fullCardImageUrl);
    //embedData.answer.attachment = answerAttachment;
}

const postPokedexEntry = async () => {
    let pokemonSearchRange = await findPokemonSearchRange();

    let randomPokemonNumber = getRandomInteger(pokemonSearchRange[0], pokemonSearchRange[1]);

    while (previousMonster.includes(randomPokemonNumber)) {
        randomPokemonNumber = getRandomInteger(pokemonSearchRange[0], pokemonSearchRange[1]);
    }

    previousMonster.push(randomPokemonNumber);

    await axios.get(`${currentGame.apiUri}/${randomPokemonNumber}`).then(async response => {
        let pendingAnswer = removeUnnecessaryInfo(response.data[0].name);

        // Pokedex API has Rhydon's name wrong, hardcode fix
        if (randomPokemonNumber === 112) {
            pendingAnswer = 'Rhydon';
        }

        if (randomPokemonNumber === 720) {
            pendingAnswer = 'Hoopa';
        }

        console.log(pendingAnswer);

        let message = `**Guess the Pokémon from this description:** \n*${response.data[0].description}*`;
        message = censorCorrectAnswerFromMessage(message, pendingAnswer, 'POKéMON');
        await buildPokemonEmbed(pendingAnswer, response.data[0].description, response.data[0].sprite, false);
        await typeMessageAndSetAnswer(message, pendingAnswer);
    }).catch(error => {
        showAndResetLeaderboard('The game is ending early due to an unexpected error.');
        clearTimeout(timeoutId);
        console.log(error);
    });
}

const postMysteryPokemon = async () => {
    let pokemonSearchRange = await findPokemonSearchRange();

    let randomPokemonNumber = getRandomInteger(pokemonSearchRange[0], pokemonSearchRange[1]);

    while (previousMonster.includes(randomPokemonNumber)) {
        randomPokemonNumber = getRandomInteger(pokemonSearchRange[0], pokemonSearchRange[1]);
    }

    previousMonster.push(randomPokemonNumber);

    await axios.get(`${currentGame.apiUri}/${randomPokemonNumber}`).then(async response => {
        let pendingAnswer = removeUnnecessaryInfo(response.data[0].name);

        // Pokedex API has Rhydon's name wrong, hardcode fix
        if (randomPokemonNumber === 112) {
            pendingAnswer = 'Rhydon';
        }

        if (randomPokemonNumber === 720) {
            pendingAnswer = 'Hoopa';
        }

        console.log(pendingAnswer)

        await buildPokemonEmbed(pendingAnswer, response.data[0].description, response.data[0].sprite, true);
        await typeMessageAndSetAnswer(null, pendingAnswer);
    }).catch(error => {
        showAndResetLeaderboard('The game is ending early due to an unexpected error.');
        clearTimeout(timeoutId);
        console.log(error);
    });
}

const removeUnnecessaryInfo = (pendingAnswer) => {
    let answer = pendingAnswer;
    if (answer.includes(" - ")) {
        answer = answer.split(" - ")[0]
    }
    console.log(answer)
    answer = answer.replace('♂️', '');
    answer = answer.replace('♂', '');
    answer = answer.replace('♀️', '');
    answer = answer.replace('♀', '');
    console.log(answer)

    return answer;
}

const findPokemonSearchRange = async () => {
    let min = 1;
    let max;
    if (!genRestriction) {
        await axios.get(`${currentGame.apiUri}/counts`).then(response => {
            max = response.data.total;
        }).catch(error => {
            showAndResetLeaderboard('The game is ending early due to an unexpected error.');
            clearTimeout(timeoutId);
            console.log(error);
        });

        return [min, max]
    }
    return POKEMON_GEN_MAP[genRestriction];
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


    embedData.answer.embed = new EmbedBuilder().setTitle(`It's **${pokemonName}!**`).setColor([255, 0, 0])
        .setDescription(pokemonDescription).setImage('attachment://pokemon.png');
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
        clearTimeout(timeoutId);
        console.log(error);
    }
}

const typeMessageAndSetAnswer = async (message, answer) => {
    await discordChannel.sendTyping();
    setTimeout(async () => {
        await discordChannel.sendTyping();

        embedData.question.embed ? discordChannel.send({
                embeds: [embedData.question.embed.setTimestamp(new Date()).toJSON()],
                files: embedData.question.attachment ? [embedData.question.attachment] : []
            }) :
            await discordChannel.send(`${message}`);
        questionTime = new Date();
        if (embedData.question.embed) {
            questionTime.setSeconds(questionTime.getSeconds() + 2);
        }

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

const createPlayerEntry = (author) => {
    return {
        player: author,
        points: answerPoints
    }
}

const addPoint = (message) => {
    let playerOnBoard = false;
    leaderBoard.forEach(position => {
        if (position.player === message.author) {
            playerOnBoard = true;
            position.points += answerPoints;
        }
    });
    if (!playerOnBoard) {
        leaderBoard.push(createPlayerEntry(message.author));
    }
}

const calculateAnswerPoints = () => {
    let points = (answerSpeed / 30) * 100;
    points = Math.floor(points);
    answerPoints = 100 - points;
    if (answerSpeed <= 0) {
        answerSpeed = 0.01;
        answerPoints = 100;
    }
    answerPoints += bonusPoints;
}

const showAndResetLeaderboard = (message) => {
    discordChannel.send(message);

    if (leaderBoard.length < 1) {
        discordChannel.send(`Nobody earned any points at all. Try harder!`);


        leaderBoard = [];
        currentGame = null;
        isGameOngoing = false;
        bonusPoints = 0;
        incorrectCount = 0;
        previousMonster = [];
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

    if (leaderBoard[3]) {
        winnerString = winnerString.concat(`4. <@${leaderBoard[3].player.id}> ${leaderBoard[3].points} points\n`)
    }
    if (leaderBoard[4]) {
        winnerString = winnerString.concat(`5. <@${leaderBoard[4].player.id}> ${leaderBoard[4].points} points\n`)
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
    genRestriction = null;
    bonusPoints = 0;
    incorrectCount = 0;
    previousMonster = [];
}

const handleAnswerAttempt = async (message) => {
    if (correctAnswer) {
        if (message.content.toLowerCase() === correctAnswer.toLowerCase() && `<#${message.channel.id}>` === gameLocation) {
            let answerWas = correctAnswer;
            correctAnswer = null;
            clearTimeout(timeoutId);
            answerTime = new Date();
            answerSpeed = ((answerTime - questionTime) / 1000).toFixed(2);
            calculateAnswerPoints();
            addPoint(message);
            message.react(`✅`).catch(err => console.error(err));
            if (incorrectCount === 1) {
                await message.reply(`Congrats ${message.author} you were first to send the correct answer of **${answerWas}**! In **${answerSpeed} seconds**, with **${incorrectCount} incorrect guess before you**, earning you **${answerPoints}** points!`);
            } else {
                await message.reply(`Congrats ${message.author} you were first to send the correct answer of **${answerWas}**! In **${answerSpeed} seconds**, with **${incorrectCount} incorrect guesses before you**, earning you **${answerPoints}** points!`);

            }

            if (embedData.answer.embed) {
                await message.channel.send({
                    embeds: [embedData.answer.embed.setTimestamp(new Date()).toJSON()],
                    files: embedData.answer.attachment ? [embedData.answer.attachment] : []
                })
            }

            cleanDataForNextRound();
            postReady();
        } else if (`<#${message.channel.id}>` === gameLocation) {
            bonusPoints += 20;
            incorrectCount += 1;
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
        }
    };
    numberOfRounds--;
    bonusPoints = 0;
    incorrectCount = 0;
    timeoutId = null;
}


module.exports = {handleGameStart, handleAnswerAttempt};
