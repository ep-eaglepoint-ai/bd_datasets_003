# VOVB0F - Color palette tool

Build and run tests or evaluation in Docker from this folder (`vovb0f-color-pallete-tool`). Commands below are for **WSL** only.

**Go to project in WSL:**

```bash
cd "/mnt/c/Users/teshi/Desktop/Projects/Eaglepoint AI/day one/bd_datasets_003/vovb0f-color-pallete-tool"
```

---

## 1. Repository Before (Docker)

Run the requirement test suite against the **baseline** state (`repository_before`). Build the image from the current repo, then run tests.

```bash
docker build -t vovb0f-color-palette .
docker run --rm vovb0f-color-palette npm test
```

One-liner:

```bash
docker build -t vovb0f-color-palette . && docker run --rm vovb0f-color-palette npm test
```

---

## 2. Repository After (Docker)

Run the requirement test suite against the **solution** state (`repository_after`). Rebuild the image after you change code, then run tests.

```bash
docker build -t vovb0f-color-palette .
docker run --rm vovb0f-color-palette npm test
```

One-liner:

```bash
docker build -t vovb0f-color-palette . && docker run --rm vovb0f-color-palette npm test
```

---

## 3. Evaluation (Docker)

Run the evaluation script and write `evaluation/report.json` on your machine. Use a volume so the file appears in your project folder.

```bash
docker build -t vovb0f-color-palette .
docker run --rm -v "$(pwd)/evaluation:/app/evaluation" vovb0f-color-palette npm run evaluate
```

One-liner:

```bash
docker build -t vovb0f-color-palette . && docker run --rm -v "$(pwd)/evaluation:/app/evaluation" vovb0f-color-palette npm run evaluate
```

After this, `evaluation/report.json` is created (or updated). It is listed in `.gitignore`.

---

## Without Docker

From this folder:

```bash
npm install
npm test
npm run evaluate
```
