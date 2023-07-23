const ms = require('ms');
const moment = require('moment-timezone');


// Maps common timezone abbreviations to full names (we are ignoring China Standard Time)
const timezoneMapping = {
    'America/Los_Angeles': 'PST/PDT' ,
    'America/Denver' : 'MST/MDT' ,
    'America/Chicago': 'CST/CDT' ,
    'America/New_York': 'EST/EDT' ,
    'Asia/Beirut' : 'LBT',
    'Europe/London' : 'BST/GMT',
};


const logReminderRequest = (interaction) => {
    const initialD = new Date();
    const initialTime = initialD.toLocaleTimeString();
    console.log(`Reminder request for ${interaction.user.username} found in interaction: "${interaction.options}"\nInitiated at ${initialTime}`);
};


const parseInteraction = (interaction) => {
    const timeOrDuration = interaction.options.get('time').value;
    let reminder = interaction.options.get('reminder').value;

    return {timeOrDuration, reminder};
};


const abbreviationMapping = Object.fromEntries(
    Object.entries(timezoneMapping).map(([key, value]) => [value, key])
);

const getCurrentAbbreviation = (zone) => {
    const now = moment().tz(zone);
    return now.format('z');
}


const setDurationReminder = (interaction, timeOrDuration, reminder) => {
    interaction.reply(`Okay, I'll remind you with: "${reminder}" in ${timeOrDuration}.`);

    setTimeout(() => {
        const d = new Date();
        const time = d.toLocaleTimeString();
        interaction.channel.send(`${interaction.member} Reminder: ${reminder}`);
        console.log(`Reminder for ${interaction.user.username} fulfilled at ${time}`);
    }, ms(timeOrDuration));
};


const determineTimeZone = (interaction, timeZoneFull = 'America/New_York') => {
    const tz = interaction.options.get('timezone').value;
    if (moment.tz.zone(tz)) {
        timeZoneFull = tz;
    } else if (abbreviationMapping[tz]) {
        timeZoneFull = abbreviationMapping[tz];
    } else {
        console.log("User did not specify a timezone or it was invalid.");
    }
    return timeZoneFull;
};


const setTimeReminder = (interaction, timeOrDuration, reminder, timeZoneFull) => {
    const targetMoment = moment.tz(timeOrDuration, 'h:mm A', timeZoneFull);
    const currentTime = moment().tz(timeZoneFull);

    const timeDifferenceInMs = targetMoment.diff(currentTime);

    if (timeDifferenceInMs < 0) {
        interaction.reply(`You've set a reminder for a time that's already passed. You specified ${timeOrDuration}, but
                       current time in ${getCurrentAbbreviation(timeZoneFull)} is ${currentTime.format('h:mm A')}`);
        console.log("Invalid reminder: Time specified is in the past.");
        return;
    }

    console.log(`Target moment: ${targetMoment.format()}`);
    console.log(`Current time: ${currentTime.format()}`);

    interaction.reply(`Okay, I'll remind you with: "${reminder}" at ${timeOrDuration} ${getCurrentAbbreviation(timeZoneFull)}.`);

    setTimeout(() => {
        console.log('Reminder fired')
        const d = new Date();
        const reminderTime = d.toLocaleTimeString();
        interaction.channel.send(`${interaction.member} Reminder: ${reminder}`);
        console.log(`Reminder for ${interaction.user.username} fulfilled at ${reminderTime}`);
    }, timeDifferenceInMs);
};


const handleReminder = (interaction) => {
    if (interaction.commandName === 'remindme') {
        logReminderRequest(interaction);

        const {timeOrDuration, reminder} = parseInteraction(interaction);

        // Check if timeOrDuration is a duration (like "5 hours") or a time (like "10:00 PM")
        const duration = ms(timeOrDuration);
        if (!isNaN(duration)) {
            // It's a duration, so we'll treat it as such
            setDurationReminder(interaction, timeOrDuration, reminder);
        } else {
            // It's a time, so we'll treat it as such
            const timeZoneFull = determineTimeZone(interaction);
            setTimeReminder(interaction, timeOrDuration, reminder, timeZoneFull);
        }
    }
};

module.exports = {handleReminder};