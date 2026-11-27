import { useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react'
import { Button, cx, Empty } from './ui'

/** Sortable, searchable, paginated table built on TanStack Table. */
export function DataTable<T>({
  data, columns, search, onRowClick, pageSize = 12, empty = 'Nothing here yet', toolbar, initialSort,
}: {
  data: T[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  search?: string
  onRowClick?: (row: T) => void
  pageSize?: number
  empty?: string
  toolbar?: ReactNode
  initialSort?: SortingState
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? [])
  const [filter, setFilter] = useState('')
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })
  const rows = table.getRowModel().rows
  const total = table.getFilteredRowModel().rows.length

  return (
    <div className="dt">
      {(search || toolbar) && (
        <div className="dt__bar">
          {search && (
            <label className="search">
              <Search aria-hidden="true" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={search} aria-label={search} />
            </label>
          )}
          {toolbar}
        </div>
      )}
      <div className="dt__scroll">
        <table className="table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted()
                  const can = h.column.getCanSort()
                  const meta = h.column.columnDef.meta as { align?: 'right' } | undefined
                  return (
                    <th key={h.id} className={cx(meta?.align === 'right' && 'num')} aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}>
                      {can ? (
                        <button type="button" className="th-sort" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === 'asc' ? <ArrowUp /> : sorted === 'desc' ? <ArrowDown /> : <ChevronsUpDown className="faint" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={cx(onRowClick && 'is-link')}
                onClick={onRowClick ? () => onRowClick(r.original) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r.original) : undefined}
              >
                {r.getVisibleCells().map((c) => {
                  const meta = c.column.columnDef.meta as { align?: 'right' } | undefined
                  return (
                    <td key={c.id} className={cx(meta?.align === 'right' && 'num')}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty title={empty} />}
      </div>
      {table.getPageCount() > 1 && (
        <div className="dt__pager">
          <span className="muted small">
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min(total, (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize)} of {total}
          </span>
          <div className="row gap-s">
            <Button size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Previous
            </Button>
            <Button size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
