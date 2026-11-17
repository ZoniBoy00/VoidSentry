/**
 * Message update event handler.
 *
 * An edit in a trap channel counts the same as a new message: someone who
 * edits an old message there (for example one written before the channel
 * became a trap) is banned like anyone who writes there.
 *
 * Discord also sends updates when link previews load or a message is pinned.
 * Only a new edit timestamp means the author changed the message, so only
 * that is acted on. Messages the bot has not seen since it started are not
 * reported by Discord.js (no partials), which keeps old history out of it.
 *
 * @module events/messageUpdate
 */

const { Events } = require('discord.js');
const { handleTrapMessage } = require('./messageCreate');

/**
 * Whether an update is an edit by the author.
 *
 * @param {import('discord.js').Message|import('discord.js').PartialMessage} oldMessage
 * @param {import('discord.js').Message} newMessage
 * @returns {boolean}
 */
function isAuthorEdit(oldMessage, newMessage) {
    if (newMessage.partial || !newMessage.editedTimestamp) return false;
    return oldMessage?.editedTimestamp !== newMessage.editedTimestamp;
}

module.exports = {
    name: Events.MessageUpdate,
    once: false,

    /**
     * @param {import('discord.js').Client} client - Discord client instance
     * @param {import('discord.js').Message|import('discord.js').PartialMessage} oldMessage - Before the edit
     * @param {import('discord.js').Message} newMessage - After the edit
     */
    async execute(client, oldMessage, newMessage) {
        if (!isAuthorEdit(oldMessage, newMessage)) return;
        await handleTrapMessage(client, newMessage, { edited: true });
    },

    isAuthorEdit,
};
