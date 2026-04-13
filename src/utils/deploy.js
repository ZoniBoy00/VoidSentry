/**
 * Slash command deployment script.
 * 
 * Deploys slash commands to Discord. Can target either a specific guild
 * for fast development or global scope for production.
 * 
 * Usage:
 * - npm run deploy        - Deploy global commands (production)
 * - npm run deploy:guild - Deploy to specific guild (development)
 * 
 * @module utils/deploy
 */

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = require('../config');
const logger = require('./logger');

// Collect commands from the commands directory
const commands = [];
const commandsPath = path.join(__dirname, '../commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data);
        logger.info(`Prepared command: ${command.data.name}`);
    }
}

if (commands.length === 0) {
    logger.error('No commands found to deploy!');
    process.exit(1);
}

// Initialize REST API client
const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);

/**
 * Deploy commands to Discord.
 * 
 * Chooses between guild-specific or global deployment based on:
 * - GUILD_ID environment variable
 * - NODE_ENV setting (development vs production)
 */
async function deploy() {
    try {
        logger.info(`Deploying ${commands.length} commands to Discord...`);

        // Use guild commands in development for instant updates
        // Use global commands in production (takes up to 1 hour to propagate)
        const isDev = process.env.NODE_ENV === 'development' && CONFIG.GUILD_ID;
        
        const route = isDev
            ? Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID)
            : Routes.applicationCommands(CONFIG.CLIENT_ID);

        const target = isDev ? `guild ${CONFIG.GUILD_ID}` : 'global';
        logger.info(`Target: ${target}`);

        // PUT to Discord API to register commands
        await rest.put(route, { body: commands.map(c => c.toJSON()) });

        logger.info(`Successfully deployed ${commands.length} commands to ${target}.`);
        
        // Warn about global command propagation time
        if (!isDev) {
            logger.warn('Global commands may take up to 1 hour to propagate.');
        }
        
    } catch (error) {
        logger.error('Failed to deploy commands:', error);
        process.exit(1);
    }
}

// Execute deployment
deploy();