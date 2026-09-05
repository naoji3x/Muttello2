import type { DroneStep } from './blocks'
export type TelloState = {
  configured: boolean; connected: boolean; flight: string; execution: string
  battery: number | null; height: number | null; lastTelemetry: number | null
  message: string; activeStep: number
  cameraOn: boolean; cameraError: string; photoFolder: string
}
declare global {
  interface Window {
    muttello2?: {
      setCamera(enabled: boolean): Promise<TelloState>
      selectPhotoFolder(): Promise<TelloState>
      exportLogs(): Promise<void>
      onFrame(callback: (frame: string | null) => void): () => void
      onPhoto(callback: (photo: { name: string; url: string }) => void): () => void
      getState(): Promise<TelloState>
      connect(): Promise<TelloState>
      runProgram(program: { version: 1; steps: DroneStep[] }): Promise<TelloState>
      cancelProgram(): Promise<TelloState>
      land(): Promise<TelloState>
      emergencyStop(): Promise<TelloState>
    }
  }
}
