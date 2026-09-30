import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { filterCommands, type SlashCommand } from './commands'
import { useSlashStore } from './slashStore'

/** "/" opens the block menu. Rendering lives in <SlashMenu/>, driven by useSlashStore. */
export const SlashExtension = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommands'),
        char: '/',
        items: ({ query }) => filterCommands(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          const store = useSlashStore.getState
          return {
            onStart: (p) => store().show(p.items, p.clientRect?.() ?? null, p.command),
            onUpdate: (p) => store().show(p.items, p.clientRect?.() ?? null, p.command),
            onExit: () => store().hide(),
            onKeyDown: ({ event }) => {
              const s = store()
              if (!s.open) return false
              if (event.key === 'ArrowDown') return s.move(1), true
              if (event.key === 'ArrowUp') return s.move(-1), true
              if (event.key === 'Escape') return s.hide(), true
              if (event.key === 'Enter' || event.key === 'Tab') {
                const item = s.items[s.index]
                if (!item || !s.select) return false
                s.select(item)
                return true
              }
              return false
            },
          }
        },
      }),
    ]
  },
})
