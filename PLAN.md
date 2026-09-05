# Tello Block Programming App Plan

## 1. Product goal

Create a simple desktop app that lets Japanese elementary school students program a Tello EDU drone with visual blocks. The MVP supports one Tello EDU with SDK 2.0 in Wi-Fi client mode; regular Tello and RoboMaster TT are not supported unless explicitly validated later.

The first release should make this learning loop easy:

1. Arrange blocks.
2. Run the program in a simulator.
3. Check the program for unsafe operations.
4. Run it on one Tello EDU.
5. Review what happened.

The app UI and learning content are Japanese-first. The internal code, APIs, and source comments may remain in English.

## 2. MVP scope

### Supported blocks

- Start
- Take off
- Land
- Wait
- Move forward, backward, left, right, up, and down
- Rotate left and right
- Repeat a fixed number of times
- Take photo
- App message / status display

### MVP features

- Blockly-based block editor
- Japanese block labels and help text
- 2D simulator
- Save and load projects locally
- Program validation before real flight
- Connect to one Tello EDU over Wi-Fi
- Set the Tello client-mode IP address at startup
- Save photos from the Tello video stream to the PC
- UDP command and response logging
- Emergency stop button
- Battery, connection, and flight-state indicators
- Beginner tutorial with 4-5 short challenges

### Out of scope for MVP

- Video recording (live preview is now in scope per the requested camera ON/OFF UI)
- Mission pads
- `rc` joystick control
- Multiple-drone control
- Cloud accounts and classroom management
- AI-generated programs
- Mobile and Chromebook support
- RoboMaster TT-specific extensions, including programmable LEDs

## 3. Recommended technical environment

- Language: TypeScript
- UI: React
- Block editor: Blockly
- Desktop shell: Electron
- Tello transport: Node.js UDP from the Electron main process
- Build tool: Vite
- Tests: Vitest and Playwright
- Package manager: npm
- Editor: Visual Studio Code
- Version control: Git

Electron is selected because the UI and UDP integration can be implemented with one JavaScript/TypeScript stack and distributed on Windows and macOS. Blockly should be customized with a small domain-specific toolbox rather than exposing all general-purpose blocks.

### Electron security baseline

- Keep `contextIsolation` enabled and `nodeIntegration` disabled.
- Use a sandboxed renderer and a restrictive Content Security Policy.
- Expose only named, typed actions through `preload.ts`; never expose raw Node.js, UDP, or generic IPC access to the renderer.
- Load only bundled local application content in the MVP.

## 4. Architecture

```text
React renderer
  - Blockly workspace
  - simulator
  - Japanese UI
  - project editor
        |
        | Electron IPC
        v
Electron main process
  - safety gate
  - execution coordinator
  - one-command queue and timeout handler
  - UDP transport
  - flight-state monitor
        |
        v
Tello EDU
  - command UDP port 8889
  - state UDP port 8890
  - video UDP port 11111
```

The renderer must not send arbitrary UDP packets. The main process exposes a small typed API such as `connect`, `runProgram`, `cancelProgram`, `land`, `emergencyStop`, and `getState`.

`cancelProgram`, `land`, and `emergencyStop` have different meanings. Cancelling discards unsent steps, landing sends `land`, and emergency stop sends `emergency`, which immediately stops the motors and can cause the aircraft to fall. Emergency stop is a teacher-facing control with a deliberate confirmation action.

### Client-mode endpoint configuration

The app connects to a Tello EDU that has already joined the school Wi-Fi network. The Tello address is supplied at app startup, not edited in the child-facing UI.

```text
npm run start -- --tello-ip 192.168.1.42
```

- `--tello-ip <IPv4>` is required for real-flight mode and identifies the Tello EDU's client-mode address.
- The command port is fixed at `8889`; the state listener binds locally to UDP port `8890`.
- The video listener binds locally to UDP port `11111` while live preview or photo capture is in use.
- Validate that the argument is a single IPv4 address before opening a UDP socket.
- Accept command responses, state packets, and video packets only from the configured Tello IP.
- Simulation does not require `--tello-ip`.
- The teacher is responsible for reserving or recording the DHCP address before a lesson.

