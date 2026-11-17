/**
 * Ban appeals.
 *
 * A person banned by VoidSentry signs in on the website and appeals to a server
 * that has appeals turned on (they are off by default). The server's moderators
 * get a post in the log channel with Approve and Deny buttons, the owner a
 * direct message (at most once a day), and the appeal is listed on the
 * dashboard. Approving lifts the ban through the same path as every other unban.
 *
 * Safeguards: one open appeal per server, a cooldown after a denial, a block
 * list per server, rate limits on the API, and only people who may manage the
 * server can decide. Decided appeals are deleted after DECIDED_RETENTION_DAYS.
 *
 * @module utils/appeals
 */

const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const { recordAudit } = require('./audit');
const { BRAND_LOGGING, COLORS } = require('./constants');
const db = require('./db');
const guildSettings = require('./guildSettings');
const { fetchChannel, formatTimestamp, sanitizeEmbedText } = require('./helpers');
const logger = require('./logger');
const { alertGuildOwner } = require('./ownerAlerts');
const { hasAdminPermission } = require('./permissions');
const { liftBan } = require('./unban');

const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 1000;
const MAX_REPLY_LENGTH = 500;
/** Decided appeals are deleted this many days after the decision; open ones are kept until decided. */
const DECIDED_RETENTION_DAYS = 90;
const DM_TIMEOUT_MS = 3000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Custom IDs: `appeal:approve:<id>`, `appeal:deny:<id>` on buttons, `appeal-deny:<id>` on the reply form. */
const BUTTON_PREFIX = 'appeal:';
const MODAL_PREFIX = 'appeal-deny:';

/** Serialise an appeal row for the API. */
function appealJson(row) {
    return {
        id: row.id,
        guildId: row.guild_id,
        userId: row.user_id,
        userTag: row.user_tag,
        text: row.text,
        status: row.status,
        reply: row.reply ?? null,
        decidedBy: row.decided_by ?? null,
        createdAt: new Date(row.created_at).toISOString(),
        decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    };
}

/**
 * Where a person stands on one server: whether they may appeal, and why not.
 *
 * @returns {Promise<{state: 'open'|'can-appeal'|'cooldown'|'blocked'|'disabled'|'unavailable'|'approved', availableAt?: string}>}
 */
async function standing(client, guildId, userId, latestBan, latestAppeal) {
    if (latestAppeal?.status === 'open') return { state: 'open' };
    // Approved after the newest ban: that ban was lifted. A newer ban can be appealed again.
    if (latestAppeal?.status === 'approved' && new Date(latestAppeal.decided_at) >= new Date(latestBan.created_at)) {
        return { state: 'approved' };
    }
    if (!client.guilds.cache.has(guildId)) return { state: 'unavailable' };
    const config = guildSettings.getGuildConfig(guildId);
    if (!config.appealsEnabled) return { state: 'disabled' };
    if (await db.isAppealBlocked(guildId, userId)) return { state: 'blocked' };
    if (latestAppeal?.status === 'denied') {
        const availableAt = new Date(latestAppeal.decided_at).getTime() + config.appealCooldownDays * DAY_MS;
        if (availableAt > Date.now()) return { state: 'cooldown', availableAt: new Date(availableAt).toISOString() };
    }
    return { state: 'can-appeal' };
}

/**
 * Every server where VoidSentry banned this person, with their appeal there.
 * Only ever about the person asking: nothing about other users is returned.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} userId - The signed-in person
 * @returns {Promise<Object[]>}
 */
