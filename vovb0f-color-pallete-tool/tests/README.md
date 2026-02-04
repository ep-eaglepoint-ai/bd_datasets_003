# Test suite – Color Palette Tool

Requirement tests are in **TypeScript (Vitest)** and live in this `tests/` folder. All test files start with `test.`.

## Layout

| Path | Description |
|------|-------------|
| `helpers/sourceFiles.ts` | Path and file read helpers for `repository_after/color-pallete-tool/src` |
| `test.paletteGenerator.test.ts` | Req 1 – 5-color generator, lock, Generate New |
| `test.imageExtractor.test.ts` | Req 2 – Image upload, Vibrant/Muted/Dominant |
| `test.colorPicker.test.ts` | Req 3 – Color picker, contrast, complementary |
| `test.saveCollections.test.ts` | Req 4 – Save, library, collections, tags |
| `test.export.test.ts` | Req 5 – Export: CSS, Tailwind, SCSS, JSON, PNG |
| `test.gallery.test.ts` | Req 6 – Public gallery, filter, copy/save |

## Run

From the **vovb0f-color-pallete-tool** folder (parent of `tests/`):

```bash
npm install
npm test
```

Or only requirement tests (same as above when all tests are in `tests/`):

```bash
npm run test:requirements
```

Run one file:

```bash
npx vitest run tests/test.paletteGenerator.test.ts
```

## What is tested

- **Static/code checks**: Required files exist under `repository_after/color-pallete-tool/src`; required strings/patterns appear in source. No server or browser is started.
- Vitest runs with **Node** environment; the helper resolves paths from `tests/helpers` to `repository_after/color-pallete-tool/src`.
