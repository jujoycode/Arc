import { Button } from './button'

export function ListPagination({ page, pages, total, label, onPageChange }: {
  page: number; pages: number; total: number; label: string; onPageChange: (page: number) => void
}) {
  if (pages <= 1) return null
  return <nav className="list-pagination" aria-label={`${label} 페이지`}>
    <span role="status">{total}개 · {page + 1} / {pages}쪽</span>
    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(0)} aria-label={`${label} 첫 페이지`}>처음</Button>
    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)} aria-label={`${label} 이전 페이지`}>이전</Button>
    <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => onPageChange(page + 1)} aria-label={`${label} 다음 페이지`}>다음</Button>
    <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => onPageChange(pages - 1)} aria-label={`${label} 마지막 페이지`}>마지막</Button>
  </nav>
}
