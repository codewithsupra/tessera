/**
 * Reference-counted realtime channel membership.
 *
 * A socket is either in a channel or not, so when two owners share a channel (React
 * StrictMode remounts, fast page switching, editor + background uploader), a late
 * unsubscribe from the first would silently cut off the second. Channels are left only
 * when their last holder releases them.
 */
type SubscribeResult = { ok: boolean; error?: { message?: string; code?: string } }

export type ChannelClient = {
  subscribe(channel: string): Promise<SubscribeResult>
  unsubscribe(channel: string): void
}

export class ChannelRefs {
  private readonly client: ChannelClient
  private readonly refs = new Map<string, number>()

  constructor(client: ChannelClient) {
    this.client = client
  }

  /** Joins (or re-uses) a channel. On failure nothing is held. Returns a release function on success. */
  async join(channel: string): Promise<SubscribeResult & { release?: () => void }> {
    this.refs.set(channel, (this.refs.get(channel) ?? 0) + 1)
    let res: SubscribeResult
    try {
      res = await this.client.subscribe(channel)
    } catch (e) {
      res = { ok: false, error: { message: (e as Error).message, code: 'CONNECTION_FAILED' } }
    }
    if (!res.ok) {
      this.drop(channel)
      return res
    }
    let released = false
    return {
      ...res,
      release: () => {
        if (released) return
        released = true
        this.drop(channel)
      },
    }
  }

  holders(channel: string): number {
    return this.refs.get(channel) ?? 0
  }

  private drop(channel: string) {
    const n = (this.refs.get(channel) ?? 0) - 1
    if (n > 0) {
      this.refs.set(channel, n)
      return
    }
    this.refs.delete(channel)
    this.client.unsubscribe(channel)
  }
}
