# Architecture & Module Specifications

This document defines the modular boundaries, public interfaces, and data flow for the 8-bit CPU OnlyOffice Simulator, adhering strictly to a decoupled architecture.

---

## 1. Core Modules & Public Interfaces

### 1.1 System Bus (`src/bus.js`)
Acts as the central communication backbone. The CPU interacts exclusively through the bus rather than touching the RAM array directly.
* **`Bus.read(address)`**: Reads an 8-bit value from the specified memory address (`0x00`–`0xFF`).
* **`Bus.write(address, value)`**: Writes an 8-bit masked value to the specified memory address.

### 1.2 RAM Module (`src/ram.js`)
Manages the physical 256-byte memory array and logical segmentation mapping.
* **`ReadRAM(address)`**: Internal storage read operation with boundary validations.
* **`WriteRAM(address, value)`**: Internal storage write operation that triggers UI cell updates.
* **`ClearRAM()`**: Resets all 256 memory cells to `0`.
* **`ToMnemonic(address, val)`**: Converts raw machine code into human-readable ISA instructions based on code boundaries.
* **`SetDisplayMode(mode)`**: Switches the rendering mode of the RAM grid (`HEX`, `BIN`, `DEC`, `MNEMONIC`).

### 1.3 CPU Core (`src/cpu.js`)
Handles processor registers, status flags, and state management. Completely decoupled from spreadsheet interactions.
* **`GetSegment(address)`**: Determines if an address belongs to `CODE` (`00h–1Fh`), `RESERVED` (`20h–7Fh`), or `DATA` (`80h–FFh`).
* **`SetRegister(regName, value)`**: Safely updates 8-bit registers (`PC`, `IR`, `MAR`, `MDR`, `AX`, `BX`) using bitwise masking (`& 0xFF`) and delegates view changes to `ui.js`.
* **`SetFlag(flagName, value)`**: Updates 1-bit status flags (`ZF`, `CF`, `SF`).
* **`ResetCPU()`**: Resets registers, flags, and execution phase back to initial states without clearing RAM contents.

### 1.4 User Interface (`src/ui.js`)
The **only** module permitted to interact with the ONLYOFFICE spreadsheet cells (`Api.GetActiveSheet()`).
* **`UI.updateRegister(regName, value)`**: Updates register display rows (Hex, Binary, Decimal).
* **`UI.updateFlag(flagName, value)`**: Updates status flag states in the sheet.
* **`UI.resetPhaseIndicator()`**: Resets instruction phase (`FETCH`) and step counter indicators.
* **`UI.updateRamCell(address, value, mode)`**: Refreshes an individual cell coordinate on the RAM grid based on current visualization modes.
* **`UI.refreshRamGrid(mode)`**: Iterates through all memory addresses to redraw the entire RAM grid.
* **`UI.highlightCells(cellRefs, colorRgb)`** / **`UI.clearHighlights()`**: Paints the active cells with the phase color (`UI.COLORS`) and restores them to white before the next micro-operation or on RESET.
* **`UI.updatePhaseIndicator(phase, microOpText, stepNum)`**: Writes the current phase, micro-operation and step counter.
* **`UI.getDelayMs()`**: Reads the RUN delay from the speed cell (`C24`).
* **`UI.refreshLogPanel(entries)`**: Redraws the 16-row log table (`B28:Z43`, one column per register).
* **`UI.readStateText()`** / **`UI.writeStateText(text)`**: Access the serialized state cell (`BH1`).

### 1.6 Logger (`src/logger.js`)
* **`WriteLog(message, details)`**: Appends a timestamped entry (optionally with step, phase and register snapshot); drops the oldest entry once the panel is full.
* **`ClearLog()`**: Empties the buffer and the panel (called by `ResetCPU()`).

### 1.7 Control Unit (`src/main.js`)
Phase/micro-step state machine (`FETCH → DECODE → EXECUTE → STORE`). Each call to `ExecuteOneMicroOp()` performs exactly one register transfer and reports it through `CompleteMicroOp()`, which clears the previous highlight, paints the new cells, updates the phase indicator and writes one log line.
* **`Step()`**: STEP button, one micro-operation (ignored while RUN is active).
* **`Run()`** / **`Pause()`**: `setTimeout`-driven loop that re-reads the delay every tick and stops on `HLT` or an illegal opcode; `RunBatch(maxSteps)` is the fallback when timers are not available.
* **`Reset()`**: RESET button, delegates to `ResetCPU()`.
* **`LoadProgram()`** / **`LoadDemoProgram()`**: Parse and load hex bytes into the Code Segment.
* **`SimulatorMain(action)`**: Entry point called by every button macro (`LOAD`, `LOAD_DEMO`, `STEP`, `RUN`, `RUN_TO_END`, `PAUSE`, `RESET`): restores the state, runs the action and saves the state again.

### 1.8 State persistence (`src/state.js`)
ONLYOFFICE executes each button macro as an independent script, so nothing kept in JavaScript variables survives between clicks.
* **`SaveState()`**: Serializes registers, flags, RAM, execution phase, pending write-back, highlights, log and RUN status as JSON into `BH1`.
* **`LoadState()`**: Restores that JSON at the start of every macro run and of every RUN tick.

### 1.9 Button macros (`tools/build-macros.js` → `dist/macros/`)
Concatenates every `/src` module into one self-contained macro per button, ending in `SimulatorMain("<ACTION>")`.

### 1.5 Utility Engine (`src/utils.js`)
Pure formatting functions shared across modules.
* **`toHex(val)`**: Converts numeric values to uppercase 2-digit Hex strings.
* **`toBin(val)`**: Converts numeric values to 8-bit padded binary strings formatted for spreadsheet text safety.
* **`toDec(val)`**: Converts numeric values to standard decimal strings.

---

## 2. Design Constraints & Architectural Rules
1. **Zero UI Leaks**: Modules such as `cpu.js`, `ram.js`, `bus.js`, and upcoming processing blocks (`alu.js`, `decoder.js`) contain **no references** to `Api.GetActiveSheet()`.
2. **Bus Mediation**: Memory read/write routines invoked by the processor go strictly through `bus.js`.
3. **Modularity**: Individual files can be tested or replaced independently without triggering breaking changes across layers.
