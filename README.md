# docklean

Safely find and clean unused Docker resources from the command line.

## Requirements

- Node.js 18+
- Docker installed and the daemon running

## Install

Run directly with npx:

```bash
npx docklean
```

Or install globally:

```bash
npm install -g docklean
```

## Usage

Scan only (no deletes):

```bash
docklean
```

Interactive cleanup (prompts before delete):

```bash
docklean --all
```

Selective cleanup:

```bash
docklean --containers
```

Dry run (shows commands that would run):

```bash
docklean --all --dry-run
```

Skip prompt:

```bash
docklean --all --force
```

Filter by age:

```bash
docklean --images --older-than 7d
```

Clean top 10 largest resources:

```bash
docklean --images --top 10
```

Clean until 5GB is reclaimed:

```bash
docklean --images --limit-space 5GB
```

Combine filters:

```bash
docklean --images --older-than 30d --top 5
```

## Flags

- `--containers` Clean stopped/exited containers
- `--images` Clean unused/dangling images
- `--volumes` Clean unused volumes
- `--networks` Clean unused networks
- `--cache` Clean build cache
- `--dangling` Dangling images + stopped containers + unused volumes
- `--all` All unused resources
- `--older-than <duration>` Only clean items older than `m/h/d/w`
- `--limit-space <size>` Clean until specified space is reclaimed (e.g., `5GB`, `500MB`)
- `--top <number>` Select top N largest resources
- `--dry-run` Print what would be removed
- `--force` Skip confirmation prompt
- `--yes` Alias for `--force`
- `--json` JSON output
- `--quiet` Minimal output
- `--verbose` More verbose output
- `--no-color` Disable colored output

**Note:** `--limit-space` and `--top` cannot be used together, and they only apply to containers and images. Docker volumes and networks do not report size information, so they are not affected by these flags.

## Exit Codes

- `0` Success
- `1` Docker CLI not found
- `2` Docker daemon not running
- `3` Nothing to clean or user declined
- `4` Partial failure
- `5` Invalid arguments

## Development

```bash
npm install
npm run build
npm run dev -- --all --dry-run
```
