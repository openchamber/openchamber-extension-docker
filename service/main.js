// src/service/main.ts
import http from "node:http";

// src/service/actions.ts
import { existsSync as existsSync2 } from "node:fs";
import { isAbsolute, join as join2 } from "node:path";

// src/service/docker.ts
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
var EXTRA_PATH = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  join(homedir(), ".orbstack", "bin"),
  join(homedir(), ".rd", "bin"),
  "/Applications/Docker.app/Contents/Resources/bin"
];
var currentPath = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
process.env.PATH = [...currentPath, ...EXTRA_PATH.filter((dir) => !currentPath.includes(dir) && existsSync(dir))].join(delimiter);
var hasBinary = (name) => (process.env.PATH ?? "").split(delimiter).some((dir) => existsSync(join(dir, name)) || existsSync(join(dir, `${name}.exe`)));

class CommandError extends Error {
  stdout;
  stderr;
  exitCode;
  missing;
  constructor(message, stdout, stderr, exitCode, missing) {
    super(message);
    this.stdout = stdout;
    this.stderr = stderr;
    this.exitCode = exitCode;
    this.missing = missing;
  }
}
var errorLine = (stderr, fallback) => {
  const line = stderr.split(`
`).map((part) => part.trim()).find(Boolean) ?? "";
  return line.replace(/^Error( response from daemon)?:\s*/i, "") || fallback;
};
var run = (command, args, options = {}) => new Promise((resolve, reject) => {
  execFile(command, args, {
    encoding: "utf8",
    timeout: options.timeout ?? 15000,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    cwd: options.cwd,
    windowsHide: true
  }, (error, stdout, stderr) => {
    if (!error) {
      resolve({ stdout, stderr });
      return;
    }
    const code = error.code;
    const missing = code === "ENOENT";
    const exitCode = typeof code === "number" ? code : null;
    const message = missing ? `${command} is not installed` : error.killed ? `${command} ${args[0] ?? ""} took too long` : errorLine(stderr, error.message);
    reject(new CommandError(message, stdout ?? "", stderr ?? "", exitCode, missing));
  });
});
var docker = (args, options) => run("docker", args, options);
var dockerBytes = (args, options = {}) => new Promise((resolve, reject) => {
  execFile("docker", args, {
    encoding: "buffer",
    timeout: options.timeout ?? 15000,
    maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024,
    windowsHide: true
  }, (error, stdout, stderr) => {
    if (error)
      reject(new CommandError(errorLine(stderr.toString("utf8"), error.message), "", stderr.toString("utf8"), null, false));
    else
      resolve(stdout);
  });
});
var streamLines = (args, onLine, onExit) => {
  const child = spawn("docker", args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  let buffer = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf(`
`);
    while (newline >= 0) {
      onLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf(`
`);
    }
    if (buffer.length > 1024 * 1024)
      buffer = "";
  });
  child.on("error", () => onExit(null));
  child.on("exit", (code) => onExit(code));
  return child;
};
var isContainerRef = (value) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/.test(value);

