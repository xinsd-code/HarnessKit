import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import type { Extension } from "@/lib/types";
import { KindBadge } from "@/components/shared/kind-badge";
import { PermissionTags } from "@/components/shared/permission-tags";
import { TrustBadge } from "@/components/shared/trust-badge";
import { useExtensionStore } from "@/stores/extension-store";

const col = createColumnHelper<Extension>();

const columns = [
  col.accessor("name", {
    header: "Name",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  col.accessor("kind", {
    header: "Kind",
    cell: (info) => <KindBadge kind={info.getValue()} />,
  }),
  col.accessor("agents", {
    header: "Agent",
    cell: (info) => <span className="text-zinc-500 dark:text-zinc-400">{info.getValue().join(", ")}</span>,
  }),
  col.accessor("permissions", {
    header: "Permissions",
    cell: (info) => <PermissionTags permissions={info.getValue()} />,
    enableSorting: false,
  }),
  col.accessor("trust_score", {
    header: "Score",
    cell: (info) => {
      const val = info.getValue();
      return val != null ? <TrustBadge score={val} size="sm" /> : <span className="text-zinc-400 dark:text-zinc-600">--</span>;
    },
  }),
  col.accessor("enabled", {
    header: "Status",
    cell: (info) => {
      const ext = info.row.original;
      const toggle = useExtensionStore.getState().toggle;
      return (
        <button
          onClick={() => toggle(ext.id, !ext.enabled)}
          className={ext.enabled ? "text-green-500 dark:text-green-400 text-xs" : "text-red-500 dark:text-red-400 text-xs"}
        >
          {ext.enabled ? "enabled" : "disabled"}
        </button>
      );
    },
  }),
];

export function ExtensionTable({ data }: { data: Extension[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden dark:border-zinc-800">
      <table className="w-full">
        <thead className="bg-zinc-100 dark:bg-zinc-900/80">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 cursor-pointer select-none"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 text-sm">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="py-12 text-center text-zinc-500">No extensions found</div>
      )}
    </div>
  );
}
