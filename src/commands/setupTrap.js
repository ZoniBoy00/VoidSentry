/**
 * Slash command to initialize a trap channel.
 *
 * Registers the current channel as a trap for this server, clears it of
 * existing messages and posts a warning embed to notify users that sending
 * messages will result in an instant ban.
 *
 * @module commands/setupTrap
 */

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const { createWarningEmbed } = require('../embeds/warningEmbed');
const { recordAudit } = require('../utils/audit');
const { createLogoAttachment } = require('../utils/helpers');
const guildSettings = require('../utils/guildSettings');
const logger = require('../utils/logger');

/** Minimum time between /setup-trap runs per channel (it clears the channel). */
const COOLDOWN_MS = 30000;
const lastRun = new Map();

module.exports = {
    /** Enforced by the interaction router: server-only, owner or administrator */
    adminOnly: true,

    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('setup-trap')
        .setDescription('Registers this channel as a trap: Clears channel and posts warning.')
        .setDMPermission(false),

    /**
     * Execute the setup-trap command.
     *
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        const wait = COOLDOWN_MS - (Date.now() - (lastRun.get(interaction.channelId) || 0));
        if (wait > 0) {
            return interaction.reply({
                content: `⏳ This channel was just set up. Try again in ${Math.ceil(wait / 1000)}s.`,
                flags: [MessageFlags.Ephemeral],
            });
        }
        lastRun.set(interaction.channelId, Date.now());

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const channel = interaction.channel;
        if (!channel?.isTextBased() || typeof channel.bulkDelete !== 'function') {
            return interaction.editReply({ content: '❌ This command can only be used in a text channel.' });
        }

        // Register the channel for this server
        try {
            await guildSettings.addTrapChannel(interaction.guild.id, channel.id);
        } catch (error) {
            logger.error(`Failed to register trap channel #${channel.name} (${channel.id}).`, error);
            return interaction.editReply({ content: '❌ Failed to save the trap channel. Please try again.' });
        }
        recordAudit(interaction.guild.id, interaction.user.id, `trap channel added: #${channel.name} (${channel.id}) (with /setup-trap)`);

        // Clear up to 50 recent messages; Discord does not bulk-delete messages older than 14 days.
        const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        if (fetched?.size > 0) {
            await channel.bulkDelete(fetched, true).catch(() => {});
            logger.info(`Cleared ${fetched.size} messages from #${channel.name}`);
        }

        // Send warning embed
        await channel.send({
            embeds: [createWarningEmbed()],
            files: [createLogoAttachment()],
        });

        logger.info(`Trap channel #${channel.name} (${channel.id}) initialized in ${interaction.guild.name}.`);

        const canBan = interaction.guild.members.me?.permissions?.has(PermissionFlagsBits.BanMembers);
        await interaction.editReply({
            content: canBan
                ? '✅ Trap channel has been initialized.'
                : '⚠️ Trap channel initialized, but I lack the **Ban Members** permission here, so I cannot ban anyone yet.',
        });
    },
};