// src/service/parse.ts
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var text = (value) => typeof value === "string" ? value : value == null ? "" : String(value);
var num = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : null;
};
var parseJsonLines = (stdout) => stdout.split(`
`).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
  try {
    const value = JSON.parse(line);
    return isRecord(value) ? [value] : [];
  } catch {
    return [];
  }
});
var UNITS = {
  b: 1,
  kb: 1000,
  mb: 1e6,
  gb: 1e9,
  tb: 1000000000000,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4
};
var parseSize = (value) => {
  const match = /^\s*([\d.]+)\s*([a-zA-Z]*)\s*$/.exec(value);
  if (!match)
    return null;
  const amount = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(amount))
    return null;
  const unit = (match[2] ?? "b").toLowerCase() || "b";
  const factor = UNITS[unit];
  return factor === undefined ? null : Math.round(amount * factor);
};
var ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
var parseStatsLine = (line) => {
  const clean = line.replace(ANSI, "").trim();
  if (!clean.startsWith("{"))
    return null;
  let row;
  try {
    row = JSON.parse(clean);
  } catch {
    return null;
  }
  if (!isRecord(row))
    return null;
  const id = text(row.ID || row.Container).trim();
  if (!id)
    return null;
  const [used = "", limit = ""] = text(row.MemUsage).split("/");
  const cpuText = text(row.CPUPerc).replace("%", "").trim();
  return {
    id,
    cpu: cpuText && cpuText !== "--" ? num(cpuText) : null,
    memory: parseSize(used),
    memoryLimit: parseSize(limit)
  };
};
var STATES = ["running", "paused", "restarting", "exited", "created", "dead", "removing"];
var HEALTH = ["healthy", "unhealthy", "starting"];
var realTime = (value) => {
  const raw = text(value);
  return raw && !raw.startsWith("0001-") ? raw : null;
};
var publishedPorts = (info) => {
  const settings = isRecord(info.NetworkSettings) ? info.NetworkSettings : {};
  const map = isRecord(settings.Ports) ? settings.Ports : {};
  const byKey = new Map;
  for (const [key, bindings] of Object.entries(map)) {
    const [containerPortText, protocol = "tcp"] = key.split("/");
    const containerPort = num(containerPortText);
    if (containerPort === null || !Array.isArray(bindings))
      continue;
    for (const binding of bindings) {
      if (!isRecord(binding))
        continue;
      const hostPort = num(binding.HostPort);
      if (hostPort === null || hostPort <= 0)
        continue;
      const hostIp = text(binding.HostIp) || "0.0.0.0";
      const dedupe = `${hostPort}/${protocol}`;
      const previous = byKey.get(dedupe);
      if (!previous || previous.hostIp.includes(":") && !hostIp.includes(":")) {
        byKey.set(dedupe, { hostIp, hostPort, containerPort, protocol });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.hostPort - b.hostPort);
};
var composeFromLabels = (labels) => {
  const project = text(labels["com.docker.compose.project"]).trim();
  if (!project)
    return null;
  const files = text(labels["com.docker.compose.project.config_files"]).trim();
  return {
    project,
    service: text(labels["com.docker.compose.service"]).trim(),
    workingDir: text(labels["com.docker.compose.project.working_dir"]).trim() || null,
    configFiles: files ? files.split(",").map((file) => file.trim()).filter(Boolean) : []
  };
};
var containerFromInspect = (info) => {
  const id = text(info.Id);
  if (!id)
    return null;
  const state = isRecord(info.State) ? info.State : {};
  const config = isRecord(info.Config) ? info.Config : {};
  const labels = isRecord(config.Labels) ? config.Labels : {};
  const status = text(state.Status);
  const health = isRecord(state.Health) ? text(state.Health.Status) : null;
  const exitCode = num(state.ExitCode);
  return {
    id,
    name: text(info.Name).replace(/^\//, "") || id.slice(0, 12),
    image: text(config.Image),
    state: STATES.includes(status) ? status : "created",
    health: health && HEALTH.includes(health) ? health : null,
    exitCode: status === "exited" || status === "dead" ? exitCode : null,
    oomKilled: state.OOMKilled === true,
    createdAt: text(info.Created),
    startedAt: realTime(state.StartedAt),
    finishedAt: realTime(state.FinishedAt),
    restartCount: num(info.RestartCount) ?? 0,
    ports: publishedPorts(info),
    compose: composeFromLabels(labels),
    cpu: null,
    memory: null,
    memoryLimit: null
  };
};
var joinCommand = (value) => Array.isArray(value) ? value.map(text).join(" ") : text(value);
var inspectDetails = (info) => {
  const config = isRecord(info.Config) ? info.Config : {};
  const host = isRecord(info.HostConfig) ? info.HostConfig : {};
  const restart = isRecord(host.RestartPolicy) ? host.RestartPolicy : {};
  const settings = isRecord(info.NetworkSettings) ? info.NetworkSettings : {};
  const networks = isRecord(settings.Networks) ? settings.Networks : {};
  const labels = isRecord(config.Labels) ? config.Labels : {};
  const mounts = Array.isArray(info.Mounts) ? info.Mounts.filter(isRecord).map((mount) => ({
    type: text(mount.Type),
    name: text(mount.Name),
    source: text(mount.Source),
    destination: text(mount.Destination),
    rw: mount.RW !== false
  })) : [];
  const attachments = Object.entries(networks).map(([name, value]) => {
    const network = isRecord(value) ? value : {};
    return {
      name,
      ip: text(network.IPAddress),
      aliases: Array.isArray(network.Aliases) ? network.Aliases.map(text).filter(Boolean) : []
    };
  });
  return {
    id: text(info.Id),
    name: text(info.Name).replace(/^\//, ""),
    image: text(config.Image),
    imageId: text(info.Image),
    createdAt: text(info.Created),
    command: joinCommand(config.Cmd),
    entrypoint: joinCommand(config.Entrypoint),
    workingDir: text(config.WorkingDir),
    user: text(config.User),
    restartPolicy: text(restart.Name) || "no",
    restartCount: num(info.RestartCount) ?? 0,
    env: Array.isArray(config.Env) ? config.Env.map(text) : [],
    labels: Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, text(value)])),
    mounts,
    networks: attachments,
    ports: publishedPorts(info)
  };
};
var classifyEndpoint = (endpoint, platform, dockerDesktopInstalled) => {
  const value = endpoint ?? "";
  const colima = /\/\.colima\/([^/]+)\/docker\.sock$/.exec(value);
  if (colima)
    return { kind: "colima", name: "Colima", profile: colima[1] ?? "default" };
  if (value.includes("/.orbstack/"))
    return { kind: "orbstack", name: "OrbStack", profile: null };
  if (value.includes("/.rd/"))
    return { kind: "rancher-desktop", name: "Rancher Desktop", profile: null };
  if (value.includes("podman"))
    return { kind: "podman", name: "Podman", profile: null };
  if (value.startsWith("tcp://") || value.startsWith("ssh://"))
    return { kind: "remote", name: "Remote Docker", profile: null };
  if (value.startsWith("npipe:"))
    return { kind: "docker-desktop", name: "Docker Desktop", profile: null };
  if (value.includes("/.docker/run/docker.sock") || value.includes("/.docker/desktop/")) {
    return { kind: "docker-desktop", name: "Docker Desktop", profile: null };
  }
  if (value.endsWith("/var/run/docker.sock") || value === "") {
    if (platform === "linux")
      return { kind: "docker-engine", name: "Docker Engine", profile: null };
    if (dockerDesktopInstalled)
      return { kind: "docker-desktop", name: "Docker Desktop", profile: null };
  }
  return { kind: "unknown", name: "Docker", profile: null };
};
var composeProjectName = (directory) => {
  const base = directory.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  return base.toLowerCase().replace(/[^a-z0-9_-]/g, "").replace(/^[^a-z0-9]+/, "");
};
var COMPOSE_FILES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];
var normalizeTimestamp = (value) => {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match)
    return null;
  const fraction = (match[2] ?? "").slice(0, 9).padEnd(9, "0");
  return `${match[1]}.${fraction}${match[3]}`;
};
var parseLogText = (output, stream) => {
  const entries = [];
  for (const line of output.split(`
`)) {
    if (line === "")
      continue;
    const space = line.indexOf(" ");
    const stamp = space > 0 ? normalizeTimestamp(line.slice(0, space)) : null;
    if (stamp) {
      entries.push({ t: stamp, s: stream, m: line.slice(space + 1).replace(/\r$/, "") });
    } else {
      const last = entries[entries.length - 1];
      if (last)
        last.m += `
${line}`;
    }
  }
  return entries;
};
var mergeLogs = (out, err) => {
  const merged = [];
  let i = 0;
  let j = 0;
  while (i < out.length || j < err.length) {
    const a = out[i];
    const b = err[j];
    if (a && (!b || a.t <= b.t)) {
      merged.push(a);
      i += 1;
    } else if (b) {
      merged.push(b);
      j += 1;
    }
  }
  return merged;
};
var DISK_KINDS = {
  images: "images",
  containers: "containers",
  "local volumes": "volumes",
  "build cache": "build-cache"
};
var parseDiskUsage = (rows) => rows.flatMap((row) => {
  const kind = DISK_KINDS[text(row.Type).trim().toLowerCase()];
  if (!kind)
    return [];
  return [{
    kind,
    total: num(row.TotalCount) ?? 0,
    active: num(row.Active) ?? 0,
    size: parseSize(text(row.Size)) ?? 0,
    reclaimable: parseSize(text(row.Reclaimable).split("(")[0] ?? "") ?? 0
  }];
});
var CWD_MARK = "\x1EOC_CWD ";
var splitExecOutput = (stdout) => {
  const at = stdout.lastIndexOf(CWD_MARK);
  if (at < 0)
    return { output: stdout, cwd: null };
  const cwd = stdout.slice(at + CWD_MARK.length).split(`
`)[0]?.trim() || null;
  return { output: stdout.slice(0, at).replace(/\n$/, ""), cwd };
};

