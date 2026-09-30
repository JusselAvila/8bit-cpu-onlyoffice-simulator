// src/main.js - Instruction-cycle control unit, program loader, run/pause engine.

const executionState = {
    phase: "FETCH",   // FETCH | DECODE | EXECUTE | STORE
    microStep: 0,
    halted: false
};

let stepCounter = 0;
let decodedInstruction = null;
let pendingWriteback = null;
let isRunning = false;
let runTimerId = null;
let runId = 0;

const RUN_BATCH_LIMIT = 500;

function hx(value) {
    return "0x" + toHex(value);
}

const REG = name => UI.registerCellRef(name);
const FLAG = name => UI.flagCellRef(name);
const RAM = address => UI.ramCellRef(address);
const ALU_CELLS = () => [REG("AX"), REG("BX"), FLAG("ZF"), FLAG("CF"), FLAG("SF")];

function RegisterSnapshot() {
    return { registers: Object.assign({}, registers), flags: Object.assign({}, flags) };
}

/**
 * Commits one micro-operation to the UI: clears the previous highlight,
 * paints the active cells with the phase color, updates the phase
 * indicator and writes exactly one log line. Call after the register
 * transfer so the snapshot shows the resulting state.
 */
function CompleteMicroOp(phase, label, logText, cells) {
    stepCounter++;
    UI.clearHighlights();
    if (cells && cells.length > 0) {
        UI.highlightCells(cells, UI.COLORS[phase]);
    }
    UI.updatePhaseIndicator(phase, label, stepCounter);
    WriteLog(logText, { step: stepCounter, phase: phase, snapshot: RegisterSnapshot() });
}

function IncrementPC() {
    const oldPC = registers.PC;
    const newPC = (oldPC + 1) & 0xFF;
    SetRegister("PC", newPC);
    return oldPC === 0xFF
        ? "PC wrapped 0xFF -> 0x00 (WARNING: program counter overflow)"
        : `PC <- PC + 1 (${hx(oldPC)} -> ${hx(newPC)})`;
}

/**
 * Error text for the log: message, macro build and the first stack frame,
 * so a failing ONLYOFFICE API call can be traced to its line in the macro.
 */
function DescribeError(e) {
    const build = typeof MACRO_BUILD !== "undefined" ? MACRO_BUILD : "src";
    const frames = (e && e.stack ? String(e.stack) : "").split("\n").slice(1);
    const where = frames.length > 0 ? frames[0].trim() : "";
    return `${e && e.message ? e.message : e} [build ${build}]${where ? " " + where : ""}`;
}

function Halt() {
    executionState.halted = true;
    StopRunLoop();
}

// --- Fetch phase ---
function Fetch_Step() {
    switch (executionState.microStep) {
        case 0: {
            SetRegister("MAR", registers.PC);
            CompleteMicroOp("FETCH", "MAR <- PC", `MAR <- PC (${hx(registers.PC)})`,
                [REG("PC"), REG("MAR"), RAM(registers.PC)]);
            executionState.microStep = 1;
            return;
        }
        case 1: {
            SetRegister("MDR", Bus.read(registers.MAR));
            CompleteMicroOp("FETCH", "MDR <- RAM[MAR]", `MDR <- RAM[${hx(registers.MAR)}] = ${hx(registers.MDR)}`,
                [REG("MAR"), REG("MDR"), RAM(registers.MAR)]);
            executionState.microStep = 2;
            return;
        }
        case 2: {
            SetRegister("IR", registers.MDR);
            const entry = GetInstruction(registers.IR);
            const name = entry ? entry.mnemonic : "??";
            CompleteMicroOp("FETCH", "IR <- MDR", `IR <- MDR (${hx(registers.IR)}) -> IR=${name}`,
                [REG("MDR"), REG("IR"), RAM(registers.MAR)]);
            executionState.microStep = 3;
            return;
        }
        case 3: {
            const text = IncrementPC();
            CompleteMicroOp("FETCH", "PC <- PC + 1", text, [REG("PC"), RAM(registers.MAR)]);
            executionState.microStep = 0;
            executionState.phase = "DECODE";
            return;
        }
        default:
            throw new Error(`[Control Unit Error] Invalid Fetch microStep: ${executionState.microStep}`);
    }
}

