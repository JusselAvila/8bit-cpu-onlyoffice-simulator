// src/logger.js - Execution log: in-memory buffer + visible sheet panel

const LOG_PANEL_SIZE = 16; // matches the log table reserved in Task 2.1 (rows 28-43)
const logBuffer = [];

function LogTimestamp() {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    const ss = now.getSeconds().toString().padStart(2, "0");
    const ms = now.getMilliseconds().toString().padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
}

/**
 * Appends one timestamped event to the log and refreshes the visible
 * panel. Oldest lines are dropped once the panel is full (scrolling).
 * details (optional): { step, phase, snapshot: { registers, flags } } for
 * micro-operations, so the log table can show one column per register.
 */
function WriteLog(message, details) {
    const entry = {
        time: LogTimestamp(),
        step: details ? details.step : null,
        phase: details ? details.phase : null,
        snapshot: details ? details.snapshot : null,
        message: message
    };
    logBuffer.push(entry);
    if (logBuffer.length > LOG_PANEL_SIZE) {
        logBuffer.shift();
    }
    UI.refreshLogPanel(logBuffer);

    const prefix = entry.step !== null ? `[Step ${pad(entry.step)}] ${entry.phase}: ` : "";
    console.log(`[${entry.time}] ${prefix}${message}`);
}

/**
 * Clears the log buffer and the visible panel. Wired to the RESET button.
 */
function ClearLog() {
    logBuffer.length = 0;
    UI.refreshLogPanel(logBuffer);
}
