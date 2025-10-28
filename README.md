<div align="center">

# update-tags-action

**Easily create/update one or more Git tags in a GitHub repository.**

[![Latest Release](https://img.shields.io/github/release/jimeh/update-tags-action.svg)](https://github.com/jimeh/update-tags-action/releases)
[![GitHub Issues](https://img.shields.io/github/issues/jimeh/update-tags-action.svg?logo=github&logoColor=white)](https://github.com/jimeh/update-tags-action/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/jimeh/update-tags-action.svg?logo=github&logoColor=white)](https://github.com/jimeh/update-tags-action/pulls)
[![License](https://img.shields.io/github/license/jimeh/update-tags-action.svg)](https://github.com/jimeh/update-tags-action/blob/main/LICENSE)

</div>

Generally useful for moving major (`v1`) and minor (`v1.2`) tags to same commit
as the latest `v1.x.x` tag.

This action
[uses itself](https://github.com/jimeh/update-tags-action/blob/main/.github/workflows/ci.yml)
to move its own major and minor tags.

## Examples

### Basic

<!-- x-release-please-start-minor -->

```yaml
- uses: jimeh/update-tags-action@v2
  with:
    tags: v2,v2.1
```

```yaml
- uses: jimeh/update-tags-action@v2
  with:
    tags: |
      v2
      v2.1
```

<!-- x-release-please-end -->

### With Release Please

This example uses
[jimeh/release-please-manifest-action](https://github.com/jimeh/release-please-manifest-action),
but you can just as easily use the official
[google-github-actions/release-please-action](https://github.com/google-github-actions/release-please-action)
instead.

First you'll want the workflow setup to run on push:

```yaml
on: [push]
```

Then you'll want a release-please job which only runs on pushes to your `main`
branch, and exposes relevant outputs from release please:

```yaml
jobs:
  # [...]
  release-please:
    runs-on: ubuntu-latest
    if: ${{ github.ref == 'refs/heads/main' }}
    outputs:
      release_created: ${{ steps.release-please.outputs.release_created }}
      major: ${{ steps.release-please.outputs.major }}
      minor: ${{ steps.release-please.outputs.minor }}
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - uses: jimeh/release-please-manifest-action@v3
        id: release-please
```

And finally a job to create MAJOR and MINOR release tags, which only runs when
release-please reports having created a release:

<!-- x-release-please-start-major -->

```yaml
jobs:
  # [...]
  release-tags:
    runs-on: ubuntu-latest
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created }}
    permissions:
      contents: write
    steps:
      - uses: jimeh/update-tags-action@v2
        with:
          tags: |
            v${{ needs.release-please.outputs.major }}
            v${{ needs.release-please.outputs.major }}.${{ needs.release-please.outputs.minor }}
```

<!-- x-release-please-end -->

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

## License

[MIT](https://github.com/jimeh/update-tags-action/blob/main/LICENSE)