// --- Decode phase ---
function Decode_Step() {
    switch (executionState.microStep) {
        case 0: {
            const entry = DecodeOpcode(registers.IR);

            if (!entry) {
                Halt();
                CompleteMicroOp("DECODE", "ILLEGAL OPCODE", `ILLEGAL OPCODE ${hx(registers.IR)} -> HALTED`, [REG("IR")]);
                return;
            }

            if (entry.bytes === 1) {
                decodedInstruction = BuildDecodedInstruction(registers.IR, entry, null);
                const disasm = Disassemble(entry, null);
                CompleteMicroOp("DECODE", disasm, `IR=${hx(registers.IR)} -> ${disasm}`, [REG("IR")]);
                executionState.microStep = 0;
                executionState.phase = "EXECUTE";
                return;
            }

            CompleteMicroOp("DECODE", "decode opcode (operand needed)",
                `IR=${hx(registers.IR)} -> ${entry.mnemonic} (2-byte, operand follows)`, [REG("IR")]);
            executionState.microStep = 1;
            return;
        }
        case 1: {
            SetRegister("MAR", registers.PC);
            CompleteMicroOp("DECODE", "MAR <- PC (operand)", `MAR <- PC (${hx(registers.PC)})`,
                [REG("PC"), REG("MAR"), RAM(registers.PC)]);
            executionState.microStep = 2;
            return;
        }
        case 2: {
            SetRegister("MDR", Bus.read(registers.MAR));
            CompleteMicroOp("DECODE", "MDR <- RAM[MAR] (operand)",
                `MDR <- RAM[${hx(registers.MAR)}] = ${hx(registers.MDR)} (operand)`,
                [REG("MAR"), REG("MDR"), RAM(registers.MAR)]);
            executionState.microStep = 3;
            return;
        }
        case 3: {
            const pcText = IncrementPC();
            const entry = GetInstruction(registers.IR);
            decodedInstruction = BuildDecodedInstruction(registers.IR, entry, registers.MDR);
            const disasm = Disassemble(entry, registers.MDR);
            CompleteMicroOp("DECODE", disasm, `${pcText}; decoded ${disasm}`,
                [REG("IR"), REG("MDR"), REG("PC")]);
            executionState.microStep = 0;
            executionState.phase = "EXECUTE";
            return;
        }
        default:
            throw new Error(`[Control Unit Error] Invalid Decode microStep: ${executionState.microStep}`);
    }
}

// --- Execute phase ---
function getSrcValue(instr) {
    switch (instr.src) {
        case "AX": return registers.AX;
        case "BX": return registers.BX;
        case "IMM": return instr.operand;
        default: return null;
    }
}

function ApplyALUFlags(aluResult) {
    SetFlag("ZF", aluResult.ZF);
    if (aluResult.CF !== null && aluResult.CF !== undefined) {
        SetFlag("CF", aluResult.CF);
    }
    SetFlag("SF", aluResult.SF);
}

function goToStore(writeback) {
    pendingWriteback = writeback;
    executionState.phase = "STORE";
    executionState.microStep = 0;
}

