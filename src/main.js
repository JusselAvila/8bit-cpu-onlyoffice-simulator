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


// --- Execute/Store phase state (Task 4.1 / 4.2) ---
let pendingWriteback = null; // { type: "REGISTER", reg, value } | { type: "MEMORY", address, value } | null

function getSrcValue(instr) {
    switch (instr.src) {
        case "AX": return registers.AX;
        case "BX": return registers.BX;
        case "IMM": return instr.operand;
        default: return null;
    }
}

/**
 * Applies an ALU result to the flag registers.
 * CF === null means "leave CF unchanged" (INC/DEC semantics).
 */
function ApplyALUFlags(aluResult) {
    SetFlag("ZF", aluResult.ZF);
    if (aluResult.CF !== null && aluResult.CF !== undefined) {
        SetFlag("CF", aluResult.CF);
    }
    SetFlag("SF", aluResult.SF);
}

/**
 * Executes exactly one micro-operation of the Execute phase.
 * Dispatches by decodedInstruction.op, using the ALU for arithmetic/logic
 * instructions and direct register writes for MOV/branches.
 */
function Execute_Step() {
    if (executionState.halted) return true;
    const instr = decodedInstruction;

    switch (instr.op) {
        case "HLT": {
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: HLT encountered - clock stopped`);
            executionState.halted = true;
            WriteLog(`[Step ${pad(stepCounter)}] HALTED: no further micro-operations until RESET`);
            pendingWriteback = null;
            return true;
        }

        case "MOV": {
            const value = getSrcValue(instr);
            pendingWriteback = { type: "REGISTER", reg: instr.dest, value: value };
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: MOV -> ${instr.dest} will receive 0x${toHex(value)} (no flags)`);
            executionState.phase = "STORE";
            executionState.microStep = 0;
            return true;
        }

        case "LOAD": {
            switch (executionState.microStep) {
                case 0: {
                    SetRegister("MAR", instr.operand);
                    stepCounter++;
                    WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: MAR <- 0x${toHex(instr.operand)} (LOAD address)`);
                    executionState.microStep = 1;
                    return false;
                }
                case 1: {
                    const value = Bus.read(registers.MAR);
                    SetRegister("MDR", value);
                    stepCounter++;
                    WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: MDR <- RAM[0x${toHex(registers.MAR)}] = 0x${toHex(value)}`);
                    pendingWriteback = { type: "REGISTER", reg: instr.dest, value: value };
                    executionState.phase = "STORE";
                    executionState.microStep = 0;
                    return true;
                }
            }
            break;
        }

        case "STORE": {
            const value = getSrcValue(instr);
            pendingWriteback = { type: "MEMORY", address: instr.operand, value: value };
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: preparing STORE of ${instr.src} (0x${toHex(value)}) to [0x${toHex(instr.operand)}]`);
            executionState.phase = "STORE";
            executionState.microStep = 0;
            return true;
        }

        case "ADD": case "SUB": case "AND": case "OR": case "XOR": {
            const a = registers[instr.dest];
            const b = getSrcValue(instr);
            const fn = { ADD: ALU_ADD, SUB: ALU_SUB, AND: ALU_AND, OR: ALU_OR, XOR: ALU_XOR }[instr.op];
            const r = fn(a, b);
            ApplyALUFlags(r);
            pendingWriteback = { type: "REGISTER", reg: instr.dest, value: r.result };
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: ${instr.op} ${instr.dest}(0x${toHex(a)}), 0x${toHex(b)} = 0x${toHex(r.result)} (ZF=${r.ZF} CF=${r.CF} SF=${r.SF})`);
            executionState.phase = "STORE";
            executionState.microStep = 0;
            return true;
        }

        case "INC": case "DEC": case "NOT": {
            const a = registers[instr.dest];
            const fn = { INC: ALU_INC, DEC: ALU_DEC, NOT: ALU_NOT }[instr.op];
            const r = fn(a);
            ApplyALUFlags(r);
            pendingWriteback = { type: "REGISTER", reg: instr.dest, value: r.result };
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: ${instr.op} ${instr.dest}(0x${toHex(a)}) = 0x${toHex(r.result)} (ZF=${r.ZF} SF=${r.SF}${r.CF === null ? ", CF unchanged" : ""})`);
            executionState.phase = "STORE";
            executionState.microStep = 0;
            return true;
        }

        case "CMP": {
            const a = registers[instr.dest];
            const b = getSrcValue(instr);
            const r = ALU_CMP(a, b);
            ApplyALUFlags(r);
            pendingWriteback = null; // CMP never writes back
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: CMP ${instr.dest}(0x${toHex(a)}) vs 0x${toHex(b)} -> flags only (ZF=${r.ZF} CF=${r.CF} SF=${r.SF})`);
            executionState.phase = "STORE";
            executionState.microStep = 0;
            return true;
        }

        case "JMP": {
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: JMP -> PC = 0x${toHex(instr.operand)}`);
            SetRegister("PC", instr.operand);
            pendingWriteback = null;
            executionState.phase = "FETCH";
            executionState.microStep = 0;
            return true;
        }

        case "JZ": case "JNZ": {
            const conditionMet = (instr.op === "JZ") ? (flags.ZF === 1) : (flags.ZF === 0);
            stepCounter++;
            if (conditionMet) {
                WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: ${instr.op} taken -> PC = 0x${toHex(instr.operand)}`);
                SetRegister("PC", instr.operand);
            } else {
                WriteLog(`[Step ${pad(stepCounter)}] EXECUTE: ${instr.op} not taken -> PC continues sequentially (0x${toHex(registers.PC)})`);
            }
            pendingWriteback = null;
            executionState.phase = "FETCH";
            executionState.microStep = 0;
            return true;
        }

        default:
            throw new Error(`[Control Unit Error] Unknown instruction op: ${instr.op}`);
    }
}

