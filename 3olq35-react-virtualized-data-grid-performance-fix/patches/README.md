Dependencies are installed in a single **root** `node_modules` (npm workspaces). So `repository_before/` and `repository_after/` do not contain `node_modules`. To create `diff.patch`, run from project root (ensure `repository_after/dist` is absent or delete it first):

```bash
git diff --no-index repository_before/ repository_after/ > patches/diff.patch
```