// src/service/inside.ts
class AnswerError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
var LOG_TAIL_MAX = 5000;
var LOG_BYTES_MAX = 6 * 1024 * 1024;
var FS_LIST_MAX = 1000;
var FS_FILE_MAX = 512 * 1024;
var EXEC_OUTPUT_MAX = 256 * 1024;
var noShell = (error) => error instanceof CommandError && /executable file not found|no such file or directory.*sh|OCI runtime exec failed/i.test(error.stderr);
var NO_SHELL = "This image has no shell (sh), so its files and commands can't be reached from here.";
var readLogs = async (id, tail, since) => {
  const lines = Math.min(Math.max(Math.trunc(tail) || 500, 1), LOG_TAIL_MAX);
  const args = ["logs", "--timestamps", "--tail", String(lines)];
  if (since)
    args.push("--since", since);
  args.push("--", id);
  try {
    const { stdout, stderr } = await docker(args, { timeout: 15000, maxBuffer: LOG_BYTES_MAX * 2 });
    let entries = mergeLogs(parseLogText(stdout, "out"), parseLogText(stderr, "err"));
    if (since)
      entries = entries.filter((entry) => entry.t > since);
    let truncated = false;
    let size = entries.reduce((sum, entry) => sum + entry.m.length + 40, 0);
    while (size > LOG_BYTES_MAX && entries.length > 0) {
      size -= (entries.shift()?.m.length ?? 0) + 40;
      truncated = true;
    }
    return { entries, truncated };
  } catch (error) {
    if (error instanceof CommandError && /No such container/i.test(error.stderr))
      throw new AnswerError(404, "This container is gone.");
    if (error instanceof CommandError && /does not support reading|configured logging driver/i.test(error.stderr)) {
      throw new AnswerError(409, "This container's logging driver keeps no logs Docker can read back.");
    }
    throw error;
  }
};
var inspect = async (id) => {
  try {
    const { stdout } = await docker(["inspect", "--type", "container", "--", id]);
    const raw = JSON.parse(stdout)[0];
    if (!raw)
      throw new AnswerError(404, "This container is gone.");
    return { ...inspectDetails(raw), raw };
  } catch (error) {
    if (error instanceof CommandError && /No such/i.test(error.stderr))
      throw new AnswerError(404, "This container is gone.");
    throw error;
  }
};
var normalizeContainerPath = (raw) => {
  const value = raw.trim() || "/";
  if (!value.startsWith("/") || value.includes("\x00"))
    return null;
  const parts = [];
  for (const segment of value.split("/")) {
    if (!segment || segment === ".")
      continue;
    if (segment === "..")
      return null;
    parts.push(segment);
  }
  return `/${parts.join("/")}`;
};
var LIST_SCRIPT = `
p="$1"; max="$2"
if [ ! -e "$p" ]; then echo "__OC_MISSING__"; exit 0; fi
if [ ! -d "$p" ]; then echo "__OC_NOT_DIR__"; exit 0; fi
entries() {
  if command -v find >/dev/null 2>&1; then find "$p" -mindepth 1 -maxdepth 1 2>/dev/null
  else ls -A "$p" 2>/dev/null | while IFS= read -r n; do if [ "$p" = "/" ]; then echo "/$n"; else echo "$p/$n"; fi; done; fi
}
n=0
entries | while IFS= read -r c; do
  n=$((n + 1)); if [ "$n" -gt "$max" ]; then echo "__OC_TRUNC__"; break; fi
  name="\${c##*/}"
  if [ -L "$c" ]; then printf 'link\\t%s\\n' "$name"
  elif [ -d "$c" ]; then printf 'dir\\t%s\\n' "$name"
  elif [ -f "$c" ]; then printf 'file\\t%s\\n' "$name"
  else printf 'other\\t%s\\n' "$name"; fi
done`;
var listDir = async (id, path) => {
  let stdout;
  try {
    ({ stdout } = await docker(["exec", "--", id, "sh", "-c", LIST_SCRIPT, "sh", path, String(FS_LIST_MAX)], { timeout: 12000 }));
  } catch (error) {
    if (noShell(error))
      throw new AnswerError(409, NO_SHELL);
    throw error;
  }
  const lines = stdout.replace(/\r/g, "").split(`
`).filter(Boolean);
  if (lines[0] === "__OC_MISSING__")
    throw new AnswerError(404, "Nothing at this path.");
  if (lines[0] === "__OC_NOT_DIR__")
    throw new AnswerError(409, "Not a folder.");
  const entries = lines.flatMap((line) => {
    const tab = line.indexOf("\t");
    if (tab <= 0)
      return [];
    const kind = line.slice(0, tab);
    const name = line.slice(tab + 1);
    if (!name || name === "." || name === "..")
      return [];
    const type = kind === "dir" || kind === "file" || kind === "link" ? kind : "other";
    return [{ name, type }];
  });
  entries.sort((a, b) => a.type === "dir" === (b.type === "dir") ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1);
  return { path, entries, truncated: lines.includes("__OC_TRUNC__") };
};
var READ_SCRIPT = `
p="$1"
if [ -d "$p" ]; then printf '%s' "__OC_DIR__"; exit 0; fi
if [ ! -f "$p" ]; then printf '%s' "__OC_MISSING__"; exit 0; fi
head -c "$2" "$p" 2>/dev/null`;
var readFile = async (id, path) => {
  let buffer;
  try {
    buffer = await dockerBytes(["exec", "--", id, "sh", "-c", READ_SCRIPT, "sh", path, String(FS_FILE_MAX + 1)], {
      timeout: 12000,
      maxBuffer: FS_FILE_MAX + 64 * 1024
    });
  } catch (error) {
    if (noShell(error))
      throw new AnswerError(409, NO_SHELL);
    throw error;
  }
  const head = buffer.subarray(0, 16).toString("utf8");
  if (head === "__OC_MISSING__")
    throw new AnswerError(404, "Nothing at this path.");
  if (head === "__OC_DIR__")
    throw new AnswerError(409, "This is a folder.");
  const truncated = buffer.length > FS_FILE_MAX;
  const body = buffer.subarray(0, FS_FILE_MAX);
  const binary = body.includes(0);
  return { path, binary, truncated, size: body.length, content: binary ? null : body.toString("utf8") };
};
var EXEC_SCRIPT = `cd -- "$1" 2>/dev/null || cd /
eval "$2" 2>&1
s=$?
printf '\\n${CWD_MARK}%s\\n' "$(pwd)"
exit $s`;
var execCommand = async (id, command, cwd) => {
  const args = ["exec", "--", id, "sh", "-c", EXEC_SCRIPT, "sh", cwd, command];
  let stdout = "";
  let exitCode = 0;
  try {
    ({ stdout } = await docker(args, { timeout: 18000, maxBuffer: 8 * 1024 * 1024 }));
  } catch (error) {
    if (!(error instanceof CommandError))
      throw error;
    if (/is not running|is paused/i.test(error.stderr))
      throw new AnswerError(409, "Start the container to run commands in it.");
    if (noShell(error) && !error.stdout.includes(CWD_MARK))
      throw new AnswerError(409, NO_SHELL);
    if (/took too long/.test(error.message))
      throw new AnswerError(408, "The command ran longer than 18 seconds and was stopped. Long-running commands belong in a terminal.");
    stdout = error.stdout;
    exitCode = error.exitCode ?? 1;
    if (!stdout)
      return { output: error.message, exitCode, cwd, truncated: false };
  }
  const split = splitExecOutput(stdout);
  const truncated = split.output.length > EXEC_OUTPUT_MAX;
  return {
    output: truncated ? split.output.slice(-EXEC_OUTPUT_MAX) : split.output,
    exitCode,
    cwd: split.cwd ?? cwd,
    truncated
  };
};

