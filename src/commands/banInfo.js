const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');

const CONFIG = require('../config');
const { COLORS, LOGO_URL, BRAND_LOGGING } = require('../utils/constants');
const { createLogoAttachment, formatTimestamp } = require('../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban-info')
        .setDescription('Look up ban information for a user by ID.')
        .addStringOption(option =>
            option
                .setName('user_id')
                .setDescription('The Discord User ID to look up')
                .setRequired(true)
        ),

    async execute(interaction) {
        // Permission check
        const isOwner = interaction.user.id === CONFIG.OWNER_ID;
        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

        if (!isOwner && !isAdmin) {
            return await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const userId = interaction.options.getString('user_id');
        const guild = interaction.guild;

        try {
            // Check if user is banned
            const banInfo = await guild.bans.fetch(userId).catch(() => null);

            if (!banInfo) {
                return await interaction.editReply({
                    content: `ℹ️ User \`${userId}\` is **not banned** on this server.`,
                });
            }

            const user = banInfo.user;

            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle('🔍 Ban Information')
                .setAuthor({ name: BRAND_LOGGING, iconURL: LOGO_URL })
                .setThumbnail(user.displayAvatarURL({ size: 256, dynamic: true }))
                .addFields(
                    {
                        name: '👤 User',
                        value: [
                            `**Tag:** ${user.tag}`,
                            `**ID:** \`${user.id}\``,
                        ].join('\n'),
                        inline: true,
                    },
                    {
                        name: '📅 Account Created',
                        value: formatTimestamp(user.createdAt),
                        inline: true,
                    },
                    {
                        name: '📋 Ban Reason',
                        value: banInfo.reason || 'No reason provided',
                        inline: false,
                    },
                )
                .setTimestamp()
                .setFooter({ text: BRAND_LOGGING, iconURL: LOGO_URL });

            await interaction.editReply({
                embeds: [embed],
                files: [createLogoAttachment()],
            });

        } catch (error) {
            console.error('[ERROR] ban-info command failed:', error);
            await interaction.editReply({
                content: '❌ Failed to fetch ban information. Make sure the ID is valid.',
            });
        }
    },
};
