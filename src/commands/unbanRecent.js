/**
 * Slash command to undo a burst of bans, for example after a trap channel was
 * set up in the wrong place and real members wrote in it.
 *
 * Lists the people VoidSentry banned on this server in the chosen window, asks
 * for confirmation with a button, then lifts the bans one at a time and writes
 * a single entry to the change log. Only bans VoidSentry recorded are touched.
 *
 * @module commands/unbanRecent
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, SlashCommandBuilder } = require('discord.js');

const { recordAudit } = require('../utils/audit');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { liftBan } = require('../utils/unban');

/** Most people one run unbans; more than that needs several runs, on purpose. */
const MAX_USERS = 25;
/** How long the confirmation button works. */
const CONFIRM_MS = 60_000;
const WINDOWS = [
    { name: 'Last hour', value: 1 },
    { name: 'Last 6 hours', value: 6 },
    { name: 'Last 24 hours', value: 24 },
    { name: 'Last 3 days', value: 72 },
];

/** "1 hour", "6 hours", "3 days". */
function windowText(hours) {
    if (hours % 24 === 0 && hours > 24) return `${hours / 24} days`;
    return hours === 1 ? '1 hour' : `${hours} hours`;
}

module.exports = {
    /** Enforced by the interaction router: server-only, owner or administrator */
    adminOnly: true,

    data: new SlashCommandBuilder()
        .setName('unban-recent')
        .setDescription('Lift the bans VoidSentry made on this server in a recent time window.')
        .setDMPermission(false)
        .addIntegerOption(opt => opt
            .setName('window')
            .setDescription('How far back to look')
            .setRequired(true)
            .addChoices(...WINDOWS)),

    MAX_USERS,

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction
     */
    async execute(interaction) {
        const hours = interaction.options.getInteger('window');
        if (!WINDOWS.some(window => window.value === hours)) {
            return interaction.reply({ content: '❌ Choose one of the offered time windows.', flags: [MessageFlags.Ephemeral] });
        }
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        let users;
        try {
            // One more than the cap, to tell whether there are more.
            users = await db.getRecentBannedUsers(interaction.guild.id, hours, MAX_USERS + 1);
        } catch (error) {
            logger.error('Could not read recent bans for /unban-recent.', error);
            return interaction.editReply({ content: '❌ Could not read the ban history. Try again in a minute.' });
        }
        if (users.length === 0) {
            return interaction.editReply({ content: `ℹ️ VoidSentry has not banned anyone here in the last ${windowText(hours)}.` });
        }
        const more = users.length > MAX_USERS;
        users = users.slice(0, MAX_USERS);

        const list = users.map(user => `• ${user.user_tag} (\`${user.user_id}\`)`).join('\n');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('unban-recent:confirm').setLabel(`Unban ${users.length}`).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('unban-recent:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        const prompt = await interaction.editReply({
            content: [
                `**Lift ${users.length} ${users.length === 1 ? 'ban' : 'bans'}** VoidSentry made in the last ${windowText(hours)}?`,
                list.slice(0, 1500),
                more ? `\nOnly the newest ${MAX_USERS} are listed. Run the command again afterwards for the rest.` : '',
            ].join('\n'),
            components: [row],
            allowedMentions: { parse: [] },
        });

        let click;
        try {
            click = await prompt.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: button => button.user.id === interaction.user.id,
                time: CONFIRM_MS,
            });
        } catch {
            return interaction.editReply({ content: '⌛ Nothing was changed: the confirmation timed out.', components: [] });
        }
        if (click.customId !== 'unban-recent:confirm') {
            return click.update({ content: 'Nothing was changed.', components: [] });
        }
        await click.update({ content: `⏳ Lifting ${users.length} ${users.length === 1 ? 'ban' : 'bans'}…`, components: [] });

        // One at a time: a burst of parallel unbans only runs into Discord's rate limit.
        let unbanned = 0;
        let notBanned = 0;
        let failed = 0;
        for (const user of users) {
            try {
                const result = await liftBan(interaction.guild, user.user_id, {
                    actorId: interaction.user.id,
                    reason: `Unbanned with /unban-recent by ${interaction.user.tag} (${interaction.user.id}) via VoidSentry`,
                    detail: null,
                });
                if (result === 'unbanned') unbanned += 1;
                else notBanned += 1;
            } catch (error) {
                failed += 1;
                logger.warn(`/unban-recent could not unban ${user.user_id} in ${interaction.guild.id}: ${error?.message || error}`);
            }
        }

        if (unbanned > 0) {
            await recordAudit(interaction.guild.id, interaction.user.id,
                `${unbanned} ${unbanned === 1 ? 'user' : 'users'} unbanned (VoidSentry bans from the last ${windowText(hours)}, with /unban-recent)`);
        }
        logger.info(`${interaction.user.tag} lifted ${unbanned} recent bans in ${interaction.guild.name} (${notBanned} already lifted, ${failed} failed).`);

        const lines = [`✅ Lifted ${unbanned} ${unbanned === 1 ? 'ban' : 'bans'}.`];
        if (notBanned) lines.push(`ℹ️ ${notBanned} ${notBanned === 1 ? 'was' : 'were'} already unbanned.`);
        if (failed) lines.push(`❌ ${failed} could not be lifted. Check that I have the **Ban Members** permission.`);
        await interaction.editReply({ content: lines.join('\n') });
    },
};
