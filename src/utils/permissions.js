/**
 * Permission utility functions.
 * 
 * Centralized permission checking for bot commands.
 * 
 * @module utils/permissions
 */

const CONFIG = require('../config');

/**
 * Check if a member has admin permission to use bot commands.
 * 
 * @param {import('discord.js').GuildMember} member - Discord guild member
 * @returns {boolean} True if member is owner or administrator
 */
function hasAdminPermission(member) {
    if (!member) return false;
    return member.id === CONFIG.OWNER_ID || member.permissions?.has('Administrator');
}

/**
 * Check if a user is the bot owner.
 * 
 * @param {import('discord.js').User} user - Discord user
 * @returns {boolean} True if user is the owner
 */
function isOwner(user) {
    return user?.id === CONFIG.OWNER_ID;
}

module.exports = {
    hasAdminPermission,
    isOwner,
};