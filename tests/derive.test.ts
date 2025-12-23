/**
 * Unit tests for the derive module, src/derive.ts
 */
import { parseSemver, renderTemplate, deriveTags } from '../src/derive.js'

describe('parseSemver', () => {
  it('parses simple version without prefix', () => {
    const result = parseSemver('1.2.3')
    expect(result).toEqual({
      prefix: '',
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: '',
      build: '',
      version: '1.2.3'
    })
  })

  it('parses version with v prefix', () => {
    const result = parseSemver('v1.2.3')
    expect(result).toEqual({
      prefix: 'v',
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: '',
      build: '',
      version: '1.2.3'
    })
  })

  it('parses version with uppercase V prefix', () => {
    const result = parseSemver('V1.2.3')
    expect(result).toEqual({
      prefix: 'V',
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: '',
      build: '',
      version: '1.2.3'
    })
  })

  it('parses version with prerelease', () => {
    const result = parseSemver('v1.0.0-beta.1')
    expect(result).toEqual({
      prefix: 'v',
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: 'beta.1',
      build: '',
      version: '1.0.0-beta.1'
    })
  })

  it('parses version with build metadata', () => {
    const result = parseSemver('v1.0.0+build.456')
    expect(result).toEqual({
      prefix: 'v',
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: '',
      build: 'build.456',
      version: '1.0.0'
    })
  })

  it('parses version with both prerelease and build metadata', () => {
    const result = parseSemver('v1.2.3-alpha.1+build.789')
    expect(result).toEqual({
      prefix: 'v',
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: 'alpha.1',
      build: 'build.789',
      version: '1.2.3-alpha.1'
    })
  })

  it('handles whitespace around version string', () => {
    const result = parseSemver('  v1.2.3  ')
    expect(result).toEqual({
      prefix: 'v',
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: '',
      build: '',
      version: '1.2.3'
    })
  })

  it('throws on empty string', () => {
    expect(() => parseSemver('')).toThrow('Invalid semver: empty string')
  })

  it('throws on whitespace only', () => {
    expect(() => parseSemver('   ')).toThrow('Invalid semver: empty string')
  })

  it('throws on invalid semver', () => {
    expect(() => parseSemver('not-a-version')).toThrow(
      "Invalid semver: 'not-a-version'"
    )
  })

  it('throws on incomplete version', () => {
    expect(() => parseSemver('v1.2')).toThrow("Invalid semver: 'v1.2'")
  })
})

