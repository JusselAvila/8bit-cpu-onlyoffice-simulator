// src/logger.js - Execution log (sheet-panel integration completed in Task 5.2)

const logBuffer = [];

/**
 * Records one execution/micro-operation event.
 * For now this buffers messages and prints them to the console;
 * Task 5.2 extends this to also write timestamped lines into the
 * ONLYOFFICE log panel and handle scrolling once the panel is full.
 */
function WriteLog(message) {
    logBuffer.push(message);
    console.log(message);
}

/**
 * Clears the log buffer. Wired to the RESET button in Task 5.2.
 */
function ClearLog() {
    logBuffer.length = 0;
    console.log("[Logger] Log cleared.");
}
