# Build emitted only changed files

Fixed in `5fc8f50`.

## Cause

`tsc` runs with `incremental: true`, so it keeps `tsconfig.tsbuildinfo` to skip
unchanged files. The `build` script removed `dist` but **not** the buildinfo:

```
rimraf dist && tsc -p .
```

`tsc` then saw a buildinfo claiming the output was current, and emitted only the
files that had changed since — so `dist/tool.js` and `dist/env.js` were missing
from the published package. Requiring the built client failed on `./tool`.

## Fix

Clear the buildinfo before compiling, so the build is always complete:

```
rimraf dist tsconfig.tsbuildinfo && tsc -p . && ...
```

## Notes

- Surfaced only because a test required the built output. `tsc --noEmit` does not
  catch it, so this class of bug is invisible to type checking.
- The build script separately removes `dist/*.test.js` etc., but those globs do
  not match `dist/test.js` — the test file still ships in the npm tarball.
