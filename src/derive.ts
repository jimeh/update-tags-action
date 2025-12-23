import { parse } from 'csv-parse/sync'
import Handlebars from 'handlebars'
import * as semver from 'semver'

/**
 * Context containing parsed semver components for template rendering.
 */
export interface SemverContext {
  /** "v" or "V" if input had a prefix, empty string otherwise */
  prefix: string
  /** Major version number */
  major: number
  /** Minor version number */
  minor: number
  /** Patch version number */
  patch: number
  /** Prerelease identifier (e.g., "beta.1"), empty if none */
  prerelease: string
  /** Build metadata (e.g., "build.123"), empty if none */
  build: string
  /** Full version string without prefix */
  version: string
}

/**
 * Parse a version string into semver components.
 *
 * @param input - Version string (e.g., "v1.2.3", "1.2.3-beta.1+build.456")
 * @returns Parsed semver context
 * @throws Error if the version string is not valid semver
 */
export function parseSemver(input: string): SemverContext {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Invalid semver: empty string')
  }

  // Check for v/V prefix and preserve original case
  const firstChar = trimmed[0]
  const hasPrefix = firstChar === 'v' || firstChar === 'V'
  const prefix = hasPrefix ? firstChar : ''
  const versionStr = hasPrefix ? trimmed.slice(1) : trimmed

  // Parse with semver library
  const parsed = semver.parse(versionStr)
  if (!parsed) {
    throw new Error(`Invalid semver: '${input}'`)
  }

  return {
    prefix,
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease.join('.'),
    build: parsed.build.join('.'),
    version: parsed.version
  }
}

/**
 * Render a single template string with semver context using Handlebars.
 * Supports {{#if variable}}...{{/if}} conditionals for optional sections.
 *
 * @param template - Handlebars template string
 * @param ctx - Semver context for substitution
 * @returns Rendered string
 */
export function renderTemplate(template: string, ctx: SemverContext): string {
  const compiled = Handlebars.compile(template, { noEscape: true })
  // Convert numbers to strings so 0 is truthy in conditionals
  const stringCtx = {
    ...ctx,
    major: String(ctx.major),
    minor: String(ctx.minor),
    patch: String(ctx.patch)
  }
  return compiled(stringCtx)
}

/**
 * Derive tags from a semver version string using a template.
 *
 * @param deriveFrom - Semver version string (e.g., "v1.2.3")
 * @param template - CSV/newline-delimited Handlebars template string
 * @returns Array of derived tag strings
 */
export function deriveTags(deriveFrom: string, template: string): string[] {
  const ctx = parseSemver(deriveFrom)

  // Render template with Handlebars first, enabling conditional tag inclusion
  const rendered = renderTemplate(template, ctx)

  // Parse rendered result as CSV/newline delimited
  const tags = (
    parse(rendered, {
      delimiter: ',',
      trim: true,
      relax_column_count: true
    }) as string[][]
  ).flat()

  // Exclude empty tags and tags that are just the prefix with no version data
  return tags.filter((tag) => tag.length > 0 && tag !== ctx.prefix)
}
