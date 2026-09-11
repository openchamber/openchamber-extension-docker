# Docker guest panel for OpenChamber

An OpenChamber extension that provides a GUI panel to inspect containers, manage container states (start, stop, restart, delete), view real-time logs, browse container file systems, and execute commands.

It shells out to the `docker` binary on PATH using host execution permissions (`permissions.exec`).

## Prerequisites

- `docker` CLI installed and accessible on PATH.
- OpenChamber version 1.22.0 or higher.
- Bun for building.

## Quick start

1. Clone or download this repository.
2. Install dependencies and build the extension panel:

```bash
bun install
bun run bundle
```

3. In OpenChamber, open Settings -> Extensions -> Add Local Extension.
4. Select this directory.
5. Allow local agent execution when prompted.

## Available scripts

- `bun run bundle`: Bundles `panel/main.ts` into `panel/main.js`.
- `bun run type-check`: Runs TypeScript type checking without emitting files.
- `bun run pack`: Creates `.tar.gz` and `.zip` archives ready for distribution.

## CI/CD and Releases

Pushing a version tag (e.g. `v0.1.0`) triggers the GitHub Actions workflow (`.github/workflows/release.yml`), which builds the extension and creates a new GitHub Release with attached `.zip` and `.tar.gz` archives.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## License

MIT
