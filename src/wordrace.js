const axios = require('axios');

let correctWord = undefined;
let numberOfRounds = 0;
let isFirstReply = true;
let isGameOngoing = false;
let gameLocation = null;
let discordChannel = null;
let leaderBoard = [];

const handleWordRace = async (interaction) => {
    if(interaction.commandName === 'wordrace'){
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
    isFirstReply ? interaction.reply(`Get ready for the word in 5 seconds! There are ${numberOfRounds} rounds in this game! `) :
                 discordChannel.send(`Get ready for the word in 5 seconds! There are ${numberOfRounds} rounds remaining!`);
    isFirstReply = false;
    postWord();
    }
    else{
        isGameOngoing = false;
        discordChannel.send(`The game is done!`)
        showLeaderBoard();
    }
}

const postWord = async () => {
    try {
        await axios.get('https://random-word-api.herokuapp.com/word').then(response =>{
            correctWord = response.data[0];
            const message = (bubbleFormatter(response.data[0]));
            discordChannel.sendTyping();
            setTimeout(async () =>{
                await discordChannel.sendTyping();
                await discordChannel.send(`${message}`); 
            },5000)
        })
        } catch (error) {
        console.log(error);
    }
}

const bubbleFormatter = (word) => {
    let bubbleWord = '';
    for(let i = 0; i < word.length; i++){
        let letter = `:regional_indicator_${word[i]}:`
        bubbleWord = bubbleWord.concat(" ", letter);
    }
    return bubbleWord;
}

const makeUser = (author) => {
    const player = {
        player : author,
        points: 1
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
        leaderBoard.push(makeUser(message.author));
    }
}

const showLeaderBoard = () => {

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
        title: '**WordRace Results**',
        fields: [

            {
                name: 'Winners',
                value: winnerString,
            },
        ],
        timestamp: new Date().toISOString(),
    };
    discordChannel.send({ embeds: [exampleEmbed]});

    discordChannel.send(`Congrats <@${leaderBoard[0].player.id}> on winning!`)
}

const handleCorrectWord = (message) => {
    if(correctWord){
        if(message.content.toLowerCase() === correctWord){
            addPoint(message);
            message.reply(`Congrats ${message.author} you were first to type **${correctWord}**!`);
            correctWord = undefined;
            clearInterval();
            numberOfRounds--;
            postReady();
        }
    }

}


module.exports = {handleWordRace, handleCorrectWord};