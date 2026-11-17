/**
 * Slash command to initialize a trap channel.
 *
 * Registers the current channel as a trap for this server, clears it of
 * existing messages and posts a warning embed to notify users that sending
 * messages will result in an instant ban. With the `create` option it makes a
 * new channel for the trap instead (needs the Manage Channels permission,
 * which the default invite does not include).
 *
 * @module commands/setupTrap
 */

const { ChannelType, SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const { createWarningEmbed } = require('../embeds/warningEmbed');
const { recordAudit } = require('../utils/audit');
const { canPostWarning } = require('../utils/dashboardSettings');
const { createLogoAttachment } = require('../utils/helpers');
const guildSettings = require('../utils/guildSettings');
const logger = require('../utils/logger');

/** Channels that can be traps; the same list as the dashboard and /trap-settings. */
const TRAP_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

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
        .addStringOption(option => option
            .setName('create')
            .setDescription('Create a new channel with this name for the trap, instead of using this channel')
            .setMinLength(1)
            .setMaxLength(100))
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

        const newName = interaction.options?.getString?.('create')?.trim();
        let channel = interaction.channel;
        if (newName) {
            const me = interaction.guild.members.me;
            if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.editReply({
                    content: '❌ I need the **Manage Channels** permission to create a channel. Create it yourself and run `/setup-trap` there, or give me the permission.',
                });
            }
            try {
                // Members must be able to see and write in a trap, even where they cannot by default.
                channel = await interaction.guild.channels.create({
                    name: newName,
                    type: ChannelType.GuildText,
                    reason: `Trap channel created with /setup-trap by ${interaction.user.tag}`,
                    permissionOverwrites: [{
                        id: interaction.guild.roles.everyone.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    }],
                });
            } catch (error) {
                logger.warn(`Could not create a trap channel in ${interaction.guild.id}: ${error?.message || error}`);
                return interaction.editReply({ content: '❌ The channel could not be created. Check my permissions and try again.' });
            }
        } else if (!TRAP_CHANNEL_TYPES.includes(channel?.type)) {
            // Threads, forum posts and voice channel chats are text-based too, but cannot be traps.
            return interaction.editReply({ content: '❌ Run this in a text or announcement channel, or use the `create` option.' });
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
        const fetched = newName ? null : await channel.messages.fetch({ limit: 50 }).catch(() => null);
        if (fetched?.size > 0) {
            await channel.bulkDelete(fetched, true).catch(() => {});
            logger.info(`Cleared ${fetched.size} messages from #${channel.name}`);
        }

        // The warning is a courtesy: the trap is active even when it cannot be posted.
        let warned = false;
        if (canPostWarning(channel, interaction.guild.members.me)) {
            warned = await channel.send({
                embeds: [createWarningEmbed(guildSettings.getGuildConfig(interaction.guild.id))],
                files: [createLogoAttachment()],
            }).then(() => true, error => {
                logger.warn(`Could not post the trap warning in ${channel.id}: ${error?.message || error}`);
                return false;
            });
        }

        logger.info(`Trap channel #${channel.name} (${channel.id}) initialized in ${interaction.guild.name}.`);

        const canBan = interaction.guild.members.me?.permissions?.has(PermissionFlagsBits.BanMembers);
        const lines = [newName ? `✅ Created <#${channel.id}> and made it a trap channel.` : '✅ Trap channel has been initialized.'];
        if (!warned) lines.push('⚠️ I could not post the warning message: I need **Embed Links** and **Attach Files** in that channel. Repost it from the dashboard once I have them.');
        if (!canBan) lines.push('⚠️ I lack the **Ban Members** permission, so I cannot ban anyone yet.');
        await interaction.editReply({ content: lines.join('\n') });
    },
};
