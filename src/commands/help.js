/**
 * Slash command that lists every available command.
 *
 * Built from the loaded command definitions, so it never goes out of date
 * when commands are added or changed.
 *
 * @module commands/help
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ApplicationCommandOptionType } = require('discord.js');

const { COLORS, LOGO_URL, BRAND_NAME, VERSION } = require('../utils/constants');
const { createLogoAttachment } = require('../utils/helpers');

/**
 * Describe one command (and its subcommands) for the help embed.
 *
 * @param {Object} command - Loaded command module
 * @returns {{name: string, value: string}}
 */
function describeCommand(command) {
    const json = command.data.toJSON();
    const lock = command.adminOnly ? ' 🔒' : '';
    const subcommands = (json.options || []).filter(opt => opt.type === ApplicationCommandOptionType.Subcommand);

    const lines = subcommands.length > 0
        ? subcommands.map(sub => `\`/${json.name} ${sub.name}\` — ${sub.description}`)
        : [json.description];

    return { name: `/${json.name}${lock}`, value: lines.join('\n').slice(0, 1024) };
}

module.exports = {
    /** Command definition for Discord */
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows all VoidSentry commands and how the bot works.'),

    /**
     * Execute the help command.
     *
     * @param {import('discord.js').CommandInteraction} interaction - Discord interaction
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        const commands = [...interaction.client.commands.values()]
            .sort((a, b) => a.data.name.localeCompare(b.data.name));

        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle(`📖 ${BRAND_NAME} Help`)
            .setAuthor({ name: BRAND_NAME, iconURL: LOGO_URL })
            .setDescription(
                'VoidSentry watches **trap channels**. Anyone who writes in one is banned instantly, which catches self-bots and compromised accounts.\n\n' +
                '**Quick start:** run `/setup-trap` in the channel you want as a trap, then pick a log channel with `/add-logchannel`.\n' +
                '🔒 = server owner / administrator only.'
            )
            .addFields(commands.map(describeCommand))
            .setFooter({ text: `${BRAND_NAME} v${VERSION}`, iconURL: LOGO_URL });

        await interaction.reply({
            embeds: [embed],
            files: [createLogoAttachment()],
            flags: [MessageFlags.Ephemeral],
        });
    },
};
