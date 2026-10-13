const fs = require("fs");
const path = require("path");
const {ApplicationCommandOptionType, MessageFlags, PermissionFlagsBits} = require("discord.js");

const STORE_PATH = path.resolve(__dirname, "..", "data", "supporter-colors.json");
const COLOR_ROLE_PREFIX = "Active Supporter - ";
const DEFAULT_SUPPORTER_ROLE_NAMES = ["Twitch Subscriber", "Discord Supporter", "YouTube Member"];
// Discord's default Blue, reserved for the server owner. Anything perceptually closer than this
// many CIEDE2000 units is refused.
const RESERVED_BLUE = "#3498db";
const DEFAULT_BLUE_LOCK_DELTA_E = 9;
// Catches role changes made while a gateway event was missed.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const HEX_PATTERN = /^#?([0-9a-f]{6})$/i;
// The swatches in Discord's role color picker. Only color roles in one of these colors are offered
// as presets.
const DISCORD_PRESET_COLORS = new Set([
    "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e91e63", "#f1c40f", "#e67e22", "#e74c3c", "#95a5a6", "#607d8b",
    "#11806a", "#1f8b4c", "#206694", "#71368a", "#ad1457", "#c27c0e", "#a84300", "#992d22", "#979c9f", "#546e7a",
]);

const readNumberEnv = (name, fallback) => {
    const parsed = Number.parseFloat(process.env[name]);
    return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
};

const BLUE_LOCK_DELTA_E = readNumberEnv("BLUE_LOCK_DELTA_E", DEFAULT_BLUE_LOCK_DELTA_E);
// Overridable so a stand-in role can be used for testing without touching real subscriptions.
const SUPPORTER_ROLE_NAMES = process.env.SUPPORTER_ROLE_NAMES
    ? process.env.SUPPORTER_ROLE_NAMES.split(",").map(name => name.trim()).filter(Boolean)
    : DEFAULT_SUPPORTER_ROLE_NAMES;

// ---------------------------------------------------------------------------------------------
// Preference store: userId -> {color: "#rrggbb", setBy, updatedAt}
// ---------------------------------------------------------------------------------------------

const preferences = new Map();
// Stays false until the store has loaded, so a command can never save over an unread file.
let enabled = false;

const loadPreferences = () => {
    try {
        const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
        Object.entries(raw).forEach(([userId, pref]) => preferences.set(userId, pref));
        console.log(`Supporter colors: loaded ${preferences.size} preferences.`);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
        console.log("Supporter colors: no preference file yet, starting empty.");
    }
};

const savePreferences = () => {
    fs.mkdirSync(path.dirname(STORE_PATH), {recursive: true});
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(Object.fromEntries(preferences), null, 2));
    fs.renameSync(tmpPath, STORE_PATH);
};

const setPreference = (userId, color, setBy) => {
    preferences.set(userId, {color, setBy, updatedAt: new Date().toISOString()});
    savePreferences();
};

const clearPreference = (userId) => {
    const existed = preferences.delete(userId);
    if (existed) {
        savePreferences();
    }
    return existed;
};

// ---------------------------------------------------------------------------------------------
// Color distance (CIEDE2000)
// ---------------------------------------------------------------------------------------------

const hexToLab = (hex) => {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    const linear = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(channel => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const [r, g, b] = linear;
    // sRGB -> XYZ, normalised to the D65 white point.
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const [fx, fy, fz] = [f(x), f(y), f(z)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const deltaE2000 = ([l1, a1, b1], [l2, a2, b2]) => {
    const rad = deg => (deg * Math.PI) / 180;
    const deg = r => (r * 180) / Math.PI;
    const pow7 = 25 ** 7;

    const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
    const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + pow7)));
    const a1p = (1 + g) * a1;
    const a2p = (1 + g) * a2;
    const c1p = Math.hypot(a1p, b1);
    const c2p = Math.hypot(a2p, b2);
    const hue = (b, a) => (b === 0 && a === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
    const h1p = hue(b1, a1p);
    const h2p = hue(b2, a2p);

    const dLp = l2 - l1;
    const dCp = c2p - c1p;
    let dhp = 0;
    if (c1p * c2p !== 0) {
        dhp = h2p - h1p;
        if (dhp > 180) dhp -= 360;
        else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2));

    const lBarP = (l1 + l2) / 2;
    const cBarP = (c1p + c2p) / 2;
    let hBarP = h1p + h2p;
    if (c1p * c2p !== 0) {
        if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2;
        else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2;
        else hBarP = (h1p + h2p - 360) / 2;
    }

    const t = 1
        - 0.17 * Math.cos(rad(hBarP - 30))
        + 0.24 * Math.cos(rad(2 * hBarP))
        + 0.32 * Math.cos(rad(3 * hBarP + 6))
        - 0.20 * Math.cos(rad(4 * hBarP - 63));
    const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
    const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + pow7));
    const sl = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
    const sc = 1 + 0.045 * cBarP;
    const sh = 1 + 0.015 * cBarP * t;
    const rt = -Math.sin(rad(2 * dTheta)) * rc;

    return Math.sqrt(
        (dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh)
    );
};

