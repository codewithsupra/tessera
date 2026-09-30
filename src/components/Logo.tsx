type Props = { size?: number; withWord?: boolean }

/** Four tesserae: plaster, lapis, verdigris, plaster — set on an ink ground. */
export function Logo({ size = 28, withWord = true }: Props) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--ink)" />
        <rect x="6" y="6" width="9" height="9" rx="1.5" fill="var(--plaster)" />
        <rect x="17" y="6" width="9" height="9" rx="1.5" fill="var(--lapis)" />
        <rect x="6" y="17" width="9" height="9" rx="1.5" fill="var(--verdigris)" />
        <rect x="17" y="17" width="9" height="9" rx="1.5" fill="var(--plaster)" />
      </svg>
      {withWord && <span className="font-display text-xl font-semibold tracking-tight text-ink">Tessera</span>}
    </span>
  )
}
