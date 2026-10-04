import './App.css'

const foundations = [
  {
    number: '01',
    title: '일정을 읽는 간트',
    description: '이슈의 기간과 진척, 선행 관계를 한 화면에서 살펴봅니다.',
  },
  {
    number: '02',
    title: 'Epic부터 하위 작업까지',
    description: '큰 목표를 Story와 Task로 나누고 팀의 일을 연결합니다.',
  },
  {
    number: '03',
    title: '하나로 연결된 보드',
    description: '칸반과 스프린트에서 같은 이슈와 상태를 관리합니다.',
  },
]

function App() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="site-header">
        <div className="brand" aria-label="Arc">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Arc</span>
        </div>
        <span className="header-caption">팀을 위한 프로젝트 관리</span>
      </header>

      <main id="main-content">
        <section className="intro" aria-labelledby="intro-title">
          <span className="eyebrow">ARC · TEAM WORKSPACE</span>
          <h1 id="intro-title">팀의 일을<br />한 흐름에서.</h1>
          <p>
            Epic과 Story로 일을 정리하고, 간트로 일정을 읽고, 보드에서 진행 상황을 확인하세요.
            Arc는 작은 팀을 위한 협업 공간입니다.
          </p>
        </section>

        <section className="foundations" aria-label="Arc의 주요 기능">
          {foundations.map((item) => (
            <article className="foundation-card" key={item.number}>
              <span className="card-number">{item.number}</span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="site-footer">Arc</footer>
    </div>
  )
}

export default App
