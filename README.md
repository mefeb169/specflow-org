# specflow-org

**An AI software organization for Claude Code.** Open Claude Code at your product root, say *"Let's work on the next feature,"* and a team of role skills takes the feature from request to verified delivery: product, UX, architecture, build and verification, across as many Git repositories as the product has, driven by [GitHub Spec Kit](https://github.com/github/spec-kit).

- **Feature-oriented.** One feature, one lifecycle, even when it spans `api/`, `web/` and `mobile/`.
- **Context before action.** It scans your repos, instructions and docs first, and labels every claim `[code]`, `[doc]`, `[planned]`, `[unknown]` or `[conflict]`.
- **Controlled autonomy.** Human gates for spec, design, implementation, acceptance and release. State changes go through a CLI that checks real files and test evidence; hooks block direct edits.
- **No lock-in.** Your repos keep their histories and conventions. State lives in plain files at the workspace root; nothing is pushed.

```
Feature request
  -> product (spec via Spec Kit) -> [spec gate]
  -> ux (UI features) + architect (plan, repo impact, tasks) -> [design gate]
  -> [implement gate] -> build, repo by repo, on feature branches
  -> verify (tests at HEAD, independent review) -> [acceptance gate] -> release
```

## Quickstart
Requirements: Claude Code, Node.js >= 18, git, and the Spec Kit CLI (`specify`).

```
cd my-product                      # the folder that contains your repos
claude plugin marketplace add mefeb169/specflow-org --scope project
claude plugin install specflow-org@specflow-org-marketplace --scope project
claude
> set up the framework here
> let's work on the next feature
```

Full documentation: [plugin README](plugins/specflow-org/README.md) · [runtime notes and what was verified](docs/runtime.md) · [architecture](docs/architecture.md) · [end-to-end run report](docs/e2e-report.md) · [security](SECURITY.md) · [changelog](CHANGELOG.md).

## Status
Public beta (0.3.0). Tested on Windows with Spec Kit 1.2.0; the CI matrix covers Ubuntu, macOS and Windows on Node 18 and 22 but has not run yet. Known gaps are listed in the plugin README.

## Development
`npm test` runs the node test suite (no dependencies). `claude plugin validate .` checks the manifests. Behavioral evals: [plugins/specflow-org/evals](plugins/specflow-org/evals/README.md). Planning history is in [tasks/](tasks/).

## License
MIT, see [LICENSE](LICENSE). The bundled `frontend-design` skill is Anthropic's, under Apache-2.0 (see the plugin's [NOTICE](plugins/specflow-org/NOTICE)).
