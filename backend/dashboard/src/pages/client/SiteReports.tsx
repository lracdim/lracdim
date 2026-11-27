import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { get, post } from '../../lib/api'
import type { Audit, Site, SiteReport } from '../../lib/types'
import { SiteHealthView } from '../../components/reports'
import { SitePicker, useSitePicker } from '../../components/SitePicker'
import { Async, Button, Card, Empty, ErrorBox, PageHeader, Skeleton } from '../../components/ui'

/**
 * Website health: Signal uptime and the latest Vector examination, the same
 * report the studio sees. "Run a fresh check" starts a new examination (three
 * an hour) and the page polls until it finishes.
 */
export function ClientHealthPage() {
  const sites = useQuery({ queryKey: ['client', 'sites'], queryFn: () => get<Site[]>('/v1/client/sites') })
  const [site, setSite] = useSitePicker(sites.data)
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['client', 'health', site],
    queryFn: () => get<SiteReport>(`/v1/client/sites/${site}/health`),
    enabled: Boolean(site),
    refetchInterval: (x) => (x.state.data?.pendingAudit ? 2000 : false),
  })
  const rescan = useMutation({
    mutationFn: () => post<Audit>(`/v1/client/sites/${site}/scan`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client'] }),
  })
  const running = Boolean(q.data?.pendingAudit)
  return (
    <>
      <PageHeader
        title="Website health"
        sub="Is the site up and fast, and what should be fixed? Uptime is checked every 5 minutes; the examination covers technical structure, SEO, performance, accessibility, security, links, content and AI visibility."
        actions={
          <>
            {sites.data && <SitePicker sites={sites.data} value={site} onChange={setSite} />}
            {site && (
              <Button icon={<RefreshCw className={rescan.isPending || running ? 'spin' : ''} />} onClick={() => rescan.mutate()} disabled={rescan.isPending || running}>
                {running ? 'Examining…' : 'Run a fresh check'}
              </Button>
            )}
          </>
        }
      />
      {rescan.isError && <ErrorBox error={rescan.error} />}
      {sites.isError ? (
        <ErrorBox error={sites.error} onRetry={() => sites.refetch()} />
      ) : sites.data && !sites.data.length ? (
        <Card><Empty title="No websites yet">We add your website here when monitoring starts.</Empty></Card>
      ) : site ? (
        <Async q={q}>{(d) => <SiteHealthView data={d} scanning={rescan.isPending} />}</Async>
      ) : (
        <Skeleton />
      )}
    </>
  )
}