// src/service/jobs.ts
import { spawn as spawn2 } from "node:child_process";
var OUTPUT_KEEP = 16000;
var FINISHED_KEEP_MS = 120000;
var counter = 0;
var jobs = [];
var prune = (now) => {
  for (let i = jobs.length - 1;i >= 0; i -= 1) {
    const job = jobs[i];
    if (job && job.endedAt !== null && now - job.endedAt > FINISHED_KEEP_MS)
      jobs.splice(i, 1);
  }
};
var listJobs = () => {
  prune(Date.now());
  return jobs.map((job) => ({ ...job }));
};
var runningJob = (kind, target) => jobs.find((job) => job.kind === kind && job.target === target && job.state === "running");
var runStep = (argv, cwd, timeoutMs, append) => new Promise((resolve) => {
  const [command, ...args] = argv;
  if (!command) {
    resolve(1);
    return;
  }
  const child = spawn2(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const timer = setTimeout(() => {
    append(`
${command} took longer than ${Math.round(timeoutMs / 60000)} min and was stopped.`);
    child.kill("SIGTERM");
  }, timeoutMs);
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  child.on("error", (error) => {
    append(error.code === "ENOENT" ? `${command} is not installed.` : error.message);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    resolve(code);
  });
});
var startJob = (spec) => {
  const existing = runningJob(spec.kind, spec.target);
  if (existing)
    return existing;
  counter += 1;
  const job = {
    id: `job-${counter}`,
    kind: spec.kind,
    target: spec.target,
    action: spec.action,
    label: spec.label,
    state: "running",
    startedAt: Date.now(),
    endedAt: null,
    output: ""
  };
  jobs.push(job);
  const append = (text) => {
    job.output = (job.output + text.replace(/\r(?!\n)/g, `
`)).slice(-OUTPUT_KEEP);
  };
  (async () => {
    let ok = true;
    for (const step of spec.steps) {
      const code = await runStep(step.argv, step.cwd, spec.timeoutMs, append);
      if (code !== 0) {
        ok = false;
        break;
      }
    }
    job.state = ok ? "done" : "failed";
    job.endedAt = Date.now();
    job.output = job.output.trim();
    spec.onDone?.(job);
  })();
  return job;
};

// src/service/storage.ts
var CACHE_MS = 15000;
var BUILT_IN_NETWORKS = new Set(["bridge", "host", "none"]);
var cached = null;
var forgetStorage = () => {
  cached = null;
};
var usage = async (containers) => {
  const images = new Set;
  const volumes = new Set;
  const networks = new Set;
  const ids = containers.map((row) => row.id);
  for (let i = 0;i < ids.length; i += 50) {
    const { stdout } = await docker(["inspect", "--type", "container", "--", ...ids.slice(i, i + 50)]).catch(() => ({ stdout: "[]" }));
    for (const info of JSON.parse(stdout)) {
      if (typeof info.Image === "string")
        images.add(info.Image);
      for (const mount of Array.isArray(info.Mounts) ? info.Mounts : []) {
        if (mount.Type === "volume" && typeof mount.Name === "string")
          volumes.add(mount.Name);
      }
      const settings = info.NetworkSettings ?? {};
      for (const [name, value] of Object.entries(settings.Networks ?? {})) {
        networks.add(name);
        if (typeof value?.NetworkID === "string")
          networks.add(value.NetworkID);
      }
    }
  }
  return { images, volumes, networks };
};
var readStorage = async (containers) => {
  if (cached && Date.now() - cached.at < CACHE_MS)
    return cached.answer;
  const [df, imageLines, volumeLines, networkLines, used] = await Promise.all([
    docker(["system", "df", "--format", "{{json .}}"], { timeout: 30000 }),
    docker(["image", "ls", "--no-trunc", "--format", "{{json .}}"]),
    docker(["volume", "ls", "--format", "{{json .}}"]),
    docker(["network", "ls", "--no-trunc", "--format", "{{json .}}"]),
    usage(containers)
  ]);
  const images = parseJsonLines(imageLines.stdout).map((row) => {
    const id = String(row.ID ?? "");
    const repository = String(row.Repository ?? "<none>");
    return {
      id,
      repository,
      tag: String(row.Tag ?? "<none>"),
      size: parseSize(String(row.Size ?? "")) ?? 0,
      createdSince: String(row.CreatedSince ?? ""),
      used: used.images.has(id),
      dangling: repository === "<none>"
    };
  });
  const volumes = parseJsonLines(volumeLines.stdout).map((row) => {
    const name = String(row.Name ?? "");
    const project = /com\.docker\.compose\.project=([^,]+)/.exec(String(row.Labels ?? ""))?.[1] ?? null;
    return { name, driver: String(row.Driver ?? ""), used: used.volumes.has(name), project };
  });
  const networks = parseJsonLines(networkLines.stdout).map((row) => {
    const id = String(row.ID ?? "");
    const name = String(row.Name ?? "");
    return {
      id,
      name,
      driver: String(row.Driver ?? ""),
      used: used.networks.has(name) || used.networks.has(id),
      builtIn: BUILT_IN_NETWORKS.has(name)
    };
  });
  const answer = { disk: parseDiskUsage(parseJsonLines(df.stdout)), images, volumes, networks };
  cached = { at: Date.now(), answer };
  return answer;
};

// src/service/actions.ts
var MINUTE = 60000;
var CONTAINER_ACTIONS = ["start", "stop", "restart", "pause", "unpause", "remove"];
var PRESENT = {
  start: "Starting",
  stop: "Stopping",
  restart: "Restarting",
  pause: "Pausing",
  unpause: "Resuming",
  remove: "Removing"
};
var containerAction = (monitor, id, action) => {
  const row = monitor.container(id);
  if (!row || !isContainerRef(row.id))
    throw new AnswerError(404, "This container is gone.");
  const argv = action === "remove" ? ["docker", "rm", "-f", "--", row.id] : ["docker", action, "--", row.id];
  return startJob({
    kind: "container",
    target: row.id,
    action,
    label: `${PRESENT[action]} ${row.name}`,
    steps: [{ argv }],
    timeoutMs: 3 * MINUTE,
    onDone: () => {
      monitor.refresh();
      if (action === "remove")
        forgetStorage();
    }
  });
};
var STACK_ACTIONS = ["up", "down", "restart", "stop", "start"];
var STACK_PRESENT = {
  up: "Starting",
  down: "Taking down",
  restart: "Restarting",
  stop: "Stopping",
  start: "Starting"
};
var stackAction = async (monitor, request) => {
  const { action, project } = request;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(project))
    throw new AnswerError(400, "That is not a Compose project name.");
  const label = `${STACK_PRESENT[action]} ${project}`;
  const members = (await monitor.snapshot(null)).containers.filter((row) => row.compose?.project === project);
  const compose = await monitor.composeCommand();
  const done = () => {
    monitor.refresh();
    forgetStorage();
  };
  if (!compose) {
    if (action === "up" && members.length === 0) {
      throw new AnswerError(409, "Docker Compose is not installed, so a stack can't be created from its file. Install the compose plugin, then try again.");
    }
    const verb = action === "up" ? "start" : action === "down" ? "stop" : action;
    return startJob({
      kind: "stack",
      target: project,
      action,
      label,
      steps: [{ argv: ["docker", verb, "--", ...members.map((row) => row.id)] }],
      timeoutMs: 5 * MINUTE,
      onDone: done
    });
  }
  const workingDir = request.workingDir && isAbsolute(request.workingDir) && existsSync2(request.workingDir) ? request.workingDir : null;
  const files = request.configFiles.map((file) => isAbsolute(file) || !workingDir ? file : join2(workingDir, file)).filter((file) => isAbsolute(file) && existsSync2(file));
  if (action === "up" && files.length === 0) {
    throw new AnswerError(409, `The Compose file for ${project} is no longer where it was started from.`);
  }
  const argv = [...compose, "-p", project];
  if (workingDir)
    argv.push("--project-directory", workingDir);
  for (const file of files)
    argv.push("-f", file);
  argv.push(...action === "up" ? ["up", "-d"] : [action]);
  return startJob({
    kind: "stack",
    target: project,
    action,
    label,
    steps: [{ argv, cwd: workingDir ?? undefined }],
    timeoutMs: (action === "up" ? 20 : 5) * MINUTE,
    onDone: done
  });
};
var pullImage = (monitor, ref) => {
  const clean = ref.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,254}$/.test(clean))
    throw new AnswerError(400, "That doesn't look like an image name, such as nginx:alpine.");
  return startJob({
    kind: "pull",
    target: clean,
    action: "pull",
    label: `Pulling ${clean}`,
    steps: [{ argv: ["docker", "pull", clean] }],
    timeoutMs: 20 * MINUTE,
    onDone: () => {
      forgetStorage();
      monitor.refresh();
    }
  });
};
var PRUNE = {
  images: { argv: ["docker", "image", "prune", "-a", "-f"], label: "Removing unused images" },
  "build-cache": { argv: ["docker", "builder", "prune", "-a", "-f"], label: "Clearing the build cache" },
  volumes: { argv: ["docker", "volume", "prune", "-a", "-f"], label: "Removing unused volumes" },
  containers: { argv: ["docker", "container", "prune", "-f"], label: "Removing stopped containers" }
};
var prune2 = (monitor, kind) => startJob({
  kind: "prune",
  target: kind,
  action: kind,
  label: PRUNE[kind].label,
  steps: [{ argv: PRUNE[kind].argv }],
  timeoutMs: 15 * MINUTE,
  onDone: () => {
    forgetStorage();
    monitor.refresh();
  }
});
var removeResource = (kind, ref, name) => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]{0,254}$/.test(ref))
    throw new AnswerError(400, "That is not a Docker reference.");
  return startJob({
    kind: "remove",
    target: `${kind}:${ref}`,
    action: kind,
    label: `Removing ${name}`,
    steps: [{ argv: ["docker", kind, "rm", "--", ref] }],
    timeoutMs: 2 * MINUTE,
    onDone: forgetStorage
  });
};
var startEngine = (monitor, name) => {
  const argv = monitor.startArgv;
  if (!argv)
    throw new AnswerError(409, `This panel can't start ${name}; start it yourself.`);
  return startJob({
    kind: "engine",
    target: "engine",
    action: "start",
    label: `Starting ${name}`,
    steps: [{ argv }],
    timeoutMs: 10 * MINUTE,
    onDone: () => monitor.recheckEngine()
  });
};