describe('renderTemplate', () => {
  const ctx = {
    prefix: 'v',
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: 'beta.1',
    build: 'build.456',
    version: '1.2.3-beta.1'
  }

  it('renders prefix placeholder', () => {
    expect(renderTemplate('{{prefix}}', ctx)).toBe('v')
  })

  it('renders major placeholder', () => {
    expect(renderTemplate('{{major}}', ctx)).toBe('1')
  })

  it('renders minor placeholder', () => {
    expect(renderTemplate('{{minor}}', ctx)).toBe('2')
  })

  it('renders patch placeholder', () => {
    expect(renderTemplate('{{patch}}', ctx)).toBe('3')
  })

  it('renders prerelease placeholder', () => {
    expect(renderTemplate('{{prerelease}}', ctx)).toBe('beta.1')
  })

  it('renders build placeholder', () => {
    expect(renderTemplate('{{build}}', ctx)).toBe('build.456')
  })

  it('renders version placeholder', () => {
    expect(renderTemplate('{{version}}', ctx)).toBe('1.2.3-beta.1')
  })

  it('renders multiple placeholders', () => {
    expect(renderTemplate('{{prefix}}{{major}}.{{minor}}', ctx)).toBe('v1.2')
  })

  it('renders same placeholder multiple times', () => {
    expect(renderTemplate('{{major}}-{{major}}', ctx)).toBe('1-1')
  })

  it('preserves text without placeholders', () => {
    expect(renderTemplate('latest', ctx)).toBe('latest')
  })

  it('handles empty prefix', () => {
    const noPrefix = { ...ctx, prefix: '' }
    expect(renderTemplate('{{prefix}}{{major}}', noPrefix)).toBe('1')
  })

  it('handles empty prerelease', () => {
    const noPrerelease = { ...ctx, prerelease: '' }
    expect(renderTemplate('{{major}}-{{prerelease}}', noPrerelease)).toBe('1-')
  })

  describe('Handlebars conditionals', () => {
    it('renders {{#if}} section when variable has value', () => {
      expect(
        renderTemplate('{{major}}{{#if prerelease}}-{{prerelease}}{{/if}}', ctx)
      ).toBe('1-beta.1')
    })

    it('omits {{#if}} section when variable is empty', () => {
      const noPrerelease = { ...ctx, prerelease: '' }
      expect(
        renderTemplate(
          '{{major}}{{#if prerelease}}-{{prerelease}}{{/if}}',
          noPrerelease
        )
      ).toBe('1')
    })

    it('handles {{#if}} with zero-valued numbers (converted to strings)', () => {
      const zeroMinor = { ...ctx, minor: 0 }
      expect(
        renderTemplate('{{major}}{{#if minor}}.{{minor}}{{/if}}', zeroMinor)
      ).toBe('1.0')
    })

    it('handles nested conditionals', () => {
      expect(
        renderTemplate(
          '{{major}}{{#if prerelease}}-{{prerelease}}{{#if build}}+{{build}}{{/if}}{{/if}}',
          ctx
        )
      ).toBe('1-beta.1+build.456')
    })

    it('handles nested conditionals with inner empty', () => {
      const noBuild = { ...ctx, build: '' }
      expect(
        renderTemplate(
          '{{major}}{{#if prerelease}}-{{prerelease}}{{#if build}}+{{build}}{{/if}}{{/if}}',
          noBuild
        )
      ).toBe('1-beta.1')
    })

    it('handles {{#unless}} for inverse logic', () => {
      const noPrerelease = { ...ctx, prerelease: '' }
      expect(
        renderTemplate('{{major}}{{#unless prerelease}}-stable{{/unless}}', ctx)
      ).toBe('1')
      expect(
        renderTemplate(
          '{{major}}{{#unless prerelease}}-stable{{/unless}}',
          noPrerelease
        )
      ).toBe('1-stable')
    })

    it('handles multiple {{#if}} sections', () => {
      const noBuild = { ...ctx, build: '' }
      expect(
        renderTemplate(
          '{{major}}{{#if prerelease}}-{{prerelease}}{{/if}}{{#if build}}+{{build}}{{/if}}',
          noBuild
        )
      ).toBe('1-beta.1')
    })
  })
})

