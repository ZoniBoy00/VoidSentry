function valuesOf(collection) {
    if (!collection) return [];
    if (typeof collection.values === 'function') return Array.from(collection.values());
    return Array.isArray(collection) ? collection : [];
}

function cleanLabel(value, fallback, maxLength = 120) {
    const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
    return (text || fallback).slice(0, maxLength);
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'size unknown';
    if (bytes < 1024) return `${bytes} B`;

    const units = ['KiB', 'MiB', 'GiB'];
    let size = bytes / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function getHost(value) {
    if (!value) return '';
    try {
        return new URL(value).hostname.slice(0, 100);
    } catch {
        return '';
    }
}

function buildMessageEvidence(message) {
    const sections = [];
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    if (content) sections.push(content);
    else sections.push('[No text content]');

    const attachments = valuesOf(message?.attachments);
    if (attachments.length > 0) {
        const lines = attachments.slice(0, 5).map(attachment => {
            const name = cleanLabel(attachment?.name, 'unnamed file');
            const type = cleanLabel(attachment?.contentType, 'type unknown', 80);
            return `• ${name} — ${type}, ${formatBytes(attachment?.size)}`;
        });
        if (attachments.length > 5) lines.push(`• +${attachments.length - 5} more attachment(s)`);
        sections.push(`Attachments (${attachments.length}):\n${lines.join('\n')}`);
    }

    const embeds = valuesOf(message?.embeds);
    if (embeds.length > 0) {
        const lines = embeds.slice(0, 3).map(embed => {
            const title = cleanLabel(embed?.title || embed?.provider?.name || embed?.type, 'embed');
            const host = getHost(embed?.url);
            return host ? `• ${title} (${host})` : `• ${title}`;
        });
        if (embeds.length > 3) lines.push(`• +${embeds.length - 3} more embed(s)`);
        sections.push(`Embeds/previews (${embeds.length}):\n${lines.join('\n')}`);
    }

    const stickers = valuesOf(message?.stickers);
    if (stickers.length > 0) {
        const names = stickers.slice(0, 5).map(sticker => cleanLabel(sticker?.name, 'unnamed sticker'));
        if (stickers.length > 5) names.push(`+${stickers.length - 5} more`);
        sections.push(`Stickers (${stickers.length}): ${names.join(', ')}`);
    }

    if (message?.poll) sections.push('Poll metadata present.');

    if (!content && attachments.length === 0 && embeds.length === 0 && stickers.length === 0 && !message?.poll) {
        sections.push('No attachment, embed, or sticker metadata was provided by Discord.');
    }

    return sections.join('\n');
}

module.exports = { buildMessageEvidence };
