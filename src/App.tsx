import { useEffect, useMemo, useRef, useState } from 'react'
import * as Blockly from 'blockly'
import {
  extractSteps,
  initialWorkspace,
  registerBlocks,
  stepLabel,
  toolbox,
  type DroneStep,
} from './blocks'

type RunState = 'idle' | 'running' | 'complete' | 'warning'

type Point = { x: number; y: number }

function buildFlightPath(steps: DroneStep[]) {
  const points: Point[] = [{ x: 50, y: 76 }]
  let point = { ...points[0] }

  for (const step of steps) {
    if (step.type !== 'move') continue
    const distance = step.distance / 100 * 9
    if (step.direction === 'forward') point.y -= distance
    if (step.direction === 'back') point.y += distance
    if (step.direction === 'left') point.x -= distance
    if (step.direction === 'right') point.x += distance
    points.push({ x: Math.max(7, Math.min(93, point.x)), y: Math.max(8, Math.min(88, point.y)) })
  }

  return points
}

function pathToSvg(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function App() {
  const blocklyRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const [steps, setSteps] = useState<DroneStep[]>([])
  const [runState, setRunState] = useState<RunState>('idle')
  const [activeStep, setActiveStep] = useState(-1)
  const [isConnected, setIsConnected] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    registerBlocks()
    if (!blocklyRef.current) return

    const workspace = Blockly.inject(blocklyRef.current, {
      toolbox,
      grid: { spacing: 22, length: 3, colour: '#dbe8f1', snap: true },
      zoom: { controls: true, wheel: true, startScale: 1, maxScale: 1.3, minScale: 0.65 },
      trashcan: true,
      theme: Blockly.Themes.Classic,
    })
    Blockly.serialization.workspaces.load(initialWorkspace, workspace)
    workspace.addChangeListener(() => setSteps(extractSteps(workspace)))
    workspaceRef.current = workspace
    setSteps(extractSteps(workspace))

    return () => workspace.dispose()
  }, [])

  useEffect(() => () => window.clearInterval(timerRef.current), [])

  const isSafeProgram = useMemo(() => {
    const takeoff = steps.findIndex((step) => step.type === 'takeoff')
    const land = steps.findIndex((step) => step.type === 'land')
    return takeoff >= 0 && land > takeoff
  }, [steps])
  const path = useMemo(() => buildFlightPath(steps), [steps])
  const moveCount = steps.filter((step) => step.type === 'move').length
  const photoCount = steps.filter((step) => step.type === 'photo').length
  const displayPoint = path[Math.min(Math.max(activeStep, 0), path.length - 1)] ?? path[0]

  function resetRun() {
    window.clearInterval(timerRef.current)
    setIsRunning(false)
    setActiveStep(-1)
    setRunState('idle')
  }

  function runSimulation() {
    if (!isSafeProgram) {
      setRunState('warning')
      return
    }
    window.clearInterval(timerRef.current)
    setRunState('running')
    setIsRunning(true)
    setActiveStep(0)
    let current = 0
    timerRef.current = window.setInterval(() => {
      current += 1
      if (current >= steps.length) {
        window.clearInterval(timerRef.current)
        setActiveStep(steps.length - 1)
        setIsRunning(false)
        setRunState('complete')
        return
      }
      setActiveStep(current)
    }, 850)
  }

  function programStatus() {
    if (runState === 'warning') return '離陸と着陸をつなげてください'
    if (runState === 'running') return `${activeStep + 1}番目のブロックを実行中`
    if (runState === 'complete') return 'シミュレーションが終わりました！'
    return isSafeProgram ? '飛行前チェック OK' : '飛行前チェックが必要です'
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">M</span><span>Muttello2</span></div>
        <div className="lesson-title"><span>ミッション 1</span> 体育館をまっすぐ飛ぼう</div>
        <div className={`connection ${isConnected ? 'connected' : ''}`}>
          <span className="connection-dot" />
          {isConnected ? 'Tello EDU 接続済み' : 'シミュレーション'}
          <button className="link-button" onClick={() => setIsConnected((connected) => !connected)}>
            {isConnected ? '切断' : '先生のTelloを確認'}
          </button>
        </div>
      </header>

      <section className="workspace-layout">
        <aside className="mission-panel">
          <div className="section-kicker">きょうのミッション</div>
          <h1>写真をとって<br />帰ってこよう</h1>
          <p>離陸して前に進み、写真をとってから安全に着陸しよう。</p>
          <div className="goal-card">
            <span className="goal-icon">🎯</span>
            <div><strong>ゴール</strong><br />写真を1まい保存する</div>
          </div>
          <div className="safety-note">
            <span>🛡️</span>
            <p><strong>安全のやくそく</strong><br />先生が「実機で飛ばす」を押すまで、ドローンは飛びません。</p>
          </div>
          <button className="outline-button" onClick={() => workspaceRef.current?.clear()}>ブロックを消す</button>
        </aside>

        <section className="editor-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">プログラム</span><h2>ブロックをつなげよう</h2></div>
            <span className="block-count">{steps.length} ブロック</span>
          </div>
          <div ref={blocklyRef} className="blockly-canvas" aria-label="プログラムを作るブロックエディタ" />
          <div className="execution-bar">
            <div className={`execution-status ${runState}`}><span />{programStatus()}</div>
            <div className="execution-actions">
              <button className="reset-button" onClick={resetRun}>最初に戻す</button>
              <button className="run-button" onClick={runSimulation} disabled={isRunning}>▶ シミュレーション</button>
            </div>
          </div>
        </section>

        <aside className="flight-panel">
          <div className="panel-heading compact"><div><span className="section-kicker">飛行のようす</span><h2>体育館シミュレーター</h2></div></div>
          <div className="gym-map">
            <div className="map-label top">ステージ</div>
            <div className="map-label bottom">スタート地点</div>
            <svg className="flight-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={pathToSvg(path)} />
              {path.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="1.2" />)}
            </svg>
            <div className="drone" style={{ left: `${displayPoint.x}%`, top: `${displayPoint.y}%` }}>✦</div>
          </div>
          <div className="telemetry">
            <div><span>高さ</span><strong>{activeStep >= 0 ? '80 cm' : '0 cm'}</strong></div>
            <div><span>写真</span><strong>{runState === 'complete' ? `${photoCount} まい` : '0 まい'}</strong></div>
            <div><span>動き</span><strong>{moveCount} かい</strong></div>
          </div>
          <div className="step-list">
            <div className="step-list-title">実行するじゅんばん</div>
            {steps.length === 0 ? <p className="empty-steps">はじめるブロックからつなげよう</p> : steps.map((step, index) => (
              <div key={`${step.type}-${index}`} className={`step-row ${index === activeStep ? 'active' : ''}`}>
                <span>{index + 1}</span>{stepLabel(step)}
              </div>
            ))}
          </div>
          <button className="real-flight-button" disabled={!isConnected || !isSafeProgram || isRunning}>実機で飛ばす <span>先生用</span></button>
        </aside>
      </section>
    </main>
  )
}

export default App
