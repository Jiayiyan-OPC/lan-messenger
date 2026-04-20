interface PresenceDotProps {
  online?: boolean
  size?: number
}

/** Standalone online dot — used inline in the chat header pill. */
export function PresenceDot({ online = true, size = 6 }: PresenceDotProps) {
  return (
    <span
      aria-hidden
      className="inline-block rounded-full"
      style={{
        width: size,
        height: size,
        background: online ? 'var(--online)' : 'var(--text-hint)',
      }}
    />
  )
}
