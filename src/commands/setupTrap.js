const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require('discord.js');

const CONFIG = require('../config');
const { createWarningEmbed } = require('../embeds/warningEmbed');
const { createLogoAttachment } = require('../utils/helpers');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-trap')
        .setDescription('Initializes the trap: Clears channel and posts warning.'),

    async execute(interaction) {
        // Permission check: OWNER_ID or Administrator
        const isOwner = interaction.user.id === CONFIG.OWNER_ID;
        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

        logger.command(`setup-trap | User: ${interaction.user.tag} (${interaction.user.id}) | isOwner: ${isOwner} | isAdmin: ${isAdmin}`);

        if (!isOwner && !isAdmin) {
            return await interaction.reply({
                content: '❌ You do not have permission to use this command. Only the authorized owner or administrators can use this.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const channel = interaction.channel;

        // Check if the current channel is in the monitored list
        if (!CONFIG.BAN_CHANNEL_IDS.includes(channel.id)) {
            logger.warn(`setup-trap used in non-monitored channel #${channel.name} (${channel.id})`);
            return await interaction.editReply({
                content: '⚠️ This channel is not in the `BAN_CHANNEL_IDS` list in `.env`. Setup will proceed, but I won\'t auto-ban here until added.',
            });
        }

        // Clear existing messages
        const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        if (fetched && fetched.size > 0) {
            await channel.bulkDelete(fetched, true).catch(() => null);
            logger.info(`Cleared ${fetched.size} messages from #${channel.name}`);
        }

        // Post warning embed
        await channel.send({
            embeds: [createWarningEmbed()],
            files: [createLogoAttachment()],
        });

        logger.info(`Trap channel #${channel.name} initialized successfully.`);

        await interaction.editReply({
            content: '✅ Trap channel has been initialized with VoidSentry branding.',
        });
    },
};