const RESERVED_BLUE_LAB = hexToLab(RESERVED_BLUE);

const isTooCloseToBlue = (hex) => deltaE2000(hexToLab(hex), RESERVED_BLUE_LAB) < BLUE_LOCK_DELTA_E;

const normalizeHex = (input) => {
    const match = HEX_PATTERN.exec(input.trim());
    return match ? `#${match[1].toLowerCase()}` : null;
};

// ---------------------------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------------------------

const isColorRole = role => role.name.startsWith(COLOR_ROLE_PREFIX);
// Custom roles carry their hex in the name and are deleted when unused. Any other color role was
// made by hand and is permanent.
const isCustomColorRole = role => isColorRole(role) && role.name.includes("#");
const isPresetRole = role =>
    isColorRole(role) && !role.name.includes("#") && DISCORD_PRESET_COLORS.has(role.hexColor);
const presetNameOf = role => role.name.slice(COLOR_ROLE_PREFIX.length);

const getGuild = client => client.guilds.cache.get(process.env.DISCORD_GUILD_ID);

const isSupporter = member => member.roles.cache.some(role => SUPPORTER_ROLE_NAMES.includes(role.name));

// The guild owner's own Blue is the reason for the lock, so the owner is exempt from it.
const isBlueExempt = (guild, userId) => guild.ownerId === userId;

// Any existing color role already in this color is reused, preferring a permanent role over a
// custom one, so typing a preset's hex never creates a duplicate.
const findRoleForColor = (guild, color) =>
    guild.roles.cache
        .filter(role => isColorRole(role) && role.hexColor === color)
        .sort((a, b) => Number(isCustomColorRole(a)) - Number(isCustomColorRole(b)) || b.position - a.position)
        .first();

const findPresetRole = (guild, color) =>
    guild.roles.cache.find(role => isPresetRole(role) && role.hexColor === color);

// Preset roles members may pick from, minus any that sit too close to the reserved blue.
const getSelectablePresets = guild => {
    const seen = new Set();
    return guild.roles.cache
        .filter(role => isPresetRole(role) && !isTooCloseToBlue(role.hexColor))
        .sort((a, b) => b.position - a.position)
        .filter(role => !seen.has(role.hexColor) && seen.add(role.hexColor))
        .map(role => ({name: presetNameOf(role), value: role.hexColor}));
};

// Returns a reason string when the color must not be applied, otherwise null.
const checkColor = (guild, userId, color) =>
    !isBlueExempt(guild, userId) && isTooCloseToBlue(color) ? `${color} is too close to the reserved blue` : null;

const ensureRole = async (guild, color) => {
    const existing = findRoleForColor(guild, color);
    if (existing) {
        return existing;
    }

    // Placed next to the highest existing color role so it lands in the same block of the
    // hierarchy. Preset roles are never deleted, so an anchor always exists.
    const anchor = guild.roles.cache
        .filter(isColorRole)
        .sort((a, b) => b.position - a.position)
        .first();
    const role = await guild.roles.create({
        name: `${COLOR_ROLE_PREFIX}${color}`,
        colors: {primaryColor: color},
        hoist: false,
        mentionable: false,
        permissions: [],
        reason: "Supporter color role recreated",
    });
    console.log(`Supporter colors: created role ${role.name}`);

    if (anchor) {
        try {
            await role.setPosition(anchor.position);
        } catch (error) {
            console.log(`Supporter colors: could not position ${role.name}: ${error}`);
        }
    }
    return role;
};

const deleteIfUnused = async (role) => {
    if (!isCustomColorRole(role) || role.members.size > 0 || !role.guild.roles.cache.has(role.id)) {
        return;
    }
    try {
        await role.delete("Supporter color role no longer in use");
        console.log(`Supporter colors: deleted unused role ${role.name}`);
    } catch (error) {
        console.log(`Supporter colors: could not delete ${role.name}: ${error}`);
    }
};

// Every role mutation goes through this chain, so two members resubscribing at once with the same
// color cannot both create the role.
let queue = Promise.resolve();
const enqueue = (task) => {
    const result = queue.then(task);
    queue = result.catch(error => console.log(`Supporter colors: ${error}`));
    return result;
};

