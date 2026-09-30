// src/state.js - Persists the simulator state in a sheet cell (UI.stateCell).
// ONLYOFFICE runs every button macro as an independent script, so JS
// variables do not survive between clicks; the sheet is the only storage
// shared by STEP, RUN, PAUSE, RESET and LOAD.

const STATE_VERSION = 1;

function SaveState() {
    const state = {
        version: STATE_VERSION,
        registers: registers,
        flags: flags,
        memory: Array.from(memory, b => toHex(b)).join(""),
        displayMode: currentDisplayMode,
        execution: executionState,
        stepCounter: stepCounter,
        decodedInstruction: decodedInstruction,
        pendingWriteback: pendingWriteback,
        isRunning: isRunning,
        runId: runId,
        highlightedCells: UI.highlightedCells,
        log: logBuffer
    };
    UI.writeStateText(JSON.stringify(state));
}

/**
 * Restores the state saved by the previous macro run. Returns false when
 * there is no saved state yet (fresh sheet) or it cannot be parsed, in
 * which case the defaults declared by each module are kept.
 */
function LoadState() {
    const text = UI.readStateText();
    if (!text) return false;

    let s;
    try {
        s = JSON.parse(text);
    } catch (e) {
        console.log(`[State] Ignoring unreadable state: ${e.message}`);
        return false;
    }
    if (!s || s.version !== STATE_VERSION) return false;

    Object.assign(registers, s.registers);
    Object.assign(flags, s.flags);
    for (let i = 0; i < memory.length; i++) {
        memory[i] = parseInt(s.memory.substr(i * 2, 2), 16) || 0;
    }
    currentDisplayMode = s.displayMode || "HEX";
    Object.assign(executionState, s.execution);
    stepCounter = s.stepCounter || 0;
    decodedInstruction = s.decodedInstruction || null;
    pendingWriteback = s.pendingWriteback || null;
    isRunning = !!s.isRunning;
    runId = s.runId || 0;
    UI.highlightedCells = s.highlightedCells || [];
    logBuffer.length = 0;
    for (const entry of (s.log || [])) {
        logBuffer.push(entry);
    }
    return true;
}
