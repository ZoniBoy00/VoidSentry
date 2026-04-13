# 🔨 VoidSentry v2.0

![VoidSentry Banner](./assets/VoidSentryBanner.gif)

A high-performance Discord security bot designed to catch and remove self-bots and malicious users who ignore server warnings. The bot monitors specific "Trap" channels and instantly bans anyone who sends a message there.

## 🚀 Features

- **Instant Detection** — Real-time monitoring of multiple restricted channels.
- **Auto-Ban** — Immediately bans violators with zero tolerance.
- **24h Message Purge** — Automatically deletes all messages the banned user sent in the last 24 hours across the server.
- **DM Notification** — Sends a notification to the user before banning (best-effort, fails silently if DMs disabled).
- **MySQL Database** — Persistent ban history storage with search and statistics.
- **Detailed Ban Logs** — Rich embed logs with:
  - User avatar, tag, ID, and mention
  - Account creation date
  - Server join date
  - Display name and roles
  - Captured message content
  - Suspicious account age warning (< 7 days old)
- **Slash Commands**:
  - `/setup-trap` — Initialize trap channels
  - `/status` — View bot uptime, statistics, and recent bans
  - `/ban-info` — Look up ban information for a user by ID (Discord ban lookup)
  - `/bans` — Ban history from database:
    - `/bans recent [limit]` — Show recent bans
    - `/bans search <user_id>` — Search bans by user ID
    - `/bans stats` — Show database statistics
- **Structured Logging** — Colored console logger with timestamps (system, security, ban, detection, command)
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
│   │   └── messageCreate.js       # Core trap detection & ban logic
│   └── utils/
│       ├── db.js                   # MySQL database connection
│       ├── deploy.js              # Slash command deployment
│       ├── helpers.js             # Utility functions
│       ├── logger.js              # Colored console logger with timestamps
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
| `BAN_CHANNEL_IDS` | IDs of "Trap" channels, separated by commas. |
| `LOG_CHANNEL_ID` | Channel ID for ban log embeds. |
| `STATUS_TEXT` | Bot status text (default: `Watching for breaches...`). |
| `DELETE_MESSAGE_SECONDS` | Messages to delete on ban (default: 86400 = 24h). |
| `BAN_REASON` | Custom ban reason. |
| `NODE_ENV` | `development` for guild commands, `production` for global. |

### MySQL Database Configuration
| Key | Description | Default |
| :--- | :--- | :--- |
| `DB_HOST` | MySQL server hostname | `localhost` |
| `DB_PORT` | MySQL server port | `3306` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | (empty) |
| `DB_NAME` | Database name | `voidsentry` |

**Note:** The database and table will be created automatically on first run.

## 🕹️ How to Use

1. **Create Database** (optional - auto-created on first run):
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

6. **Initialize**: Go to each trap channel and use `/setup-trap`.

## 🎮 Commands

| Command | Description | Permissions |
| :--- | :--- | :--- |
| `/setup-trap` | Clears channel and posts trap warning | Owner / Administrator |
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
2. 🗑️ **Cleanup** — Trigger message immediately deleted
3. ✅ **Validation** — Bot permissions and role hierarchy checked
4. 📨 **DM Notification** — User notified via DM (best-effort)
5. 🔨 **Ban Execution** — User banned, 24h of messages purged
6. 💾 **Database** — Ban record stored in MySQL
7. 📊 **Stats** — Ban recorded in statistics tracker
8. 📝 **Logging** — Detailed embed sent to log channel

## 📝 Important Notes

- **Message Content Intent**: Must be enabled in Discord Developer Portal → Bot → Privileged Intents.
- **Database**: MySQL is required for ban history storage. Database auto-creates on first run.
- **No Appeals**: The bot uses a "zero-tolerance" policy. Anyone typing in the trap channel is banned immediately.
- **24h Purge**: All messages from the banned user in the last 24 hours are automatically deleted.
- **DM Notification**: Best-effort, fails silently if user has DMs disabled.

## 🔌 Database Schema

The `bans` table is created automatically:

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

---

*Created for secure Discord community management.*