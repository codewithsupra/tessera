import { defaultFilter } from 'cmdk'

/**
 * Palette ranking. Every item's first keyword is its name (a page title, a command's label);
 * the rest are synonyms and the page's parent path. A name match always outranks a match that
 * only comes from the rest, so searching "launch plan" puts the page titled that ahead of
 * the pages filed under it.
 */
export function paletteFilter(value: string, search: string, keywords?: string[]): number {
  const [name = '', ...rest] = keywords ?? []
  const byName = defaultFilter(name, search)
  const byRest = defaultFilter(value, search, rest)
  return Math.max(byName, byRest * 0.5)
}
