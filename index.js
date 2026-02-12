require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    AttachmentBuilder,
    MessageFlags,
    Events,
    ActivityType,
    PresenceUpdateStatus
} = require('discord.js');

const path = require('path');

/**
 * --- Configuration ---
 * Loads settings from .env and cleans inputs for reliability.
 */
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    // Clean OWNER_ID: remove quotes/spaces and take only the first ID found
    OWNER_ID: process.env.OWNER_ID?.replace(/['"]/g, '').split(/\s+/)[0],
    // Support multiple trap channel IDs separated by commas
    BAN_CHANNEL_IDS: process.env.BAN_CHANNEL_IDS ? process.env.BAN_CHANNEL_IDS.split(',').map(id => id.trim()) : [],
    LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
    STATUS_TEXT: process.env.STATUS_TEXT || 'Watching for intruders...',
};

// Validate that required keys are present
const missingKeys = Object.entries(CONFIG).filter(([k, v]) => {
    if (k === 'OWNER_ID' || k === 'STATUS_TEXT') return false; // Optional keys
    if (Array.isArray(v)) return v.length === 0;
    return !v;
}).map(([k]) => k);

if (missingKeys.length > 0) {
    console.error(`[FATAL] Missing or empty environment variables: ${missingKeys.join(', ')}`);
    process.exit(1);
}

// Client initialization with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

// Assets setup (Branding)
const logoPath = path.join(__dirname, 'assets', 'logo.png');

/**
 * --- Embed Generators ---
 */

const createWarningEmbed = () => new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🚨 WARNING: BOT DETECTION CHANNEL 🚨')
    .setAuthor({ name: 'VoidSentry Security', iconURL: 'attachment://logo.png' })
    .setDescription(
        'This channel is monitored exclusively for bot detection.\n' +
        '**Do NOT type anything in this chat.**\n\n' +
        'If you send a message here, for any reason, you will be permanently banned.\n\n' +
        'There are no appeals. No second chances.\n\n' +
        'This is not a joke and not a test.\n' +
        '**You have been warned.**'
    )
    .setTimestamp();

const createBanLogEmbed = (user, reason, channelId) => new EmbedBuilder()
    .setColor(0x2C2F33)
    .setTitle('🔨 Security Action: User Banned')
    .setAuthor({ name: 'VoidSentry Logging', iconURL: 'attachment://logo.png' })
    .setThumbnail(user.displayAvatarURL())
    .addFields(
        { name: 'Target User', value: `${user.tag} (\`${user.id}\`)`, inline: false },
        { name: 'Violation Reason', value: reason, inline: false },
        { name: 'Detected In', value: `<#${channelId}>`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'VoidSentry Security System', iconURL: 'attachment://logo.png' });

/**
 * --- Slash Command Registration ---
 */

const commands = [
    new SlashCommandBuilder()
        .setName('setup-trap')
        .setDescription('Initializes the trap: Clears channel and posts warning.'),
].map(c => c.toJSON());

const deployCommands = async () => {
    const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
    try {
        console.log('[INFO] Deploying application commands...');
        await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: commands });
        console.log('[INFO] Application commands deployed successfully.');
    } catch (error) {
        console.error('[ERROR] Failed to deploy commands:', error);
    }
};

/**
 * --- Core Event Handlers ---
 */

client.once(Events.ClientReady, async () => {
    console.log(`[SYSTEM] Logged in as ${client.user.tag}`);

    // Set custom status and Presence to DND (Do Not Disturb) for a professional look
    client.user.setPresence({
        activities: [{ name: CONFIG.STATUS_TEXT, type: ActivityType.Watching }],
        status: 'dnd',
    });

    // Fallback status set
    client.user.setStatus('dnd');

    await deployCommands();
    console.log(`[SYSTEM] Monitoring ${CONFIG.BAN_CHANNEL_IDS.length} trap channels.`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup-trap') {
        try {
            // Permission check: OWNER_ID (bypasses admin) OR Administrator permission
            const isOwner = interaction.user.id === CONFIG.OWNER_ID;
            const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

            // Log auth attempt for transparency
            console.log(`[AUTH] Command: setup-trap | User: ${interaction.user.tag} | isOwner: ${isOwner} | isAdmin: ${isAdmin}`);

            if (!isOwner && !isAdmin) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use this command. Only the authorized owner or administrators can use this.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const channel = interaction.channel;

            // Optional notice if channel is not in the monitored list
            if (!CONFIG.BAN_CHANNEL_IDS.includes(channel.id)) {
                return await interaction.editReply({
                    content: '⚠️ This channel is not in the `BAN_CHANNEL_IDS` list in `.env`. Setup will proceed, but I won\'t auto-ban here until added.'
                });
            }

            // Clean existing messages before setup
            const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
            if (fetched && fetched.size > 0) {
                await channel.bulkDelete(fetched, true).catch(() => null);
            }

            const warningLogo = new AttachmentBuilder(logoPath);

            await channel.send({
                embeds: [createWarningEmbed()],
                files: [warningLogo]
            });
            await interaction.editReply({ content: '✅ Trap channel has been initialized with VoidSentry branding.' });
        } catch (err) {
            console.error('[ERROR] Setup failed:', err);
            await interaction.editReply({ content: '❌ Error: Ensure I have "Manage Messages" permission and the logo exists in /assets.' });
        }
    }
});

client.on('messageCreate', async (message) => {
    // Validation: Ignore bots, DMs, and non-monitored channels
    if (message.author.bot || !message.guild || !CONFIG.BAN_CHANNEL_IDS.includes(message.channel.id)) return;

    const { author, guild, member, channel } = message;

    try {
        console.log(`[DETECTION] Violation in <#${channel.id}> by ${author.tag} (${author.id})`);

        // 1. Immediate message removal
        if (message.deletable) {
            await message.delete().catch(() => null);
        }

        // 2. Bot permission validation
        const botMember = guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
            console.error('[SECURITY ERR] Missing "Ban Members" permission!');
            return;
        }

        // 3. Target hierarchy check (cannot ban users with higher/equal roles)
        if (!member.bannable) {
            console.warn(`[HIERARCHY] Cannot ban ${author.tag} (Role priority issue).`);
            return;
        }

        // 4. Ban execution
        const reason = 'Security Breach: Sent a message in a Bot Detection Channel.';
        await guild.members.ban(author, {
            reason: reason,
            deleteMessageSeconds: 604800 // Delete 7 days of message history
        });

        console.log(`[BAN SUCCESS] Removed ${author.tag} for trap violation.`);

        // 5. Audit Logging
        if (CONFIG.LOG_CHANNEL_ID) {
            const logChannel = await guild.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
            if (logChannel?.isTextBased()) {
                const logLogo = new AttachmentBuilder(logoPath);
                await logChannel.send({
                    embeds: [createBanLogEmbed(author, reason, channel.id)],
                    files: [logLogo]
                });
            }
        }

    } catch (error) {
        console.error('[FATAL] Security process failed:', error);
    }
});

/**
 * --- Login ---
 */
client.login(CONFIG.TOKEN);
