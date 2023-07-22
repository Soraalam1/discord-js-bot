const axios = require('axios');

let correctWord = undefined;
let numberOfRounds = 0;
let isFirstReply = true;
let isGameOngoing = false;
let discordChannel = null;

const handleWordRace = async (interaction) => {
    if(interaction.commandName === 'wordrace'){
        if(isGameOngoing){
            interaction.reply('WAIT! A game is going on right now!');
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
    isFirstReply ? interaction.reply(`Get ready for the word in 5 seconds! There are ${numberOfRounds} rounds in this game! `) :
                 discordChannel.send(`Get ready for the word in 5 seconds! There are ${numberOfRounds} left!`);
    isFirstReply = false;
    postWord();
    }
    else{
        isGameOngoing = false;
        discordChannel.send(`The game is done!`)
    }
}

const postWord = async () => {
    try {
        await axios.get('https://random-word-api.herokuapp.com/word').then(response =>{
            correctWord = response.data[0];
            const message = (bubbleFormatter(response.data[0]));
            //todo: add typing from the bot
            setTimeout(async () =>{
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

const handleCorrectWord = (message) => {
    if(correctWord){
        console.log(message);
        if(message.content.toLowerCase() === correctWord){
            message.reply(`Congrats ${message.author} you were first to type ${correctWord}!`);
            correctWord = undefined;
            clearInterval();
            numberOfRounds--;
            postReady();
        }
    }

}


module.exports = {handleWordRace, handleCorrectWord};