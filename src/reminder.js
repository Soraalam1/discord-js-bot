const ms = require('ms');

function handleReminder(message) {
    if (message.content.startsWith('!remindme')) {
        const parts = message.content.split(' ');

        if (!parts[1] || isNaN(ms(parts[1]))) {
            message.channel.send('Not a valid time format...idiot. Remember, the syntax is !remindme (time) (reminder)');
            return;
        }

        if (!parts[2]) {
            message.channel.send('Where is your reminder bro...Remember, the syntax is !remindme (time) (reminder)');
            return;
        }

        const reminder = parts.slice(2).join(' ')

        message.channel.send('Okay, I\'ll remind you to "${reminder}" in ${parts[1]}');

        setTimeout(() => {
            message.author.send('Reminder: ${reminder}');
        }, ms(parts[1]));
    }
}

module.exports = handleReminder;