// src/service/monitor.ts
import { existsSync as existsSync4 } from "node:fs";
import { join as join3 } from "node:path";

// src/service/engine.ts
import { existsSync as existsSync3 } from "node:fs";
var readContext = async () => {
  try {
    const { stdout } = await docker(["context", "inspect", "--format", "{{json .}}"], { timeout: 5000 });
    const value = JSON.parse(stdout.trim().split(`
`)[0] ?? "{}");
    return { name: value.Name ?? null, endpoint: value.Endpoints?.docker?.Host ?? null };
  } catch {
    return { name: null, endpoint: null };
  }
};
var startFor = (engine, platform) => {
  const darwin = platform === "darwin";
  switch (engine.kind) {
    case "colima": {
      const argv = engine.profile && engine.profile !== "default" ? ["colima", "start", engine.profile] : ["colima", "start"];
      const canRun = hasBinary("colima");
      return { start: { display: argv.join(" "), canRun }, argv: canRun ? argv : null };
    }
    case "docker-desktop":
      return darwin ? { start: { display: "open -a Docker", canRun: true }, argv: ["open", "-a", "Docker"] } : { start: { display: "Start Docker Desktop", canRun: false }, argv: null };
    case "orbstack":
      if (hasBinary("orb"))
        return { start: { display: "orb start", canRun: true }, argv: ["orb", "start"] };
      return darwin ? { start: { display: "open -a OrbStack", canRun: true }, argv: ["open", "-a", "OrbStack"] } : null;
    case "rancher-desktop":
      return darwin ? { start: { display: 'open -a "Rancher Desktop"', canRun: true }, argv: ["open", "-a", "Rancher Desktop"] } : { start: { display: "Start Rancher Desktop", canRun: false }, argv: null };
    case "podman":
      return { start: { display: "podman machine start", canRun: false }, argv: null };
    case "docker-engine":
      return { start: { display: "sudo systemctl start docker", canRun: false }, argv: null };
    default:
      return null;
  }
};
var probeEngine = async () => {
  const context = await readContext();
  let kind = classifyEndpoint(context.endpoint, process.platform, existsSync3("/Applications/Docker.app"));
  if (kind.kind === "unknown" && process.platform === "darwin") {
    if (hasBinary("colima"))
      kind = { kind: "colima", name: "Colima", profile: "default" };
    else if (hasBinary("orb"))
      kind = { kind: "orbstack", name: "OrbStack", profile: null };
  }
  const start = startFor(kind, process.platform);
  const base = {
    kind: kind.kind,
    name: kind.name,
    context: context.name,
    endpoint: context.endpoint,
    start: start?.start ?? null
  };
  try {
    const { stdout } = await docker(["version", "--format", "{{.Server.Version}}"], { timeout: 8000 });
    return {
      engine: { ...base, running: true, version: stdout.trim() || null, cliMissing: false, problem: null },
      startArgv: start?.argv ?? null
    };
  } catch (error) {
    const missing = error instanceof CommandError && error.missing;
    const problem = error instanceof CommandError ? errorLine(error.stderr, error.message) : "Docker did not answer.";
    return {
      engine: { ...base, running: false, version: null, cliMissing: missing, problem: missing ? null : problem },
      startArgv: start?.argv ?? null
    };
  }
};
var detectCompose = async () => {
  try {
    await docker(["compose", "version", "--short"], { timeout: 5000 });
    return ["docker", "compose"];
  } catch {}
  try {
    await run("docker-compose", ["version", "--short"], { timeout: 5000 });
    return ["docker-compose"];
  } catch {
    return null;
  }
};

// src/service/incidents.ts
var readEvent = (value) => {
  if (typeof value !== "object" || value === null)
    return null;
  const row = value;
  if (row.Type !== "container")
    return null;
  const actor = typeof row.Actor === "object" && row.Actor !== null ? row.Actor : {};
  const attributes = typeof actor.Attributes === "object" && actor.Attributes !== null ? actor.Attributes : {};
  const id = String(actor.ID ?? row.id ?? "");
  const action = String(row.Action ?? row.status ?? "");
  if (!id || !action)
    return null;
  const exit = Number.parseInt(String(attributes.exitCode ?? ""), 10);
  return { action, id, name: String(attributes.name ?? id.slice(0, 12)), exitCode: Number.isFinite(exit) ? exit : null };
};
var STOP_WINDOW_MS = 30000;
var REPEAT_WINDOW_MS = 60000;
var KEEP = 200;

class IncidentTracker {
  seq = 0;
  incidents = [];
  killedAt = new Map;
  lastIncidentAt = new Map;
  get latest() {
    return this.seq;
  }
  since(after) {
    return this.incidents.filter((incident) => incident.seq > after);
  }
  onEvent(event, now) {
    const { action, id } = event;
    if (action === "kill" || action === "stop") {
      this.killedAt.set(id, now);
      return null;
    }
    if (action === "start") {
      this.killedAt.delete(id);
      return null;
    }
    if (action === "destroy") {
      this.killedAt.delete(id);
      this.lastIncidentAt.delete(id);
      return null;
    }
    let kind = null;
    if (action === "oom")
      kind = "oom";
    else if (action === "health_status: unhealthy")
      kind = "unhealthy";
    else if (action === "die") {
      const stoppedOnPurpose = now - (this.killedAt.get(id) ?? -Infinity) < STOP_WINDOW_MS;
      if (!stoppedOnPurpose && event.exitCode !== null && event.exitCode !== 0)
        kind = "crashed";
    }
    if (!kind)
      return null;
    if (now - (this.lastIncidentAt.get(id) ?? -Infinity) < REPEAT_WINDOW_MS)
      return null;
    this.lastIncidentAt.set(id, now);
    this.seq += 1;
    const incident = { seq: this.seq, at: now, containerId: id, name: event.name, kind, exitCode: event.exitCode };
    this.incidents.push(incident);
    if (this.incidents.length > KEEP)
      this.incidents.splice(0, this.incidents.length - KEEP);
    return incident;
  }
}

