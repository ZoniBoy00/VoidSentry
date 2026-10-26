/**
 * Interaction create event handler.
 * 
 * Routes slash command interactions to the appropriate command handlers.
 * Includes error handling for failed command executions.
 * 
 * @module events/interactionCreate
 */

const { Events, MessageFlags } = require('discord.js');

const logger = require('../utils/logger');
const { hasAdminPermission, isOwner } = require('../utils/permissions');
const { UNBAN_PREFIX, handleUnbanButton } = require('../utils/unbanButton');

module.exports = {
    /** Event name for Discord.js */
    name: Events.InteractionCreate,
    /** Execute on every interaction, not just once */
    once: false,

    /**
     * Handle interaction create event.
     * 
     * @param {import('discord.js').Client} client - Discord client instance
     * @param {import('discord.js').Interaction} interaction - Discord interaction
     */
    async execute(client, interaction) {
        // The unban button on ban log messages
        if (interaction.isButton() && interaction.customId.startsWith(UNBAN_PREFIX)) {
            return handleUnbanButton(interaction).catch(err => logger.error('Unban button failed', err));
        }

        // Only handle chat input commands (slash commands)
        if (!interaction.isChatInputCommand()) return;

        // Get command from collection
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        // Commands flagged ownerOnly are for the bot owner (OWNER_ID) only.
        if (command.ownerOnly && !isOwner(interaction.user)) {
            return interaction.reply({
                content: '❌ This command is only available to the bot owner.',
                flags: [MessageFlags.Ephemeral],
            }).catch(() => {});
        }

        // Commands flagged adminOnly are server-only and need owner/administrator rights.
        if (command.adminOnly && (!interaction.inGuild() || !hasAdminPermission(interaction.member))) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral],
            }).catch(() => {});
        }

        logger.command(`/${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id})`);

        try {
            await command.execute(interaction);
        } catch (err) {
            logger.error(`Command /${interaction.commandName} failed`, err);

            // Handle error response based on interaction state
            const reply = { content: '❌ An error occurred while executing this command.' };

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(reply).catch(err => logger.warn(`Could not send error reply: ${err.message}`));
            } else {
                await interaction.reply({ ...reply, flags: [MessageFlags.Ephemeral] }).catch(err => logger.warn(`Could not send error reply: ${err.message}`));
            }
        }
    },
};