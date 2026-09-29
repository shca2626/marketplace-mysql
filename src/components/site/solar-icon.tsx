/**
 * Vendora platform brand mark — a sun rising over a solar panel.
 * Stroke-based, inherits `currentColor`, works in light & dark themes.
 */
export function SolarIcon({
  size = 24,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* sun */}
      <circle cx="12" cy="6.5" r="2.75" />
      <path d="M12 1.5v1.2M17 4l-.85.85M7 4l.85.85" />
      {/* panel */}
      <path d="M4 12.5h16l1.2 8.5H2.8L4 12.5Z" />
      <path d="M8.7 12.5 8 21M15.3 12.5 16 21M3.4 16.75h17.2" />
    </svg>
  )
}
