const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const CONFIG = require('../config');
const logger = require('./logger');

// Register all slash commands here
const commands = [
    new SlashCommandBuilder()
        .setName('setup-trap')
        .setDescription('Initializes the trap: Clears channel and posts warning.'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Shows VoidSentry bot status, uptime, and ban statistics.'),
    new SlashCommandBuilder()
        .setName('ban-info')
        .setDescription('Look up ban information for a user by ID.')
        .addStringOption(option =>
            option
                .setName('user_id')
                .setDescription('The Discord User ID to look up')
                .setRequired(true)
        ),
].map(c => c.toJSON());

/**
 * Deploys application (slash) commands to Discord.
 */
async function deployCommands() {
    const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
    try {
        logger.info(`Deploying ${commands.length} application commands...`);
        await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: commands });
        logger.info('Application commands deployed successfully.');
    } catch (error) {
        logger.error('Failed to deploy commands:', error);
    }
}

module.exports = { deployCommands };
