/**
 * Slash command to manage per-server trap settings.
 *
 * Lets server administrators list and remove trap channels and override the
 * log channel, ban reason and message purge duration for their own server.
 *
 * @module commands/trapSettings
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChannelType } = require('discord.js');

const { COLORS, LOGO_URL, BRAND_NAME } = require('../utils/constants');
const { createLogoAttachment } = require('../utils/helpers');
const { recordAudit } = require('../utils/audit');
const guildSettings = require('../utils/guildSettings');
const logger = require('../utils/logger');

const textChannelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

module.exports = {
    /** Enforced by the interaction router: server-only, owner or administrator */
    adminOnly: true,

    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('trap-settings')
        .setDescription('View or change VoidSentry settings for this server.')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('view').setDescription('Show this server trap channels and settings')
        )
        .addSubcommand(sub =>
            sub.setName('remove-trap')
                .setDescription('Stop treating a channel as a trap')
                .addChannelOption(opt => opt.setName('channel').setDescription('Trap channel to remove (default: this channel)').addChannelTypes(...textChannelTypes))
        )
        .addSubcommand(sub =>
            sub.setName('log-channel')
                .setDescription('Set the ban log channel (omit to reset to the default)')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel for ban logs').addChannelTypes(...textChannelTypes))
        )
        .addSubcommand(sub =>
            sub.setName('reason')
                .setDescription('Set the ban reason (omit to reset to the default)')
                .addStringOption(opt => opt.setName('text').setDescription('Reason shown in the audit log').setMaxLength(500))
        )
        .addSubcommand(sub =>
            sub.setName('purge')
                .setDescription('Set how many seconds of messages to delete on ban (omit to reset to the default)')
                .addIntegerOption(opt => opt.setName('seconds').setDescription('0 - 604800').setMinValue(0).setMaxValue(604800))
        )
        .addSubcommand(sub =>
            sub.setName('dry-run')
                .setDescription('Report violations without banning (for testing)')
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Turn dry-run mode on or off').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('exempt-add')
                .setDescription('Never ban members with this role (their trap message is just deleted)')
                .addRoleOption(opt => opt.setName('role').setDescription('Role to exempt').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('exempt-remove')
                .setDescription('Remove a role exemption')
                .addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true))
        ),

    /**
     * Execute the trap-settings command.
     *
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'view') return await this.view(interaction);

            let message;
            // Same wording as the dashboard's audit entries (dashboardSettings.js).
            let detail;
            if (subcommand === 'remove-trap') {
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                if (!guildSettings.listTrapChannels(guildId).includes(channel.id)) {
                    return interaction.reply({ content: `ℹ️ <#${channel.id}> is not a trap channel set with \`/setup-trap\`.`, flags: [MessageFlags.Ephemeral] });
                }
                await guildSettings.removeTrapChannel(channel.id);
                message = `✅ <#${channel.id}> is no longer a trap channel.`;
                detail = `trap channel removed: #${channel.name} (${channel.id})`;
            } else if (subcommand === 'log-channel') {
                const channel = interaction.options.getChannel('channel');
                await guildSettings.setLogChannel(guildId, channel?.id ?? null);
                message = channel ? `✅ Ban logs will be sent to <#${channel.id}>.` : '✅ Log channel reset to the default.';
                detail = channel ? `log channel set to #${channel.name} (${channel.id})` : 'log channel reset to the default';
            } else if (subcommand === 'reason') {
                const text = interaction.options.getString('text')?.trim() || null;
                await guildSettings.setBanReason(guildId, text);
                message = text ? '✅ Ban reason updated.' : '✅ Ban reason reset to the default.';
                detail = text ? 'ban reason changed' : 'ban reason reset to the default';
            } else if (subcommand === 'dry-run') {
                const enabled = interaction.options.getBoolean('enabled');
                await guildSettings.setDryRun(guildId, enabled);
                message = enabled ? '🧪 Dry-run enabled: violations are reported but nobody is banned.' : '✅ Dry-run disabled: violations now result in bans.';
                detail = `dry-run ${enabled ? 'turned on' : 'turned off'}`;
            } else if (subcommand === 'exempt-add') {
                const role = interaction.options.getRole('role');
                await guildSettings.addExemptRole(guildId, role.id);
                message = `✅ Members with <@&${role.id}> will no longer be banned for writing in a trap channel.`;
                detail = `exempt role added: ${role.name} (${role.id})`;
            } else if (subcommand === 'exempt-remove') {
                const role = interaction.options.getRole('role');
                await guildSettings.removeExemptRole(guildId, role.id);
                message = `✅ <@&${role.id}> is no longer exempt.`;
                detail = `exempt role removed: ${role.name} (${role.id})`;
            } else if (subcommand === 'purge') {
                const seconds = interaction.options.getInteger('seconds');
                await guildSettings.setDeleteMessageSeconds(guildId, seconds);
                message = seconds === null ? '✅ Message purge reset to the default.' : `✅ Messages from the last ${seconds}s will be deleted on ban.`;
                detail = seconds === null ? 'message deletion reset to the default' : `message deletion on ban set to ${seconds} seconds`;
            }

            if (detail) recordAudit(guildId, interaction.user.id, `${detail} (with /trap-settings)`);
            await interaction.reply({ content: message, flags: [MessageFlags.Ephemeral], allowedMentions: { parse: [] } });
        } catch (error) {
            logger.error(`/trap-settings ${subcommand} failed in guild ${guildId}.`, error);
            const payload = { content: '❌ Failed to save the setting. Please try again.', flags: [MessageFlags.Ephemeral] };
            if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
            else await interaction.reply(payload);
        }
    },

    /**
     * Show the server effective configuration.
     *
     * @param {import('discord.js').CommandInteraction} interaction
     */
    async view(interaction) {
        const guildId = interaction.guild.id;
        const config = guildSettings.getGuildConfig(guildId);
        const traps = guildSettings.listTrapChannels(guildId);

        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle('⚙️ Server Settings')
            .setAuthor({ name: BRAND_NAME, iconURL: LOGO_URL })
            .addFields(
                { name: '🪤 Trap Channels', value: traps.length ? traps.map(id => `<#${id}>`).join('\n') : 'None — use `/setup-trap` in a channel', inline: false },
                { name: '📝 Log Channel', value: config.logChannelId ? `<#${config.logChannelId}>` : 'Not set', inline: true },
                { name: '🧹 Message Purge', value: `\`${config.deleteMessageSeconds}s\``, inline: true },
                { name: '🧪 Dry-run', value: config.dryRun ? 'On — nobody is banned' : 'Off', inline: true },
                { name: '🛡️ Exempt Roles', value: config.exemptRoleIds.length ? config.exemptRoleIds.map(id => `<@&${id}>`).join(', ') : 'None (administrators are always exempt)', inline: false },
                { name: '📄 Ban Reason', value: config.banReason.slice(0, 500), inline: false },
            );

        await interaction.reply({ embeds: [embed], files: [createLogoAttachment()], flags: [MessageFlags.Ephemeral] });
    },
};
