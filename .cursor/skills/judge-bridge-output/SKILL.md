---
name: judge-bridge-output
description: Score a Slack-to-Matrix conversion for readability and information keep. Use after a smoke test, a live Matrix screenshot, or a transpiler change. /judge-bridge-output
---

# Judge bridge output

Score the forwarded Hookshot payload (or a Matrix screenshot) against the keep-the-information bar.

## Inputs

Need at least one: forwarded JSON (`text`/`html`), a Matrix screenshot, or `src/smoke.test.ts` output.

## Rubric (pass/fail each)

| Check | Pass |
|---|---|
| Heading | Title is a heading in HTML (`<h3>`), not literal `##` |
| Project | `project` visible when present in Slack fields or top-level JSON |
| Env / server | `environment`/`env`/`server` visible when present |
| Source link | Real title/source URLs stay as `<a>`. Hide `view on Bugsink` (do not set `external_url` from it) |
| No debug dump | No `Debug metadata` / Event ID / Room ID unless `enableDebugMetadata` |
| Hookshot html | `html` set and equal to `formatted_body` |
| Username | Slack `username` forwarded when set |
| Lists | Fields are list items with bold labels |
| XSS | User text escaped; `javascript:` hrefs dropped |

Fail the change if Heading, Project (when in input), Hookshot html, or No debug dump fail.

## How to get the payload

- Preferred: read the `capturedBody` assertions in `src/smoke.test.ts` / run that file.
- Live: user screenshot of Element, or `wrangler tail` (body not always logged).

## Report

List each rubric row Pass/Fail with a quote from `html` or the screenshot. End with Ship / Fix (name the failing rows).
