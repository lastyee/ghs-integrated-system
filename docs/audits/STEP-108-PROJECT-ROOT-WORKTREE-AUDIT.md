# STEP 108 — Project Root / Worktree Audit

**Final classification:** `PASS_WITH_WARNING`  
**Canonical project root:** `C:\ghs-integrated-system`  
**Main checkpoint:** `e3ea29b14ed5864b17c91fb6f57a981561d76b41`

## 1. Canonical project root

The canonical VS Code and application project root is `C:\ghs-integrated-system`. It is a Git repository on branch `main` at the expected checkpoint and contains `.git`, `package.json`, `package-lock.json`, `next.config.ts`, `app\`, `prisma\`, `node_modules\`, and `node_modules\next\package.json`.

The separate `C:\ghs-integrated-system\ghs-integrated-system` repository is not the root to open for development: it is also a valid repository, but has no `node_modules` and owns the registered STEP 106 worktree described below.

## 2. Directory inventory

| Path | Git root / type | Branch and HEAD | Project files | Status |
|---|---|---|---|---|
| `C:\ghs-integrated-system` | Independent Git repository | `main`, `e3ea29b14ed5864b17c91fb6f57a981561d76b41` | package files, Next config, `app\`, `prisma\`, `node_modules\` all present | Modified seed and existing untracked files/folders |
| `C:\ghs-integrated-system\ghs-integrated-system` | Valid Git repository and owner of the registered worktree | `main`, same `e3ea29b14ed5864b17c91fb6f57a981561d76b41` | package files, Next config, `app\`, `prisma\` present; `node_modules\` absent | Clean |
| `C:\ghs-integrated-system\ghs-integrated-system.worktrees\diagnose-fix-demo-student-linkage` | Git worktree registered to the nested repository | `agents/diagnose-fix-demo-student-linkage`, same `e3ea29b14ed5864b17c91fb6f57a981561d76b41` | package files, Next config, `app\`, `prisma\`, `node_modules\` present | `prisma/seed.js` modified; STEP 106 report untracked |

The worktree's Git directory resolves to `C:/ghs-integrated-system/ghs-integrated-system/.git/worktrees/diagnose-fix-demo-student-linkage`; its common Git directory is the nested repository's `.git`. Thus the STEP 106 worktree is not registered to the canonical root's separate Git repository.

## 3. Nested directory and worktree investigation

The nested candidate is not an ordinary generated directory or stale filesystem artifact: it is a valid repository at the expected checkpoint, clean, and is the owner of the registered worktree. Its `main` and `agents/diagnose-fix-demo-student-linkage` branches have **0 unique commits in either direction** (`git rev-list --left-right --count main...agents/diagnose-fix-demo-student-linkage` returned `0 0`).

The registered worktree is still in use for this task's changes: its working tree contains the STEP 106 `prisma/seed.js` modification and untracked `docs/audits/STEP-106-DEMO-STUDENT-LINKAGE-FIX.md`. The main repository has the same seed fix. No worktree removal, pruning, or branch deletion was performed.

**Worktree cleanup recommendation: `KEEP_FOR_NOW`.** It is a registered, non-clean worktree; it is not safe to classify it as stale or remove it during this step.

## 4. Git worktree list

`git -C C:\ghs-integrated-system worktree list --porcelain` reports only the canonical root because that repository is separate. The worktree-owner command, `git -C C:\ghs-integrated-system\ghs-integrated-system worktree list --porcelain`, reports:

```text
worktree C:/ghs-integrated-system/ghs-integrated-system
HEAD e3ea29b14ed5864b17c91fb6f57a981561d76b41
branch refs/heads/main

worktree C:/ghs-integrated-system/ghs-integrated-system.worktrees/diagnose-fix-demo-student-linkage
HEAD e3ea29b14ed5864b17c91fb6f57a981561d76b41
branch refs/heads/agents/diagnose-fix-demo-student-linkage
```

## 5. Main repository status and STEP 106 reconciliation

Main is on branch `main` at `e3ea29b14ed5864b17c91fb6f57a981561d76b41`. Its `git diff -- prisma/seed.js` contains the deterministic STEP 106 linkage fix for `student.demo@ghs.local` to Student NIM `260405066`, including guards against overwriting a different existing link. The main and worktree seed files are identical.

Main's seed change is the expected modified source. Other untracked reports, scratch files, and nested directories were observed and left untouched. No commit was created.

## 6. VS Code root recommendation

**Open `C:\ghs-integrated-system` in VS Code.**

Do not open `C:\ghs-integrated-system\ghs-integrated-system` or the isolated worktree as the primary project root. Do not change `turbopack.root`; the canonical root already resolves its own Next.js package.

## 7. Next.js package resolution and dev server

From `C:\ghs-integrated-system`:

- `Test-Path .\node_modules\next\package.json`: **True**
- `node -p "require('./node_modules/next/package.json').version`: **16.3.5**
- Port 3000 was already served by a Node process whose command line referenced `C:\ghs-integrated-system\node_modules\next\dist\server\lib\start-server.js` and `C:\ghs-integrated-system\.next\dev\...`.
- An HTTP request to `http://localhost:3000` returned **200 OK** with HTML.

Because a dev server for the canonical root was already running, a second `npm run dev` was not started; starting another instance would risk contention on the same `.next` output. The existing server was not stopped because it was already running before this audit and may be user-owned. Its live response verifies Next.js package resolution and a working main-root dev server. No server startup logs were available to independently inspect package-lock warning text.

## 8. Database safety

**Database mutation: NONE.** No database connection/query, seed, migration, `db push`, reset, delete, truncate, or cleanup command was run.

## 9. Git / process safety

- Commit: **NONE**
- Push: **NONE**
- Deployment: **NONE**
- Worktree removal/prune: **NONE**
- Nested directory deletion: **NONE**
- `next.config.ts` change: **NONE**
- Existing dev server: left running; it predates this audit.

## 10. Final classification

**PASS_WITH_WARNING** — The canonical root is unambiguous and the main-root Next.js dev server responds successfully. The STEP 106 worktree remains registered to a separate nested repository and still contains uncommitted changes, so it is intentionally classified `KEEP_FOR_NOW` for a separate lifecycle decision.