// ---------------------------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------------------------

// Members who already have a color role from before the bot managed them get it adopted as their
// preference, so existing manual assignments survive the first run.
const adoptExistingColor = (member) => {
    const current = member.roles.cache
        .filter(role => isColorRole(role) && role.colors.primaryColor !== 0)
        .sort((a, b) => b.position - a.position)
        .first();
    if (!current) {
        return null;
    }
    setPreference(member.id, current.hexColor, "import");
    console.log(`Supporter colors: imported ${current.name} (${current.hexColor}) for ${member.user.tag}`);
    return preferences.get(member.id);
};

const reconcileMember = async (member) => {
    const guild = member.guild;
    const pref = preferences.get(member.id) ?? adoptExistingColor(member);

    let desiredRole = null;
    if (pref && isSupporter(member)) {
        const problem = checkColor(guild, member.id, pref.color);
        if (problem) {
            console.log(`Supporter colors: not applying color for ${member.user.tag}: ${problem}`);
        } else {
            desiredRole = await ensureRole(guild, pref.color);
        }
    }

    const toRemove = member.roles.cache.filter(role => isColorRole(role) && role.id !== desiredRole?.id);
    const needsAdd = desiredRole && !member.roles.cache.has(desiredRole.id);
    if (toRemove.size === 0 && !needsAdd) {
        return;
    }

    const roleIds = member.roles.cache
        .filter(role => role.id !== guild.id && !toRemove.has(role.id))
        .map(role => role.id);
    if (needsAdd) {
        roleIds.push(desiredRole.id);
    }
    const updated = await member.roles.set(roleIds, "Supporter color sync");
    // discord.js returns a patched copy and leaves the cache stale until the gateway echo arrives,
    // which would make the removed role still look in use below.
    guild.members.cache.set(updated.id, updated);

    for (const role of toRemove.values()) {
        await deleteIfUnused(role);
    }
};

const sweep = async (guild) => {
    await guild.members.fetch();
    for (const member of guild.members.cache.values()) {
        if (member.user.bot) {
            continue;
        }
        try {
            await reconcileMember(member);
        } catch (error) {
            console.log(`Supporter colors: failed to sync ${member.user.tag}: ${error}`);
        }
    }
    for (const role of guild.roles.cache.filter(isCustomColorRole).values()) {
        await deleteIfUnused(role);
    }
};

const startSupporterColors = async (client) => {
    const guild = getGuild(client);
    if (!guild) {
        console.log("Supporter colors: guild not found, feature disabled.");
        return;
    }
    try {
        loadPreferences();
    } catch (error) {
        console.error(`Supporter colors: could not read ${STORE_PATH}, feature disabled so it isn't overwritten.`, error);
        return;
    }
    enabled = true;

    const runSweep = () => enqueue(() => sweep(guild)).catch(() => {});
    await runSweep();
    setInterval(runSweep, SWEEP_INTERVAL_MS);
    console.log("Supporter colors: sync running.");
};

const relevantRoleIds = member =>
    member.roles.cache
        .filter(role => isColorRole(role) || SUPPORTER_ROLE_NAMES.includes(role.name))
        .map(role => role.id)
        .sort()
        .join(",");

const handleMemberUpdate = (oldMember, newMember) => {
    if (!enabled || newMember.guild.id !== process.env.DISCORD_GUILD_ID || newMember.user.bot) {
        return;
    }
    // The bot's own role edits come back through here too. Reconciling is idempotent, so the
    // second pass finds nothing to do.
    if (!oldMember.partial && relevantRoleIds(oldMember) === relevantRoleIds(newMember)) {
        return;
    }
    enqueue(() => reconcileMember(newMember)).catch(() => {});
};

const handleMemberRemove = (member) => {
    if (!enabled || member.guild.id !== process.env.DISCORD_GUILD_ID) {
        return;
    }
    const roles = [...member.roles.cache.filter(isCustomColorRole).values()];
    enqueue(async () => {
        for (const role of roles) {
            await deleteIfUnused(role);
        }
    }).catch(() => {});
};

// ---------------------------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------------------------

