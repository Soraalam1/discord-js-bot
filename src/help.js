//interaction.reply({ content: 'Only you! :)', ephemeral: true });

const handleHelp = (interaction) =>
{
    if (interaction.commandName === 'help'){
        const helpValue = interaction.options.get('command').value;
        if (helpValue == 'word race typing game')
        {
            interaction.reply({ content: 'wordrace blah blah blah', ephemeral: true}); //"ephemeral: true" makes the text only readable to user
        }
        else if (helpValue == 'reminder')
        {
            interaction.reply({ content: 'remindme blah blah blah', ephemeral: true});
        }
        else if (helpValue == 'pokedex typing game')
        {
            interaction.reply({ content: 'pokedex blah blah blah', ephemeral: true});
        }
    }
}

module.exports = {handleHelp}