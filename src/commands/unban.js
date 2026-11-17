/**
 * Slash command to unban a user.
 *
 * Removes the Discord ban on this server. The stored ban history is kept
 * as an audit trail.
 *
 * @module commands/unban
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const logger = require('../utils/logger');
const { liftBan } = require('../utils/unban');

/** Regex to validate Discord snowflake IDs (17-19 digits) */
const DISCORD_ID_REGEX = /^\d{17,19}$/;

module.exports = {
    /** Enforced by the interaction router: server-only, owner or administrator */
    adminOnly: true,

    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user from this server by ID.')
        .setDMPermission(false)
        .addStringOption(opt => opt.setName('user_id').setDescription('Discord User ID').setRequired(true)),

    /**
     * Execute the unban command.
     *
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        const userId = interaction.options.getString('user_id').trim();
        if (!DISCORD_ID_REGEX.test(userId)) {
            return interaction.reply({
                content: '❌ Invalid Discord ID format. Must be 17-19 digits.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            const result = await liftBan(interaction.guild, userId, {
                actorId: interaction.user.id,
                reason: `Unbanned by ${interaction.user.tag} (${interaction.user.id}) via VoidSentry`,
                detail: `user ${userId} unbanned (with /unban)`,
            });
            if (result === 'not-banned') {
                return interaction.editReply({ content: `ℹ️ User \`${userId}\` is not banned on this server.` });
            }
            logger.info(`${interaction.user.tag} unbanned ${userId} in ${interaction.guild.name}.`);
            await interaction.editReply({ content: `✅ User \`${userId}\` has been unbanned.` });
        } catch (error) {
            logger.error(`Failed to unban ${userId} in guild ${interaction.guild.id}.`, error);
            await interaction.editReply({ content: '❌ Failed to unban. Check that I have the **Ban Members** permission.' });
        }
    },
};
