# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 15 TypeScript app using the App Router. Routes and top-level views live in `src/app`; reusable UI lives in `src/components`. Simulator UI is under `src/components/simulator`, wizard UI under `src/components/wizard`, and shared primitives under `src/components/ui`. Domain calculations and state helpers live in `src/lib`; fiscal, NHS, OBR, OECD, and historical datasets live in `src/data`. Static assets and JSON fallbacks are in `public`, including `public/data/*.json`. Tests are colocated as `*.test.ts`.

## Build, Test, and Development Commands

- `npm install`: install dependencies; Node `>=20.0.0` required.
- `npm run dev`: start the local Next dev server with Turbopack.
- `npm run build`: create a production build.
- `npm run start`: serve the built app.
- `npm run typecheck`: run `tsc --noEmit` with strict TypeScript settings.
- `npm run test`: run the Vitest suite once.
- `npm run test:watch`: run Vitest in watch mode while editing.
- `npm run ci`: run typecheck, tests, and production build in sequence.

## Coding Style & Naming Conventions

Use TypeScript for application and data logic. Prefer named exports for shared helpers and keep domain types close to the code that owns them. Use the `@/` alias for imports from `src`, for example `@/lib/scenario`. Follow the local file style; newer UI code generally uses two-space indentation while much of the data/model code uses tabs. Components exported as app views use PascalCase filenames, while utilities use kebab-case or descriptive lowercase names such as `baseline-projection.ts`.

## Testing Guidelines

Vitest is configured in `vitest.config.ts` and includes `src/**/*.test.ts`. Add focused unit tests beside changed code, especially for fiscal calculations, URL state, currency conversion, and data-source parsing. Prefer deterministic fixtures and explicit numeric assertions over broad snapshots. Run `npm run test` and `npm run typecheck` before submitting; use `npm run ci` for release-level confidence.

## Commit & Pull Request Guidelines

Recent history uses short Conventional Commit-style subjects, mainly `feat: ...` and `fix: ...`; keep subjects imperative and specific, for example `fix: allow zero tax delta`. Pull requests should include a brief problem statement, change summary, test results, and screenshots or recordings for visible UI changes. Link issues or data-source updates where relevant.

## Security & Configuration Tips

Use `.env.example` as the template for optional live data URLs such as `NHS_BUDGET_DATA_URL`, `OBR_BASELINE_DATA_URL`, and `ONS_PSF_HISTORICAL_URL`. Do not commit `.env.local`, build output, or generated cache files. When updating public data, preserve the JSON shapes consumed by `src/data/sources`.
