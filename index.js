const { Client, GatewayIntentBits } = require('discord.js');
const CONFIG = require('./src/config');

// --- Event Handlers ---
const readyHandler = require('./src/events/ready');
const interactionHandler = require('./src/events/interactionCreate');
const messageHandler = require('./src/events/messageCreate');

// --- Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// --- Register Events ---
client.once(readyHandler.name, (...args) => readyHandler.execute(client, ...args));
client.on(interactionHandler.name, (...args) => interactionHandler.execute(...args));
client.on(messageHandler.name, (...args) => messageHandler.execute(...args));

// --- Login ---
client.login(CONFIG.TOKEN);
