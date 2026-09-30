# Plugin and marketplace distribution

## Claude Code

This repository includes:
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `skills/the-extractor/SKILL.md`

Repository marketplace install pattern:

```text
/plugin marketplace add https://github.com/executiveusa/the-extractor
/plugin install the-extractor@the-extractor
```

Verify against the current Claude Code release before publishing; plugin surfaces evolve.

## Codex / OpenAI plugins

This repository includes `.codex-plugin/plugin.json` and a skills directory. Current OpenAI plugin systems can package skills-only workflows, and eligible workspaces can import/sync plugin marketplaces from GitHub.

Do not claim public-directory approval until OpenAI has actually approved the plugin.

## GitHub Action

`action.yml` exposes the local deterministic audit as a CI step.

Example:

```yaml
- uses: executiveusa/the-extractor@v0
  with:
    path: docs/landing-page.md
    strict: true
```

GitHub Actions can be published in GitHub Marketplace from a public repository with root action metadata and a tagged release.

## Paid GitHub App later

Paid Marketplace plans apply to GitHub Apps rather than monetizing a plain Action directly. Build a paid GitHub App only after Team demand is proven.

## Versioning

- v0.x: method, CLI, plugins, action, proof cases.
- v1.0: stable audit contract and test suite.
- Cloud/Team features use a separate service version and must not silently change local open-source behavior.
