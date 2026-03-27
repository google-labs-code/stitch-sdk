# Containerized Stitch MCP Proxy

Run the Stitch MCP proxy in a container instead of installing Node.js dependencies on the host. The API key is injected via a container secret — it never touches environment variables or command-line arguments.

## Build

```bash
# Podman
podman build -t stitch-mcp .

# Docker
docker build -t stitch-mcp .
```

## Create the API key secret

```bash
# Podman
printf '%s' "your-stitch-api-key" | podman secret create stitch-api-key -

# Docker
printf '%s' "your-stitch-api-key" | docker secret create stitch-api-key -
```

## Run

```bash
# Podman
podman run --rm -i --secret stitch-api-key stitch-mcp

# Docker
docker run --rm -i --secret stitch-api-key stitch-mcp
```

## Configure as an MCP server

### Claude Code (`~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "stitch": {
      "command": "podman",
      "args": ["run", "--rm", "-i", "--secret", "stitch-api-key", "stitch-mcp"]
    }
  }
}
```

### Cursor / VS Code (`.cursor/mcp.json` or `.vscode/mcp.json`)

```json
{
  "mcpServers": {
    "stitch": {
      "command": "podman",
      "args": ["run", "--rm", "-i", "--secret", "stitch-api-key", "stitch-mcp"]
    }
  }
}
```

## Why containerize?

- **No host dependencies** — Node.js and npm packages stay inside the container
- **Secret isolation** — API key is read from `/run/secrets/`, never exposed as an environment variable
- **Reproducible** — Same image runs the same way everywhere
- **Disposable** — `--rm` cleans up after each session
