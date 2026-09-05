import type { DroneStep } from './blocks'
export type TelloState = {
  configured: boolean; connected: boolean; flight: string; execution: string
  battery: number | null; height: number | null; lastTelemetry: number | null
  message: string; activeStep: number
}
declare global {
  interface Window {
    muttello2?: {
      getState(): Promise<TelloState>
      connect(): Promise<TelloState>
      runProgram(program: { version: 1; steps: DroneStep[] }): Promise<TelloState>
      cancelProgram(): Promise<TelloState>
      land(): Promise<TelloState>
      emergencyStop(): Promise<TelloState>
    }
  }
}
