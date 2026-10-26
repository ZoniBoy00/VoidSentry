# 🔨 VoidSentry v2.0

![VoidSentry Banner](./assets/VoidSentryBanner.gif)

A high-performance Discord security bot designed to catch and remove self-bots and malicious users who ignore server warnings. The bot monitors specific "Trap" channels and instantly bans anyone who sends a message there.

## 🚀 Features

- **Multi-Server Support** — One bot instance serves any number of servers. Each server has its own trap channels, log channel, ban reason and purge duration, managed with slash commands (no restart needed).
- **Instant Detection** — Real-time monitoring of multiple restricted channels.
- **Auto-Ban** — Immediately bans violators with zero tolerance.
- **Message Purge** — Deletes the banned user's recent messages across the server (24h by default, configurable per server).
- **DM Notification** — Sends a notification to the user *before* banning (best-effort, 3 s timeout, fails silently if DMs are disabled).
- **Safety Net** — Administrators and configurable exempt roles are never banned (their trap message is only deleted). A per-server dry-run mode reports violations without banning, and failed bans (missing permission, role hierarchy) are reported to the log channel.
- **Privacy** — Captured message content is cleared from the ban history after `MESSAGE_RETENTION_DAYS` (default 90).
- **MySQL Database** — Persistent ban history storage with search and statistics.
- **Detailed Ban Logs** — Rich embed logs with:
  - User avatar, tag, ID, and mention
  - Account creation date
  - Server join date
  - Display name and roles
  - Captured message content
  - Suspicious account age warning (< 7 days old)
- **Slash Commands**:
  - `/setup-trap` — Register the current channel as a trap for this server and post the warning
  - `/trap-settings` — View or change this server's trap channels, log channel, ban reason, purge duration, dry-run mode and exempt roles
  - `/add-logchannel [channel]` — Choose where ban logs are posted on this server (any channel, any name)
  - `/remove-logchannel` — Stop posting ban logs
  - `/unban` — Unban a user by ID (ban history is kept)
  - `/status` — View bot uptime, statistics, and recent bans
  - `/ban-info` — Look up ban information for a user by ID (Discord ban lookup)
  - `/bans` — Ban history from database:
    - `/bans recent [limit]` — Show recent bans
    - `/bans search <user_id>` — Search bans by user ID
    - `/bans stats` — Show database statistics
    - Results are limited to the current server (the bot owner can add `global:true`)
- **Structured Logging** — Pino-based logger with categories (system, security, ban, detection, command)
- **Statistics Tracking** — In-memory tracking of bans, detections, and DM success rate
- **Branded Design** — Custom logo and professional embeds

## 📁 Project Structure

```
VoidSentry/
├── assets/                        # Branding assets
│   ├── logo.png
│   ├── VoidSentryBanner.gif
│   └── VoidSentryLogo.gif
├── src/
│   ├── config/
│   │   └── index.js               # Environment config, MySQL settings
│   ├── commands/
│   │   ├── setupTrap.js            # /setup-trap
│   │   ├── trapSettings.js         # /trap-settings (per-server settings)
│   │   ├── addLogChannel.js        # /add-logchannel
│   │   ├── removeLogChannel.js     # /remove-logchannel
│   │   ├── unban.js                # /unban
│   │   ├── status.js              # /status
│   │   ├── banInfo.js             # /ban-info (Discord ban lookup)
│   │   └── bans.js                # /bans (database history)
│   ├── embeds/
│   │   ├── warningEmbed.js        # Trap channel warning
│   │   ├── banLogEmbed.js         # Detailed ban log
│   │   └── banNotificationEmbed.js # DM notification
│   ├── events/
│   │   ├── ready.js               # Bot startup & database init
│   │   ├── interactionCreate.js   # Slash command router
│   │   ├── guildDelete.js         # Cleans up when the bot leaves a server
│   │   ├── channelDelete.js       # Unregisters deleted trap channels
│   │   └── messageCreate.js       # Core trap detection & ban logic
│   └── utils/
│       ├── db.js                   # MySQL database connection
│       ├── deploy.js              # Slash command deployment
│       ├── guildSettings.js       # Per-server settings & trap channels (cached)
│       ├── helpers.js             # Utility functions
│       ├── logger.js              # Pino structured logger
│       ├── permissions.js         # Permission checker
│       ├── stats.js               # In-memory statistics
│       └── constants.js           # Colors, paths, branding
├── .env                           # Your secrets (not committed)
├── .env.example                   # Example config template
├── .gitignore
├── index.js                       # Entry point
├── package.json
└── README.md
```

