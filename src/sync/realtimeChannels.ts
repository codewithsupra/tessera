import { insforge } from '../lib/insforge'
import { ChannelRefs } from './channels'

/** The app-wide channel membership for the single realtime socket. */
export const channels = new ChannelRefs({
  subscribe: (ch) => insforge.realtime.subscribe(ch),
  unsubscribe: (ch) => insforge.realtime.unsubscribe(ch),
})