### Photo capture

The photo block saves a decoded frame from Tello's video stream to the PC. It is not a separate camera command sent to the aircraft.

When the executor reaches the first photo block in a program:

1. Bind the local UDP video listener to port `11111`.
2. Send `streamon` if the stream is not already active.
3. Wait for `ok` and the first decodable video frame, with a bounded timeout.
4. Save that frame as a JPEG in the teacher-selected project photo folder.
5. Display the saved snapshot in the app. Keep the stream active for later photo blocks, then send `streamoff` when the program completes or is cancelled. If the user explicitly enabled live preview, retain the stream until camera OFF is pressed. No video files are recorded.

`streamon` can be sent after takeoff: the SDK only requires that SDK mode has already been entered. For a program containing takeoff followed by photo, streaming therefore begins immediately before the first photo block. A failed stream start or frame timeout stops the program and shows a Japanese error; it must not be silently skipped.

## 5. Program representation

Do not translate blocks directly into UDP strings. Save the Blockly workspace JSON as the project source, then convert it into a validated intermediate representation at execution time. Both formats require a version number and migration path.

Example:

```json
{
  "version": 1,
  "steps": [
    { "type": "takeoff" },
    { "type": "move", "direction": "forward", "distanceCm": 50 },
    { "type": "wait", "milliseconds": 1000 },
    { "type": "land" }
  ]
}
```

Execution targets:

- Simulator executor
- Tello executor

This keeps simulation, safety checking, and real-drone execution consistent.

## 6. Safety requirements

Every real-flight run must pass validation before any flight command is sent.

Initial configurable limits:

- Maximum altitude: 250 cm
- Maximum vertical movement per block: 250 cm
- Maximum lateral movement per block: 500 cm
- Maximum planned lateral displacement from the launch point: 500 cm
- Minimum movement per block: 20 cm
- Rotation per block: 1-360 degrees
- Maximum program duration: 60 seconds
- Maximum repeat count: 10
- One active flight program at a time

Validation rules:

- A real-flight program must contain takeoff and land.
- Movement before takeoff is rejected.
- Commands after landing are rejected.
- Repeat counts, planned altitude, and planned lateral displacement must stay within limits.
- Telemetry must be recent and battery must meet a configurable preflight threshold.
- Commands are sent one at a time; the next command waits for `ok`, `error`, or timeout.
- Movement, takeoff, rotation, and landing commands are never automatically retried after a timeout. The app enters an uncertain state and stops the queue.
- On connection loss, discard unsent commands. Attempt landing only while the command channel remains available; otherwise show that aircraft state is unknown.
- Emergency motor stop is available only through the deliberate teacher-facing control.

The simulator must be the default execution target. Real flight requires an explicit user action.

## 7. Milestones

### M0: Confirm hardware and operating systems

- Confirm Tello EDU model and firmware.
- Document the supported hardware and firmware combination.
- Confirm target operating systems, initially Windows and macOS.
- Test the SDK 2.0 connection flow with one known-good device.
- Verify client-mode onboarding, DHCP address assignment or reservation, firewall permissions, and operation without Internet access.
- Record command responses and failure cases.

### M1: Blockly editor prototype

- Create the Electron + React + TypeScript project.
- Add Blockly and Japanese toolbox categories.
- Implement the initial block set.
- Serialize and restore versioned workspace JSON.

Exit condition: a user can create and reopen a basic flight program without a drone.

### M2: Intermediate representation and simulator

- Convert blocks into the intermediate representation.
- Add type and range validation.
- Implement a 2D Tello simulator.
- Implement a Fake Tello UDP transport for `ok`, `error`, timeout, and lost-response tests.
- Add video-frame fixtures and photo-save tests without requiring a physical drone.
- Add step-by-step execution and reset.

Exit condition: all MVP challenges can be completed in simulation.

### M3: Tello EDU connection

