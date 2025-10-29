---
alwaysApply: true
---

# AGENTS.md

This file provides guidance to LLM agents when working with code in this
repository.

## Project Overview

GitHub Action that creates/updates Git tags in repositories. Commonly used to
maintain major (`v1`) and minor (`v1.2`) version tags pointing to the latest
patch release (`v1.2.3`). The action uses itself in CI to manage its own version
tags.

**Important**: TypeScript sources in `src/` are transpiled to JavaScript in
`dist/`. Both are checked into the repository. A CI workflow verifies `dist/` is
up-to-date. Always run `npm run package` (or `npm run bundle`) after modifying
`src/` files.

## Development Commands

Package manager: npm (Node 24 via mise.toml)

```bash
# Install dependencies
npm install

# Development workflow
npm run format:write  # Format code with Prettier (80 char lines)
npm run lint          # ESLint check
npm run test          # Run Jest tests
npm run package       # Build src/index.ts -> dist/index.js via Rollup
npm run bundle        # Alias: format + package

# Run a single test file
NODE_OPTIONS=--experimental-vm-modules NODE_NO_WARNINGS=1 npx jest tests/main.test.ts

# CI variants (suppress warnings)
npm run ci-test       # Run tests in CI mode

# Full pre-commit check
npm run all  # format → lint → test → coverage → update-readme → package

# Update README from action.yml
npm run update-readme

# Watch mode
npm run package:watch # Auto-rebuild on changes
```

## Code Architecture

### Source Structure

- **[src/index.ts](src/index.ts)**: Entrypoint that imports and runs `main()`
- **[src/main.ts](src/main.ts)**: Core orchestration logic. Exports `run()`
  function that coordinates input parsing, tag processing, and output setting
- **[src/inputs.ts](src/inputs.ts)**: Input parsing and validation. Exports
  `getInputs()` that reads action inputs and `Inputs` interface
- **[src/tags.ts](src/tags.ts)**: Tag parsing and processing logic:
  - `parseTagsInput()`: Parses CSV/newline input, handles `tag:ref` syntax,
    pre-resolves all unique refs to SHAs in parallel (optimization)
  - `processTag()`: Creates/updates individual tags based on `when_exists` mode
  - `resolveRefToSha()`: Converts git refs to commit SHAs (private helper)
- **[action.yml](action.yml)**: GitHub Action metadata (inputs/outputs)
- **[tests/fixtures/](tests/fixtures)**: Mock implementations of @actions/core,
  @actions/github, and csv-parse for testing

### Tag Input Parsing

Uses `csv-parse/sync` to handle both CSV and newline-delimited formats. Supports
per-tag ref overrides: `v1:main` tags `v1` to `main` branch.

### Tag Update Logic

1. Parse and validate inputs ([inputs.ts](src/inputs.ts))
2. Parse tags and extract per-tag refs ([tags.ts](src/tags.ts):parseTagsInput)
3. Pre-resolve all unique refs to SHAs in parallel (optimization)
4. For each tag ([tags.ts](src/tags.ts):processTag):
   - If exists + update mode: Update if SHA differs
   - If exists + skip mode: Skip silently
   - If exists + fail mode: Fail action
   - If doesn't exist (404): Create it
5. Set outputs with created/updated tag lists ([main.ts](src/main.ts))

### Testing Patterns

Uses Jest with ESM support. Key pattern for mocking ESM modules:

```typescript
// Declare mocks BEFORE importing tested module
jest.unstable_mockModule('@actions/core', () => core)

// Dynamic import AFTER mocks
const { run } = await import('../src/main.ts')
```

Mock fixtures live in `tests/fixtures/` (e.g., `core.ts` mocks @actions/core).

### Testing Best Practices

- Consider edge cases as well as the main success path
- Tests live in `tests/` directory, fixtures in `tests/fixtures/`
- Run tests after any refactoring to ensure coverage requirements are met
- Use `@actions/core` package for logging (not `console`) for GitHub Actions
  compatibility

