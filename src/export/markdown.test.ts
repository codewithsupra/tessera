import { escapeInline, pageToMarkdown, renderBlocks, renderInline, type PMNode } from './markdown'

const t = (text: string, ...marks: (string | { type: string; attrs?: Record<string, unknown> })[]): PMNode => ({
  type: 'text',
  text,
  marks: marks.map((m) => (typeof m === 'string' ? { type: m } : m)),
})
const p = (...content: PMNode[]): PMNode => ({ type: 'paragraph', content })
const li = (...content: PMNode[]): PMNode => ({ type: 'listItem', content })

describe('inline marks', () => {
  it('renders each mark', () => {
    expect(renderInline([t('b', 'bold')])).toBe('**b**')
    expect(renderInline([t('i', 'italic')])).toBe('*i*')
    expect(renderInline([t('s', 'strike')])).toBe('~~s~~')
    expect(renderInline([t('u', 'underline')])).toBe('<u>u</u>')
    expect(renderInline([t('h', 'highlight')])).toBe('==h==')
    expect(renderInline([t('x = 1', 'code')])).toBe('`x = 1`')
    expect(renderInline([t('site', { type: 'link', attrs: { href: 'https://a.test/x y' } })])).toBe('[site](https://a.test/x%20y)')
  })

  it('shares delimiters across adjacent runs instead of closing and reopening', () => {
    expect(renderInline([t('bold ', 'bold'), t('both', 'bold', 'italic'), t(' plain')])).toBe('**bold *both*** plain')
  })

  it('nests links outside emphasis and keeps code innermost', () => {
    const link = { type: 'link', attrs: { href: 'https://x.test' } }
    expect(renderInline([t('go ', link), t('now', link, 'bold')])).toBe('[go **now**](https://x.test)')
    expect(renderInline([t('fn()', 'bold', 'code')])).toBe('**`fn()`**')
  })

  it('does not escape inside code and fences backticks safely', () => {
    expect(renderInline([t('a*b', 'code')])).toBe('`a*b`')
    expect(renderInline([t('use `x`', 'code')])).toBe('`` use `x` ``')
    expect(renderInline([t('`tick', 'code')])).toBe('`` `tick ``')
  })

  it('escapes Markdown syntax in plain text', () => {
    expect(escapeInline('2*3 [x] _y_ <b> a|b ~~z~~ ==h== \\')).toBe('2\\*3 \\[x\\] \\_y\\_ \\<b\\> a\\|b \\~\\~z\\~\\~ \\=\\=h\\=\\= \\\\')
  })

  it('renders hard breaks', () => {
    expect(renderInline([t('a'), { type: 'hardBreak' }, t('b')])).toBe('a\\\nb')
  })
})

describe('blocks', () => {
  it('renders headings, paragraphs and rules', () => {
    const md = renderBlocks([
      { type: 'heading', attrs: { level: 2 }, content: [t('Plan')] },
      p(t('Text')),
      { type: 'horizontalRule' },
    ])
    expect(md).toBe('## Plan\n\nText\n\n---')
  })

  it('escapes paragraph starts that would become other syntax', () => {
    expect(renderBlocks([p(t('# not a heading'))])).toBe('\\# not a heading')
    expect(renderBlocks([p(t('- not a list'))])).toBe('\\- not a list')
    expect(renderBlocks([p(t('1. not ordered'))])).toBe('\\1. not ordered')
  })

  it('renders bullet, ordered (with start) and nested lists', () => {
    const md = renderBlocks([
      { type: 'bulletList', content: [li(p(t('one')), { type: 'bulletList', content: [li(p(t('nested')))] }), li(p(t('two')))] },
      { type: 'orderedList', attrs: { start: 3 }, content: [li(p(t('three'))), li(p(t('four')))] },
    ])
    expect(md).toBe('- one\n  - nested\n- two\n\n3. three\n4. four')
  })

  it('renders task lists with checked state', () => {
    const md = renderBlocks([
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('todo'))] }] },
    ])
    expect(md).toBe('- [x] done\n- [ ] todo')
  })

  it('renders blockquotes with every line prefixed, including blank ones', () => {
    expect(renderBlocks([{ type: 'blockquote', content: [p(t('a')), p(t('b'))] }])).toBe('> a\n>\n> b')
  })

  it('renders fenced code with language, longer fences when the code contains backticks', () => {
    expect(renderBlocks([{ type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const x = 1')] }])).toBe('```ts\nconst x = 1\n```')
    expect(renderBlocks([{ type: 'codeBlock', content: [t('```nested```')] }])).toBe('````\n```nested```\n````')
  })

  it('keeps text of unknown blocks rather than dropping it', () => {
    expect(renderBlocks([{ type: 'mystery', content: [p(t('kept'))] }])).toBe('kept')
  })
})

describe('pageToMarkdown', () => {
  it('writes frontmatter, a title and the body', () => {
    const md = pageToMarkdown(
      { id: 'p1', title: 'Launch "plan"', createdAt: Date.UTC(2026, 0, 2), updatedAt: Date.UTC(2026, 0, 3) },
      { type: 'doc', content: [p(t('Hello'))] },
    )
    expect(md).toBe('---\ntitle: "Launch \\"plan\\""\ntessera_id: p1\ncreated: 2026-01-02T00:00:00.000Z\nupdated: 2026-01-03T00:00:00.000Z\n---\n\n# Launch "plan"\n\nHello\n')
  })

  it('handles untitled and empty pages', () => {
    const md = pageToMarkdown({ id: 'p2', title: '  ', createdAt: 0, updatedAt: 0 }, null)
    expect(md).toContain('title: "Untitled"')
    expect(md.endsWith('# Untitled\n')).toBe(true)
  })
})
