# THE EXTRACTOR

**Delete what did not earn its place.**

The Extractor is a destruction-first anti-slop system for copy, websites, interfaces, proposals and agent-generated output.

Most “humanizers” immediately rewrite weak material. The Extractor does the opposite:

```text
freeze source
→ define the human job
→ identify slop and evidence gaps
→ delete before replacing
→ reduce to essential meaning
→ humanize only what survives
→ recompose around the task
→ verify
```

It is built around one stopping rule:

> Stop when another removal would make the human less successful.

## What it ships

- `extractor` local CLI;
- Claude Code plugin;
- Codex/OpenAI plugin manifest;
- GitHub Action;
- reusable `SKILL.md`;
- deterministic copy/UI signal rules;
- Crown & Core proof case;
- static product landing page;
- commercialization and 30-day GTM docs.

## Install

### Local CLI

```bash
git clone https://github.com/executiveusa/the-extractor.git
cd the-extractor
npm link
extractor audit ./tests/fixtures/slop.txt
```

No runtime dependencies. Node 20+.

### Claude Code

```text
/plugin marketplace add https://github.com/executiveusa/the-extractor
/plugin install the-extractor@the-extractor
```

### Codex

The repository includes `.codex-plugin/plugin.json` plus the skills directory for current Codex/OpenAI plugin flows. Import the repository or marketplace through the plugin controls available to your account/workspace.

### GitHub Action

```yaml
- uses: executiveusa/the-extractor@v0
  with:
    path: docs/landing-copy.md
    strict: true
```

## CLI

```bash
extractor audit <file|url|->
extractor audit page.md --format json
extractor audit page.md --strict
```

`--strict` exits non-zero when a high-severity signal is found.

## What the CLI detects

The CLI is intentionally deterministic. It flags observable signals such as:
- portable premium slogans;
- staging language;
- vague “difference” claims;
- generic CTA labels;
- unsupported superlatives;
- repeated abstractions;
- high choice density;
- competing CTA vocabulary;
- common UI-default signals when source code is audited.

The **agent skill** does the higher-order work: intent, deletion, R0→R4 reduction, evidence review, humanization and recomposition.

## Not an AI detector

The Extractor does not decide who wrote text. Pattern matches are not authorship evidence. Material is `origin unknown` unless provenance is independently established.

## Crown & Core proof case

The first proof case is a real tenant demo. The audit preserves concrete location, photography, booking and useful service detail, while challenging broad “elevated / experience / thoughtfully designed” language, catalogue overload, generic differentiators and the giant booking selector.

Read [`docs/CROWN-CORE-CASE-STUDY.md`](docs/CROWN-CORE-CASE-STUDY.md).

## Open source + revenue

Core stays open. Revenue starts with a service, not a giant SaaS build:

**Deep Extraction Audit — $299 launch price**

One page. Human-reviewed. Baseline → slop map → removal → R1/R2/R3 → recorded walkthrough.

Read [`docs/MONETIZATION.md`](docs/MONETIZATION.md) and [`docs/GO-TO-MARKET-30-DAYS.md`](docs/GO-TO-MARKET-30-DAYS.md).

## Quality law

A finding must say:
- what the element is;
- why it fails the human task;
- what is lost if removed;
- the smallest reversible action.

No vague “this feels AI” criticism.

## Sources

The Extractor is an original orchestration skill. It references rather than vendors projects such as Impeccable, Humanizer, Stop Slop, i-have-adhd and anti-slop systems. See [`docs/SOURCES.md`](docs/SOURCES.md) for the reviewed source map and licenses.

## Test

```bash
npm test
npm run check
```

## License

MIT.
