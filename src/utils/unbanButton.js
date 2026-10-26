/**
 * "Unban" button on ban log messages.
 *
 * Lets a moderator undo a ban straight from the log channel. The same rules as
 * /unban apply: server only, and only administrators (or the bot owner) may use it.
 *
 * @module utils/unbanButton
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const logger = require('./logger');
const { hasAdminPermission } = require('./permissions');

/** Prefix of the button's custom ID; the user ID follows it. */
const UNBAN_PREFIX = 'unban:';
/** Regex to validate Discord snowflake IDs (17-19 digits) */
const DISCORD_ID_REGEX = /^\d{17,19}$/;

/**
 * Row with a single unban button for the given user.
 *
 * @param {string} userId - Banned user's ID
 * @returns {import('discord.js').ActionRowBuilder}
 */
function createUnbanRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${UNBAN_PREFIX}${userId}`)
            .setLabel('Unban')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Secondary),
    );
}

/** Row showing that the ban was lifted; the button can no longer be pressed. */
function createUnbannedRow(moderatorName) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('unbanned')
            .setLabel(`Unbanned by ${moderatorName}`.slice(0, 80))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
    );
}

/**
 * Handle a press of an unban button.
 *
 * @param {import('discord.js').ButtonInteraction} interaction - Button interaction
 * @returns {Promise<void>}
 */
async function handleUnbanButton(interaction) {
    const userId = interaction.customId.slice(UNBAN_PREFIX.length);
    const ephemeral = content => interaction.reply({ content, flags: [MessageFlags.Ephemeral] });

    if (!interaction.inGuild() || !hasAdminPermission(interaction.member)) {
        return ephemeral('❌ You do not have permission to unban users.');
    }
    if (!DISCORD_ID_REGEX.test(userId)) {
        return ephemeral('❌ This button is not valid.');
    }

    try {
        await interaction.guild.members.unban(userId, `Unbanned by ${interaction.user.tag} (${interaction.user.id}) via VoidSentry`);
        logger.info(`${interaction.user.tag} unbanned ${userId} in ${interaction.guild.name} from the log button.`);
    } catch (error) {
        // 10026 = Unknown Ban: someone already lifted it, so just show the final state.
        if (error?.code !== 10026) {
            logger.error(`Failed to unban ${userId} in guild ${interaction.guild.id} from the log button.`, error);
            return ephemeral('❌ Failed to unban. Check that I have the **Ban Members** permission.');
        }
    }

    await interaction.update({ components: [createUnbannedRow(interaction.user.username)] });
}

module.exports = { UNBAN_PREFIX, createUnbanRow, handleUnbanButton };
