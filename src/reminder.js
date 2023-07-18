const ms = require('ms');

function handleReminder(message) {
    const initialD = new Date();
    const initialTime = initialD.toLocaleTimeString();
    if (message.content.startsWith('!remindme')) {
        console.log(`Reminder request for ${message.author.username} found in message: "${message.content}"\nInitiated at ${initialTime}`);

        const parts = message.content.split(' ');

        if (!parts[1] || isNaN(ms(parts[1]))) {
            message.channel.send('Not a valid time format...idiot. Remember, the syntax is !remindme (time) (reminder)');
            console.log("Invalid date/time format used in reminder request.");
            return;
        }

        if (!parts[2]) {
            message.channel.send('Where is your reminder bro...Remember, the syntax is !remindme (time) (reminder)');
            console.log("Reminder body not found; missing text after date/time.")
            return;
        }

        const reminder = parts.slice(2).join(' ');

        message.reply(`Okay, I\'ll remind you with: "${reminder}" in ${parts[1]}.`);

        setTimeout(() => {
            const d = new Date();
            const time = d.toLocaleTimeString();
            message.reply(`Reminder: ${reminder}`);
            console.log(`Reminder for ${message.author.username} fulfilled at ${time}`);
        }, ms(parts[1]));
    }
}

module.exports = {handleReminder};