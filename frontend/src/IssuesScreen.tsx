import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import type { Issue } from './api'
import { useIssues } from './GanttScreen'
import { IssueForm, priorityLabels, statusLabels, typeLabels } from './IssueForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function IssuesScreen({ projectId }: { projectId: number }) {
  const issues = useIssues(projectId)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [createOpen, setCreateOpen] = useState(false)
  const columns = useMemo<ColumnDef<Issue>[]>(() => [
    { accessorKey: 'key', header: '키', cell: ({ row }) => <Link className="table-link" to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(row.original.id) }}>{row.original.key}</Link> },
    { accessorKey: 'title', header: '제목' },
    { accessorKey: 'type', header: '유형', cell: ({ row }) => typeLabels[row.original.type] },
    { accessorKey: 'status', header: '상태', cell: ({ row }) => statusLabels[row.original.status] },
    { accessorKey: 'priority', header: '우선순위', cell: ({ row }) => priorityLabels[row.original.priority] },
    { accessorKey: 'assigneeName', header: '담당자', cell: ({ row }) => row.original.assigneeName ?? '미지정' },
    { accessorKey: 'dueDate', header: '완료일', cell: ({ row }) => row.original.dueDate?.slice(0, 10) ?? '—' },
  ], [projectId])
  const table = useReactTable({ data: issues.data?.items ?? [], columns, state: { sorting, globalFilter: search }, onSortingChange: setSorting, onGlobalFilterChange: setSearch, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 20 } } })
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">ISSUE DIRECTORY</p><h1>이슈 목록</h1><p>검색과 정렬로 일을 찾고 상세에서 편집하세요.</p></div><Button onClick={() => setCreateOpen(true)}><Plus size={16} /> 이슈 만들기</Button></div><div className="table-toolbar"><Input type="search" placeholder="키 또는 제목 검색" aria-label="이슈 검색" value={search} onChange={event => setSearch(event.target.value)} /><span>{table.getFilteredRowModel().rows.length}개 결과</span></div><div className="table-wrap"><Table><TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}><button className="table-sort" type="button" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())} {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}</button></TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}{table.getRowModel().rows.length === 0 && <TableRow><TableCell colSpan={columns.length}>조건에 맞는 이슈가 없습니다.</TableCell></TableRow>}</TableBody></Table></div><div className="pagination"><span>{table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1} 페이지</span><Button variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>이전</Button><Button variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>다음</Button></div><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>이슈 만들기</DialogTitle></DialogHeader><IssueForm projectId={projectId} onSaved={id => { setCreateOpen(false); navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(projectId), issueId: String(id) } }) }} onCancel={() => setCreateOpen(false)} /></DialogContent></Dialog></section>
}
