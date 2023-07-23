const axios = require('axios');
const {time} = require("discord.js");

const GAME_LIST = [
    {
        gameTitle: 'WordRace',
        commandName: 'wordrace',
        apiUri: 'https://random-word-api.herokuapp.com/word'
    },
    {
        gameTitle: 'Pokedex Reader',
        commandName: 'pokedex',
        apiUri:'https://pokeapi.glitch.me/v1/pokemon'
    },
    {
        gameTitle: "Who's that Pokemon?",
        commandName: 'whosthatpokemon'
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

const handleGameStart = async (interaction) => {
    GAME_LIST.forEach(gameChoice => {
        if (gameChoice.commandName === interaction.commandName){
            currentGame = gameChoice;
        }
    })

    if (currentGame) {
        if(isGameOngoing){
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
    if(numberOfRounds > 0){
        isGameOngoing = true;
        if(interaction){
        gameLocation = `<#${interaction.channelId}>`;
        }
    isFirstReply ? interaction.reply(`Get ready for the first round! There are ${numberOfRounds} rounds in this game! `) :
                 discordChannel.send(`Get ready for next round in 5 seconds! There are ${numberOfRounds} rounds remaining!`);
    isFirstReply = false;
    await playRound();
    timeoutId = setTimeout(() => {
        discordChannel.send(`Nobody typed it in time. The correct answer was: **${correctAnswer}**!`)
        numberOfRounds--
        postReady();
    }, 30000)
    }
    else{
        isGameOngoing = false;
        discordChannel.send(`The game is done!`)
        showLeaderBoard();
        leaderBoard = [];
        currentGame = null;
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
        default:
            break;
    }
}

const postPokedexEntry = async () => {
    let totalPokemonCount;

    await axios.get(`${currentGame.apiUri}/counts`).then(response =>{
        totalPokemonCount = response.data.total;
    }).catch(errror => {
        //TODO: add cancel game here
        console.log(errror);
    });

    let randomPokemonNumber = getRandomInteger(1, totalPokemonCount);

    await axios.get(`${currentGame.apiUri}/${randomPokemonNumber}`).then(response =>{
        console.log(response.data[0].name)
        correctAnswer = response.data[0].name
        let message = `Guess the Pokemon from this description: *${response.data[0].description}*`;
        message = censorCorrectAnswerFromMessage(message);
        typeAndSendMessage(message);
    }).catch(errror => {
        //TODO: add cancel game here
        console.log(errror);
    });
}

function censorCorrectAnswerFromMessage(message) {
    //TODO could be cleaned up
    let correctedMessage;
    correctedMessage = message.replaceAll(correctAnswer, 'POKEMON');
    correctedMessage = message.replaceAll(correctAnswer.toLowerCase(), 'POKEMON');
    correctedMessage = message.replaceAll(correctAnswer.toUpperCase(), 'POKEMON');
    return correctedMessage;

}

function getRandomInteger(min, max) {
    console.log(Math.floor(Math.random() * (max - min) ) + min)
    return Math.floor(Math.random() * (max - min + 1) ) + min;
}

const postWord = async () => {
    try {
        await axios.get(currentGame.apiUri).then(response =>{
            correctAnswer = response.data[0];
            console.log(response.data[0])
            const message = (bubbleFormatter(response.data[0]));
            console.log(message);
            typeAndSendMessage(message);
        })
    } catch (error) {
        //TODO: add cancel game here
        console.log(error);
    }
}

const typeAndSendMessage = async (message) => {
    await discordChannel.sendTyping();
    setTimeout(async () =>{
        await discordChannel.sendTyping();
        await discordChannel.send(`${message}`);
    },5000)
}



const bubbleFormatter = (word) => {
    let bubbleWord = '';
    for(let i = 0; i < word.length; i++){
        let letter = `:regional_indicator_${word[i]}:`
        bubbleWord = bubbleWord.concat(" ", letter);
    }
    return bubbleWord;
}

const createPlayerEntry = (author, points = 1) => {
    const player = {
        player : author,
        points: points
    }
    return player
}

const addPoint = (message) => {
    let playerOnBoard = false;
    leaderBoard.forEach(rank => {
        if(rank.player == message.author){
            playerOnBoard = true;
            rank.points++;
        }
    });
    if(!playerOnBoard){
        leaderBoard.push(createPlayerEntry(message.author));
    }
}

const showLeaderBoard = () => {

    if (leaderBoard.length < 1) {
        discordChannel.send('Nobody earned any points at all. Try harder!');
        return;
    }

    leaderBoard.sort((a,b) =>{
        return b.points - a.points
    });
    let winnerString = `:first_place:<@${leaderBoard[0].player.id}> ${leaderBoard[0].points} points\n`;

    if(leaderBoard[1]){
        winnerString = winnerString.concat(`:second_place:<@${leaderBoard[1].player.id}> ${leaderBoard[1].points} points\n`)
    }

    if(leaderBoard[2]){
        winnerString = winnerString.concat(`:third_place:<@${leaderBoard[2].player.id}> ${leaderBoard[2].points} points\n`)        
    }

    const exampleEmbed = {
        title: `**${currentGame.gameTitle}** Results`,
        fields: [

            {
                name: 'Winners',
                value: winnerString,
            },
        ],
        timestamp: new Date().toISOString(),
    };
    discordChannel.send({ embeds: [exampleEmbed]});

    discordChannel.send(`Congrats <@${leaderBoard[0].player.id}> on winning!`);
}

const handleCorrectAnswer = (message) => {
    if(correctAnswer){
        if(message.content.toLowerCase() === correctAnswer.toLowerCase()){
            clearTimeout(timeoutId);
            addPoint(message);
            message.reply(`Congrats ${message.author} you were first to send the correct answer of **${correctAnswer}**!`);
            correctAnswer = null;
            numberOfRounds--;
            postReady();
        }
    }

}


module.exports = {handleWordRace: handleGameStart, handleCorrectWord: handleCorrectAnswer};
