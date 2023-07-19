const ms = require('ms');
const moment = require('moment-timezone');

// Maps common timezone abbreviations to full names (we are ignoring China Standard Time)
const timezoneMapping = {
    'PST': 'America/Los_Angeles',
    'PDT': 'America/Los_Angeles',
    'MST': 'America/Denver',
    'MDT': 'America/Denver',
    'CST': 'America/Chicago',
    'CDT': 'America/Chicago',
    'EST': 'America/New_York',
    'EDT': 'America/New_York'
}

function handleReminder(message) {
    const initialD = new Date();
    const initialTime = initialD.toLocaleTimeString();

    if (message.content.startsWith('!remindme')) {
        console.log(`Reminder request for ${message.author.username} found in message: "${message.content}"\nInitiated at ${initialTime}`);

        const parts = message.content.split(' ');

        if (!parts[1]) {
            message.channel.send('Sorry, it looks like you used the command wrong. Remember, the syntax is !remindme (time) (timezone) (reminder)');
            console.log(`User ${message.author.username} submitted an invalid reminder request.`);
            return;
        }

        let delay;
        let reminder;
        const timeOrDuration = parts[1];

        // If the second argument is a recognized timezone, interpret the first argument as a time
        const timeZoneFull = moment.tz.zone(parts[2]) ? parts[2] : timezoneMapping[parts[2].toUpperCase()];
        if (timeZoneFull) {
            const time = timeOrDuration;
            reminder = parts.slice(3).join(' ');

            // Creates a moment object in specified time zone
            console.log(`Time input: ${time}`);
            console.log(`Timezone input: ${timeZoneFull}`);

            const targetMoment = moment.tz(timeZoneFull);
            targetMoment.set({
                hour:   moment(time, 'h:mm A').get('hour'),
                minute: moment(time, 'h:mm A').get('minute')
            });
            const currentTime = moment.tz(timeZoneFull);
            delay = targetMoment.diff(currentTime);

            console.log(`Target moment: ${targetMoment.format()}`);
            console.log(`Current time: ${currentTime.format()}`);
            console.log(`Delay: ${delay}`);

            if (delay <= 0) {
                // Interprets time as being for next day
                targetMoment.add(1, 'day');
                delay = targetMoment.diff(currentTime);
                message.reply(`Okay, I\'ll remind you with: "${reminder}" at ${time} ${timeZoneFull} tomorrow. `);
            } else {
                message.reply(`Okay, I\'ll remind you with: "${reminder}" at ${time} ${timeZoneFull}`);
            }
        }
        // Otherwise, interpret first argument as countdown
        else if (!isNaN(ms(timeOrDuration))) {
            reminder = parts.slice(2).join(' ');
            delay = ms(timeOrDuration);

            message.reply(`Okay, I\'ll remind you with: "${reminder}" in ${timeOrDuration}`);
        }
        else {
            message.reply("Invalid time, duration or timezone, buddy. Try that again: !remindme (time or duration) (timezone if time provided) (reminder)");
            console.log(`Invalid time, duration, or timezone used in request for user ${message.author.username}`);
            return;
        }

        console.log('Setting reminder for ', delay, ' ms');
        setTimeout(() => {
            console.log('Reminder fired')
            const d = new Date();
            const reminderTime = d.toLocaleTimeString();
            message.reply(`Reminder: ${reminder}`);
            console.log(`Reminder for ${message.author.username} fulfilled at ${reminderTime}`);
        }, delay);
    }
}

module.exports = {handleReminder};