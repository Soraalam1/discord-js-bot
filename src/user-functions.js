

const handleUserFunction = async (interaction) => { 

    try {
        console.log('Our values');
        console.log(interaction);
        const roleName = await interaction.options.get('role').name;
        console.log(roleName);
        const roleId = await interaction.options.get('role').value;
        console.log(roleId);
        const member = interaction.member;
        console.log(member);        
        selfRole(roleId,roleName,member,interaction);
    } catch (error) {
        console.log(`"There was an error : ${error}"`);
    }

}
const selfRole = (roleId, roleName, member,interaction) => {
    const hasRole = checkRole(roleId,member);
    //interaction.guild.members.cache.get(roleId)
    if(hasRole){ 
        member.roles.add(roleId);
        interaction.reply(`You now have the ${roleName} role!`)
    }
    else{
         member.roles.remove(roleId);
         interaction.reply(`You have removed the ${roleName} role.`)
    }
}
const checkRole = (roleId, member) => {
    return !!member.roles.cache.get(roleId)
}    

module.exports = {handleUserFunction}