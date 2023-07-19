const axios = require('axios');

const handleWordRace = (interaction) =>{
    if(interaction.commandName === 'wordrace'){
        const getWord = async () => {
            try {
                await axios.get('https://random-word-api.herokuapp.com/word').then(response =>{
                    console.log(response.data[0]);
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

        getWord();
  
    }
}

module.exports = {handleWordRace};