function Execute_Step() {
    const instr = decodedInstruction;

    switch (instr.op) {
        case "HLT": {
            Halt();
            pendingWriteback = null;
            CompleteMicroOp("EXECUTE", "HLT", "HLT encountered - clock stopped until RESET", [REG("IR")]);
            return;
        }

        case "MOV": {
            const value = getSrcValue(instr);
            CompleteMicroOp("EXECUTE", `MOV ${instr.dest}`,
                `MOV -> ${instr.dest} will receive ${hx(value)} (no flags)`, ALU_CELLS());
            goToStore({ type: "REGISTER", reg: instr.dest, value: value });
            return;
        }

        case "LOAD": {
            if (executionState.microStep === 0) {
                SetRegister("MAR", instr.operand);
                CompleteMicroOp("EXECUTE", "MAR <- address", `MAR <- ${hx(instr.operand)} (LOAD address)`,
                    [REG("MAR"), RAM(instr.operand)]);
                executionState.microStep = 1;
                return;
            }
            SetRegister("MDR", Bus.read(registers.MAR));
            CompleteMicroOp("EXECUTE", "MDR <- RAM[MAR]", `MDR <- RAM[${hx(registers.MAR)}] = ${hx(registers.MDR)}`,
                [REG("MAR"), REG("MDR"), RAM(registers.MAR)]);
            goToStore({ type: "REGISTER", reg: instr.dest, value: registers.MDR });
            return;
        }

        case "STORE": {
            const value = getSrcValue(instr);
            CompleteMicroOp("EXECUTE", `STORE [${hx(instr.operand)}]`,
                `preparing STORE of ${instr.src} (${hx(value)}) to [${hx(instr.operand)}]`, [REG(instr.src)]);
            goToStore({ type: "MEMORY", address: instr.operand, value: value });
            return;
        }

        case "ADD": case "SUB": case "AND": case "OR": case "XOR": {
            const a = registers[instr.dest];
            const b = getSrcValue(instr);
            const fn = { ADD: ALU_ADD, SUB: ALU_SUB, AND: ALU_AND, OR: ALU_OR, XOR: ALU_XOR }[instr.op];
            const r = fn(a, b);
            ApplyALUFlags(r);
            CompleteMicroOp("EXECUTE", `${instr.op} ${instr.dest}`,
                `${instr.op} ${instr.dest}(${hx(a)}), ${hx(b)} = ${hx(r.result)}`, ALU_CELLS());
            goToStore({ type: "REGISTER", reg: instr.dest, value: r.result });
            return;
        }

        case "INC": case "DEC": case "NOT": {
            const a = registers[instr.dest];
            const fn = { INC: ALU_INC, DEC: ALU_DEC, NOT: ALU_NOT }[instr.op];
            const r = fn(a);
            ApplyALUFlags(r);
            CompleteMicroOp("EXECUTE", `${instr.op} ${instr.dest}`,
                `${instr.op} ${instr.dest}(${hx(a)}) = ${hx(r.result)}${r.CF === null ? " (CF unchanged)" : ""}`,
                ALU_CELLS());
            goToStore({ type: "REGISTER", reg: instr.dest, value: r.result });
            return;
        }

        case "CMP": {
            const a = registers[instr.dest];
            const b = getSrcValue(instr);
            ApplyALUFlags(ALU_CMP(a, b));
            CompleteMicroOp("EXECUTE", `CMP ${instr.dest}`,
                `CMP ${instr.dest}(${hx(a)}) vs ${hx(b)} -> flags only`, ALU_CELLS());
            goToStore(null);
            return;
        }

        case "JMP": {
            CompleteMicroOp("EXECUTE", `JMP ${hx(instr.operand)}`,
                `JMP -> target ${hx(instr.operand)}`, [REG("PC"), RAM(instr.operand)]);
            goToStore({ type: "REGISTER", reg: "PC", value: instr.operand });
            return;
        }

        case "JZ": case "JNZ": {
            const taken = (instr.op === "JZ") ? (flags.ZF === 1) : (flags.ZF === 0);
            CompleteMicroOp("EXECUTE", `${instr.op} ${taken ? "taken" : "not taken"}`,
                taken ? `${instr.op} taken (ZF=${flags.ZF}) -> target ${hx(instr.operand)}`
                      : `${instr.op} not taken (ZF=${flags.ZF}) -> PC continues at ${hx(registers.PC)}`,
                [FLAG("ZF"), REG("PC")]);
            goToStore(taken ? { type: "REGISTER", reg: "PC", value: instr.operand } : null);
            return;
        }

        default:
            throw new Error(`[Control Unit Error] Unknown instruction op: ${instr.op}`);
    }
}

// --- Store phase ---
function finishStore() {
    pendingWriteback = null;
    executionState.phase = "FETCH";
    executionState.microStep = 0;
}

function Store_Step() {
    const wb = pendingWriteback;

    if (!wb) {
        CompleteMicroOp("STORE", "no write-back", "no write-back required", []);
        finishStore();
        return;
    }

    if (wb.type === "REGISTER") {
        SetRegister(wb.reg, wb.value);
        CompleteMicroOp("STORE", `${wb.reg} <- ${hx(wb.value)}`, `${wb.reg} <- ${hx(wb.value)}`, [REG(wb.reg)]);
        finishStore();
        return;
    }

    switch (executionState.microStep) {
        case 0: {
            const segment = GetSegment(wb.address);
            if (segment !== "DATA") {
                CompleteMicroOp("STORE", "REJECTED (segment)",
                    `REJECTED - address ${hx(wb.address)} is in the ${segment} segment (writes only allowed in DATA, 80h-FFh)`,
                    [RAM(wb.address)]);
                finishStore();
                return;
            }
            SetRegister("MAR", wb.address);
            CompleteMicroOp("STORE", "MAR <- address", `MAR <- ${hx(wb.address)}`, [REG("MAR"), RAM(wb.address)]);
            executionState.microStep = 1;
            return;
        }
        case 1: {
            SetRegister("MDR", wb.value);
            CompleteMicroOp("STORE", "MDR <- register", `MDR <- ${hx(wb.value)}`, [REG("MDR"), RAM(wb.address)]);
            executionState.microStep = 2;
            return;
        }
        case 2: {
            Bus.write(registers.MAR, registers.MDR);
            CompleteMicroOp("STORE", "RAM[MAR] <- MDR", `RAM[${hx(registers.MAR)}] <- MDR (${hx(registers.MDR)})`,
                [RAM(registers.MAR)]);
            finishStore();
            return;
        }
        default:
            throw new Error(`[Control Unit Error] Invalid Store microStep: ${executionState.microStep}`);
    }
}