async function listForAppellant(client, userId) {
    const [bans, appeals] = await Promise.all([db.findBansByUserId(userId), db.getAppealsByUser(userId)]);
    const latestBans = new Map();
    for (const ban of bans) if (!latestBans.has(ban.guild_id)) latestBans.set(ban.guild_id, ban);

    return Promise.all([...latestBans.values()].map(async ban => {
        const guild = client.guilds.cache.get(ban.guild_id);
        const latestAppeal = appeals.find(appeal => appeal.guild_id === ban.guild_id) ?? null;
        return {
            guildId: ban.guild_id,
            guildName: guild?.name ?? ban.guild_name,
            icon: guild?.iconURL?.({ size: 128, extension: 'png' }) ?? null,
            bannedAt: new Date(ban.created_at).toISOString(),
            channelName: ban.channel_name,
            ...(await standing(client, ban.guild_id, userId, ban, latestAppeal)),
            appeal: latestAppeal ? appealJson(latestAppeal) : null,
        };
    }));
}

/** Approve and Deny buttons for an appeal in the log channel. */
function createDecisionRow(appealId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}approve:${appealId}`).setLabel('Approve and unban').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}deny:${appealId}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    );
}

/** A disabled button that says how the appeal was decided. */
function createDecidedRow(status, moderatorName) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('appeal-decided')
            .setLabel(`${status === 'approved' ? 'Approved' : 'Denied'} by ${moderatorName}`.slice(0, 80))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
    );
}

/** The log channel post about a new appeal. */
function createAppealEmbed(appeal, ban) {
    return new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`📨 Ban appeal #${appeal.id}`)
        .setAuthor({ name: BRAND_LOGGING })
        .addFields(
            {
                name: '👤 User',
                value: [`**Tag:** ${sanitizeEmbedText(appeal.userTag, 100)}`, `**ID:** \`${appeal.userId}\``, `**Mention:** <@${appeal.userId}>`].join('\n'),
                inline: true,
            },
            {
                name: '🔨 Ban',
                value: ban ? `${formatTimestamp(new Date(ban.created_at))}\nin #${sanitizeEmbedText(ban.channel_name, 100)}` : 'No stored ban record.',
                inline: true,
            },
            { name: '💬 Appeal', value: `\`\`\`${sanitizeEmbedText(appeal.text, 1000)}\`\`\``, inline: false },
        )
        .setFooter({ text: 'Approve lifts the ban. The appeal and the decision are also on the dashboard.' })
        .setTimestamp(new Date(appeal.createdAt));
}

/** Tell moderators about a new appeal: the log channel and, at most once a day, the owner. Never throws. */
async function notifyModerators(guild, appeal, ban) {
    const { logChannelId } = guildSettings.getGuildConfig(guild.id);
    const channel = logChannelId ? await fetchChannel(guild, logChannelId) : null;
    if (channel) {
        await channel.send({ embeds: [createAppealEmbed(appeal, ban)], components: [createDecisionRow(appeal.id)], allowedMentions: { parse: [] } })
            .catch(error => logger.warn(`Could not post appeal #${appeal.id} to the log channel: ${error?.message || error}`));
    }
    await alertGuildOwner(guild, 'appeal');
}