// src/service/monitor.ts
var IDLE_MS = 90000;
var STATS_IDLE_MS = 20000;
var SAFETY_REFRESH_MS = 20000;
var ENGINE_RECHECK_MS = 4000;
var COMPOSE_RECHECK_MS = 60000;
var INSPECT_BATCH = 50;

class Monitor {
  engine = null;
  engineCheckedAt = 0;
  engineProbe = null;
  startArgv = null;
  compose = null;
  composeCheckedAt = 0;
  containers = new Map;
  stats = new Map;
  refreshedAt = 0;
  refreshing = null;
  refreshAgain = false;
  refreshTimer = null;
  events = null;
  statsProcess = null;
  lastRequestAt = 0;
  lastStatsRequestAt = 0;
  incidents = new IncidentTracker;
  constructor() {
    setInterval(() => this.idleCheck(), 5000).unref();
  }
  async touch(wantStats, light = false) {
    const now = Date.now();
    this.lastRequestAt = now;
    if (wantStats)
      this.lastStatsRequestAt = now;
    const stale = !this.engine || !this.engine.running && now - this.engineCheckedAt > ENGINE_RECHECK_MS;
    if (stale)
      await this.checkEngine();
    if (!this.engine?.running)
      return;
    if (!this.events)
      this.startEvents();
    if (wantStats && !this.statsProcess)
      this.startStats();
    if (light)
      return;
    if (now - this.refreshedAt > SAFETY_REFRESH_MS)
      await this.refresh();
    else if (this.refreshing)
      await this.refreshing;
  }
  recheckEngine() {
    this.engineCheckedAt = 0;
    if (this.engine)
      this.engine = { ...this.engine, running: false };
  }
  async composeCommand() {
    if (Date.now() - this.composeCheckedAt > COMPOSE_RECHECK_MS) {
      this.compose = await detectCompose();
      this.composeCheckedAt = Date.now();
    }
    return this.compose;
  }
  container(id) {
    return this.containers.get(id) ?? [...this.containers.values()].find((row) => row.id.startsWith(id) || row.name === id);
  }
  async snapshot(directory) {
    const jobs = listJobs();
    const engine = {
      ...this.engine ?? {
        kind: "unknown",
        name: "Docker",
        context: null,
        endpoint: null,
        running: false,
        version: null,
        cliMissing: false,
        start: null,
        problem: null
      },
      starting: jobs.some((job) => job.kind === "engine" && job.state === "running")
    };
    const running = engine.running;
    return {
      at: Date.now(),
      engine,
      compose: (await this.composeCommand())?.join(" ") ?? null,
      containers: running ? this.withStats() : [],
      project: directory ? projectInfo(directory) : null,
      jobs,
      incidentSeq: this.incidents.latest,
      statsLive: this.statsProcess !== null
    };
  }
  withStats() {
    return [...this.containers.values()].map((row) => {
      const sample = row.state === "running" ? this.stats.get(row.id) : undefined;
      return sample ? { ...row, cpu: sample.cpu, memory: sample.memory, memoryLimit: sample.memoryLimit } : row;
    });
  }
  async checkEngine() {
    if (!this.engineProbe) {
      this.engineProbe = (async () => {
        const probe = await probeEngine();
        const wasRunning = this.engine?.running === true;
        this.engine = probe.engine;
        this.startArgv = probe.startArgv;
        this.engineCheckedAt = Date.now();
        if (!probe.engine.running && wasRunning)
          this.stopWatchers();
        if (probe.engine.running && !wasRunning)
          this.refreshedAt = 0;
      })().finally(() => {
        this.engineProbe = null;
      });
    }
    await this.engineProbe;
  }
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      try {
        do {
          this.refreshAgain = false;
          const { stdout } = await docker(["ps", "-aq", "--no-trunc"]);
          const ids = stdout.split(`
`).map((line) => line.trim()).filter(Boolean);
          const next = new Map;
          for (let i = 0;i < ids.length; i += INSPECT_BATCH) {
            const batch = ids.slice(i, i + INSPECT_BATCH);
            try {
              const { stdout: inspected } = await docker(["inspect", "--type", "container", "--", ...batch]);
              for (const info of JSON.parse(inspected)) {
                const row = containerFromInspect(info);
                if (row)
                  next.set(row.id, row);
              }
            } catch {
              for (const id of batch) {
                try {
                  const { stdout: single } = await docker(["inspect", "--type", "container", "--", id]);
                  const row = containerFromInspect(JSON.parse(single)[0] ?? {});
                  if (row)
                    next.set(row.id, row);
                } catch {}
              }
            }
          }
          this.containers = next;
          this.refreshedAt = Date.now();
        } while (this.refreshAgain);
      } catch {
        this.recheckEngine();
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
  scheduleRefresh() {
    if (this.refreshTimer)
      return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, 150);
  }
  startEvents() {
    this.events = streamLines(["events", "--format", "{{json .}}", "--filter", "type=container"], (line) => {
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        return;
      }
      const event = readEvent(value);
      if (!event || event.action.startsWith("exec_"))
        return;
      this.incidents.onEvent(event, Date.now());
      this.scheduleRefresh();
    }, () => {
      this.events = null;
      if (Date.now() - this.lastRequestAt < IDLE_MS)
        this.recheckEngine();
    });
  }
  startStats() {
    this.statsProcess = streamLines(["stats", "--no-trunc", "--format", "{{json .}}"], (line) => {
      const sample = parseStatsLine(line);
      if (sample)
        this.stats.set(sample.id, sample);
    }, () => {
      this.statsProcess = null;
      this.stats.clear();
    });
  }
  stopWatchers() {
    this.events?.kill();
    this.statsProcess?.kill();
    this.events = null;
    this.statsProcess = null;
    this.stats.clear();
  }
  idleCheck() {
    const now = Date.now();
    if (this.statsProcess && now - this.lastStatsRequestAt > STATS_IDLE_MS) {
      this.statsProcess.kill();
      this.statsProcess = null;
      this.stats.clear();
    }
    if (now - this.lastRequestAt > IDLE_MS && (this.events || this.containers.size > 0)) {
      this.stopWatchers();
      this.containers.clear();
      this.refreshedAt = 0;
      this.engine = null;
    }
  }
  shutdown() {
    this.stopWatchers();
  }
}
var projectCache = new Map;
var projectInfo = (directory) => {
  const cached = projectCache.get(directory);
  if (cached && Date.now() - cached.at < 1e4)
    return cached.info;
  const composeFile = COMPOSE_FILES.find((name) => existsSync4(join3(directory, name))) ?? null;
  const info = { directory, composeFile, name: composeProjectName(directory) };
  projectCache.set(directory, { at: Date.now(), info });
  return info;
};

