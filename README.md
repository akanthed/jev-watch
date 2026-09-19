# jev-watch

CLI tool that loads test cases from JSON, calls the TypeSafe Jev API, and flags
when answers drift after a model update — a choice flips, a score moves, or
confidence drops below tolerance.

## Setup

```bash
npm install
npm run build
```

Set credentials in `.env.local` (or the shell environment) — either a
TypeSafe API key, to call `https://api.typesafe.ai` directly:

```
JEV_API_KEY=sk-...
JEV_API_URL=https://your-dedicated-endpoint.example.com   # optional, for enterprise/custom deployments
JEV_MODEL=jev-latest                                      # optional, this is the default
```

or an OpenRouter API key, to call TypeSafe's Jev model through OpenRouter
instead (no TypeSafe account needed):

```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=~typesafe/jev-latest   # optional, this is the default
```

`JEV_API_KEY` takes precedence when both are set.

Link the CLI locally if you want the bare `jev-watch` command:

```bash
npm link
```

## API contract

`jev-watch` speaks TypeSafe's System One wire format (`src/systemOne.ts`),
shared by both transports:

- **Direct** (`JEV_API_KEY`) — `src/client.ts` POSTs to
  `${JEV_API_URL:-https://api.typesafe.ai}/v1/systemone`.
- **OpenRouter** (`OPENROUTER_API_KEY`) — `src/openrouterClient.ts` POSTs to
  `https://openrouter.ai/api/alpha/decisions`, which normalizes to the same
  request/response shape.

Both send `{ "state": ..., "model": ..., "questions": { "<id>": { "type": "choice" | "noul", "instructions": "...", "criteria": {...} } } }`
and get back `{ "answers": { "<id>": { "type": "choice", "choice": "...", "probabilities": {...}, "confidence": 0.82 } } }`
(or a `"noul"` answer with just a `noul` probability).

`jev-watch`'s own test-case format only has `choice` and `score` question
types (see below); `src/systemOne.ts` adapts between them:

- `choice` questions map straight across, with `confidence` taken directly
  from the API's `confidence` field.
- `score` questions — which in this repo are always continuous 0–1 values
  described by `instruction` — map onto Jev's `noul` (calibrated yes/no
  probability) question type, using that same `instruction` text as the
  anchor for what 0 and 1 mean, and `noul`'s returned probability becomes
  the test's `score`.

## Test case format

```json
{
  "testName": "CRAToolkit support routing",
  "state": "Customer says: I can't log in",
  "questions": {
    "department": {
      "type": "choice",
      "instruction": "Which team?",
      "options": { "billing": "...", "technical": "...", "sales": "..." }
    }
  },
  "expected": { "department": "technical" },
  "tolerance": 0.1
}
```

- `type: "choice"` — fails if the returned choice doesn't match `expected`, or
  if `confidence` drops more than `tolerance` below 1.0 (e.g. `tolerance: 0.1`
  requires confidence >= 0.9).
- `type: "score"` — fails if `|actual.score - expected| > tolerance`, or on
  the same confidence check as above.

## Running

```bash
# single test case
node bin/jev-watch.js examples/support-routing.json

# a whole directory
node bin/jev-watch.js examples

# after npm link
jev-watch examples
```

## Example run

```
$ jev-watch examples
PASS CRAToolkit refund eligibility
FAIL CRAToolkit sales lead qualification
  drift [department] choice: expected sales, got (missing) (tolerance 0.1)
  drift [leadQuality] choice: expected 0.850, got (missing) (tolerance 0.1)
FAIL CRAToolkit support routing
  drift [department] choice: expected technical, got billing (tolerance 0.1)
  drift [department] confidence: expected 0.900, got 0.550 (tolerance 0.1)

1/4 tests passed
```

Exit code is `0` when every test passes, `1` otherwise — wire it into CI to
catch drift on every model deploy.

## Project layout

- `src/types.ts` — test case, API response, and result types
- `src/systemOne.ts` — shared TypeSafe System One wire format + adapter
- `src/client.ts` — direct TypeSafe API client (`api.typesafe.ai`)
- `src/openrouterClient.ts` — client that calls Jev via OpenRouter's Decisions API
- `src/runner.ts` — loads test cases, calls the API, evaluates drift
- `src/report.ts` — terminal output
- `src/index.ts` — CLI entrypoint
- `bin/jev-watch.js` — executable shim
- `examples/` — four sample test cases
