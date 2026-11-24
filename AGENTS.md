## 📚 Dual-Tier Documentation Maintenance (Mandatory)
Every feature, UI change, or algorithm modification MUST update both documentation tiers in Slovak & English:
1. **User Guide (Tier 1):** `docs/USER_GUIDE_SK.md`, `docs/USER_GUIDE.md`, and in-app `src/shared/components/HelpModal.tsx`.
2. **Developer Guide (Tier 2):** `docs/DEVELOPER_GUIDE_SK.md` and `docs/DEVELOPER_GUIDE.md` (formulas, data models, Web Worker protocols).
3. **Changelog & Version:** Bump patch version in `package.json` and document in `CHANGELOG.md`.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