/** Tell the appellant about the decision. Best-effort: they usually share no server with the bot any more. */
async function notifyAppellant(client, appeal, guildName, status, reply) {
    let timer;
    try {
        const text = status === 'approved'
            ? `✅ Your appeal to **${guildName}** was approved and the ban was lifted.`
            : `❌ Your appeal to **${guildName}** was denied.`;
        const message = reply ? `${text}\n\nReply from the moderators:\n> ${sanitizeEmbedText(reply, MAX_REPLY_LENGTH)}` : text;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DM timed out')), DM_TIMEOUT_MS); });
        const user = await Promise.race([client.users.fetch(appeal.user_id), timeout]);
        await Promise.race([user.send({ content: message, allowedMentions: { parse: [] } }), timeout]);
    } catch (error) {
        logger.debug(`Could not tell ${appeal.user_id} about appeal #${appeal.id}: ${error?.message || error}`);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * File an appeal for the signed-in person.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {{userId: string, userTag: string, guildId: string, text: unknown}} request
 * @returns {Promise<{ok: true, appeal: Object} | {ok: false, error: string}>}
 */
async function submitAppeal(client, { userId, userTag, guildId, text }) {
    if (typeof text !== 'string') return { ok: false, error: 'Write your appeal.' };
    const body = text.trim();
    if (body.length < MIN_TEXT_LENGTH) return { ok: false, error: `Write at least ${MIN_TEXT_LENGTH} characters.` };
    if (body.length > MAX_TEXT_LENGTH) return { ok: false, error: `An appeal can be at most ${MAX_TEXT_LENGTH} characters.` };

    const entry = (await listForAppellant(client, userId)).find(item => item.guildId === guildId);
    const refusals = {
        open: 'You already have an open appeal on this server.',
        approved: 'Your appeal on this server was already approved.',
        cooldown: 'Your last appeal was denied recently. Try again later.',
        blocked: 'This server does not accept appeals from you.',
        disabled: 'This server does not accept appeals.',
        unavailable: 'VoidSentry is no longer on this server.',
    };
    if (!entry) return { ok: false, error: 'VoidSentry has no ban of yours on this server.' };
    if (entry.state !== 'can-appeal') return { ok: false, error: refusals[entry.state] };

    const guild = client.guilds.cache.get(guildId);
    // The ban may have been lifted by hand already; then there is nothing to appeal.
    try {
        await guild.bans.fetch({ user: userId, force: true });
    } catch (error) {
        if (error?.code === 10026) return { ok: false, error: 'You are not banned on this server any more.' };
        // Anything else (for example a missing permission) is for the moderators to sort out; accept the appeal.
    }

    const id = await db.addAppeal({ guildId, userId, userTag, text: body });
    const row = await db.getAppeal(id);
    const appeal = appealJson(row);
    const [latestBan] = await db.findBansByUserId(userId, guildId);
    logger.info(`Appeal #${id} from ${userId} on ${guild.name} (${guildId}).`);
    await notifyModerators(guild, appeal, latestBan);
    return { ok: true, appeal };
}

/**
 * Approve or deny an open appeal. The caller has checked that the decider may manage the server.
 *
 * @param {import('discord.js').Guild} guild - Server the appeal belongs to
 * @param {{appealId: unknown, deciderId: string, decision: unknown, reply?: unknown, block?: unknown, via?: string}} request -
 *   `via` says where it was decided for the change log, for example "with the log button" (empty for the dashboard)
 * @returns {Promise<{ok: true, status: 'approved'|'denied'} | {ok: false, error: string}>}
 */
async function decideAppealFor(guild, { appealId, deciderId, decision, reply = null, block = false, via = '' }) {
    if (!Number.isInteger(appealId) || appealId < 1) return { ok: false, error: 'Unknown appeal.' };
    if (decision !== 'approve' && decision !== 'deny') return { ok: false, error: 'Choose approve or deny.' };
    if (reply !== null && typeof reply !== 'string') return { ok: false, error: 'The reply must be text.' };
    const replyText = reply?.trim() || null;
    if (replyText && replyText.length > MAX_REPLY_LENGTH) return { ok: false, error: `The reply can be at most ${MAX_REPLY_LENGTH} characters.` };

    const appeal = await db.getAppeal(appealId);
    if (!appeal || appeal.guild_id !== guild.id) return { ok: false, error: 'Unknown appeal.' };
    if (appeal.status !== 'open') return { ok: false, error: 'This appeal was already decided.' };

    const status = decision === 'approve' ? 'approved' : 'denied';
    const where = via ? `, ${via}` : '';
    // Claim the decision first, so two moderators pressing at once cannot both act.
    if (!await db.decideAppeal(appealId, { status, reply: replyText, decidedBy: deciderId })) {
        return { ok: false, error: 'This appeal was already decided.' };
    }

    if (status === 'approved') {
        try {
            const result = await liftBan(guild, appeal.user_id, {
                actorId: deciderId,
                reason: `Appeal #${appealId} approved by ${deciderId} via VoidSentry`,
                detail: `user ${appeal.user_id} unbanned (appeal #${appealId} approved${where})`,
            });
            if (result === 'not-banned') {
                await recordAudit(guild.id, deciderId, `appeal #${appealId} approved (user ${appeal.user_id} was already unbanned${where})`);
            }
        } catch (error) {
            await db.reopenAppeal(appealId);
            logger.error(`Could not unban ${appeal.user_id} for appeal #${appealId} in ${guild.id}.`, error);
            return { ok: false, error: 'Could not unban. Check that VoidSentry has the Ban Members permission. The appeal is still open.' };
        }
    } else {
        if (block === true) await db.addAppealBlock(guild.id, appeal.user_id, deciderId);
        await recordAudit(guild.id, deciderId, `appeal #${appealId} denied (user ${appeal.user_id}${block === true ? ', no further appeals' : ''}${where})`);
    }

    logger.info(`Appeal #${appealId} on ${guild.name} (${guild.id}) ${status} by ${deciderId}.`);
    await notifyAppellant(guild.client, appeal, guild.name, status, replyText);
    return { ok: true, status };
}

/**
 * Approve or Deny pressed in the log channel. Deny opens a short form for an optional reply.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleAppealButton(interaction) {
    const [, action, rawId] = interaction.customId.split(':');
    const appealId = Number.parseInt(rawId, 10);
    const ephemeral = content => interaction.reply({ content, flags: [MessageFlags.Ephemeral] });

    if (!interaction.inGuild() || !hasAdminPermission(interaction.member)) {
        return ephemeral('❌ You do not have permission to decide appeals.');
    }

    if (action === 'deny') {
        return interaction.showModal(
            new ModalBuilder()
                .setCustomId(`${MODAL_PREFIX}${appealId}`)
                .setTitle(`Deny appeal #${appealId}`)
                .addLabelComponents(new LabelBuilder()
                    .setLabel('Reply to the user (optional)')
                    .setTextInputComponent(new TextInputBuilder()
                        .setCustomId('reply')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setMaxLength(MAX_REPLY_LENGTH))),
        );
    }
    if (action !== 'approve') return ephemeral('❌ This button is not valid.');

    const result = await decideAppealFor(interaction.guild, {
        appealId, deciderId: interaction.user.id, decision: 'approve', via: 'with the log button',
    });
    if (!result.ok) return ephemeral(`❌ ${result.error}`);
    await interaction.update({ components: [createDecidedRow('approved', interaction.user.username)] });
}

/**
 * The Deny form was sent.
 *
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleAppealModal(interaction) {
    const appealId = Number.parseInt(interaction.customId.slice(MODAL_PREFIX.length), 10);
    if (!interaction.inGuild() || !hasAdminPermission(interaction.member)) {
        return interaction.reply({ content: '❌ You do not have permission to decide appeals.', flags: [MessageFlags.Ephemeral] });
    }
    const result = await decideAppealFor(interaction.guild, {
        appealId,
        deciderId: interaction.user.id,
        decision: 'deny',
        reply: interaction.fields.getTextInputValue('reply'),
        via: 'with the log button',
    });
    if (!result.ok) return interaction.reply({ content: `❌ ${result.error}`, flags: [MessageFlags.Ephemeral] });
    if (interaction.isFromMessage()) {
        await interaction.update({ components: [createDecidedRow('denied', interaction.user.username)] });
    } else {
        await interaction.reply({ content: '✅ Appeal denied.', flags: [MessageFlags.Ephemeral] });
    }
}

module.exports = {
    BUTTON_PREFIX,
    MODAL_PREFIX,
    DECIDED_RETENTION_DAYS,
    MAX_TEXT_LENGTH,
    MAX_REPLY_LENGTH,
    appealJson,
    listForAppellant,
    submitAppeal,
    decideAppealFor,
    createDecisionRow,
    handleAppealButton,
    handleAppealModal,
};
