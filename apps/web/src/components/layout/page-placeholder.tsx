import { useEffect } from 'react'
import { Construction } from 'lucide-react'
import { brand } from '@/config/brand'

type PagePlaceholderProps = {
  title: string
  description: string
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  useEffect(() => {
    document.title = `${title} · ${brand.name}`
  }, [title])

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <div>
        <h1 id="page-title" className="text-2xl font-bold">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <Construction className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Esta tela será construída em uma próxima etapa.</p>
      </div>
    </section>
  )
}