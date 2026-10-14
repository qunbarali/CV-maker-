# CV Maker — Offline Resume Studio

CV Maker is an offline-first desktop CV and resume editor built with **Tauri 2, React, TypeScript and Vite**. It is designed to run locally without accounts, cloud storage, telemetry or remote APIs. Desktop builds store drafts and preferences in an application-local SQLite database and provide portable JSON backups. Browser preview mode falls back to localStorage.

## Current implementation status

This is an active development build, not yet a fully production-certified replacement for commercial resume services. It includes a polished three-panel workspace, a reusable 30-entry template catalog, live preview, local autosave, editor undo/redo, section ordering, custom sections, multiple saved documents, photo positioning/filters, design controls, a cover-letter draft, local keyword analysis, a writing phrase library, JSON backup/import, DOCX generation and PNG export. PDF and cover-letter export use the operating system's print dialog.

The 30 templates currently share rendering primitives and several layout families. The registry is extensible, but each template still needs individual visual QA and pagination checks before being described as production-quality. DOCX and image export depend on locally installed npm packages and must be verified after dependency installation. The ATS score is an explainable heuristic, not a simulation of any specific employer's ATS.

## Stack

- Tauri 2 / Rust: native desktop shell and cross-platform packaging.
- React 18 + TypeScript + Vite: editor, template gallery and live document rendering.
- Lucide React: local vector icons.
- Zustand, Zod and dnd-kit are available in the dependency set for future modular state, validation and richer accessible drag-and-drop work; current editor state and reorder behavior are implemented in React.
- `docx`: local Word document generation.
- `html-to-image`: local PNG/JPEG rendering of the resume preview.

## Requirements

