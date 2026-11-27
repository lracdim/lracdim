import { useEffect, useState } from 'react'
import type { Site } from '../lib/types'

const KEY = 'ld.site'

/** Remembers which website the user is looking at across pages (per browser tab). */
export function useSitePicker(sites: Site[] | undefined, allowAll = false) {
  const [id, setId] = useState<string>(() => sessionStorage.getItem(KEY) || '')
  useEffect(() => {
    if (!sites?.length) return
    const valid = sites.some((s) => s.id === id) || (allowAll && id === 'all')
    if (!valid) setId(allowAll && sites.length > 1 ? 'all' : sites[0].id)
  }, [sites, id, allowAll])
  const choose = (v: string) => {
    sessionStorage.setItem(KEY, v)
    setId(v)
  }
  return [id, choose] as const
}

export function SitePicker({ sites, value, onChange, allowAll }: { sites: Site[]; value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  if (sites.length < 2) return sites[0] ? <span className="site-chip">{sites[0].url.replace(/^https?:\/\//, '')}</span> : null
  return (
    <label className="select-wrap">
      <span className="sr-only">Website</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowAll && <option value="all">All websites</option>}
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {s.url.replace(/^https?:\/\//, '')}
          </option>
        ))}
      </select>
    </label>
  )
}
