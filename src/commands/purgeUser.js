/**
 * Slash command to erase everything stored about one user.
 *
 * Bot owner only. Deletes the user's ban records on every server, so a
 * data-deletion request (GDPR) can be answered immediately. It does not lift
 * any ban on Discord itself; use /unban for that.
 *
 * @module commands/purgeUser
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const db = require('../utils/db');
const stats = require('../utils/stats');
const logger = require('../utils/logger');

/** Regex to validate Discord snowflake IDs (17-19 digits) */
const DISCORD_ID_REGEX = /^\d{17,19}$/;

module.exports = {
    /** Enforced by the interaction router: only the bot owner (OWNER_ID) */
    ownerOnly: true,

    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('purge-user')
        .setDescription('Bot owner only: delete all stored ban records of a user (data deletion request).')
        .addStringOption(opt => opt.setName('user_id').setDescription('Discord User ID').setRequired(true)),

    /**
     * Execute the purge-user command.
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
            const deleted = await db.deleteBansByUser(userId);
            stats.forgetUser(userId);
            logger.info(`Data deletion: removed ${deleted} ban record(s) for user ${userId}.`);
            await interaction.editReply({
                content: deleted > 0
                    ? `✅ Deleted **${deleted}** ban record(s) for \`${userId}\`. Any active Discord bans are unchanged (use \`/unban\` on each server to lift them).`
                    : `ℹ️ No stored ban records found for \`${userId}\`.`,
            });
        } catch (error) {
            logger.error(`Failed to purge data for user ${userId}.`, error);
            await interaction.editReply({ content: '❌ Failed to delete the records. Please try again.' });
        }
    },
};
