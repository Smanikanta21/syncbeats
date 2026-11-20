# Security policy

## Report a vulnerability privately

Use GitHub's [Report a vulnerability](https://github.com/Smanikanta21/syncbeats/security/advisories/new) form for authentication flaws, exposed credentials, unauthorized room access, user-data exposure, and other security issues. Do not put credentials, exploit details, or personal data in public issues or pull requests.

Include the affected commit or version, reproduction steps, expected and observed behavior, and likely impact. Use synthetic accounts and data. Maintainers will review reports as capacity allows; this student-led project does not promise a response-time SLA.

If the private reporting form is unavailable, open an issue asking maintainers to enable private reporting. Include no vulnerability details.

## Supported code

There are no designated long-term support releases. Security fixes target the current maintained web code; experimental native clients and old commits may not receive backports. The hosted service and self-hosted deployments can run different revisions.

## Credentials and deployments

- Use separate local, staging, and production credentials. Keep `.env` files and provider cookies outside Git.
- If a credential has been committed, revoke or rotate it at the provider. Removing a file or rewriting history does not invalidate it.
- Keep the database visualizer on a trusted local or private network and configure its authentication before exposing it.
- Do not pass deployment credentials to untrusted pull requests. Self-hosting requires reviewing environment settings and dependencies.

Maintainers track publication prerequisites in the [open-source launch checklist](docs/OPEN_SOURCE_PLAN.md).
