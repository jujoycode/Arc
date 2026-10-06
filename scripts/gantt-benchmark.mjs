// Node 24 type stripping; synthetic model timing, independent of API and DOM.
import { performance } from 'node:perf_hooks'
import { ganttRows } from '../frontend/src/features/gantt/internal/model/ganttRows.ts'
import { visibleIssues } from '../frontend/src/features/gantt/internal/model/gantt.ts'
const projects = [{ id: 1, workspaceId: 1, name: 'Performance', key: 'PERF' }]
const versions = Array.from({length: 100}, (_, i) => ({ id: i+1, projectId: 1, name: `Version ${i+1}`, startDate: '2026-10-01', dueDate: '2026-12-31', status: 'OPEN' }))
for (const count of [1000, 5000, 20000]) {
 for (const grouped of [false, true]) {
  const issues = Array.from({length: count}, (_, i) => ({ id: i+1, projectId: 1, number: i+1, key: `PERF-${i+1}`, title: `Issue ${i+1}`, type: 'TASK', status: 'TODO', priority: 'NORMAL', reporterId: 1, startDate: '2026-10-01', dueDate: '2026-10-30', progress: i%101, versionId: grouped ? i%100+1 : null, sortOrder: i, version: 0, updatedAt: '2026-10-01T00:00:00Z' }))
  const samples=[]
  for(let run=0;run<7;run++) {
   const start=performance.now()
   const rows=ganttRows(1, projects, issues, grouped?versions:[])
   const visible=visibleIssues(rows, new Set(), '', 'ALL', 'ALL')
   if(visible.length !== count+1+(grouped?100:0)) throw Error('Missing rows')
   if(run) samples.push(performance.now()-start)
  }
  samples.sort((a,b)=>a-b)
  console.log(JSON.stringify({count,grouped,medianMs:+samples[3].toFixed(2),maxMs:+samples.at(-1).toFixed(2)}))
 }
}
