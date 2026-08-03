---
name: Orval 8 Zod v4 import fix
description: orval 8.x generates z.int() and other Zod v4 APIs but imports from bare 'zod' (v3). Fix with post-process sed step.
---

## Rule
After running orval codegen, the generated files import `from 'zod'` but use Zod v4 APIs (e.g. `z.int()`). The workspace has `zod@3.x` which ships a `/v4` compat export. Fix by patching the import in the codegen script.

## Why
The `importZodFrom` orval config option (v8.23) does not actually change the import path in generated files. The only reliable fix is a post-process `sed` command.

## How to apply
In `lib/api-spec/package.json` codegen script, add after the orval command:
```
find ../../lib/api-zod/src/generated -name '*.ts' -exec sed -i "s|from 'zod'|from 'zod/v4'|g" {} \;
```

Full script:
```json
"codegen": "orval --config ./orval.config.ts && find ../../lib/api-zod/src/generated -name '*.ts' -exec sed -i \"s|from 'zod'|from 'zod/v4'|g\" {} \\; && pnpm -w run typecheck:libs"
```
