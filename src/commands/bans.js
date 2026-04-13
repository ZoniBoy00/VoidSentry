/**
 * Slash command to view ban history.
 * 
 * Displays stored ban history from the MySQL database.
 * Supports searching by user ID or viewing recent bans.
 * 
 * @module commands/bans
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const CONFIG = require('../config');
const db = require('../utils/db');
const { COLORS, LOGO_URL, BRAND_LOGGING } = require('../utils/constants');
const { formatTimestamp } = require('../utils/helpers');
const { hasAdminPermission } = require('../utils/permissions');

const DISCORD_ID_REGEX = /^\d{17,19}$/;

module.exports = {
    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('bans')
        .setDescription('View ban history from the database.')
        .addSubcommand(sub =>
            sub.setName('recent')
                .setDescription('Show recent bans')
                .addIntegerOption(opt => opt.setName('limit').setDescription('Number of bans to show (max 20)').setMinValue(1).setMaxValue(20))
        )
        .addSubcommand(sub =>
            sub.setName('search')
                .setDescription('Search bans by user ID')
                .addStringOption(opt => opt.setName('user_id').setDescription('Discord User ID').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('stats')
                .setDescription('Show ban statistics')
        ),

    /**
     * Execute the bans command.
     * 
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        if (!hasAdminPermission(interaction.member)) {
            return interaction.reply({ content: '❌ No permission.', flags: [MessageFlags.Ephemeral] });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'recent') {
            await this.showRecentBans(interaction);
        } else if (subcommand === 'search') {
            await this.searchBans(interaction);
        } else if (subcommand === 'stats') {
            await this.showStats(interaction);
        }
    },

    /**
     * Show recent bans from the database.
     * 
     * @param {import('discord.js').CommandInteraction} interaction
     */
    async showRecentBans(interaction) {
        const limit = interaction.options.getInteger('limit') || 10;
        
        try {
            const bans = await db.getBans(limit);
            
            if (bans.length === 0) {
                return interaction.reply({ content: 'ℹ️ No bans in the database.', flags: [MessageFlags.Ephemeral] });
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.INFO)
                .setTitle('📋 Recent Bans')
                .setAuthor({ name: BRAND_LOGGING, iconURL: LOGO_URL });

            const fields = bans.map((ban, i) => ({
                name: `#${i + 1} — ${ban.user_tag}`,
                value: `**ID:** \`${ban.user_id}\`\n**Server:** ${ban.guild_name}\n**Channel:** #${ban.channel_name}\n**Time:** ${formatTimestamp(new Date(ban.created_at))}`,
                inline: false,
            }));

            embed.addFields(fields);
            embed.setFooter({ text: `${BRAND_LOGGING} • ${bans.length} bans shown`, iconURL: LOGO_URL });

            await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        } catch (err) {
            await interaction.reply({ content: '❌ Failed to fetch bans.', flags: [MessageFlags.Ephemeral] });
        }
    },

    /**
     * Search bans by user ID.
     * 
     * @param {import('discord.js').CommandInteraction} interaction
     */
    async searchBans(interaction) {
        const userId = interaction.options.getString('user_id');

        if (!DISCORD_ID_REGEX.test(userId)) {
            return interaction.reply({
                content: '❌ Invalid Discord ID format. Must be 17-19 digits.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        try {
            const bans = await db.findBansByUserId(userId);

            if (bans.length === 0) {
                return interaction.reply({
                    content: `ℹ️ No bans found for user \`${userId}\`.`,
                    flags: [MessageFlags.Ephemeral],
                });
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle(`🔍 Search Results for ${userId}`)
                .setAuthor({ name: BRAND_LOGGING, iconURL: LOGO_URL })
                .setDescription(`Found **${bans.length}** ban record(s)`);

            const recentBans = bans.slice(0, 10);
            const fields = recentBans.map((ban, i) => ({
                name: `#${i + 1} — ${ban.guild_name}`,
                value: `**Time:** ${formatTimestamp(new Date(ban.created_at))}\n**Channel:** #${ban.channel_name}\n**Reason:** ${ban.reason}`,
                inline: true,
            }));

            embed.addFields(fields);

            if (bans.length > 10) {
                embed.setFooter({ text: `${BRAND_LOGGING} • Showing 10 of ${bans.length} records`, iconURL: LOGO_URL });
            } else {
                embed.setFooter({ text: BRAND_LOGGING, iconURL: LOGO_URL });
            }

            await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        } catch (err) {
            await interaction.reply({ content: '❌ Failed to search bans.', flags: [MessageFlags.Ephemeral] });
        }
    },

    /**
     * Show ban statistics.
     * 
     * @param {import('discord.js').CommandInteraction} interaction
     */
    async showStats(interaction) {
        try {
            const totalBans = await db.getBanCount();
            const uniqueUsers = await db.getUniqueUserCount();
            const guildStats = await db.getGuildStats();

            const embed = new EmbedBuilder()
                .setColor(COLORS.INFO)
                .setTitle('📊 Ban Database Statistics')
                .setAuthor({ name: BRAND_LOGGING, iconURL: LOGO_URL })
                .addFields(
                    { name: '📈 Total Bans', value: `\`${totalBans}\``, inline: true },
                    { name: '👤 Unique Users', value: `\`${uniqueUsers}\``, inline: true },
                    { name: '🗄️ Database', value: 'MySQL', inline: true },
                );

            if (guildStats.length > 0) {
                embed.addFields({
                    name: '🏠 Top Servers',
                    value: guildStats.map(g => `**${g.guild_name}:** ${g.count}`).join('\n'),
                    inline: false,
                });
            }

            embed.setFooter({ text: BRAND_LOGGING, iconURL: LOGO_URL });

            await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        } catch (err) {
            await interaction.reply({ content: '❌ Failed to fetch statistics.', flags: [MessageFlags.Ephemeral] });
        }
    },
};