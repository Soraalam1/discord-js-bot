const axios = require('axios');

let correctWord = undefined;
let isAnswered = false;
let isGameRunning = false;
let numberOfRounds = 0;
let numberOfSeconds = 0;

const handleWordRace = (interaction) => {
    if(interaction.commandName === 'wordrace'){
        numberOfRounds = interaction.options.get('rounds');
        numberOfSeconds = interaction.options.get('time');
        getWord(interaction);
    }
}

const getWord = async (interaction) => {
    try {
        await axios.get('https://random-word-api.herokuapp.com/word').then(response =>{
            console.log(response.data[0]);
            correctWord = response.data[0];
            const message = (bubbleFormatter(response.data[0]));                    
            interaction.reply(`${message}`)
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
        if(message.content.toLowerCase() === correctWord){
            message.reply(`Congrats ${message.author} you were first to type ${correctWord}!`);
            correctWord = undefined;
        }
    }

}

const startGame = (interaction) => {
    isGameRunning = true;

}

module.exports = {handleWordRace, handleCorrectWord};