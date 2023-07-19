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

        let timeZoneFull = moment.tz.guess(); // Sets default timezone to system timezone

        if (!parts[1]) {
            message.channel.send('Sorry, it looks like you used the command wrong. Remember, the syntax is !remindme (time/duration) (timezone optional) (reminder)');
            console.log(`User ${message.author.username} submitted an invalid reminder request.`);
            return;
        }

        let timeOrDuration = parts[1];
        let reminder;

        // Check if timeOrDuration is a duration (like "5 hours") or a time (like "10:00 PM")
        const duration = ms(timeOrDuration);
        if (!isNaN(duration)) {
            // It's a duration, so we'll treat it as such
            reminder = parts.slice(2).join(' ');

            message.reply(`Okay, I'll remind you with: "${reminder}" in ${timeOrDuration}.`);

            setTimeout(() => {
                const d = new Date();
                const time = d.toLocaleTimeString();
                message.reply(`Reminder: ${reminder}`);
                console.log(`Reminder for ${message.author.username} fulfilled at ${time}`);
            }, duration);
        } else {
            // It's a time, so we'll treat it as such
            let reminderStartIndex = 3; // Assumes timezone is provided
            if (!parts[2] || isNaN(ms(parts[2]))) {
                const tz = parts[2].toUpperCase();
                if (moment.tz.zone(tz) || timezoneMapping[tz]) {
                    timeZoneFull = timezoneMapping[tz] || tz;
                    timeZoneDisplay = tz; // Displays user input as entered
                } else {
                    timeZoneFull = moment.tz.guess(); // Uses system time zone if not specified or invalid
                    timeZoneDisplay = moment.tz(timeZoneFull).format('z'); // Uses abbreviated timezone for display
                    reminderStartIndex = 2; // No timezone, so reminder starts from 2nd part
                    console.log("User did not specify a timezone or it was invalid. Default system timezone will be used.");
                }
            }

            const reminder = parts.slice(reminderStartIndex).join(' ');

            const targetMoment = moment.tz(timeOrDuration, 'h:mm A', timeZoneFull);
            const currentTime = moment().tz(timeZoneFull);

            const timeDifferenceInMs = targetMoment.diff(currentTime);

            if (timeDifferenceInMs < 0) {
                message.reply(`You've set a reminder for a time that's already passed. You specified ${timeOrDuration}, but current time in ${timeZoneFull} is ${currentTime.format('h:mm A')}`);
                console.log("Invalid reminder: Time specified is in the past.")
                return;
            }

            console.log(`Target moment: ${targetMoment.format()}`);
            console.log(`Current time: ${currentTime.format()}`);

            if (reminderStartIndex == 2) {
                message.reply(`You did not specify a time zone. I'll remind you with: "${reminder}" at ${timeOrDuration} ${timeZoneDisplay}. If you would like to use your own timezone, please specify next time: !remindme (time/duration) (timezone) (reminder)`);
            } else {
                message.reply(`Okay, I'll remind you with: "${reminder}" at ${timeOrDuration} ${timeZoneDisplay}.`);
            }

            setTimeout(() => {
                console.log('Reminder fired')
                const d = new Date();
                const reminderTime = d.toLocaleTimeString();
                message.reply(`Reminder: ${reminder}`);
                console.log(`Reminder for ${message.author.username} fulfilled at ${reminderTime}`);
            }, timeDifferenceInMs);
        }
    }
}

module.exports = {handleReminder};