import { GanttChart } from './GanttChart'
import { sampleIssues, sampleRelations } from './sampleGanttData'
import './App.css'

function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="site-header">
        <div className="brand" aria-label="Arc">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Arc</span>
        </div>
        <span className="header-caption">프로젝트 / 제품 개발</span>
        <span className="preview-label">기능 미리보기 · 샘플 데이터</span>
      </header>

      <main id="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PROJECT TIMELINE</p>
            <h1>간트 차트</h1>
            <p>Epic부터 하위 작업까지 일정과 선행 관계를 살펴보세요.</p>
          </div>
          <span className="sample-note">현재 화면은 저장되지 않는 샘플 데이터입니다.</span>
        </div>
        <GanttChart issues={sampleIssues} relations={sampleRelations} />
      </main>

      <footer className="site-footer">Arc · KRDS를 바탕으로 발전시키는 팀 작업 공간</footer>
    </div>
  )
}

export default App
