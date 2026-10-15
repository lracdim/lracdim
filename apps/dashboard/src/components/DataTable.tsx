import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { EmptyState } from './EmptyState';

export type SortDirection = 'asc' | 'desc';

export interface Column<T> {
  key: string;
  header: string;
  /** Returning a value makes the column sortable. Omit for a static column. */
  sortValue?: (row: T) => string | number;
  render: (row: T) => JSX.Element;
}

export interface DataTableProps<T> {
  /** Table caption. Required: it is the table's accessible name. */
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Makes rows clickable and keyboard activatable. */
  onRowClick?: (row: T) => void;
  /** Key of the row currently shown in a detail panel, if any. */
  selectedKey?: string;
  emptyTitle?: string;
  emptyBody?: string;
  initialSort?: { key: string; direction: SortDirection };
}

export function DataTable<T>(props: DataTableProps<T>) {
  const [sortKey, setSortKey] = createSignal<string | undefined>(props.initialSort?.key);
  const [direction, setDirection] = createSignal<SortDirection>(
    props.initialSort?.direction ?? 'asc',
  );

  const sortedRows = createMemo(() => {
    const key = sortKey();
    const column = props.columns.find((candidate) => candidate.key === key);
    if (!column?.sortValue) return props.rows;

    const factor = direction() === 'asc' ? 1 : -1;
    const sortValue = column.sortValue;

    return [...props.rows].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * factor;
      }
      return String(left).localeCompare(String(right)) * factor;
    });
  });

  function toggleSort(key: string) {
    if (sortKey() === key) {
      setDirection(direction() === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setDirection('asc');
    }
  }

  function ariaSort(key: string): 'ascending' | 'descending' | undefined {
    if (sortKey() !== key) return undefined;
    return direction() === 'asc' ? 'ascending' : 'descending';
  }

  return (
    <Show
      when={props.rows.length > 0}
      fallback={
        <EmptyState
          title={props.emptyTitle ?? 'Nothing here yet'}
          body={props.emptyBody}
        />
      }
    >
      <div class="table-wrap">
        <table class="table">
          <caption>{props.caption}</caption>
          <thead>
            <tr>
              <For each={props.columns}>
                {(column) => (
                  <th
                    scope="col"
                    aria-sort={column.sortValue ? ariaSort(column.key) : undefined}
                  >
                    <Show
                      when={column.sortValue}
                      fallback={<span class="table__head-static">{column.header}</span>}
                    >
                      <button
                        type="button"
                        class="table__sort"
                        onClick={() => toggleSort(column.key)}
                      >
                        <span>{column.header}</span>
                        <span class="table__sort-mark" aria-hidden="true">
                          {sortKey() === column.key
                            ? direction() === 'asc'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </button>
                    </Show>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={sortedRows()}>
              {(row) => {
                const key = props.rowKey(row);
                const clickable = Boolean(props.onRowClick);
                return (
                  <tr
                    data-clickable={clickable ? 'true' : undefined}
                    aria-selected={
                      props.selectedKey !== undefined
                        ? props.selectedKey === key
                          ? 'true'
                          : 'false'
                        : undefined
                    }
                    tabindex={clickable ? 0 : undefined}
                    onClick={() => props.onRowClick?.(row)}
                    onKeyDown={(event) => {
                      if (!clickable) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        props.onRowClick?.(row);
                      }
                    }}
                  >
                    <For each={props.columns}>
                      {(column) => <td>{column.render(row)}</td>}
                    </For>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}
