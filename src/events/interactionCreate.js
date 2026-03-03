const { Events } = require('discord.js');
const setupTrap = require('../commands/setupTrap');
const statusCmd = require('../commands/status');
const banInfoCmd = require('../commands/banInfo');
const logger = require('../utils/logger');

const commandMap = {
    'setup-trap': setupTrap,
    'status': statusCmd,
    'ban-info': banInfoCmd,
};

module.exports = {
    name: Events.InteractionCreate,
    once: false,

    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = commandMap[interaction.commandName];
        if (!command) return;

        logger.command(`/${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id})`);

        try {
            await command.execute(interaction);
        } catch (err) {
            logger.error(`Command /${interaction.commandName} failed`, err);

            const reply = {
                content: '❌ An error occurred while executing this command.',
            };

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(reply).catch(() => null);
            } else {
                await interaction.reply({ ...reply, ephemeral: true }).catch(() => null);
            }
        }
    },
};
