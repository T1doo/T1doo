interface PlaceholderPageProps {
  title: string
  milestone: string
}

function PlaceholderPage({ title, milestone }: PlaceholderPageProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <div className="text-lg font-medium">{title}</div>
      <div className="text-[var(--fg-muted)]">将在 {milestone} 里程碑交付</div>
    </div>
  )
}

export default PlaceholderPage
