import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { api } from '@/shared/api/client'
import type { Issue } from '../../api/types'
import { ProjectIssueFilters } from './ProjectIssueFilters'
import { useProjectFilters } from '../model/ProjectFilters'
import { useProjectAccess } from '@/features/project'
import { IssueForm } from './IssueForm'
import { priorityLabels, statusLabels, typeLabels } from '../model/issueLabels'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

interface PageResult { items: Issue[]; total: number; page: number; size: number }

export function IssuesScreen({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const { filters } = useProjectFilters()
  const { search, status, type: kind, priority, assigneeId, versionId, sprintState } = filters
  const { archived } = useProjectAccess(projectId)
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 })
  const [createOpen, setCreateOpen] = useState(false)
  const params = new URLSearchParams({ page: String(pagination.pageIndex), size: String(pagination.pageSize), sort: sorting[0]?.id ?? 'updatedAt', direction: sorting[0]?.desc === false ? 'asc' : 'desc' })
  if (search.trim()) params.set('search', search.trim())
  if (status) params.set('status', status)
  if (kind) params.set('type', kind)
  if (priority) params.set('priority', priority)
  if (assigneeId) params.set('assigneeId', assigneeId)
  if (versionId) params.set('versionId', versionId)
  if (sprintState) params.set('sprintState', sprintState)
  const issues = useQuery({ queryKey: ['issue-directory', projectId, params.toString()], queryFn: () => api<PageResult>(`/projects/${projectId}/issues?${params}`), placeholderData: keepPreviousData })
  const filtersApplied = Object.values(filters).some(Boolean)
  const columns = useMemo<ColumnDef<Issue>[]>(() => [
    { accessorKey: 'key', header: '키', cell: ({ row }) => <Link className="table-link" to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(row.original.id) }}>{row.original.key}</Link> },
    { accessorKey: 'title', header: '제목', cell: ({ row }) => <Link className="table-link" to="/projects/$projectId/issues/$issueId" params={{ projectId: String(projectId), issueId: String(row.original.id) }}>{row.original.title}</Link> },
    { accessorKey: 'type', header: '유형', cell: ({ row }) => typeLabels[row.original.type] },
    { accessorKey: 'status', header: '상태', cell: ({ row }) => statusLabels[row.original.status] },
    { accessorKey: 'priority', header: '우선순위', cell: ({ row }) => priorityLabels[row.original.priority] },
    { accessorKey: 'assigneeName', header: '담당자', cell: ({ row }) => row.original.assigneeName ?? '미지정' },
    { accessorKey: 'dueDate', header: '완료일', cell: ({ row }) => row.original.dueDate?.slice(0, 10) ?? '—' },
  ], [projectId])
  const table = useReactTable({ data: issues.data?.items ?? [], columns, state: { sorting, pagination }, onSortingChange: updater => { setSorting(updater); setPagination(current => ({ ...current, pageIndex: 0 })) }, onPaginationChange: setPagination, getCoreRowModel: getCoreRowModel(), manualSorting: true, manualPagination: true, rowCount: issues.data?.total ?? 0 })
  return <section className="view-page"><div className="view-heading"><div><p className="eyebrow">ISSUE DIRECTORY</p><h1>이슈 목록</h1><p>검색·필터·정렬로 일을 찾고 상세에서 편집하세요.</p></div><Button disabled={archived} onClick={() => setCreateOpen(true)}><Plus size={16} /> 이슈 만들기</Button></div>
    <ProjectIssueFilters projectId={projectId} onChange={() => setPagination(current => ({ ...current, pageIndex: 0 }))} />
    <div className="table-toolbar"><span>{issues.data?.total ?? 0}개 결과{filtersApplied ? ' · 필터 적용' : ''}{issues.isFetching ? ' · 불러오는 중…' : ''}</span><label>페이지 크기<select value={pagination.pageSize} onChange={event => setPagination({ pageIndex: 0, pageSize: Number(event.target.value) })}><option value={20}>20개</option><option value={50}>50개</option><option value={100}>100개</option></select></label></div>
    {issues.isError && <p className="form-message" role="alert">{(issues.error as Error).message}</p>}<div className="table-wrap"><Table><TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id}><button className="table-sort" type="button" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())} {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}</button></TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}{table.getRowModel().rows.length === 0 && <TableRow><TableCell colSpan={columns.length}>{issues.isPending ? '이슈를 불러오는 중입니다…' : '조건에 맞는 이슈가 없습니다.'}</TableCell></TableRow>}</TableBody></Table></div><div className="pagination"><span>{pagination.pageIndex + 1} / {table.getPageCount() || 1} 페이지</span><Button variant="outline" disabled={!table.getCanPreviousPage() || issues.isFetching} onClick={() => table.previousPage()}>이전</Button><Button variant="outline" disabled={!table.getCanNextPage() || issues.isFetching} onClick={() => table.nextPage()}>다음</Button></div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>이슈 만들기</DialogTitle></DialogHeader><IssueForm projectId={projectId} onSaved={id => { setCreateOpen(false); navigate({ to: '/projects/$projectId/issues/$issueId', params: { projectId: String(projectId), issueId: String(id) } }) }} onCancel={() => setCreateOpen(false)} /></DialogContent></Dialog></section>
}
