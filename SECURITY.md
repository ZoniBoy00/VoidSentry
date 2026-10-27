# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability** ([direct link](https://github.com/ZoniBoy00/VoidSentry/security/advisories/new)). Do not open a public issue for them.

This covers the bot and the website at [voidsentry.vercel.app](https://voidsentry.vercel.app), including its dashboard. The website's source is private, so report problems with it here as well.

Include what you found, how to reproduce it and what an attacker could do with it. You will get an answer within a week. Reports in English or Finnish are welcome.

## Supported versions

Only the latest version on `main` is supported. Fixes are not backported.

## Scope

In scope:

- Getting access to a server's settings, ban history or dashboard actions without being its owner or an administrator.
- Getting the bot to ban, unban or skip someone it should not.
- Reading or changing data of other servers or users.
- Leaks of tokens, sessions or stored messages.

Out of scope: denial of service by flooding, problems in Discord itself, and reports from automated scanners without a demonstrated impact.

Please do not test against servers you do not administer, and do not access or keep other people's data beyond what is needed to show the problem.
