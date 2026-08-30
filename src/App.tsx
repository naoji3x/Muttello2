import { useEffect, useMemo, useRef, useState } from 'react'
import * as Blockly from 'blockly'
import {
  extractSteps,
  missions,
  registerBlocks,
  stepLabel,
  toolbox,
  type DroneStep,
} from './blocks'

type RunState = 'idle' | 'running' | 'complete' | 'warning'

type Point = { x: number; y: number }
type FlightState = Point & { altitude: number; heading: number }

const initialFlightState: FlightState = { x: 50, y: 76, altitude: 0, heading: 0 }

function normalizeHeading(heading: number) {
  return ((heading % 360) + 360) % 360
}

function simulateFlight(steps: DroneStep[]) {
  const states: FlightState[] = []
  const state = { ...initialFlightState }

  for (const step of steps) {
    if (step.type === 'takeoff') state.altitude = 80
    if (step.type === 'land') state.altitude = 0
    if (step.type === 'turn') {
      state.heading = normalizeHeading(
        state.heading + (step.direction === 'right' ? step.degrees : -step.degrees),
      )
    }

    if (step.type === 'move') {
      if (step.direction === 'up') state.altitude = Math.min(250, state.altitude + step.distance)
      if (step.direction === 'down') state.altitude = Math.max(0, state.altitude - step.distance)

      const distance = step.distance / 100 * 9
      const radians = state.heading * Math.PI / 180
      const forward = { x: Math.sin(radians), y: -Math.cos(radians) }
      const right = { x: Math.cos(radians), y: Math.sin(radians) }
      if (step.direction === 'forward') {
        state.x += forward.x * distance
        state.y += forward.y * distance
      }
      if (step.direction === 'back') {
        state.x -= forward.x * distance
        state.y -= forward.y * distance
      }
      if (step.direction === 'left') {
        state.x -= right.x * distance
        state.y -= right.y * distance
      }
      if (step.direction === 'right') {
        state.x += right.x * distance
        state.y += right.y * distance
      }
      state.x = Math.max(7, Math.min(93, state.x))
      state.y = Math.max(8, Math.min(88, state.y))
    }

    states.push({ ...state })
  }

  return states
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
  const [missionId, setMissionId] = useState<typeof missions[number]['id']>(missions[0].id)
  const [completedMissionIds, setCompletedMissionIds] = useState<string[]>([])
  const missionWorkspacesRef = useRef<
    Record<string, ReturnType<typeof Blockly.serialization.workspaces.save>>
  >({})

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
  const flightStates = useMemo(() => simulateFlight(steps), [steps])
  const path = useMemo(() => [initialFlightState, ...flightStates], [flightStates])
  const photoCount = steps.filter((step) => step.type === 'photo').length
  const selectedMission = missions.find((mission) => mission.id === missionId) ?? missions[0]
  const displayState = activeStep >= 0
    ? flightStates[Math.min(activeStep, flightStates.length - 1)] ?? initialFlightState
    : initialFlightState

  function resetRun() {
    window.clearInterval(timerRef.current)
    setIsRunning(false)
    setActiveStep(-1)
    setRunState('idle')
  }

  function selectMission(nextMissionId: typeof missions[number]['id']) {
    const mission = missions.find((item) => item.id === nextMissionId)
    const workspace = workspaceRef.current
    if (!mission || !workspace) return

    missionWorkspacesRef.current[missionId] = Blockly.serialization.workspaces.save(workspace)
    resetRun()
    setMissionId(mission.id)
    workspace.clear()
    const savedWorkspace = missionWorkspacesRef.current[mission.id]
    if (savedWorkspace) {
      Blockly.serialization.workspaces.load(savedWorkspace, workspace)
    }
    setSteps(extractSteps(workspace))
  }

  function clearWorkspace() {
    resetRun()
    workspaceRef.current?.clear()
    setSteps([])
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
        setCompletedMissionIds((ids) => ids.includes(missionId) ? ids : [...ids, missionId])
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
        <div className="lesson-title"><span>ミッション {selectedMission.number}</span> 体育館を{selectedMission.shortTitle}</div>
        <div className={`connection ${isConnected ? 'connected' : ''}`}>
          <span className="connection-dot" />
          {isConnected ? 'Tello EDU 接続済み' : 'シミュレーション'}
        </div>
      </header>

      <section className="workspace-layout">
        <aside className="mission-panel">
          <div className="section-kicker">きょうのミッション</div>
          <h1>{selectedMission.title}</h1>
          <p>{selectedMission.description}</p>
          <div className="goal-card">
            <span className="goal-icon">{selectedMission.icon}</span>
            <div><strong>ゴール</strong><br />{selectedMission.goal}</div>
          </div>
          <div className="mission-picker">
            <div className="mission-picker-title">ミッションをえらぶ</div>
            {missions.map((mission) => (
              <button
                key={mission.id}
                className={`mission-option ${mission.id === missionId ? 'selected' : ''}`}
                onClick={() => selectMission(mission.id)}
                disabled={isRunning}
              >
                <span className="mission-number">{completedMissionIds.includes(mission.id) ? '✓' : mission.number}</span>
                <span>{mission.shortTitle}</span>
              </button>
            ))}
          </div>
          <div className="safety-note">
            <span>🛡️</span>
            <p><strong>安全のやくそく</strong><br />先生とドローンに接続してから「飛ばす」を押そう。</p>
          </div>
        </aside>

        <section className="editor-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">プログラム</span><h2>ブロックをつなげよう</h2></div>
            <span className="block-count">{steps.length} ブロック</span>
          </div>
          <div ref={blocklyRef} className="blockly-canvas" aria-label="プログラムを作るブロックエディタ" />
          <button className="palette-clear-button" onClick={clearWorkspace} disabled={isRunning}>
            🗑 すべてのブロックを消す
          </button>
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
            <div className="drone" style={{ left: `${displayState.x}%`, top: `${displayState.y}%` }}>
              <span className="drone-direction" style={{ transform: `rotate(${displayState.heading}deg)` }}>▲</span>
            </div>
            <div className="altitude-label" style={{ left: `${displayState.x}%`, top: `${displayState.y}%` }}>{displayState.altitude} cm</div>
          </div>
          <div className="telemetry">
            <div><span>高さ</span><strong>{displayState.altitude} cm</strong></div>
            <div><span>写真</span><strong>{runState === 'complete' ? `${photoCount} まい` : '0 まい'}</strong></div>
            <div><span>向き</span><strong>{displayState.heading}°</strong></div>
          </div>
          <div className="step-list">
            <div className="step-list-title">実行するじゅんばん</div>
            {steps.length === 0 ? <p className="empty-steps">はじめるブロックからつなげよう</p> : steps.map((step, index) => (
              <div key={`${step.type}-${index}`} className={`step-row ${index === activeStep ? 'active' : ''}`}>
                <span>{index + 1}</span>{stepLabel(step)}
              </div>
            ))}
          </div>
          <div className="drone-actions">
            <button className="connect-button" onClick={() => setIsConnected((connected) => !connected)}>
              {isConnected ? '接続を切る' : 'ドローンに接続する'}
            </button>
            <button className="fly-button" onClick={runSimulation} disabled={!isConnected || !isSafeProgram || isRunning}>飛ばす</button>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
