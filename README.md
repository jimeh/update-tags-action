<h1 align="center">
  update-tags-action
</h1>

<p align="center">
  <strong>
    Create/update git tags via GitHub API.
  </strong>
</p>

<p align="center">
  <a href="https://github.com/jimeh/update-tags-action/releases">
    <img src="https://img.shields.io/github/v/tag/jimeh/update-tags-action?label=release" alt="GitHub tag (latest SemVer)">
  </a>
  <a href="https://github.com/jimeh/update-tags-action/issues">
    <img src="https://img.shields.io/github/issues-raw/jimeh/update-tags-action.svg?style=flat&logo=github&logoColor=white" alt="GitHub issues">
  </a>
  <a href="https://github.com/jimeh/update-tags-action/pulls">
    <img src="https://img.shields.io/github/issues-pr-raw/jimeh/update-tags-action.svg?style=flat&logo=github&logoColor=white" alt="GitHub pull requests">
  </a>
  <a href="https://github.com/jimeh/update-tags-action/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/jimeh/update-tags-action.svg?style=flat" alt="License Status">
  </a>
</p>

A simple action which makes it easy to create/update one or more tags on a
GitHub repository.

Generally useful for moving major (`v1`) and minor (`v1.2`) tags to same commit
as the latest `v1.x.x` tag. This action uses itself to move it's own major and
minor tags.

## Examples

### Basic

```yaml
- uses: jimeh/update-tags-action@v0
  with:
    tags: v1,v1.2
```

```yaml
- uses: jimeh/update-tags-action@v0
  with:
    tags: |
      v1
      v1.2
```

### With Release Please

This example uses
[jimeh/release-please-manifest-action](https://github.com/jimeh/release-please-manifest-action),
but you can just as easily use the official
[google-github-actions/release-please-action](https://github.com/google-github-actions/release-please-action)
instead.

```yaml
name: Push
on: push

jobs:
  release-please:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'
    steps:
      - uses: jimeh/release-please-manifest-action@v1
        id: release-please
      - uses: jimeh/update-tags-action@v0
        with:
          tags: |
            v${{ steps.release-please.outputs.major }}
            v${{ steps.release-please.outputs.major }}.${{ steps.release-please.outputs.minor }}
```

<!-- action-docs-inputs -->

## Inputs

| parameter    | description                                                                       | required | default             |
| ------------ | --------------------------------------------------------------------------------- | -------- | ------------------- |
| tags         | List/CSV of tags to create/update.                                                | `true`   |                     |
| ref          | The SHA or ref to tag. Defaults to SHA of current commit.                         | `false`  | ${{ github.sha }}   |
| when_exists  | What to do if the tag already exists. Must be one of 'update', 'skip', or 'fail'. | `false`  | update              |
| github_token | The GitHub token to use for authentication.                                       | `false`  | ${{ github.token }} |

<!-- action-docs-inputs -->

<!-- action-docs-outputs -->

## Outputs

| parameter | description                             |
| --------- | --------------------------------------- |
| tags      | List of tags that were created/updated. |
| created   | List of tags that were created.         |
| updated   | List of tags that were updated.         |

<!-- action-docs-outputs -->
