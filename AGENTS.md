# Agent Workflow

## User Confirmation Required

Before creating a `worktree`, ask the user for confirmation.

Do not commit code directly. Ask the user for confirmation before creating a commit.

## Sync To Main

When the user says `sync to main` or `synt to main`, they mean:

1. Fetch `origin/main`.
2. Rebase the current branch on `origin/main`.
3. Push the current HEAD directly to `main` with a normal push, for example:
   `git push origin HEAD:main`

Do not force push for this workflow.
