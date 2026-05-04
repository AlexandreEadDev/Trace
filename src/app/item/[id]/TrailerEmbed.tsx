'use client'

interface TrailerEmbedProps {
  trailerKey: string
  title: string
}

export function TrailerEmbed({ trailerKey, title }: TrailerEmbedProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Bande-annonce</h2>
      <div className="relative w-full overflow-hidden rounded-xl border shadow-sm" style={{ paddingBottom: '56.25%' }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${trailerKey}?rel=0&modestbranding=1`}
          title={`Bande-annonce — ${title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </section>
  )
}