Install Node.js LTS, Rust stable and the platform prerequisites in the [Tauri v2 prerequisites guide](https://v2.tauri.app/start/prerequisites/). Windows builds require Microsoft C++ build tools and WebView2; macOS requires Xcode command-line tools; Linux requires Tauri's documented system libraries.

## Run in development

```bash
npm install
npm run dev
```

Run the desktop shell:

```bash
npm run tauri:dev
```

Run checks and build the frontend:

```bash
npm run typecheck
npm run test
npm run build
```

Package for the current host operating system:

```bash
npm run tauri:build
```

The **Manual validation** GitHub Actions workflow can be started manually to run checks on Linux, Windows and macOS. It does not run on pushes or pull requests.

The build creates the platform bundle(s) configured in `src-tauri/tauri.conf.json`. A Windows machine does not automatically produce a signed/notarized macOS release. Build and test Windows, macOS and Linux releases on their target platforms.

## Main features

- **Editor:** personal details, professional summary, work experience, education, skills/proficiency, projects, certifications, languages and unlimited custom sections.
- **Preview:** live document preview, template switching, theme and design controls, section order and compact/balanced/spacious density.
- **Templates:** 30 catalog entries in classic, modern, minimal, creative, academic, executive, timeline, photo, two-column, colorful and ATS-oriented categories.
- **Documents:** multiple local resumes, rename current document, duplicate a CV, autosave, recent editor undo/redo and keyboard shortcuts (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Ctrl/Cmd+S`).
- **Photo:** local photo upload, downscaling, horizontal/vertical positioning and simple visual filters.
- **Career tools:** local job keyword overlap, a heuristic resume score, phrase prompts and rule-based summary/bullet suggestions. These tools do not invent metrics and cannot predict hiring outcomes.
- **Cover letter:** local editable draft with a CV-based starter prompt and print-to-PDF flow.
- **Exports:** JSON backup/import, DOCX, PNG, and browser/webview print flow for PDF. JPEG export is available through the export helper.
- **Onboarding and localization:** first-run guidance, English/Spanish/Urdu UI controls and a right-to-left shell for Urdu. Translation coverage is partial and should be expanded before release.
- **Privacy:** no account or remote service required for the core editor.

## Offline behavior and privacy

All core editing and analysis features are local. No remote fonts, CDN scripts, cloud AI or analytics are required. The UI may run with the network disabled after dependencies and the app have been installed. Do not confuse installing/updating npm packages with runtime offline behavior: dependencies are resolved at build time and bundled into the app where appropriate.

Desktop drafts are saved in `cv-maker.sqlite3` under the operating-system application-data directory. Writes use SQLite transactions and write-ahead logging. Browser preview uses localStorage, which has storage limits. Photo uploads are downscaled before storage. The database is not encrypted by the app, so protect the OS account and export JSON backups regularly. Schema version checks, SQLite health reporting and portable workspace restore are implemented; native upgrade/recovery behavior still needs runtime verification on the target operating system.

Tauri's default capability is intentionally minimal. Keep native filesystem permissions narrow; validate all imported JSON; never execute imported HTML/scripts; do not trust file paths from imported documents. Do not put personal resumes, photos, database files, signing keys or secrets in Git.

## Release quality checklist

Before calling a release production-ready, verify:

- `npm install`, `npm run typecheck`, `npm run test`, `npm run build` and `npm run tauri build` succeed on a clean checkout.
- Resume creation, edits, autosave, restart, duplicate, rename, delete, undo and redo behave correctly.
- All 30 templates have distinct visual treatment, and long content paginates without clipping.
- PDF has selectable text and correct page breaks; DOCX opens in office suites; PNG/JPEG exports render at intended resolution.
- JSON imports validate shape/schema and never silently replace the wrong document.
- Offline operation works with networking disabled after installation.
- Keyboard accessibility, screen-reader labels, reduced motion, Spanish translations and Urdu RTL are tested.
- Clean install, upgrade and uninstall are tested on each target OS.

## Repository policy

The repository is `qunbarali/CV-maker-`, with `main` as the target branch. Verify repository visibility and permissions in GitHub before publishing releases. Keep build artifacts and local data out of commits. GitHub Actions are manual-only to avoid unnecessary CI-minute usage.

## License

No open-source license has been selected. Choose a license before public redistribution; without one, default copyright rules apply.


## Local database and privacy

Desktop builds use SQLite (`cv-maker.sqlite3`) with write-ahead logging. The database is local to the current operating-system user and is not encrypted by the application; use OS account protections and keep JSON backups in a secure location. Browser preview uses localStorage. Exported DOCX/image files are generated on-device. The manual validation workflow is deliberately `workflow_dispatch`-only to avoid unrequested CI runs.

## Phase 5 — Export workflow

- Added an ATS-readable plain-text (`.txt`) resume export that includes contact details and populated resume sections without HTML markup.
- Added a separate cover-letter DOCX export, preserving paragraph breaks and using document-friendly page margins.
- Export actions now report completion or a readable failure message in the workspace status area.
- Added tests for plain-text export section coverage, blank-section omission, and whitespace trimming.

The PDF action still uses the platform print dialog. Verify print preview, multi-page pagination, and output on Windows, macOS, and Linux before shipping a release. This environment could not complete dependency installation, so the TypeScript checks, tests, and production build are not yet verified.

## Phase 6 — safer backup restore

- JSON backup imports now pass through a dedicated normalizer before the active resume is changed.
- Legacy or partial backups receive safe defaults for missing collections and design preferences.
- Invalid section names, malformed nested entries, unsupported image data URLs, and out-of-range design values are filtered or bounded.
- Imported documents receive a fresh internal ID so importing a backup does not overwrite an existing document with the same ID.
- Backup files larger than 15 MB are rejected before parsing, and file-read errors are shown in the UI.
- Automated tests cover invalid input, backup envelopes, partial/legacy data, design bounds, and section ordering.

The normalizer is a defensive compatibility layer, not a malware scanner. Only import backups from sources you trust, and keep sensitive resume exports private.


## Phase 7 — persistence reliability

- Native SQLite writes are serialized and their errors now propagate to the UI instead of being logged and silently swallowed.
- Autosave and explicit save actions show a failure notice when the durable write fails, including a reminder to export a backup.
- Settings persistence failures are surfaced in the workspace status.
- Browser storage failures now reject the save operation rather than reporting success when localStorage is unavailable or full.
- Added a flush hook for callers that need to await pending native writes before a controlled shutdown or workflow transition.

This is improved failure reporting, not a guarantee against disk failure or sudden power loss. Test native SQLite behavior on target operating systems before production release.


## Phase 8 — SQLite health and schema safety

- Initializes the SQLite schema in a versioned, idempotent transaction (`PRAGMA user_version = 1`).
- Runs SQLite `quick_check` during desktop startup and refuses to continue when integrity is not `ok`.
- Exposes a read-only `database_health` Tauri command with integrity, schema version, resume count, and settings count.
- Adds a typed frontend helper to request the health report and validate its fields.
- Adds unit coverage for healthy and unhealthy health reports.

The diagnostics panel is now available from the design settings popover. It reports native SQLite integrity, schema version, saved CV count, and settings count. Browser preview explains that native SQLite checks require the desktop build. Run `npm run check` and `npm run tauri:build` on a machine with dependencies installed before shipping.


## Phase 9 — workspace recovery and diagnostics

- Added a user-facing native database diagnostics panel with an explicit re-check action and readable integrity/schema/record-count results.
- Added a workspace backup format (`schemaVersion: 2`) that exports all saved CVs plus interface language and cover-letter draft settings.
- Workspace restore accepts the multi-CV format and the older single-CV backup format, normalizes imported documents, limits imports to 500 CVs and 15 MB, merges with existing documents, and restores supported settings.
- Restore reports save failures instead of claiming that data was recovered when durable persistence fails.

**Release status:** this is a further development phase, not a claim of production completion. Dependency installation timed out in this environment, so TypeScript checks, automated tests, the Tauri build, and runtime verification remain unverified. Test backup round trips and native SQLite diagnostics on the target Windows machine before relying on them for important data.


## Phase 10 — release-candidate hardening

- Added the explicit `serde` derive dependency required by the Rust database-health response type.
- Refuse to open a database with a schema version newer than the running app supports, instead of silently downgrading its version marker.
- Hardened workspace restore merging: exact duplicate resume content is deduplicated, distinct revisions with the same title/name are preserved, and the app refuses a restore that would exceed the 500-document limit instead of silently truncating existing CVs.
- Bound imported cover-letter drafts to 1,000,000 characters and restore the onboarding preference alongside supported language and cover-letter settings.
- Added unit cases for workspace deduplication, same-title revisions and non-destructive capacity limits.

**Final verification status:** source edits and configuration syntax have been reviewed, but this environment could not install npm dependencies and does not have Cargo/Rust installed. TypeScript diagnostics are therefore blocked by missing React/Tauri/export dependencies; Vitest and the native desktop build have not run. Treat this ZIP as a release-candidate source package, not a verified installer. Run the documented `npm run check` and `npm run tauri:build` commands on a Windows development machine before relying on it for important CV data.


## Native application icons and storage safeguards

- Tauri bundle icons are checked into `src-tauri/icons/` for Windows (`icon.ico`), macOS (`icon.icns`) and Linux PNG bundles. The icon paths are explicitly declared in `src-tauri/tauri.conf.json` to avoid default `icon.ico` lookup failures.
- Native SQLite is authoritative in desktop mode. A native read/parse failure now pauses editing instead of falling back to stale browser data and potentially overwriting the database.
- Workspace writes validate document IDs, duplicate IDs, per-document size and total size before starting the replacement transaction.
- Backup deduplication ignores generated IDs and timestamps recursively, including nested experience, education and skill IDs.

## Phase 11 — source audit and native icon fix

- Added explicit Windows, macOS and Linux icon assets and declared all five icon paths in the Tauri bundle configuration. `npm run tauri:build` validates icon presence and file headers before invoking Tauri.
- Changed desktop storage hydration so native SQLite errors do not fall back to stale browser storage. The editor stays blocked until CVs and settings load successfully, preventing startup autosave from replacing native data with cached state.
- Corrected empty-database hydration so stale browser-cache CVs are not silently restored into an empty native database.
- Validated the full resume replacement before beginning the SQLite transaction, including unique/matching document IDs and per-document/workspace size limits.
- Fixed workspace backup deduplication to ignore generated IDs/timestamps recursively, including nested experience, education and skill records.
- Added tests for nested-ID deduplication and non-integer database schema versions.

**Verification note:** TypeScript/TSX syntax transpilation, JSON configuration parsing, icon file checks, whitespace checks, and all 19 current unit-test cases via a dependency-free local harness passed. The official Vitest run, full TypeScript type-check, and native Rust/Tauri build remain unverified because npm dependency installation timed out and Cargo is not installed in this environment. The local harness is not a substitute for Vitest or a native build.