// src/shared/format.ts
var locale = "en";
var setLocale = (next) => {
  try {
    locale = Intl.NumberFormat.supportedLocalesOf(next)[0] ?? "en";
  } catch {
    locale = "en";
  }
};
var number = (value, digits) => new Intl.NumberFormat(locale, {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
}).format(value);
var formatBytes = (bytes) => {
  if (bytes === null)
    return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit >= 3 && value < 100 ? 1 : 0;
  return `${number(value, digits)} ${units[unit]}`;
};
var span = (ms) => {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1)
    return "seconds";
  if (minutes < 60)
    return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48)
    return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
};
var ago = (iso, now = Date.now()) => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at))
    return "";
  const value = span(now - at);
  return value === "seconds" ? "just now" : `${value} ago`;
};
var since = (iso, now = Date.now()) => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(at) ? span(now - at) : "";
};

// src/shared/stacks.ts
var inside = (path, directory) => path === directory || path.startsWith(`${directory.replace(/\/+$/, "")}/`);
var isProjectStack = (stack, project) => {
  if (!project)
    return false;
  if (stack.workingDir)
    return inside(stack.workingDir, project.directory);
  return stack.project === project.name;
};
var byName = (a, b) => label(a).localeCompare(label(b));
var groupContainers = (containers, project) => {
  const stacks = new Map;
  const standalone = [];
  for (const row of containers) {
    if (!row.compose) {
      standalone.push(row);
      continue;
    }
    let stack = stacks.get(row.compose.project);
    if (!stack) {
      stack = {
        project: row.compose.project,
        workingDir: row.compose.workingDir,
        configFiles: row.compose.configFiles,
        containers: [],
        running: 0,
        isProject: false
      };
      stacks.set(row.compose.project, stack);
    }
    stack.containers.push(row);
    if (row.state === "running")
      stack.running += 1;
  }
  const all = [...stacks.values()];
  for (const stack of all) {
    stack.containers.sort(byName);
    stack.isProject = isProjectStack(stack, project);
  }
  const mine = all.filter((stack) => stack.isProject);
  if (mine.length === 0 && project?.composeFile) {
    mine.push({
      project: project.name,
      workingDir: project.directory,
      configFiles: [`${project.directory.replace(/\/+$/, "")}/${project.composeFile}`],
      containers: [],
      running: 0,
      isProject: true
    });
  }
  return {
    project: mine,
    stacks: all.filter((stack) => !stack.isProject).sort((a, b) => b.running - a.running || a.project.localeCompare(b.project)),
    standalone: standalone.sort((a, b) => Number(b.state === "running") - Number(a.state === "running") || byName(a, b))
  };
};
var notUpLine = (stack, compose) => {
  const file = stack.configFiles[0]?.split("/").pop() || "compose file";
  return compose ? `${file} · not running` : `${file} · not running · install Docker Compose to start it`;
};
var label = (row) => row.compose?.service || row.name;
var STOP_CODES = new Set([0, 130, 137, 143]);
var isCrashed = (row) => (row.state === "exited" || row.state === "dead") && (row.oomKilled || row.exitCode !== null && !STOP_CODES.has(row.exitCode));
var needsAttention = (row) => isCrashed(row) || row.state === "restarting" || row.health === "unhealthy";
var toneOf = (row) => {
  if (needsAttention(row))
    return "bad";
  if (row.state === "running")
    return row.health === "starting" ? "warn" : "ok";
  if (row.state === "paused")
    return "warn";
  return "off";
};
var stateLine = (row, now = Date.now()) => {
  switch (row.state) {
    case "running": {
      const up = since(row.startedAt, now);
      if (up === "seconds")
        return "just started";
      return up ? `up ${up}` : "running";
    }
    case "restarting":
      return row.restartCount > 0 ? `restarting · ${row.restartCount} restarts` : "restarting";
    case "paused":
      return "paused";
    case "created":
      return "created, never started";
    case "removing":
      return "being removed";
    default: {
      const when = ago(row.finishedAt, now);
      const code = row.oomKilled ? "out of memory" : `exited (${row.exitCode ?? "?"})`;
      return when ? `${code} ${when}` : code;
    }
  }
};
var portUrl = (port) => {
  const wildcard = port.hostIp === "0.0.0.0" || port.hostIp === "::" || port.hostIp === "";
  const hostName = wildcard ? "localhost" : port.hostIp.includes(":") ? `[${port.hostIp}]` : port.hostIp;
  return `http://${hostName}:${port.hostPort}`;
};

// src/service/status-view.ts
var SHOWN = 6;
var PORTS_SHOWN = 3;
var TONE = { ok: "success", warn: "warning", bad: "error", off: "muted" };
var projectStack = (snapshot) => groupContainers(snapshot.containers, snapshot.project).project[0] ?? null;
var stackJob = (snapshot, stack, state) => snapshot.jobs.find((job) => job.kind === "stack" && job.target === stack.project && job.state === state);
var controlsFor = (snapshot, stack) => {
  const { engine } = snapshot;
  if (!engine.running) {
    return engine.start?.canRun && !engine.starting ? [{ kind: "button", id: "start-engine", label: `Start ${engine.name}` }] : [];
  }
  if (!stack)
    return [];
  const busy = Boolean(stackJob(snapshot, stack, "running"));
  const compose = Boolean(snapshot.compose);
  if (stack.running === 0) {
    return compose || stack.containers.length > 0 ? [{ kind: "button", id: "up", label: "Up", disabled: busy }] : [];
  }
  return [
    { kind: "button", id: "restart", label: "Restart", disabled: busy },
    { kind: "button", id: compose ? "down" : "stop", label: compose ? "Down" : "Stop", disabled: busy }
  ];
};
var failureNote = (snapshot, stack) => {
  const failed = stackJob(snapshot, stack, "failed");
  if (!failed)
    return null;
  const last = failed.output.split(`
`).map((text) => text.trim()).filter(Boolean).pop() ?? "It failed.";
  return { kind: "note", id: "job-failed", text: `${failed.label} failed: ${last}`, tone: "error" };
};
var statusView = (snapshot, locale, now = Date.now()) => {
  setLocale(locale);
  const { engine } = snapshot;
  if (!engine.running) {
    const text = engine.starting ? `Starting ${engine.name}…` : engine.cliMissing ? "Docker isn't installed." : `${engine.name} isn't running.`;
    return { rows: [{ kind: "note", id: "engine", text }], controls: controlsFor(snapshot, null) };
  }
  const stack = projectStack(snapshot);
  if (!stack) {
    return { rows: [{ kind: "note", id: "empty", text: "No Compose file or containers for this project." }], controls: [] };
  }
  const rows = [];
  const running = stackJob(snapshot, stack, "running");
  if (running)
    rows.push({ kind: "note", id: "job", text: `${running.label}…` });
  const failed = failureNote(snapshot, stack);
  if (failed)
    rows.push(failed);
  if (stack.containers.length === 0) {
    if (!running)
      rows.push({ kind: "note", id: "not-up", text: notUpLine(stack, Boolean(snapshot.compose)) });
    return { rows, controls: controlsFor(snapshot, stack) };
  }
  for (const row of stack.containers.slice(0, SHOWN)) {
    const isRunning = row.state === "running";
    const ports = row.ports.filter((port) => port.protocol === "tcp").slice(0, PORTS_SHOWN);
    const tone = toneOf(row);
    rows.push({
      kind: "line",
      id: `container-${row.id.slice(0, 12)}`,
      label: label(row),
      dot: TONE[tone],
      content: isRunning && ports.length > 0 ? { kind: "chips", chips: ports.map((port) => ({ id: `port-${port.hostPort}`, label: `:${port.hostPort}`, url: portUrl(port) })) } : { kind: "text", text: stateLine(row, now), tone: tone === "bad" ? "error" : "muted" },
      ...isRunning ? { value: formatBytes(row.memory) } : {}
    });
  }
  if (stack.containers.length > SHOWN) {
    rows.push({ kind: "note", id: "more", text: `+${stack.containers.length - SHOWN} more in the Docker panel` });
  }
  return { rows, controls: controlsFor(snapshot, stack) };
};

