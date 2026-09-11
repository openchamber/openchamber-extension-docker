# Docker guest panel for OpenChamber

An OpenChamber extension that provides a GUI panel to inspect containers, manage container states (start, stop, restart, delete), view real-time logs, browse container file systems, and execute commands.

It shells out to the `docker` binary on PATH using host execution permissions (`permissions.exec`).

## Prerequisites

- `docker` CLI installed and accessible on PATH.
- OpenChamber version 1.22.0 or higher.

## Installation

### Option 1: Install from release archive (.zip)

1. Download `docker-extension.zip` from the latest [GitHub Release](https://github.com/openchamber/openchamber-extension-docker/releases).
2. In OpenChamber, open Settings -> Extensions -> Add Extension.
3. Select the downloaded `.zip` archive or extracted directory.
4. Allow local agent execution when prompted.

### Option 2: Install from Git repository

1. In OpenChamber, open Settings -> Extensions -> Add Extension.
2. Provide the Git repository URL:
   `https://github.com/openchamber/openchamber-extension-docker.git`
   *(Or clone the repository locally and select the folder).*
3. Allow local agent execution when prompted.

## Development

If you are modifying the extension source code:

- `bun run bundle`: Bundles `panel/main.ts` into `panel/main.js`.
- `bun run type-check`: Runs TypeScript type checking without emitting files.
- `bun run pack`: Creates `docker-extension.zip` archive ready for distribution.

## CI/CD and Releases

Pushing a version tag (e.g. `v0.1.0`) triggers the GitHub Actions workflow (`.github/workflows/release.yml`), which builds the extension and creates a new GitHub Release with the attached `docker-extension.zip` package.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## License

MIT
