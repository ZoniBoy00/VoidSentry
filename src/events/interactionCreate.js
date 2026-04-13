/**
 * Interaction create event handler.
 * 
 * Routes slash command interactions to the appropriate command handlers.
 * Includes error handling for failed command executions.
 * 
 * @module events/interactionCreate
 */

const { Events } = require('discord.js');

const logger = require('../utils/logger');

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
        // Only handle chat input commands (slash commands)
        if (!interaction.isChatInputCommand()) return;

        // Get command from collection
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        logger.command(`/${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id})`);

        try {
            await command.execute(interaction);
        } catch (err) {
            logger.error(`Command /${interaction.commandName} failed`, err);

            // Handle error response based on interaction state
            const reply = { content: '❌ An error occurred while executing this command.' };

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(reply).catch(() => {});
            } else {
                await interaction.reply({ ...reply, ephemeral: true }).catch(() => {});
            }
        }
    },
};