## 🛠️ Installation

1. **Requirement**: [Node.js](https://nodejs.org/) v18.0 or higher.
2. **Database**: Set up a MySQL database (see configuration below).
3. **Download**: Clone or download this repository.
4. **Install Dependencies**:
   ```bash
   npm install
   ```

## ⚙️ Configuration (.env)

Copy `.env.example` to `.env` and fill in your credentials:

### Discord Configuration
| Key | Description |
| :--- | :--- |
| `DISCORD_TOKEN` | Your bot's secret token from the Developer Portal. |
| `CLIENT_ID` | Your bot's Application ID. |
| `OWNER_ID` | Your Discord User ID (for admin commands). |
| `GUILD_ID` | Discord Server ID for development (guild commands). |
| `BAN_CHANNEL_IDS` | Optional. Trap channel IDs, separated by commas, that apply on every server. Normally leave empty and use `/setup-trap` instead. |
| `LOG_CHANNEL_ID` | Optional default log channel ID. Only works on the server that owns the channel; other servers set theirs with `/trap-settings log-channel`. |
| `STATUS_TEXT` | Bot status text (default: `Watching for breaches...`). |
| `DELETE_MESSAGE_SECONDS` | Default messages to delete on ban (default: 86400 = 24h). Servers can override it. |
| `BAN_REASON` | Default ban reason. Servers can override it. |
| `MESSAGE_RETENTION_DAYS` | Days to keep captured message content in the ban history (default: 90, `0` = keep forever). |
| `NODE_ENV` | `development` for guild commands, `production` for global. |

### MySQL Database Configuration
| Key | Description | Default |
| :--- | :--- | :--- |
| `DB_HOST` | MySQL server hostname | required |
| `DB_PORT` | MySQL server port | `3306` |
| `DB_USER` | MySQL username | required |
| `DB_PASSWORD` | MySQL password | required |
| `DB_NAME` | Existing database name | required |

**Note:** The `bans`, `guild_settings`, `trap_channels` and `exempt_roles` tables are created automatically. The database itself must exist
and the configured user only needs access to that database.

## 🕹️ How to Use

1. **Create Database** (once, using an administrator account):
   ```sql
   CREATE DATABASE voidsentry;
   ```

2. **Invite the Bot**: Ensure the bot has `Ban Members`, `Manage Messages`, and `View Channels` permissions.

3. **Role Hierarchy**: Move the bot's role to the **very top** of your Role list.

4. **Deploy Commands**:
   ```bash
   # For development (faster, guild-specific)
   npm run deploy:guild
   
   # For production (global commands, ~1hr propagation)
   npm run deploy
   ```

5. **Launch**:
   ```bash
   npm start
   ```

6. **Initialize**: On every server, go to each trap channel and use `/setup-trap`. Choose the log channel with `/add-logchannel` (use any channel you like, e.g. `#mod-logs`).

## 🎮 Commands

| Command | Description | Permissions |
| :--- | :--- | :--- |
| `/setup-trap` | Registers the channel as a trap, clears it and posts the warning | Owner / Administrator |
| `/trap-settings view` | Show this server's trap channels and settings | Owner / Administrator |
| `/trap-settings remove-trap [channel]` | Stop treating a channel as a trap | Owner / Administrator |
| `/add-logchannel [channel]` | Set the ban log channel (checks bot permissions, posts a confirmation) | Owner / Administrator |
| `/remove-logchannel` | Stop posting ban logs | Owner / Administrator |
| `/trap-settings log-channel [channel]` | Same as the two above, without the permission check | Owner / Administrator |
| `/trap-settings reason [text]` | Set (or reset) the ban reason | Owner / Administrator |
| `/trap-settings purge [seconds]` | Set (or reset) the message purge duration | Owner / Administrator |
| `/trap-settings dry-run <enabled>` | Report violations without banning | Owner / Administrator |
| `/trap-settings exempt-add <role>` | Never ban members with this role | Owner / Administrator |
| `/trap-settings exempt-remove <role>` | Remove a role exemption | Owner / Administrator |
| `/unban <user_id>` | Unban a user on this server | Owner / Administrator |
| `/status` | Bot uptime, stats, ping, recent bans | Owner / Administrator |
| `/ban-info` | Look up Discord ban by user ID | Owner / Administrator |
| `/bans recent [limit]` | Recent bans from database | Owner / Administrator |
| `/bans search <user_id>` | Search database by user ID | Owner / Administrator |
| `/bans stats` | Database statistics | Owner / Administrator |

## 📋 Ban Log Details

When a user is banned, the log embed includes:

| Field | Description |
| :--- | :--- |
| 👤 User | Tag, ID, and mention |
| 📅 Account Created | When the Discord account was created |
| 📥 Joined Server | When the user joined your server |
| 🏷️ Display Name | Server nickname or username |
| 🎭 Roles | All roles the user had (up to 15) |
| ⚠️ Violation Reason | Why the ban occurred |
| 📍 Detected In | Which trap channel triggered the ban |
| 🕐 Action Taken At | Exact timestamp of the ban |
| 💬 Message Content | What the user wrote (truncated if long) |
| 🚩 Suspicious Flag | Warns if the account is less than 7 days old |

## 🔧 Ban Process Flow

1. 🔍 **Detection** — Message detected in trap channel
2. 🛡️ **Exemption** — Administrators and exempt roles are skipped (message deleted only)
3. ✅ **Validation** — Bot permissions and role hierarchy checked (failures reported to the log channel)
4. 🧪 **Dry run** — If enabled, the violation is reported and nothing else happens
5. 📨 **DM Notification** — User notified via DM before the ban (best-effort)
6. 🔨 **Ban Execution** — User banned, recent messages purged
7. 🗑️ **Cleanup** — Trigger message deleted if it survived the purge
8. 💾 **Database** — Ban record stored in MySQL
9. 📊 **Stats** — Ban recorded in statistics tracker
10. 📝 **Logging** — Detailed embed sent to log channel

## 📝 Important Notes

- **Message Content Intent**: Must be enabled in Discord Developer Portal → Bot → Privileged Intents.
- **Database**: MySQL is required for ban history storage. Database auto-creates on first run.
- **No Appeals**: The bot uses a "zero-tolerance" policy. Anyone typing in the trap channel is banned immediately.
- **Message Purge**: The banned user's recent messages are deleted (24 hours by default).
- **Docker**: A `Dockerfile` is included. The bot exits on uncaught exceptions, so run it with a restart policy (`docker run --restart unless-stopped --env-file .env voidsentry`).
- **DM Notification**: Best-effort, fails silently if user has DMs disabled.

## 🔌 Database Schema

The tables are created automatically. Ban history (`bans`):

```sql
CREATE TABLE bans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    user_tag VARCHAR(100) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    guild_name VARCHAR(100) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    channel_name VARCHAR(100) NOT NULL,
    message_content TEXT,
    reason VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_guild_id (guild_id),
    INDEX idx_created_at (created_at)
);
```

Per-server settings, trap channels and exempt roles:

```sql
CREATE TABLE guild_settings (
    guild_id VARCHAR(20) NOT NULL PRIMARY KEY,
    log_channel_id VARCHAR(20) NULL,
    ban_reason VARCHAR(500) NULL,
    delete_message_seconds INT NULL,
    dry_run TINYINT(1) NULL
);

CREATE TABLE trap_channels (
    channel_id VARCHAR(20) NOT NULL PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    INDEX idx_trap_guild_id (guild_id)
);

CREATE TABLE exempt_roles (
    guild_id VARCHAR(20) NOT NULL,
    role_id VARCHAR(20) NOT NULL,
    PRIMARY KEY (guild_id, role_id)
);
```

---

*Created for secure Discord community management.*