/**
 * Executes exactly one micro-operation of the Store phase.
 * Register write-backs are instant; memory write-backs (STORE instruction)
 * go through MAR/MDR across three micro-steps, with Data Segment protection.
 */
function Store_Step() {
    if (executionState.halted) return true;

    if (!pendingWriteback) {
        stepCounter++;
        WriteLog(`[Step ${pad(stepCounter)}] STORE: no write-back required`);
        executionState.phase = "FETCH";
        executionState.microStep = 0;
        return true;
    }

    if (pendingWriteback.type === "REGISTER") {
        SetRegister(pendingWriteback.reg, pendingWriteback.value);
        stepCounter++;
        WriteLog(`[Step ${pad(stepCounter)}] STORE: ${pendingWriteback.reg} <- 0x${toHex(pendingWriteback.value)}`);
        pendingWriteback = null;
        executionState.phase = "FETCH";
        executionState.microStep = 0;
        return true;
    }

    // pendingWriteback.type === "MEMORY" (STORE instruction)
    switch (executionState.microStep) {
        case 0: {
            const segment = GetSegment(pendingWriteback.address);
            if (segment !== "DATA") {
                stepCounter++;
                WriteLog(`[Step ${pad(stepCounter)}] STORE: REJECTED - address 0x${toHex(pendingWriteback.address)} is in the ${segment} segment (writes only allowed in DATA, 80h-FFh)`);
                pendingWriteback = null;
                executionState.phase = "FETCH";
                executionState.microStep = 0;
                return true;
            }
            SetRegister("MAR", pendingWriteback.address);
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] STORE: MAR <- 0x${toHex(pendingWriteback.address)}`);
            executionState.microStep = 1;
            return false;
        }
        case 1: {
            SetRegister("MDR", pendingWriteback.value);
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] STORE: MDR <- 0x${toHex(pendingWriteback.value)}`);
            executionState.microStep = 2;
            return false;
        }
        case 2: {
            Bus.write(registers.MAR, registers.MDR);
            stepCounter++;
            WriteLog(`[Step ${pad(stepCounter)}] STORE: RAM[0x${toHex(registers.MAR)}] <- MDR (0x${toHex(registers.MDR)})`);
            pendingWriteback = null;
            executionState.phase = "FETCH";
            executionState.microStep = 0;
            return true;
        }
    }
}

/**
 * Single entry point for one STEP click: dispatches to the current phase.
 * This is what the STEP button (Task 5.1) will call.
 */
function Step() {
    if (executionState.halted) {
        WriteLog(`[Step ${pad(stepCounter)}] HALTED: no further steps until RESET`);
        return;
    }
    switch (executionState.phase) {
        case "FETCH": Fetch_Step(); break;
        case "DECODE": Decode_Step(); break;
        case "EXECUTE": Execute_Step(); break;
        case "STORE": Store_Step(); break;
        default: throw new Error(`[Control Unit Error] Unknown phase: ${executionState.phase}`);
    }
}