describe('deriveTags', () => {
  it('generates tags with default-style template', () => {
    const result = deriveTags(
      'v1.2.3',
      '{{prefix}}{{major}},{{prefix}}{{major}}.{{minor}}'
    )
    expect(result).toEqual(['v1', 'v1.2'])
  })

  it('generates single tag from simple template', () => {
    const result = deriveTags('v1.2.3', '{{prefix}}{{major}}')
    expect(result).toEqual(['v1'])
  })

  it('handles version without prefix', () => {
    const result = deriveTags(
      '1.2.3',
      '{{prefix}}{{major}},{{prefix}}{{major}}.{{minor}}'
    )
    expect(result).toEqual(['1', '1.2'])
  })

  it('handles prerelease in template', () => {
    const result = deriveTags(
      'v1.0.0-rc.1',
      '{{prefix}}{{major}}-{{prerelease}}'
    )
    expect(result).toEqual(['v1-rc.1'])
  })

  it('filters empty tags and prefix-only tags from result', () => {
    const result = deriveTags('v1.2.3', '{{prefix}}{{major}},,{{prefix}}')
    expect(result).toEqual(['v1'])
  })

  it('trims whitespace around template parts', () => {
    const result = deriveTags('v1.2.3', '  {{prefix}}{{major}}  ,  latest  ')
    expect(result).toEqual(['v1', 'latest'])
  })

  it('generates full version tag', () => {
    const result = deriveTags('v1.2.3', '{{prefix}}{{version}}')
    expect(result).toEqual(['v1.2.3'])
  })

  it('throws on invalid semver', () => {
    expect(() => deriveTags('invalid', '{{major}}')).toThrow(
      "Invalid semver: 'invalid'"
    )
  })

  it('handles newline-delimited template', () => {
    const result = deriveTags(
      'v1.2.3',
      '{{prefix}}{{major}}\n{{prefix}}{{major}}.{{minor}}'
    )
    expect(result).toEqual(['v1', 'v1.2'])
  })

  it('handles mixed newlines and commas in template', () => {
    const result = deriveTags(
      'v1.2.3',
      '{{prefix}}{{major}},{{prefix}}{{major}}.{{minor}}\nlatest'
    )
    expect(result).toEqual(['v1', 'v1.2', 'latest'])
  })

  describe('with Handlebars conditionals', () => {
    it('generates tag with optional prerelease when present', () => {
      const result = deriveTags(
        'v1.0.0-beta.1',
        '{{prefix}}{{major}}{{#if prerelease}}-{{prerelease}}{{/if}}'
      )
      expect(result).toEqual(['v1-beta.1'])
    })

    it('generates tag without prerelease section when absent', () => {
      const result = deriveTags(
        'v1.0.0',
        '{{prefix}}{{major}}{{#if prerelease}}-{{prerelease}}{{/if}}'
      )
      expect(result).toEqual(['v1'])
    })

    it('generates multiple tags with conditionals', () => {
      const result = deriveTags(
        'v1.2.3-rc.1',
        '{{prefix}}{{major}},{{prefix}}{{major}}.{{minor}}{{#if prerelease}}-{{prerelease}}{{/if}}'
      )
      expect(result).toEqual(['v1', 'v1.2-rc.1'])
    })

    it('handles build metadata conditional', () => {
      const result = deriveTags(
        'v1.0.0+build.123',
        '{{prefix}}{{major}}{{#if build}}+{{build}}{{/if}}'
      )
      expect(result).toEqual(['v1+build.123'])
    })

    it('handles both prerelease and build conditionals', () => {
      const result = deriveTags(
        'v1.0.0-alpha.1+build.789',
        '{{prefix}}{{major}}{{#if prerelease}}-{{prerelease}}{{/if}}{{#if build}}+{{build}}{{/if}}'
      )
      expect(result).toEqual(['v1-alpha.1+build.789'])
    })
  })

  describe('conditional tag inclusion', () => {
    it('includes latest tag only for stable releases', () => {
      // Stable release gets latest tag
      const stable = deriveTags(
        'v1.2.3',
        '{{prefix}}{{major}},{{prefix}}{{major}}.{{minor}}{{#unless prerelease}},latest{{/unless}}'
      )
      expect(stable).toEqual(['v1', 'v1.2', 'latest'])

      // Prerelease does not get latest tag
      const prerelease = deriveTags(
        'v1.2.3-beta.1',
        '{{prefix}}{{major}},{{prefix}}{{major}}.{{minor}}{{#unless prerelease}},latest{{/unless}}'
      )
      expect(prerelease).toEqual(['v1', 'v1.2'])
    })

    it('conditionally includes entire tag group with {{#if}}', () => {
      // With prerelease: include prerelease-specific tags
      const withPre = deriveTags(
        'v2.0.0-rc.1',
        '{{prefix}}{{major}}{{#if prerelease}},{{prefix}}{{major}}-{{prerelease}}{{/if}}'
      )
      expect(withPre).toEqual(['v2', 'v2-rc.1'])

      // Without prerelease: only major tag
      const withoutPre = deriveTags(
        'v2.0.0',
        '{{prefix}}{{major}}{{#if prerelease}},{{prefix}}{{major}}-{{prerelease}}{{/if}}'
      )
      expect(withoutPre).toEqual(['v2'])
    })

    it('conditionally includes newline-separated tags', () => {
      // Stable release includes all tags
      const stable = deriveTags(
        'v1.0.0',
        '{{prefix}}{{major}}\n{{prefix}}{{major}}.{{minor}}{{#unless prerelease}}\nstable{{/unless}}'
      )
      expect(stable).toEqual(['v1', 'v1.0', 'stable'])

      // Prerelease excludes stable tag
      const prerelease = deriveTags(
        'v1.0.0-alpha.1',
        '{{prefix}}{{major}}\n{{prefix}}{{major}}.{{minor}}{{#unless prerelease}}\nstable{{/unless}}'
      )
      expect(prerelease).toEqual(['v1', 'v1.0'])
    })

    it('excludes multiple tags conditionally', () => {
      const result = deriveTags(
        'v1.0.0-beta.1',
        '{{prefix}}{{major}}{{#unless prerelease}},latest,stable,production{{/unless}}'
      )
      expect(result).toEqual(['v1'])
    })

    it('includes multiple tags conditionally for stable', () => {
      const result = deriveTags(
        'v1.0.0',
        '{{prefix}}{{major}}{{#unless prerelease}},latest,stable,production{{/unless}}'
      )
      expect(result).toEqual(['v1', 'latest', 'stable', 'production'])
    })
  })
})