// --- Dispatcher: advances exactly one micro-operation ---
function ExecuteOneMicroOp() {
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

// --- Button macros ---
// STEP button
function Step() {
    if (isRunning) {
        WriteLog(`[STEP] Ignored: RUN in progress, press PAUSE first`);
        return;
    }
    ExecuteOneMicroOp();
}

// RESET button: registers, flags, phase, step counter, highlights and log (RAM is kept)
function Reset() {
    ResetCPU();
}

// --- RUN / PAUSE engine ---
// Every button click is a separate macro run, so PAUSE/RESET cannot reach
// the timer created by RUN. The loop is instead controlled through the
// persisted state: each tick reloads it and stops when isRunning is false
// or another RUN has replaced runId.
function StopRunLoop() {
    isRunning = false;
    if (runTimerId !== null) {
        clearTimeout(runTimerId);
        runTimerId = null;
    }
}

function RunTick(myRunId) {
    runTimerId = null;
    LoadState();
    if (!isRunning || runId !== myRunId) return;

    try {
        ExecuteOneMicroOp();
    } catch (e) {
        StopRunLoop();
        WriteLog(`[RUN] Stopped on error: ${DescribeError(e)}`);
    }
    if (isRunning && executionState.halted) {
        StopRunLoop();
        WriteLog(`[RUN] Finished at step ${pad(stepCounter)} (CPU halted)`);
    }
    SaveState();

    if (isRunning) {
        // The delay is read on every tick so the speed cell can be edited while running.
        runTimerId = setTimeout(() => RunTick(myRunId), UI.getDelayMs());
    }
}

// RUN button
function Run() {
    if (executionState.halted) {
        WriteLog(`[RUN] Cannot start: CPU is halted, press RESET first`);
        return;
    }
    if (typeof setTimeout !== "function") {
        WriteLog(`[RUN] setTimeout not available in this sandbox, falling back to batch mode`);
        RunBatch(RUN_BATCH_LIMIT);
        return;
    }
    isRunning = true;
    runId = Date.now();
    WriteLog(`[RUN] Started (delay=${UI.getDelayMs()}ms)`);
    SaveState();
    const myRunId = runId;
    runTimerId = setTimeout(() => RunTick(myRunId), 0);
}

// PAUSE button
function Pause() {
    if (!isRunning) return;
    StopRunLoop();
    WriteLog(`[PAUSE] Execution paused at step ${pad(stepCounter)} (state preserved)`);
}

/**
 * Fallback for sandboxes without timers: executes up to maxSteps
 * micro-operations synchronously, stopping on HLT or an illegal opcode.
 */
function RunBatch(maxSteps) {
    let count = 0;
    while (!executionState.halted && count < maxSteps) {
        ExecuteOneMicroOp();
        count++;
    }
    WriteLog(`[RUN] Batch executed ${count} micro-operations (halted=${executionState.halted})`);
}

// RUN (batch) button
function RunToEnd() {
    if (isRunning) StopRunLoop();
    RunBatch(RUN_BATCH_LIMIT);
}

// --- Program Loader ---
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
    UI.refreshRamGrid(currentDisplayMode);

    ResetCPU();
    const build = typeof MACRO_BUILD !== "undefined" ? MACRO_BUILD : "src";
    WriteLog(`[LOAD] Program loaded: ${bytes.length} bytes into Code Segment (00h-${toHex(bytes.length - 1)}h) [build ${build}]`);
    return true;
}

// LOAD PROGRAM button (loads the built-in demo when the source cell is empty)
function LoadProgram() {
    const text = UI.getProgramSourceText();
    if (text.trim() === "") {
        return LoadDemoProgram();
    }
    let bytes;
    try {
        bytes = ParseHexProgram(text);
    } catch (e) {
        WriteLog(`[LOAD] ERROR: ${e.message}`);
        return false;
    }
    return LoadProgramFromBytes(bytes);
}

function LoadDemoProgram() {
    const demoBytes = [0x01, 0x00, 0x02, 0x05, 0x10, 0x06, 0x1B, 0x32, 0x04, 0x07, 0x80, 0x00];
    const demoText = demoBytes.map(b => toHex(b)).join(" ");
    UI.setProgramSourceText(demoText);
    const loaded = LoadProgramFromBytes(demoBytes);
    if (loaded) {
        WriteLog(`[LOAD] Built-in demo program: multiplication 5 x 6 by successive additions`);
    }
    return loaded;
}

// --- Macro entry point ---
// Each ONLYOFFICE button runs its own macro; every run restores the state
// saved by the previous one, performs the action and saves it again.
const ACTIONS = {
    LOAD: LoadProgram,
    LOAD_DEMO: LoadDemoProgram,
    STEP: Step,
    RUN: Run,
    RUN_TO_END: RunToEnd,
    PAUSE: Pause,
    RESET: Reset
};

function SimulatorMain(action) {
    const handler = ACTIONS[action];
    if (!handler) {
        throw new Error(`[Simulator] Unknown action: ${action}`);
    }
    LoadState();
    try {
        handler();
    } catch (e) {
        StopRunLoop();
        WriteLog(`[ERROR] ${action}: ${DescribeError(e)}`);
    }
    SaveState();
}
