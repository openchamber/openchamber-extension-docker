# Docker for OpenChamber

Your project's containers next to the chat. The Docker panel puts the Compose stack of the open project first, with live CPU and memory, its ports one click away, and Up, Restart and Down for the whole stack. Other stacks fold below it, then containers on their own.

When a container crashes or turns unhealthy, a line under it says why, read from its last log lines by your Small Model. While the panel is closed, the rail icon counts the containers that crashed since you last looked.

## What's in it

- **The panel.** Click a container for its Logs, Files, Shell and Inspect. Logs follow live, filter, and copy; Files browses the container and opens text files; Shell runs one command at a time in the folder the last one left, with `cd` carrying over; Inspect shows ports, networks, mounts and environment, with values that look like secrets hidden until clicked.
- **Storage.** Disk space by images, build cache, volumes and stopped containers, a cleanup for each, and the images, volumes and networks themselves. Pull an image from here. Everything that deletes asks once on the button before it runs.
- **Work Status.** A section in the chat's Work Status panel with the open project's stack, and Up, Restart and Down in its header. OpenChamber versions that draw extension sections themselves build it from the service's `/status` answer, with no page of its own; older ones load `status/index.html`.
- **`/docker <name>`.** Attaches a container's state and its last 200 log lines to your message, so the agent reads what you see. Without a name it picks the project's container that crashed. "Attach to chat" in the Logs tab does the same.
- **Docker not running.** The panel says which engine the docker CLI uses (Colima, Docker Desktop, OrbStack, Rancher Desktop, Podman) and starts it with one click when it can.

The panel never runs a stack's commands by itself; every change is a click. Without Docker Compose installed, stacks still start, stop and restart container by container, but Up can't create a stack from its file and Down becomes Stop.

## Install

In OpenChamber, open Settings → Extensions and add this repository's Git URL. Approve what it asks for:

- **Local service.** A small process OpenChamber starts next to the panel; it runs `docker` (and `docker compose`), and `colima`, `orb` or `open -a` when you press Start for your engine. It runs with your user's rights, like any command in your terminal.
- **Small Model.** For the one-line crash reasons. Without it, or without a Small Model set, the panel works the same and those lines don't appear.

Requires OpenChamber 2.5.0 or newer and the `docker` CLI. Web and desktop; the phone app and VS Code don't load extensions.

## How it stays light

The service watches `docker events` instead of polling, so the container list changes when Docker says it did. `docker stats` runs only while a panel or the Work Status section is on screen, and stops twenty seconds after the last look. With nothing open for ninety seconds, both stop. A closed panel asks for new crashes every fifteen seconds; that reads the crashes the service already saw in the events and starts no Docker command while Docker is up.

Logs arrive in steps: the last 500 lines, then only what's new every two seconds.

## Build

```bash
bun install
bun run build      # writes panel/main.js, status/main.js, background/main.js and service/main.js
bun run test
bun run typecheck
bun run pack       # docker-extension.zip
```

The built files are committed: OpenChamber installs extensions from Git without building them. Bump `version` in `package.json` to ship an update.

## License

MIT
