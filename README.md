# Docker guest panel for OpenChamber

An OpenChamber extension that provides a GUI panel to inspect containers, manage container states (start, stop, restart, delete), view real-time logs, browse container file systems, and execute commands.

It shells out to the `docker` binary on PATH using host execution permissions (`permissions.exec`).

## Prerequisites

- `docker` CLI installed and accessible on PATH.
- OpenChamber version 1.22.0 or higher.
- Bun for building from source.

## Installation

### Option 1: Install from release archive (.zip or .tar.gz)

1. Download `docker-extension.zip` or `docker-extension.tar.gz` from the latest [GitHub Release](https://github.com/openchamber/openchamber-extension-docker/releases).
2. Extract the archive into a directory on your machine.
3. In OpenChamber, open Settings -> Extensions -> Add Local Extension.
4. Select the extracted directory.
5. Allow local agent execution when prompted.

### Option 2: Install from Git source

1. Clone this repository:

```bash
git clone git@github.com:openchamber/openchamber-extension-docker.git
cd openchamber-extension-docker
```

2. Install dependencies and build the extension panel:

```bash
bun install
bun run bundle
```

3. In OpenChamber, open Settings -> Extensions -> Add Local Extension.
4. Select the repository directory.
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
