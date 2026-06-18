# Agent Workflow

## Architecture Constraints

- The user does not maintain a separate public `server`.
- Any service-oriented capability must continue using the official `server` from the upstream/main repository.
- For all future feature work and modifications, treat the `server` as locked to `main` branch behavior unless the user explicitly says otherwise.
- Only non-`server` parts may be customized, built, and released independently by the user.
- The scaffold/package variant used to distinguish these non-`server` customizations is called `happy-fe`.

## User Confirmation Required

- Do not create a `worktree` for this repository unless the user explicitly changes this rule.
- Do not create or switch to another branch for feature development. All development and functional changes must happen on the current branch.

Do not commit code directly. Ask the user for confirmation before creating a commit.

## Documentation Sync

For larger changes, check whether related documentation should also be updated to reflect the new behavior or constraints.

## Post-change Handoff

After each code change, if any related service, CLI, app, or environment needs to be restarted, reinstalled, rebuilt, or rerun, explicitly tell the user the exact command(s).

Examples include:

- If the CLI change requires reinstalling `happy-fe`, tell the user to run `pnpm --filter happy cli:install:fe`.
- If a local service must be restarted, provide the exact restart command.
- If the iOS app must be reinstalled or rerun, provide the exact command or steps required in this repo.

## Sync To Main

When the user says `sync to main` or `synt to main`, they mean:

1. Fetch `origin/main`.
2. Rebase the current branch on `origin/main`.
3. Push the current HEAD directly to `main` with a normal push, for example:
   `git push origin HEAD:main`

Do not force push for this workflow.