const buildSupporterColorCommands = (guild) => {
    const presets = guild ? getSelectablePresets(guild) : [];
    const presetOption = {
        name: "color",
        description: "One of Discord's preset colors",
        type: ApplicationCommandOptionType.String,
        required: true,
        // Discord rejects an empty choices list, and caps it at 25.
        ...(presets.length > 0 && {choices: presets.slice(0, 25)}),
    };
    const hexOption = {
        name: "color",
        description: "Hex color code, e.g. #ff8800",
        type: ApplicationCommandOptionType.String,
        required: true,
    };
    const userOption = {
        name: "user",
        description: "The member whose color to manage",
        type: ApplicationCommandOptionType.User,
        required: true,
    };
    const subcommands = (withUser) => {
        const target = withUser ? [userOption] : [];
        return [
            {name: "set", description: "Use a custom hex color", type: ApplicationCommandOptionType.Subcommand, options: [...target, hexOption]},
            {name: "preset", description: "Use one of Discord's preset colors", type: ApplicationCommandOptionType.Subcommand, options: [...target, presetOption]},
            {name: "clear", description: "Forget the saved color", type: ApplicationCommandOptionType.Subcommand, options: target},
            {name: "view", description: "Show the saved color", type: ApplicationCommandOptionType.Subcommand, options: target},
        ];
    };

    return [
        {
            name: "mycolor",
            description: "Choose your name color while you're a supporter",
            options: subcommands(false),
        },
        {
            name: "supportercolor",
            description: "Manage a supporter's name color",
            default_member_permissions: String(PermissionFlagsBits.ManageRoles),
            options: subcommands(true),
        },
    ];
};

const describeColor = (guild, color) => {
    const preset = findPresetRole(guild, color);
    return preset ? `${presetNameOf(preset)} (${color})` : color;
};

const handleSupporterColorCommand = async (interaction) => {
    const {commandName} = interaction;
    if (commandName !== "mycolor" && commandName !== "supportercolor") {
        return;
    }
    if (!enabled) {
        interaction.reply({content: "Supporter colors aren't available right now.", flags: MessageFlags.Ephemeral}).catch(() => {});
        return;
    }

    try {
        // Creating and positioning a role can take longer than the 3s Discord allows for a reply.
        await interaction.deferReply({flags: MessageFlags.Ephemeral});

        const guild = interaction.guild;
        const isAdmin = commandName === "supportercolor";
        const user = isAdmin ? interaction.options.getUser("user") : interaction.user;
        // The target may have left the server; their preference can still be stored.
        const member = isAdmin ? interaction.options.getMember("user") : interaction.member;
        const who = isAdmin ? `${user}'s` : "Your";
        const subcommand = interaction.options.getSubcommand();
        const reply = content => interaction.editReply({content, allowedMentions: {parse: []}});

        if (subcommand === "view") {
            const pref = preferences.get(user.id);
            if (!pref) {
                await reply(`${who} color isn't set.`);
                return;
            }
            const status = member && isSupporter(member) ? "active" : "saved but not active (not currently supporting)";
            await reply(`${who} color is ${describeColor(guild, pref.color)}, ${status}.`);
            return;
        }

        if (subcommand === "clear") {
            const existed = clearPreference(user.id);
            if (member) {
                await enqueue(() => reconcileMember(member));
            }
            await reply(existed ? `${who} color has been cleared.` : `${who} color wasn't set.`);
            return;
        }

        let color;
        if (subcommand === "set") {
            color = normalizeHex(interaction.options.getString("color"));
            if (!color) {
                await reply("That isn't a valid hex color. Use something like `#ff8800`.");
                return;
            }
            // Discord treats color 0 as "no color", so pure black would not show.
            if (color === "#000000") {
                await reply("Pure black can't be used as a role color. Try `#010101`.");
                return;
            }
        } else {
            color = normalizeHex(interaction.options.getString("color"));
            if (!color || !findPresetRole(guild, color)) {
                await reply("That isn't one of the preset colors.");
                return;
            }
        }

        const problem = checkColor(guild, user.id, color);
        if (problem) {
            await reply(`Sorry, ${problem}. Please pick a different color.`);
            return;
        }

        setPreference(user.id, color, interaction.user.id);
        if (member) {
            await enqueue(() => reconcileMember(member));
        }

        let status;
        if (member && isSupporter(member)) {
            status = "It's been applied.";
        } else {
            status = `It'll apply while ${isAdmin ? "they're" : "you're"} supporting.`;
        }
        await reply(`${who} color is now ${describeColor(guild, color)}. ${status}`);
    } catch (error) {
        console.log(`Supporter colors: command failed: ${error}`);
        const content = "Something went wrong updating the color.";
        const send = interaction.deferred || interaction.replied
            ? interaction.editReply({content})
            : interaction.reply({content, flags: MessageFlags.Ephemeral});
        send.catch(() => {});
    }
};

module.exports = {
    startSupporterColors,
    handleMemberUpdate,
    handleMemberRemove,
    handleSupporterColorCommand,
    buildSupporterColorCommands,
    // Exposed for checking the blue lock from the command line.
    isTooCloseToBlue,
    deltaE2000,
    hexToLab,
};
