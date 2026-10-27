# 🔨 VoidSentry v2.1

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
  - `/help` — List all commands (built from the loaded commands, always up to date)
  - `/setup-trap` — Register the current channel as a trap for this server and post the warning
  - `/trap-settings` — View or change this server's trap channels, log channel, ban reason, purge duration, dry-run mode and exempt roles
  - `/add-logchannel [channel]` — Choose where ban logs are posted on this server (any channel, any name)
  - `/remove-logchannel` — Stop posting ban logs
  - `/unban` — Unban a user by ID (ban history is kept)
  - `/purge-user` — Bot owner only: delete all stored ban records of a user (data deletion requests)
  - `/status` — View bot uptime, statistics, and recent bans
  - `/ban-info` — Look up ban information for a user by ID (Discord ban lookup)
  - `/bans` — Ban history from database:
    - `/bans recent [limit]` — Show recent bans
    - `/bans search <user_id>` — Search bans by user ID
    - `/bans stats` — Show database statistics
    - Results are limited to the current server (the bot owner can add `global:true`)
- **Unban from the log** — Every ban log has an Unban button for administrators.
- **Change log** — Every settings change and unban (from a command, the log button or the dashboard) is recorded with who made it, in the `audit_log` table.
- **Owner alerts** — When the bot cannot ban on a server (missing permission, role too low), the server owner gets at most one direct message a day about it.
- **Optional web dashboard** — The hosted bot at [voidsentry.vercel.app](https://voidsentry.vercel.app) has a dashboard for settings, ban history, statistics, unbans and CSV export. Its website is not open source; the API it uses is in this repository and switched off unless you configure it. Self-hosted bots are fully usable with slash commands alone (see [Running without the dashboard](#running-without-the-dashboard)).
- **Live Status** — The bot's "Watching" status rotates between your `STATUS_TEXT`, the number of servers and the total number of users banned.
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
│   │   ├── help.js                 # /help
│   │   ├── setupTrap.js            # /setup-trap
│   │   ├── trapSettings.js         # /trap-settings (per-server settings)
│   │   ├── addLogChannel.js        # /add-logchannel
│   │   ├── removeLogChannel.js     # /remove-logchannel
│   │   ├── unban.js                # /unban
│   │   ├── purgeUser.js            # /purge-user (bot owner only)
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
│       ├── db.js                   # MySQL queries
│       ├── migrations.js          # Versioned schema migrations
│       ├── deploy.js              # Slash command deployment
│       ├── guildSettings.js       # Per-server settings & trap channels (cached)
│       ├── audit.js               # Change log entries for commands and buttons
│       ├── unbanButton.js         # Unban button on ban logs
│       ├── ownerAlerts.js         # Daily DM to a server owner when bans fail
│       ├── messageEvidence.js     # Summary of the message that triggered a ban
│       ├── helpers.js             # Utility functions
│       ├── logger.js              # Pino structured logger
│       ├── presence.js            # Rotating bot status
│       ├── statsServer.js         # Optional stats endpoint (+ dashboard API)
│       ├── dashboardApi.js        # Optional API for the hosted dashboard
│       ├── dashboardSettings.js   # Settings changes made through the dashboard
│       ├── banStats.js            # Ban statistics (per day, hour, weekday, channel) for the dashboard
│       ├── rateLimit.js           # Dashboard API rate limits
│       ├── sessionRevocations.js  # "Sign out everywhere" for the dashboard
│       ├── permissions.js         # Permission checker
│       ├── stats.js               # In-memory statistics
│       └── constants.js           # Colors, paths, branding
├── scripts/
│   ├── backup.js                  # npm run backup
│   ├── backupCrypto.js            # Backup encryption
│   └── decrypt-backup.js          # npm run backup:decrypt
├── test/                          # node --test (npm test)
├── .env                           # Your secrets (not committed)
├── .env.example                   # Example config template
├── Dockerfile
├── index.js                       # Entry point
├── package.json
├── SECURITY.md                    # How to report vulnerabilities
└── README.md
```

## 🛠️ Installation

1. **Requirement**: [Node.js](https://nodejs.org/) v20 or higher (CI and the Docker image use Node 20).
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
| `STATUS_TEXT` | First line of the rotating bot status (default: `Watching for breaches...`). Server and ban counts are added automatically. |
| `DELETE_MESSAGE_SECONDS` | Default messages to delete on ban (default: 86400 = 24h). Servers can override it. |
| `BAN_REASON` | Default ban reason. Servers can override it. |
| `STATS_PORT` | Optional. Port of a read-only JSON endpoint (`GET /stats`) with aggregate numbers (servers, members, total bans, bans in the last 7 days) for the website. `0` or empty = disabled. |
| `STATS_HOST` | Interface for the stats endpoint (default `127.0.0.1`). Keep it on localhost and expose it through a tunnel or reverse proxy. |
| `STATS_TOKEN` | Optional bearer token the stats endpoint requires. Use a random value of at least 32 characters (for example `openssl rand -hex 32`); the bot logs a warning at start-up if it is shorter. |
| `STATS_TOKEN_PREVIOUS` | Only during a token rotation: the old token, still accepted (see [Rotating STATS_TOKEN](#rotating-stats_token)). |
| `DASHBOARD_API` | `true` (default) serves the dashboard API under `/api/` when `STATS_TOKEN` is set. Set `false` to serve only `/stats` (see [Running without the dashboard](#running-without-the-dashboard)). |
| `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_KEY`, `BACKUP_COPY_DIR` | Used by `npm run backup` only (see [Backups and migrations](#backups-and-migrations)). |
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

**Note:** The tables are created and updated automatically by migrations at startup. The database itself must exist
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
| `/help` | List all commands | Everyone |
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
| `/purge-user <user_id>` | Delete all stored ban records of a user on every server | Bot owner only |
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
- **Database**: MySQL is required. The database must exist; its tables are created on first run.
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

Also created by migrations: `audit_log` (who changed which setting or lifted which ban, and when), `session_revocations` (dashboard "sign out everywhere") and `schema_migrations` (which migrations have run). `src/utils/migrations.js` has the exact definitions.

## Running without the dashboard

The web dashboard belongs to the hosted bot and its website is not open source. A self-hosted bot does not need it: every setting and action is available as a slash command, ban logs carry an Unban button, and the change log is still written to the database.

The dashboard API is never served unless you set both `STATS_PORT` and `STATS_TOKEN`. To run the bot on its own:

- Leave `STATS_PORT` empty (or `0`). No HTTP port is opened at all.
- Or, to publish only the aggregate `/stats` numbers (for your own status page or monitoring), set `STATS_PORT` and optionally `STATS_TOKEN`, and set `DASHBOARD_API=false`. Then `/api/*` answers `404` even with a valid token.

The dashboard tables (`audit_log`, `session_revocations`) are still created; they stay small and unused apart from the change log.

## Backups and migrations

The schema is managed by versioned migrations (`src/utils/migrations.js`) that run automatically at startup and are recorded in the `schema_migrations` table. Never edit a shipped migration; add a new one.

`npm run backup` writes a gzip-compressed `mysqldump` to `BACKUP_DIR` (default `./backups`) and keeps the newest `BACKUP_KEEP` files (default 14). It needs the `mysqldump` program and uses the `DB_*` settings. Run it daily, for example with cron:

```
15 3 * * * cd /path/to/VoidSentry && npm run backup
```

To restore: `gunzip -c backups/voidsentry-YYYYMMDD-HHMMSS.sql.gz | mysql -h HOST -u USER -p DATABASE`.

**Encryption and an off-machine copy.** Set `BACKUP_KEY` to a long random passphrase and backups are written as `.sql.gz.enc` (AES-256-GCM, key derived with scrypt). Without it they stay unencrypted and the script prints a warning. Keep the key in a password manager, not next to the backups: without it an encrypted backup cannot be restored. Set `BACKUP_COPY_DIR` to a folder that is synced to another machine or cloud storage to keep a second copy; it is pruned to `BACKUP_KEEP` files as well. The copy is only made when `BACKUP_KEY` is set, so an unencrypted dump never leaves the machine; otherwise the script skips it and exits with code 1.

To restore an encrypted backup, decrypt it first, then restore as above:

```
npm run backup:decrypt -- backups/voidsentry-YYYYMMDD-HHMMSS.sql.gz.enc
gunzip -c backups/voidsentry-YYYYMMDD-HHMMSS.sql.gz | mysql -h HOST -u USER -p DATABASE
```

The decrypt step refuses a wrong key or a changed file and leaves no partial output. Do one test restore after turning encryption on.

## Dashboard API

When `STATS_PORT` and `STATS_TOKEN` are set (and `DASHBOARD_API` is not `false`), the stats server also serves the API behind the website dashboard under `/api/` (see `src/utils/dashboardApi.js` for the routes, including settings, unban, CSV export and statistics, and the owner-only routes for server trends, leaving a server and deleting a user's data). It always requires the bearer token and acts for the Discord user named in `X-Discord-User`; the bot checks that user rights in each server itself. Anyone who holds `STATS_TOKEN` can act as any user, so keep it secret and expose the port only through a tunnel or reverse proxy.

- **Sign out everywhere.** The website sends the issue time of the session in `X-Session-Issued`. `POST /api/me/revoke` stores the current time for that user (table `session_revocations`), and every older session of that user then gets `403`, owner routes included.
- **Rate limits.** Per user 120 requests and 20 searches a minute, and 1,200 requests a minute in total; over the limit the API answers `429`. All requests arrive from the website's servers, so limits are per Discord user, not per IP. Sign-in on the website never reaches the bot; limit it with the Vercel Firewall if needed.

### Rotating STATS_TOKEN

Rotate it at once if it may have leaked (a commit, a screenshot, a shared log), and otherwise now and then. The bot accepts two tokens during the switch, so the dashboard keeps working:

1. Generate a new token, for example `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. In the bot's `.env`: move the current value to `STATS_TOKEN_PREVIOUS` and put the new one in `STATS_TOKEN`. Restart the bot.
3. In Vercel, set `BOT_STATS_TOKEN` to the new token and redeploy the website.
4. Check that the dashboard and `/status` work, then empty `STATS_TOKEN_PREVIOUS` and restart the bot again. The old token is now refused.

If the token leaked, also use **Sign out everywhere** on the dashboard and check the audit log of each server for changes you did not make.

A separate owner-only token would add little: the website needs both to work, so both would sit in the same Vercel environment and leak together. The owner routes are instead protected by the same token, the owner's Discord sign-in and session revocation.

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

---

*Created for secure Discord community management.*