// src/service/main.ts
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
if (!port || !token) {
  console.error("OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required");
  process.exit(1);
}
var BODY_MAX = 64 * 1024;
var monitor = new Monitor;
var ok = (body) => ({ status: 200, body });
var fail = (status, message) => ({ status, body: { error: message } });
var readBody = (req) => new Promise((resolve, reject) => {
  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > BODY_MAX) {
      reject(new AnswerError(413, "Request too large."));
      req.destroy();
    }
  });
  req.on("end", () => {
    if (!raw) {
      resolve({});
      return;
    }
    try {
      const value = JSON.parse(raw);
      resolve(typeof value === "object" && value !== null ? value : {});
    } catch {
      reject(new AnswerError(400, "Expected a JSON body."));
    }
  });
  req.on("error", reject);
});
var str = (value) => typeof value === "string" ? value : "";
var containerId = (raw) => {
  const id = decodeURIComponent(raw ?? "");
  if (!isContainerRef(id))
    throw new AnswerError(400, "That is not a container id.");
  const row = monitor.container(id);
  if (!row)
    throw new AnswerError(404, "This container is gone.");
  return row.id;
};
var needsEngine = async (wantStats = false) => {
  await monitor.touch(wantStats);
  const snapshot = await monitor.snapshot(null);
  if (!snapshot.engine.running)
    throw new AnswerError(503, `${snapshot.engine.name} isn't running.`);
};
var route = async ({ method, path, query, body }) => {
  const [first, second, third, fourth] = path;
  if (method === "GET" && first === "snapshot") {
    await monitor.touch(query.get("stats") === "1");
    return ok(await monitor.snapshot(query.get("directory") || null));
  }
  if (first === "status" && !second) {
    const directory = query.get("directory") || null;
    if (method === "GET") {
      await monitor.touch(true);
      return ok(statusView(await monitor.snapshot(directory), query.get("locale") ?? "en"));
    }
    if (method === "POST") {
      const refuse = (status, message) => ({ status, body: { message } });
      try {
        const id = str(body.id);
        if (id === "start-engine") {
          await monitor.touch(false);
          const snapshot = await monitor.snapshot(null);
          if (snapshot.engine.running)
            return refuse(409, `${snapshot.engine.name} is already running.`);
          return ok({ job: startEngine(monitor, snapshot.engine.name) });
        }
        if (!STACK_ACTIONS.includes(id))
          return refuse(400, "Unknown control.");
        await needsEngine();
        const stack = projectStack(await monitor.snapshot(directory));
        if (!stack)
          return refuse(404, "This project has no Compose stack.");
        return ok({
          job: await stackAction(monitor, { action: id, project: stack.project, workingDir: stack.workingDir, configFiles: stack.configFiles })
        });
      } catch (error) {
        if (error instanceof AnswerError)
          return refuse(error.status, error.message);
        if (error instanceof CommandError)
          return refuse(502, error.message);
        throw error;
      }
    }
  }
  if (method === "GET" && first === "incidents") {
    await monitor.touch(false, true);
    const after = Number(query.get("after") ?? 0);
    return ok({ latest: monitor.incidents.latest, incidents: monitor.incidents.since(Number.isFinite(after) ? after : 0) });
  }
  if (method === "POST" && first === "engine" && second === "start") {
    await monitor.touch(false);
    const snapshot = await monitor.snapshot(null);
    if (snapshot.engine.running)
      return fail(409, `${snapshot.engine.name} is already running.`);
    return ok({ job: startEngine(monitor, snapshot.engine.name) });
  }
  if (first === "containers" && second) {
    await needsEngine();
    const id = containerId(second);
    if (method === "GET" && third === "logs") {
      const since = query.get("since");
      const normalized = since ? normalizeTimestamp(since) : null;
      if (since && !normalized)
        return fail(400, "Bad since timestamp.");
      return ok(await readLogs(id, Number(query.get("tail") ?? 500), normalized));
    }
    if (method === "GET" && third === "inspect")
      return ok(await inspect(id));
    if (method === "GET" && third === "fs") {
      const target = normalizeContainerPath(query.get("path") ?? "/");
      if (!target)
        return fail(400, "Paths start with / and stay inside the container.");
      return ok(fourth === "file" ? await readFile(id, target) : await listDir(id, target));
    }
    if (method === "POST" && third === "exec") {
      const command = str(body.command).trim();
      if (!command)
        return fail(400, "Type a command.");
      if (command.length > 8000)
        return fail(400, "That command is too long.");
      const cwd = normalizeContainerPath(str(body.cwd) || "/") ?? "/";
      return ok(await execCommand(id, command, cwd));
    }
    if (method === "POST" && third && CONTAINER_ACTIONS.includes(third)) {
      return ok({ job: containerAction(monitor, id, third) });
    }
  }
  if (method === "POST" && first === "stacks") {
    await needsEngine();
    const action = str(body.action);
    if (!STACK_ACTIONS.includes(action))
      return fail(400, "Unknown stack action.");
    return ok({
      job: await stackAction(monitor, {
        action,
        project: str(body.project),
        workingDir: str(body.workingDir) || null,
        configFiles: Array.isArray(body.configFiles) ? body.configFiles.map(str).filter(Boolean).slice(0, 16) : []
      })
    });
  }
  if (method === "GET" && first === "storage") {
    await needsEngine();
    return ok(await readStorage((await monitor.snapshot(null)).containers));
  }
  if (method === "POST" && first === "storage" && second === "prune") {
    await needsEngine();
    const kind = str(body.kind);
    if (!["images", "build-cache", "volumes", "containers"].includes(kind))
      return fail(400, "Unknown cleanup.");
    return ok({ job: prune2(monitor, kind) });
  }
  if (method === "POST" && first === "images" && second === "pull") {
    await needsEngine();
    return ok({ job: pullImage(monitor, str(body.ref)) });
  }
  if (method === "POST" && (first === "image" || first === "volume" || first === "network") && second === "remove") {
    await needsEngine();
    return ok({ job: removeResource(first, str(body.ref), str(body.name) || str(body.ref)) });
  }
  return fail(404, "Not found.");
};
var server = http.createServer((req, res) => {
  const send = ({ status, body }) => {
    if (res.headersSent)
      return;
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Bearer ${token}`) {
    send(fail(401, "unauthorized"));
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/health") {
    send(ok({ ok: true }));
    return;
  }
  const method = req.method ?? "GET";
  (async () => {
    try {
      const body = method === "POST" ? await readBody(req) : {};
      const path = url.pathname.split("/").filter(Boolean);
      send(await route({ method, path, query: url.searchParams, body }));
    } catch (error) {
      if (error instanceof AnswerError)
        send(fail(error.status, error.message));
      else if (error instanceof CommandError)
        send(fail(502, error.message));
      else
        send(fail(500, error instanceof Error ? error.message : "Something went wrong."));
    }
  })();
});
var shutdown = () => {
  monitor.shutdown();
  server.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
server.listen(port, "127.0.0.1");
