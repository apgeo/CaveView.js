# Project Guidelines: CaveView 2.x NextGen

## 🏗 Architecture
This project uses a **Dual-Engine** architecture:
- **Engine v1 (Standard):** Located in `src/v1/`. Handles `.lox`, `.3d`, `.plt` and smaller PLY files using Mesh reconstruction.
- **Engine v2 (NextGen):** Located in `src/v2/`. Specialized for massive LiDAR data using Octree LOD, Streaming, and EDL shading.
- **Shared:** Located in `src/shared/`. Contains types, business logic, and UI components used by both engines.

## 🚀 Engine v2 (NextGen) Tech Stack
- **Octree:** Hierarchical spatial indexing managed in `pointcloud.worker.ts`.
- **Shaders:** Custom WebGL shaders for point size attenuation and normal-based lighting.
- **EDL:** Eye-Dome Lighting post-processing pass for depth perception.
- **Navigation:** GSAP-powered smooth flight (Street View style) with Undo history.
- **Terrain:** `three-geo` integration for Mapbox 3D surface visualization.

## 🛠 Development Rules
- **Maintain Parity:** Every feature added to the platform must work in both engines where applicable (e.g., clipping, measurement, calibration).
- **Type Safety:** Use shared types from `@shared/types` to ensure cross-engine compatibility.
- **Performance First:** Heavy processing (parsing, indexing) MUST be offloaded to Web Workers.
- **LiDAR Benchmark:** The "Erna" model (6.2M points) is the primary performance benchmark. Always verify 60 FPS in v2 before committing engine changes.
- **AST Code Search & Refactor:** Use `ast-grep` (`sg run -p ...`) for structural multi-line code search, syntax-aware refactoring, and AST inspections across TS/TSX.
- **E2E & Visual Verification:** Use `playwright-cli` for automated browser interactions, UI validation, and screenshot captures.
- **Automated Dual-Tier Documentation Maintenance (Mandatory):**
  - Whenever adding a new feature, modifying UI tools, or altering rendering/mathematical logic:
    1. **User Guide (SK & EN):** Update `docs/USER_GUIDE_SK.md`, `docs/USER_GUIDE.md`, and in-app `src/shared/components/HelpModal.tsx`.
    2. **Developer Guide (SK & EN):** Update `docs/DEVELOPER_GUIDE_SK.md` and `docs/DEVELOPER_GUIDE.md` with mathematical formulations, data schemas, and architecture flows.
    3. **Changelog & Versioning:** Bump patch version in `package.json` and document entries in `CHANGELOG.md`.

## graphify
This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

