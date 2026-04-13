/**
 * VoidSentry - Discord Security Bot
 * 
 * Entry point for the bot. Handles:
 * - Client initialization with required intents
 * - Dynamic command loading from src/commands/
 * - Dynamic event loading from src/events/
 * - Graceful shutdown handling
 * 
 * @module VoidSentry
 * @version 2.0.0
 */

const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config();

const CONFIG = require('./src/config');
const logger = require('./src/utils/logger');
const db = require('./src/utils/db');

/**
 * Initialize Discord client with required intents.
 * 
 * Required intents:
 * - Guilds: Basic guild access
 * - GuildMessages: Monitor messages in channels
 * - MessageContent: Read message content (PRIVILEGED - must enable in Developer Portal)
 * 
 * @see https://discord.com/developers/docs/topics/gateway#gateway-intents
 */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        // PRIVILEGED: Must be enabled in Discord Developer Portal
        // Required for detecting messages in trap channels
        GatewayIntentBits.MessageContent,
    ],
});

/**
 * Command collection for slash commands.
 * Loaded dynamically from src/commands/ directory.
 * 
 * @type {Collection<string, Object>}
 */
client.commands = new Collection();

// Load commands dynamically
const commandsPath = path.join(__dirname, 'src/commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // Validate command structure
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        logger.debug(`Loaded command: ${command.data.name}`);
    } else {
        logger.warn(`Skipped invalid command file: ${file}`);
    }
}

logger.info(`Loaded ${client.commands.size} command(s)`);

// Load events dynamically from src/events/
const eventsPath = path.join(__dirname, 'src/events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(client, ...args));
    } else {
        client.on(event.name, (...args) => event.execute(client, ...args));
    }
    logger.debug(`Loaded event: ${event.name}`);
}

logger.info(`Loaded ${eventFiles.length} event(s)`);

/**
 * Graceful shutdown handler.
 * Cleans up Discord connection and database on process termination.
 * 
 * @param {string} signal - Signal name (SIGINT/SIGTERM)
 */
const shutdown = async (signal) => {
    logger.system(`${signal} received, shutting down gracefully...`);
    client.destroy();
    await db.closePool();
    process.exit(0);
};

// Handle termination signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Login to Discord
client.login(CONFIG.TOKEN)
    .catch(err => {
        logger.fatal('Failed to login to Discord:', err);
        process.exit(1);
    });