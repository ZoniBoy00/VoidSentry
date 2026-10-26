/**
 * Slash command to choose this server's ban log channel.
 *
 * Any text channel works, whatever it is named. The bot checks that it can
 * post there and sends a confirmation message to the channel.
 *
 * @module commands/addLogChannel
 */

const { SlashCommandBuilder, MessageFlags, ChannelType, PermissionFlagsBits } = require('discord.js');

const guildSettings = require('../utils/guildSettings');
const logger = require('../utils/logger');

/** Permissions the bot needs in the log channel to post ban logs. */
const REQUIRED_PERMISSIONS = [
    [PermissionFlagsBits.ViewChannel, 'View Channel'],
    [PermissionFlagsBits.SendMessages, 'Send Messages'],
    [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
    [PermissionFlagsBits.AttachFiles, 'Attach Files'],
];

module.exports = {
    /** Enforced by the interaction router: server-only, owner or administrator */
    adminOnly: true,

    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('add-logchannel')
        .setDescription('Choose the channel where ban logs are posted for this server.')
        .setDMPermission(false)
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('Any text channel (default: this channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        ),

    /**
     * Execute the add-logchannel command.
     *
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        if (!channel?.isTextBased()) {
            return interaction.reply({ content: '❌ Please choose a text channel.', flags: [MessageFlags.Ephemeral] });
        }

        // Check the bot can actually post there before saving.
        const botMember = interaction.guild.members.me;
        const permissions = botMember ? channel.permissionsFor(botMember) : null;
        const missing = REQUIRED_PERMISSIONS
            .filter(([flag]) => !permissions?.has(flag))
            .map(([, name]) => name);
        if (missing.length > 0) {
            return interaction.reply({
                content: `❌ I cannot post in <#${channel.id}>. Missing permission(s): **${missing.join(', ')}**.`,
                flags: [MessageFlags.Ephemeral],
            });
        }

        try {
            await guildSettings.setLogChannel(interaction.guild.id, channel.id);
        } catch (error) {
            logger.error(`Failed to save log channel ${channel.id} for guild ${interaction.guild.id}.`, error);
            return interaction.reply({ content: '❌ Failed to save the log channel. Please try again.', flags: [MessageFlags.Ephemeral] });
        }

        await channel.send({
            content: '✅ VoidSentry will post ban logs in this channel.',
            allowedMentions: { parse: [] },
        }).catch(() => {});

        await interaction.reply({
            content: `✅ Ban logs will now be posted in <#${channel.id}>.`,
            flags: [MessageFlags.Ephemeral],
        });
    },
};