## TypeScript Configuration

- Target: ES2022, NodeNext module resolution
- Strict mode enabled throughout
- Build outputs ESM to dist/index.js with external sourcemaps
- Line length: 80 chars (enforced by Prettier)

## CI/CD

`.github/workflows/ci.yml` runs:

1. **check-dist**: Verify bundled dist/ matches source
2. **lint**: ESLint with GitHub formatter
3. **release-please**: Semantic versioning releases
4. **release-tags**: Self-referential tag updates after release

## Release Process

This project uses [release-please](https://github.com/googleapis/release-please)
to automate versioning and releases based on
[Conventional Commits](https://www.conventionalcommits.org/).

### How It Works

1. **Commit with conventional format**: All commits must follow the Conventional
   Commits specification (e.g., `feat:`, `fix:`, `chore:`, `docs:`)
2. **Release PR is created**: release-please automatically opens/updates a
   "Release PR" that:
   - Proposes the next version number based on commit types
   - Updates `CHANGELOG.md` with all changes since last release
   - Updates version numbers in `package.json` and other files
3. **Review the Release PR**: Check the proposed version bump and changelog
   entries are correct
4. **Merge to release**: Merging the Release PR triggers:
   - Creation of a GitHub Release with the changelog
   - Publishing of a new Git tag
   - Execution of the `release-tags` workflow to update major/minor version tags

### Conventional Commit Format

All commit messages must follow this format:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Common types:**

- `feat:` - New feature (triggers minor version bump)
- `fix:` - Bug fix (triggers patch version bump)
- `docs:` - Documentation changes only
- `chore:` - Maintenance tasks, dependency updates
- `refactor:` - Code refactoring without feature/behavior changes
- `test:` - Adding or updating tests
- `ci:` - CI/CD configuration changes
- `BREAKING CHANGE:` - In footer, triggers major version bump

**Examples:**

```text
feat: add support for multiple tag formats

fix: handle 404 errors when tag doesn't exist

docs: update README with new examples

chore(deps): bump @actions/core to v1.10.0
```

## Action Interface

**Inputs:**

- `tags`: CSV/newline list, supports `tag:ref` syntax
- `ref`: SHA/ref to tag (default: current commit)
- `when_exists`: update|skip|fail (default: update)
- `github_token`: Auth token (default: github.token)

**Outputs:**

- `tags`: All created/updated tags
- `created`: Newly created tags
- `updated`: Updated tags

## Code Style and Guidelines

- 80 character line length (Prettier)
- No semicolons, single quotes, no trailing commas
- Explicit function return types
- Type imports: `import type * as core from '@actions/core'`
- Error handling via try-catch with `core.setFailed()`
- 404 errors specifically caught to distinguish "tag doesn't exist" from other
  errors
- Use descriptive variable and function names
- Keep functions focused and manageable
- Document functions with JSDoc comments
- Follow DRY principles and avoid unnecessary complexity
- Maintain consistency with existing patterns and style
- Focus comments on explaining "why", not "what" (avoid basic unnecessary
  comments)
- Use TypeScript's type system for safety and clarity

## Pull Request Guidelines

When creating a pull request (PR), please ensure that:

- Keep changes focused and minimal (avoid large changes, or consider breaking
  them into separate, smaller PRs)
- Formatting checks pass
- Linting checks pass
- Unit tests pass and coverage requirements are met
- The action has been transpiled to JavaScript and the `dist` directory is
  up-to-date with the latest changes in the `src` directory
- If necessary, the `README.md` file is updated to reflect any changes in
  functionality or usage

The body of the PR should include:

- A summary of the changes
- A special note of any changes to dependencies
- A link to any relevant issues or discussions
- Any additional context that may be helpful for reviewers

## Code Review Guidelines

When performing a code review, please follow these guidelines:

- If there are changes that modify the functionality/usage of the action,
  validate that there are changes in the `README.md` file that document the new
  or modified functionality
