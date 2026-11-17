# Hub assistant

A chat with Claude on every page of the Hub (gold button, bottom right). It supports the owner and the team with questions
about the company and everything recorded in the Hub, and it can add tasks.

## What it can do

- **Read the Hub**: clients, tasks, fixed tasks, agreements, videos, documents (names only), contact log, SEO actions,
  invoices, expenses, onboarding forms, monitored sites, incidents, checks, backups, visitor numbers, site requests,
  daily briefings, bank lines and the bookkeeping. It reads with the signed-in person's own rights (row level security),
  so it never sees more than that person may see.
- **Add a task** (`client_tasks`) when asked.
- **Remember a fact** when asked: it adds a dated line to the company knowledge.
- **Know the company**: the *Knowledge* tab holds one free text (services, prices, rules, how each client is handled).
  It is read with every question.

It cannot change or delete other data, send mail or invoices, or reach anything outside the Hub (mail, calendar, Drive,
social accounts). Keys and tokens (`site_bridges`, `monitored_sites.db_health_apikey`, …) are not readable: the allow-list
is in `src/lib/assistant.ts` and is covered by tests.

## Setup

1. **Database**: `supabase/migrations/20261117010000_assistant.sql` adds one table, `assistant_knowledge`. It changes no
   existing tables. Lovable applies it after this branch is merged.
2. **Secret** (Lovable Cloud → Secrets): `ANTHROPIC_API_KEY`, a key from the Claude Console (console.anthropic.com).
   Until it is set, the assistant answers that the key is missing.
3. Optional secret `ASSISTANT_MODEL`: a Claude model id. Without it the assistant uses the newest Sonnet the key can use.

## Cost

Every question is billed on the Claude API key (not on a Claude chat subscription). Each question sends the instructions,
the company knowledge and the conversation so far, plus what it looks up. Set a monthly spend limit in the Claude Console.

## Data

Questions, the company knowledge and the rows the assistant looks up are sent to Anthropic's API to get an answer. That can
include client contact details and messages from website visitors (`site_records`). The chat itself is kept only in the
browser it was typed in.
