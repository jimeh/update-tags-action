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
    tags: v2,v2.2
```

```yaml
- uses: jimeh/update-tags-action@v2
  with:
    tags: |
      v2
      v2.2
```

<!-- x-release-please-end -->

### Deriving Tags from Version

Automatically derive major and minor tags from a semver version string:

```yaml
- uses: jimeh/update-tags-action@v2
  with:
    derive_from: v1.2.3
    # Creates tags: v1, v1.2
```

With a custom template (major tag only):

```yaml
- uses: jimeh/update-tags-action@v2
  with:
    derive_from: v1.2.3
    derive_from_template: '{{prefix}}{{major}}'
    # Creates tag: v1
```

Combine derived tags with explicit tags:

```yaml
- uses: jimeh/update-tags-action@v2
  with:
    derive_from: v1.2.3
    tags: latest
    # Creates tags: latest, v1, v1.2
```

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
      tag_name: ${{ steps.release-please.outputs.tag_name }}
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
          derive_from: ${{ needs.release-please.outputs.tag_name }}
          # Creates tags: v2, v2.2 (for tag_name v2.2.0)
```

<!-- x-release-please-end -->

<!-- action-docs-inputs source="action.yml" -->

## Inputs

| name                   | description                                                                                                                                                                                                              | required | default                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------- |
| `tags`                 | <p>List/CSV of tags to create/update.</p>                                                                                                                                                                                | `false`  | `""`                                                |
| `derive_from`          | <p>Semver version string to derive tags from (e.g., 'v1.2.3'). When provided, generates tags using <code>derive_from_template</code> input. Default template will produce major and minor tags. (e.g., 'v1', 'v1.2')</p> | `false`  | `""`                                                |
| `derive_from_template` | <p>Handlebars template for deriving tags from the <code>derive_from</code> input. CSV/newline-delimited list with placeholders: {{prefix}}, {{major}}, {{minor}}, {{patch}}, {{prerelease}}, {{build}}, {{version}}.</p> | `false`  | `{{prefix}}{{major}},{{prefix}}{{major}}.{{minor}}` |
| `ref`                  | <p>The SHA or ref to tag. Defaults to SHA of current commit.</p>                                                                                                                                                         | `false`  | `${{ github.sha }}`                                 |
| `when_exists`          | <p>What to do if the tag already exists. Must be one of 'update', 'skip', or 'fail'.</p>                                                                                                                                 | `false`  | `update`                                            |
| `annotation`           | <p>Optional annotation message for tags. If provided, creates annotated tags. If empty, creates lightweight tags.</p>                                                                                                    | `false`  | `""`                                                |
| `dry_run`              | <p>If true, logs planned operations without executing them.</p>                                                                                                                                                          | `false`  | `false`                                             |
| `github_token`         | <p>The GitHub token to use for authentication.</p>                                                                                                                                                                       | `false`  | `${{ github.token }}`                               |

<!-- action-docs-inputs source="action.yml" -->

### Derive Template Syntax

The `derive_from_template` input uses [Handlebars](https://handlebarsjs.com/)
for template rendering. Splitting the template into separate tags by comma or
newline is done after the template is rendered.

Available placeholders:

| Placeholder      | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `{{prefix}}`     | `v` or `V` if input had a prefix, empty otherwise     |
| `{{major}}`      | Major version number                                  |
| `{{minor}}`      | Minor version number                                  |
| `{{patch}}`      | Patch version number                                  |
| `{{prerelease}}` | Prerelease identifier (e.g., `beta.1`), empty if none |
| `{{build}}`      | Build metadata (e.g., `build.123`), empty if none     |
| `{{version}}`    | Full version string without prefix                    |

#### Conditional Sections

Use Handlebars `{{#if}}` blocks to include content only when a variable has a
value. This is useful for optional components like prerelease or build metadata:

```yaml
- uses: jimeh/update-tags-action@v2
  with:
    # Creates tag: v1-beta.1
    derive_from: v1.2.3-beta.1
    derive_from_template: |
      {{prefix}}{{major}}{{#if prerelease}}-{{prerelease}}{{/if}}
```

For a stable release without prerelease:

```yaml
- uses: jimeh/update-tags-action@v2
  with:
    # Creates tag: v1 (prerelease section omitted)
    derive_from: v1.2.3
    derive_from_template: |
      {{prefix}}{{major}}{{#if prerelease}}-{{prerelease}}{{/if}}
```

You can also use `{{#unless}}` for inverse logic:

```yaml
- uses: jimeh/update-tags-action@v2
  with:
    # Creates tag: v1-stable (only for non-prerelease versions)
    derive_from: v1.2.3
    derive_from_template: |
      {{prefix}}{{major}}{{#unless prerelease}}-stable{{/unless}}
```

<!-- action-docs-outputs source="action.yml" -->

## Outputs

| name      | description                                    |
| --------- | ---------------------------------------------- |
| `tags`    | <p>List of tags that were created/updated.</p> |
| `created` | <p>List of tags that were created.</p>         |
| `updated` | <p>List of tags that were updated.</p>         |
| `skipped` | <p>List of tags that were skipped.</p>         |

<!-- action-docs-outputs source="action.yml" -->
<!-- action-docs-runs source="action.yml" -->

## Runs

This action is a `node24` action.

<!-- action-docs-runs source="action.yml" -->

## License

[MIT](https://github.com/jimeh/update-tags-action/blob/main/LICENSE)
