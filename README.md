# 🔨 VoidSentry (Security Trap)

![VoidSentry Banner](./assets/VoidSentryBanner.gif)

A high-performance security bot designed to catch and remove self-bots and malicious users who ignore server warnings. The bot monitors a specific "Trap" channel and instantly bans anyone who sends a message there.

## 🚀 Features

- **Instant Detection**: Real-time monitoring of restricted channels.
- **Auto-Cleanup**: Automatically deletes the intruder's message instantly.
- **Slash Commands**: Professional `/setup-trap` command to initialize the channel.
- **Security Logs**: Detailed embed-based logging in a dedicated administration channel.
- **Branded Design**: Custom logo and professional embeds for a high-end look.

## 🖼️ Branding

The project includes custom branding under the name **VoidSentry**.
- **Logo**: `logo.png` is located in the `assets/` directory.
- **Identity**: All system messages and logs are branded with the VoidSentry icon and name.

## 🛠️ Installation

1.  **Requirement**: [Node.js](https://nodejs.org/) v16.11.0 or higher.
2.  **Download**: Clone or download this repository.
3.  **Install Libraries**:
    ```bash
    npm install
    ```

## ⚙️ Configuration (.env)

Edit the `.env` file with your credentials:

| Key | Description |
| :--- | :--- |
| `DISCORD_TOKEN` | Your bot's secret token from the Developer Portal. |
| `CLIENT_ID` | Your bot's Application ID. |
| `BAN_CHANNEL_IDS` | IDs of the "Trap" channels, separated by commas (e.g., `123,456`). |
| `LOG_CHANNEL_ID` | The ID of the channel where ban reports are sent. |

## 🕹️ How to Use

1.  **Invite the Bot**: Ensure the bot has `Ban Members`, `Manage Messages`, and `View Channels` permissions.
2.  **Role Hierarchy**: Move the bot's role to the **very top** of your Role list.
3.  **Multi-Channel Support**: In `.env`, you can list multiple channels:
    `BAN_CHANNEL_IDS=10111222333,40444555666`
4.  **Launch**: `node index.js`
5.  **Initialize**: Go to **each** trap channel and use the `/setup-trap` command.

## 📝 Important Notes

- **Message Content Intent**: Must be enabled in the Discord Developer Portal for the bot to read messages.
- **No Appeals**: The bot is designed for a "zero-tolerance" policy. Anyone who types in the trap channel is banned immediately without confirmation.

---
*Created for secure Discord community management.*
