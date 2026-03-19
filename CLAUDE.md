# Claude Code conventions

## Branch naming

- Bug fix: `fix-<short-description>`
- Feature: `feature-<short-description>`
- Always create from latest `main` and push to remote immediately before making any changes.
- Do NOT work on auto-generated worktree branches (e.g. `claude/*`). Always create a properly named branch in the main repo.

## PR title format

- Single issue: `fix: <description> (COM-X)`
- Multiple issues: `fix: <description> (COM-X, COM-Y)`
- Feature: `feat: <description> (COM-X)`
- Include a `Closes COM-X` line in the body for each issue.

## Merge strategy

- Squash merge: `gh pr merge --squash`
- Use `-D` (not `-d`) to delete local branches after squash merge — git sees squash commits as unmerged.

## gh CLI

Installed at `/opt/homebrew/bin/gh`. Always use `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"` before invoking `gh`.

## Post-merge cleanup sequence

1. Confirm Vercel production deploy succeeded (ask user).
2. Mark Linear issues Done via Linear MCP tool (`mcp__4e40c17b-0f30-409a-a868-b0ab924392ff__save_issue` with `state: "Done"`).
3. Update docs if user-facing behaviour changed.
4. `git push origin --delete <branch>`
5. `git checkout main && git pull`
6. `git branch -D <branch>`
7. Ask if any related issues were also resolved.

## Linear issue description formatting

Pass descriptions with real newline characters (not `\n` escape sequences) to avoid literal `\n\n` rendering in the Linear UI.
