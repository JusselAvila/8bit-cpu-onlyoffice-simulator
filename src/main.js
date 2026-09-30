// src/main.js - CPU instruction cycle control unit
// Fetch phase implemented here (Task 3.2). Decode (#26) and Execute/Store (#29)
// extend the same phase/microStep state machine; button wiring (STEP/RUN/PAUSE/
// RESET/LOAD) is completed in Task 5.1/5.2.

const executionState = {
    phase: "FETCH",   // FETCH | DECODE | EXECUTE | STORE
    microStep: 0,     // index within the current phase's micro-operation sequence
    halted: false
};

let stepCounter = 0;

function pad(n) {
    return n.toString().padStart(2, "0");
}

/**
 * Executes exactly one micro-operation of the Fetch phase.
 * Call once per STEP click while executionState.phase === "FETCH".
 * Returns true when the Fetch phase has completed (IR loaded, PC incremented,
 * control handed over to Decode).
 */
function Fetch_Step() {
    if (executionState.halted) {
        WriteLog(`[Step ${pad(stepCounter)}] HALTED: no further steps until RESET`);
        return true;
    }

    switch (executionState.microStep) {
        case 0: {
            // MAR <- PC
            SetRegister("MAR", registers.PC);
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] FETCH: MAR <- PC (0x${toHex(registers.PC)})`);
            executionState.microStep = 1;
            return false;
        }
        case 1: {
            // MDR <- RAM[MAR], through the Bus
            const value = Bus.read(registers.MAR);
            SetRegister("MDR", value);
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] FETCH: MDR <- RAM[0x${toHex(registers.MAR)}] = 0x${toHex(value)}`);
            executionState.microStep = 2;
            return false;
        }
        case 2: {
            // IR <- MDR
            SetRegister("IR", registers.MDR);
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] FETCH: IR <- MDR (0x${toHex(registers.MDR)})`);
            executionState.microStep = 3;
            return false;
        }
        case 3: {
            // PC <- PC + 1, with 8-bit wraparound (FFh -> 00h)
            const oldPC = registers.PC;
            const newPC = (oldPC + 1) & 0xFF;
            SetRegister("PC", newPC);
            stepCounter++;

            if (oldPC === 0xFF) {
                WriteLog(`[Step ${pad(stepCounter)}] FETCH: PC wrapped 0xFF -> 0x00 (WARNING: program counter overflow)`);
            } else {
                WriteLog(`[Step ${pad(stepCounter)}] FETCH: PC <- PC + 1 (0x${toHex(oldPC)} -> 0x${toHex(newPC)})`);
            }

            // Fetch complete: reset micro-step for the next instruction's Fetch
            // and hand control to Decode (Task 3.3).
            executionState.microStep = 0;
            executionState.phase = "DECODE";
            return true;
        }
        default:
            throw new Error(`[Control Unit Error] Invalid Fetch microStep: ${executionState.microStep}`);
    }
}

	
let decodedInstruction = null;

/**
 * Executes exactly one micro-operation of the Decode phase.
 * Call once per STEP click while executionState.phase === "DECODE".
 * Returns true when Decode has completed (decodedInstruction ready,
 * control handed over to Execute).
 */
function Decode_Step() {
    if (executionState.halted) {
        WriteLog(`[Step ${pad(stepCounter)}] HALTED: no further steps until RESET`);
        return true;
    }

    switch (executionState.microStep) {
        case 0: {
            const entry = DecodeOpcode(registers.IR);

            if (!entry) {
                stepCounter++;
                WriteLog(`[Step ${pad(stepCounter)}] DECODE: ILLEGAL OPCODE 0x${toHex(registers.IR)} -> HALTED`);
                executionState.halted = true;
                return true;
            }

            if (entry.bytes === 1) {
                // No operand to fetch: decode completes in a single micro-step.
                decodedInstruction = BuildDecodedInstruction(registers.IR, entry, null);
                stepCounter++;
                WriteLog(`[Step ${pad(stepCounter)}] DECODE: IR=0x${toHex(registers.IR)} -> ${Disassemble(entry, null)}`);
                executionState.microStep = 0;
                executionState.phase = "EXECUTE";
                return true;
            }

            // 2-byte instruction: proceed to fetch the operand byte.
            executionState.microStep = 1;
            return false;
        }
        case 1: {
            // MAR <- PC
            SetRegister("MAR", registers.PC);
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] DECODE: MAR <- PC (0x${toHex(registers.PC)})`);
            executionState.microStep = 2;
            return false;
        }
        case 2: {
            // MDR <- RAM[MAR], through the Bus (this is the operand byte)
            const value = Bus.read(registers.MAR);
            SetRegister("MDR", value);
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] DECODE: MDR <- RAM[0x${toHex(registers.MAR)}] = 0x${toHex(value)} (operand)`);
            executionState.microStep = 3;
            return false;
        }
        case 3: {
            // PC <- PC + 1, with 8-bit wraparound
            const oldPC = registers.PC;
            const newPC = (oldPC + 1) & 0xFF;
            SetRegister("PC", newPC);
            stepCounter++;

            if (oldPC === 0xFF) {
                WriteLog(`[Step ${pad(stepCounter)}] DECODE: PC wrapped 0xFF -> 0x00 (WARNING: program counter overflow)`);
            } else {
                WriteLog(`[Step ${pad(stepCounter)}] DECODE: PC <- PC + 1 (0x${toHex(oldPC)} -> 0x${toHex(newPC)})`);
            }

            const entry = GetInstruction(registers.IR);
            decodedInstruction = BuildDecodedInstruction(registers.IR, entry, registers.MDR);
            WriteLog(`[Step ${pad(stepCounter)}] DECODE: ${Disassemble(entry, registers.MDR)}`);

            executionState.microStep = 0;
            executionState.phase = "EXECUTE";
            return true;
        }
        default:
            throw new Error(`[Control Unit Error] Invalid Decode microStep: ${executionState.microStep}`);
    }
}


// --- Program Loader (Task 3.4) ---

/**
 * Parses a space-separated hex byte string, e.g. "01 00 02 05".
 * Pure function - no sheet access, no side effects - so it can be unit-tested
 * independently of the ONLYOFFICE environment.
 * Throws on empty input or any invalid token.
 */
function ParseHexProgram(text) {
    if (typeof text !== "string" || text.trim() === "") {
        throw new Error("program source is empty");
    }
    const tokens = text.trim().split(/\s+/);
    const bytes = tokens.map(tok => {
        const value = parseInt(tok, 16);
        if (isNaN(value) || value < 0 || value > 255) {
            throw new Error(`invalid byte token "${tok}"`);
        }
        return value;
    });
    return bytes;
}

/**
 * Core loader: validates and writes a byte array into the Code Segment,
 * clears any leftover bytes from a previous (longer) program, resets the
 * CPU, and logs the result.
 * Returns true on success, false if the program was rejected.
 */
function LoadProgramFromBytes(bytes) {
    if (!Array.isArray(bytes) || bytes.length === 0) {
        WriteLog(`[LOAD] ERROR: program is empty`);
        return false;
    }
    if (bytes.length > 32) {
        WriteLog(`[LOAD] ERROR: program size (${bytes.length} bytes) exceeds Code Segment capacity (32 bytes, 00h-1Fh)`);
        return false;
    }
    for (const b of bytes) {
        if (!Number.isInteger(b) || b < 0 || b > 255) {
            WriteLog(`[LOAD] ERROR: invalid byte value ${b} in program`);
            return false;
        }
    }

    ClearCodeSegment();
    for (let i = 0; i < bytes.length; i++) {
        Bus.write(i, bytes[i]);
    }
    UI.refreshRamGrid(currentDisplayMode); // ensures leftover cleared cells (beyond new length) also refresh

    ResetCPU();
    WriteLog(`[LOAD] Program loaded: ${bytes.length} bytes into Code Segment (00h-${toHex(bytes.length - 1)}h)`);
    return true;
}

/**
 * Reads the program source cell, parses it and loads it.
 * This is the function wired to the LOAD PROGRAM button (Task 5.1).
 */
function LoadProgram() {
    const text = UI.getProgramSourceText();
    let bytes;
    try {
        bytes = ParseHexProgram(text);
    } catch (e) {
        WriteLog(`[LOAD] ERROR: ${e.message}`);
        return false;
    }
    return LoadProgramFromBytes(bytes);
}

/**
 * Loads the mandatory Task 6.1 demonstration program (5 x 6 by successive
 * additions) and writes its hex text into the source cell so it is visible
 * and editable afterwards (needed for live-modification scenarios in the defense).
 */
function LoadDemoProgram() {
    const demoBytes = [0x01, 0x00, 0x02, 0x05, 0x10, 0x06, 0x1B, 0x32, 0x04, 0x07, 0x80, 0x00];
    const demoText = demoBytes.map(b => toHex(b)).join(" ");

    UI.setProgramSourceText(demoText);
    WriteLog(`[LOAD] Loading built-in demo program (multiplication by successive additions)`);
    return LoadProgramFromBytes(demoBytes);
}
