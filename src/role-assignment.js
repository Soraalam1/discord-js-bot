const handleUserRoleRequest = async (interaction) => {

    try {
        const role = interaction.guild.roles.cache.get(interaction.options.get('role').value);
        if (!role) {
            return;
        }
        await selfRole(role, interaction);
    } catch (error) {
        console.log(`"There was an error : ${error}"`);
    }

}
const selfRole = async (role, interaction) => {
    const hasRole = interaction.member.roles.cache.has(role.id);
    if (hasRole) {
        await interaction.member.roles.remove(role);
        interaction.reply(`You have removed the ${role.name} role.`)
    } else {
        await interaction.member.roles.add(role);
        interaction.reply(`You now have the ${role.name} role!`)
    }
}

module.exports = {handleUserRoleRequest}