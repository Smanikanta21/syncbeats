# Contributing to SyncBeats

Start with the [README](README.md) and [local development guide](dev/LOCAL_DEVELOPMENT.md). The web client and backend are the current contribution focus. Native clients are experimental; discuss native work before starting a substantial change.

## Choose a contribution

- Report a reproducible bug or improve an unclear setup instruction.
- Look for issues labeled `good first issue` or `help wanted` when maintainers have marked them.
- Discuss larger playback, synchronization, authentication, and schema changes in an issue before implementing them. Include the behavior you want and how you will verify it.

We welcome documentation and accessibility contributions as well as code. You do not need music-service credentials to work on the landing-page demo.

## Send a pull request

1. Fork the repository and create a branch from `nodejs-dev` for web changes.
2. Keep the change focused. Place web work in `dev/frontend`, `dev/syncbeats-server`, or `dev/db-visualizer`.
3. Run the checks for the packages you changed, as listed in the local development guide.
4. Describe the problem, the resulting behavior, and what you tested. Include screenshots for visible changes.
5. For playback changes, create or join the same room in two tabs or devices. Check pause/resume, seeking, queue changes, late joins, and reconnects as appropriate. Automated tests alone do not establish synchronization accuracy.

Use `prisma migrate dev` to create migrations for schema changes. Commit migration SQL and regenerate the client. Do not use `prisma db push` as a substitute for a reviewed migration.

Keep the server authoritative for playback. Any participant can control playback; host-only permissions apply to room management. Preserve byte-range audio serving and adaptive clock/drift parameters. Explain protocol changes in the PR.

Never commit environment files, tokens, cookies, database exports, user data, or copyrighted music without redistribution rights. Report vulnerabilities through [SECURITY.md](SECURITY.md).

## License and conduct

Contributions are offered under the repository's [MIT license](LICENSE), unless a file explicitly carries a different license. Only submit work you have the right to contribute; preserve existing copyright and third-party notices. Follow the [code of conduct](CODE_OF_CONDUCT.md).
