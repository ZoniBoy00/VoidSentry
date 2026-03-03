# 🔨 VoidSentry v2.0

![VoidSentry Banner](./assets/VoidSentryBanner.gif)

A high-performance Discord security bot designed to catch and remove self-bots and malicious users who ignore server warnings. The bot monitors specific "Trap" channels and instantly bans anyone who sends a message there.

## 🚀 Features

- **Instant Detection** — Real-time monitoring of multiple restricted channels.
- **Auto-Ban** — Immediately bans violators with zero tolerance.
- **24h Message Purge** — Automatically deletes all messages the banned user sent in the last 24 hours across the server.
- **DM Notification** — Sends a notification to the user before banning (best-effort, fails silently if DMs disabled).
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
  - `/ban-info` — Look up ban information for a user by ID
- **Color-Coded Logger** — Professional console output with timestamps and categories
- **Statistics Tracking** — In-memory tracking of bans, detections, and DM success rate
- **Branded Design** — Custom logo and professional embeds

## 📁 Project Structure

```
BanBot/
├── assets/                        # Branding assets
│   ├── logo.png
│   ├── VoidSentryBanner.gif
│   └── VoidSentryLogo.gif
├── src/
│   ├── config/
│   │   └── index.js               # Environment config & validation
│   ├── commands/
│   │   ├── setupTrap.js            # /setup-trap slash command
│   │   ├── status.js               # /status slash command
│   │   └── banInfo.js              # /ban-info slash command
│   ├── embeds/
│   │   ├── warningEmbed.js         # Trap channel warning embed
│   │   ├── banLogEmbed.js          # Detailed ban log embed
│   │   └── banNotificationEmbed.js # DM notification embed
│   ├── events/
│   │   ├── ready.js                # Bot startup & presence
│   │   ├── interactionCreate.js    # Slash command router
│   │   └── messageCreate.js        # Core trap detection & ban logic
│   └── utils/
│       ├── constants.js            # Colors, paths, branding
│       ├── helpers.js              # Utility functions
│       ├── logger.js               # Color-coded console logger
│       ├── stats.js                # In-memory statistics tracker
│       └── deploy.js               # Slash command deployment
├── .env                            # Your secrets (not committed)
├── .env.example                    # Example config template
├── .gitignore
├── index.js                        # Entry point (bootstrapper)
├── package.json
└── README.md
```

## 🛠️ Installation

1. **Requirement**: [Node.js](https://nodejs.org/) v16.11.0 or higher.
2. **Download**: Clone or download this repository.
3. **Install Dependencies**:
    ```bash
    npm install
    ```

## ⚙️ Configuration (.env)

Copy `.env.example` to `.env` and fill in your credentials:

| Key | Description |
| :--- | :--- |
| `DISCORD_TOKEN` | Your bot's secret token from the Developer Portal. |
| `CLIENT_ID` | Your bot's Application ID. |
| `OWNER_ID` | Your Discord User ID (for admin commands). |
| `BAN_CHANNEL_IDS` | IDs of the "Trap" channels, separated by commas (e.g., `123,456`). |
| `LOG_CHANNEL_ID` | The ID of the channel where ban reports are sent. |
| `STATUS_TEXT` | Custom bot status text (default: `Watching for intruders...`). |

## 🕹️ How to Use

1. **Invite the Bot**: Ensure the bot has `Ban Members`, `Manage Messages`, and `View Channels` permissions.
2. **Role Hierarchy**: Move the bot's role to the **very top** of your Role list.
3. **Multi-Channel Support**: In `.env`, you can list multiple channels:
    ```
    BAN_CHANNEL_IDS=10111222333,40444555666
    ```
4. **Launch**:
    ```bash
    npm start
    ```
    Or for development (auto-restart on changes):
    ```bash
    npm run dev
    ```
5. **Initialize**: Go to **each** trap channel and use the `/setup-trap` command.

## 🎮 Commands

| Command | Description | Permissions |
| :--- | :--- | :--- |
| `/setup-trap` | Clears the channel and posts the trap warning embed | Owner / Administrator |
| `/status` | Shows bot uptime, stats, ping, and recent bans | Owner / Administrator |
| `/ban-info` | Look up ban details for a specific user ID | Owner / Administrator |

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
6. 📊 **Stats** — Ban recorded in statistics tracker
7. 📝 **Logging** — Detailed embed sent to log channel

## 📝 Important Notes

- **Message Content Intent**: Must be enabled in the Discord Developer Portal for the bot to read messages.
- **Server Members Intent**: Must be enabled for member information to be available in ban logs.
- **No Appeals**: The bot is designed for a "zero-tolerance" policy. Anyone who types in the trap channel is banned immediately.
- **24h Purge**: All messages from the banned user in the last 24 hours are automatically deleted server-wide.
- **DM Notification**: The bot attempts to DM the user before banning. This is best-effort and will fail silently if the user has DMs disabled.

---
*Created for secure Discord community management.*
