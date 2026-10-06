# JobAgent

Nightly job search agent. Fetches jobs from free sources, ranks them against a PII-free
profile, writes cover letters and resume tweak suggestions for the top 5, and sends everything
to Telegram. See `job-search-agent-requirements.md` for the full requirements.

## Setup (local)

1. Install Node.js 22 LTS and pnpm (`corepack enable`).
2. Install dependencies (this also creates `pnpm-lock.yaml`, which Docker needs):

   ```
   pnpm add grammy better-sqlite3 zod pino yaml cheerio mammoth node-cron openai
   pnpm add -D typescript tsx vitest @types/node @types/better-sqlite3
   ```

3. Copy `.env.example` to `.env` and fill in the values (see Phase 0 steps 2 and 3).
4. Check that everything compiles and starts:

   ```
   pnpm typecheck
   pnpm dev
   ```

## Deploy (server)

```
mkdir -p data && sudo chown -R 1000:1000 data config
docker compose up -d --build
```

The container runs as a non-root user, has a read-only filesystem, drops all capabilities,
publishes no ports, and has CPU and memory limits.

## Code style rules for this project

- Write like Java: classes, interfaces, explicit types on variables, parameters and return values.
- Pass dependencies through the constructor.
- Use simple `for` loops instead of long `map` / `filter` / `reduce` chains.
- Do not use `any`; do not use clever one-line tricks.
- Use clear, full names for variables and methods; keep methods short.
- Comments explain why, not what.

## Folder layout

- `src/config`: config schema and YAML loader
- `src/models`: shared data types (Job)
- `src/fetchers`: one file per job source, behind the `JobFetcher` interface
- `src/pipeline`: normalize, filter, dedupe, rank
- `src/llm`: NVIDIA client, prompts, outbound PII guard
- `src/profile`: resume parser and PII redaction
- `src/telegram`: bot, commands, message formatter
- `src/db`: SQLite schema and access
- `config/config.yaml`: all search criteria
- `data/`: SQLite database and profile (never committed)