- Implement UDP transport in the Electron main process.
- Enter SDK mode and handle command responses.
- Implement a one-command queue and explicit uncertain-state handling.
- Implement takeoff, landing, movement, rotation, and state updates.
- Bind UDP port `11111`, start streaming on demand, decode frames, and save photo-block output locally.
- Add timeout, connection-loss, and local diagnostic logging behavior without automatic retries of flight commands.

Exit condition: the same validated program runs in simulation and on one Tello EDU.

### M4: Classroom usability

- Add a preflight checklist, safety warnings, and the teacher-facing emergency-stop control.
- Add battery and connection indicators.
- Add beginner tutorial and challenge cards.
- Test with representative elementary-school users and an adult supervisor.

Exit condition: a first-time user can complete the first challenge with supervision and without reading SDK documentation.

### M5: Packaging and release candidate

- Define separate pilot and production distribution paths; production packages require code-signing and platform notarization where applicable.
- Keep diagnostic logs local by default and allow a teacher to export them explicitly.
- Write teacher setup instructions.
- Test offline operation.
- Run a regression test suite against the simulator and a physical drone.

## 8. Initial repository structure

```text
src/
  blocks/       # Custom Blockly blocks and Japanese labels
  compiler/     # Workspace -> intermediate representation
  safety/       # Validation and limits
  simulator/    # Simulation model and renderer
  tello/        # Command queue, state machine, and UDP protocol
  video/        # Video stream decoder and photo capture
  ui/           # React screens and components
  types/        # Shared TypeScript types
electron/
  main.ts       # Electron main process
  preload.ts    # Restricted typed renderer bridge
tests/
  fakes/        # Fake Tello transport and protocol scenarios
```

## 9. Acceptance criteria for the first release

- A student can make a takeoff, forward movement, turn, and landing program using blocks.
- The program can be previewed without a drone.
- Unsafe programs are rejected with child-friendly Japanese explanations.
- A teacher can understand the connection and flight state at a glance.
- A disconnected drone does not continue receiving queued movement commands.
- A timed-out flight command never runs twice because of an automatic retry.
- The app distinguishes cancelled, landing, emergency-stop, and uncertain-flight states.
- A photo block starts streaming on demand and saves one decodable frame to the selected PC folder.
- The app works with one Tello EDU on the supported desktop operating systems.
- A complete beginner tutorial takes approximately 15 minutes or less.

## 10. Immediate next tasks

### Implementation status (2026-09-05)

- M3: UDP execution, telemetry, safety validation, local logs, on-demand H.264 decoding, live camera ON/OFF, JPEG snapshot saving/display implemented. Hardware acceptance remains pending.
- M4: Three-item preflight checklist, battery/flight indicators, deliberate emergency confirmation, five challenge cards and introductory tutorial implemented. Representative child/adult usability testing remains pending.
- M5: Pilot/production build paths, required production signing credentials, bundled decoder, explicit log export, and teacher/release checklist implemented. Actual signed artifacts, notarization, physical-drone regression and offline device acceptance remain pending; this is not a validated production release.
- Earlier milestone gaps filled: versioned project save/load, wait/repeat/message blocks, step execution and simulated photo display. Repeat blocks compile to a bounded flat IR; both execution targets use the same expanded steps and safety checks.

See [teacher guide](docs/teacher-guide.md) for setup and the remaining hardware/release checks.

1. Confirm the exact Tello EDU hardware, firmware, and target operating systems.
2. Create a small hardware test script that accepts `--tello-ip` for SDK mode, takeoff, landing, state reception, on-demand `streamon`, photo-frame reception, timeout, and connection-loss scenarios.
3. Scaffold the Electron + React + TypeScript application with the Electron security baseline.
4. Add Blockly and implement the Japanese toolbox.
5. Define versioned workspace JSON, the intermediate representation, and safety limits as TypeScript types.
6. Build the simulator and Fake Tello transport before connecting the full application to a physical drone.

## References

- Tello SDK 2.0 User Guide: `Tello SDK 2.0 User Guide.pdf`
- Blockly documentation: https://docs.blockly.com/
- Electron documentation: https://www.electronjs.org/docs/latest/
