// tests/run-tests.js - Automated edge-case and validation suite.
// Usage: node tests/run-tests.js
//
// Loads every /src module into an isolated context with a minimal mock of the
// ONLYOFFICE Api (cell values, fills, number formats), runs each test case and
// writes the input / expected / observed table to tests/test-results.md.
// Button tests create a new context per click, like ONLYOFFICE does, and only
// share the sheet between them.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const MODULES = ["utils", "isa", "ram", "bus", "cpu", "alu", "decoder", "logger", "ui", "state", "main"];
const SCRIPT = new vm.Script(
    MODULES.map(m => fs.readFileSync(path.join(ROOT, "src", m + ".js"), "utf8")).join("\n"),
    { filename: "simulator.js" }
);

const DEMO = "01 00 02 05 10 06 1B 32 04 07 80 00";
const VARIANT_7X3 = "01 00 02 03 10 07 1B 32 04 07 80 00";
const PHASE_COLORS = { "255,255,0": "FETCH", "0,176,240": "DECODE", "146,208,80": "EXECUTE", "255,0,0": "STORE" };
const CELL = { programSource: "25,11", delay: "24,3", phase: "18,3", state: "1,60" };

// --- Harness ---
function createSheet() {
    const values = {};
    const fills = {};
    const key = (r, c) => `${r},${c}`;
    const api = {
        CreateColorFromRGB: (r, g, b) => ({ rgb: `${r},${g},${b}` }),
        GetActiveSheet: () => ({
            GetCells: (r, c) => ({
                SetValue: v => { values[key(r, c)] = String(v); },
                GetValue: () => values[key(r, c)] ?? "",
                SetNumberFormat: () => {},
                SetFillColor: color => {
                    // Same failure as the desktop editor when no ApiColor is given
                    if (!color || !color.rgb) throw new TypeError("Cannot read properties of null (reading 'color')");
                    fills[key(r, c)] = color.rgb;
                }
            })
        })
    };
    return { values, fills, api };
}

function createSimulator(sheet) {
    const ctx = vm.createContext({ Api: sheet.api, console: { log() {}, error() {} }, setTimeout, clearTimeout, Date });
    SCRIPT.runInContext(ctx);
    return { sheet, ev: code => vm.runInContext(code, ctx) };
}

function bytes(text) {
    return text.trim().split(/\s+/).map(t => parseInt(t, 16));
}

function runProgram(text) {
    const s = createSimulator(createSheet());
    s.ev(`LoadProgramFromBytes(${JSON.stringify(bytes(text))})`);
    s.ev("RunBatch(2000)");
    return s;
}

function hx(v) {
    return v.toString(16).toUpperCase().padStart(2, "0");
}

// Formats "AX=1E ZF=1 RAM[80h]=1E halted=true" for the requested fields.
function show(s, fields) {
    const r = s.ev("registers");
    const f = s.ev("flags");
    return fields.map(k => {
        if (k in f) return `${k}=${f[k]}`;
        if (k === "halted") return `halted=${s.ev("executionState.halted")}`;
        if (k === "steps") return `steps=${s.ev("stepCounter")}`;
        if (k.startsWith("RAM[")) return `${k}=${hx(s.ev(`ReadRAM(0x${k.slice(4, -2)})`))}`;
        return `${k}=${hx(r[k])}`;
    }).join(" ");
}

function logHas(s, text) {
    return s.ev("logBuffer").some(e => e.message.includes(text));
}

function throws(s, code) {
    try { s.ev(code); return "no error"; } catch (e) { return "throws"; }
}

function click(sheet, action) {
    const s = createSimulator(sheet);
    s.ev(`SimulatorMain(${JSON.stringify(action)})`);
    return s;
}

function savedState(sheet) {
    return JSON.parse(sheet.values[CELL.state]);
}

function describeSaved(st) {
    const r = st.registers;
    return `AX=${hx(r.AX)} BX=${hx(r.BX)} ZF=${st.flags.ZF} RAM[80h]=${st.memory.substr(0x80 * 2, 2)} halted=${st.execution.halted}`;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check, timeoutMs) {
    const start = Date.now();
    while (!check()) {
        if (Date.now() - start > timeoutMs) return false;
        await sleep(10);
    }
    return true;
}

// --- Test cases ---
const TESTS = [
    // ALU and flags
    { id: "A-01", area: "ALU", name: "0xFF + 1 (unsigned carry, zero)", input: "01 FF 10 01 00",
      expected: "AX=00 ZF=1 CF=1 SF=0", run: () => show(runProgram("01 FF 10 01 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-02", area: "ALU", name: "0x00 - 1 (borrow, negative)", input: "01 00 14 01 00",
      expected: "AX=FF ZF=0 CF=1 SF=1", run: () => show(runProgram("01 00 14 01 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-03", area: "ALU", name: "0x7F + 1 (sign change, no carry)", input: "01 7F 10 01 00",
      expected: "AX=80 ZF=0 CF=0 SF=1", run: () => show(runProgram("01 7F 10 01 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-04", area: "ALU", name: "INC 0xFF wraps to 0", input: "01 FF 18 00",
      expected: "AX=00 ZF=1 CF=0 SF=0", run: () => show(runProgram("01 FF 18 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-05", area: "ALU", name: "INC does not modify CF (CF=1 from SUB kept)", input: "01 00 14 01 18 00",
      expected: "AX=00 ZF=1 CF=1 SF=0", run: () => show(runProgram("01 00 14 01 18 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-06", area: "ALU", name: "DEC 0x00 wraps to 0xFF", input: "01 00 1A 00",
      expected: "AX=FF ZF=0 CF=0 SF=1", run: () => show(runProgram("01 00 1A 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-07", area: "ALU", name: "CMP equal (5 vs 5), AX unchanged", input: "01 05 1C 05 00",
      expected: "AX=05 ZF=1 CF=0 SF=0", run: () => show(runProgram("01 05 1C 05 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-08", area: "ALU", name: "CMP greater (9 vs 5)", input: "01 09 1C 05 00",
      expected: "AX=09 ZF=0 CF=0 SF=0", run: () => show(runProgram("01 09 1C 05 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-09", area: "ALU", name: "CMP lesser (3 vs 5)", input: "01 03 1C 05 00",
      expected: "AX=03 ZF=0 CF=1 SF=1", run: () => show(runProgram("01 03 1C 05 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-10", area: "ALU", name: "AND clears CF (CF=1 from SUB before)", input: "01 00 14 01 20 0F 00",
      expected: "AX=0F ZF=0 CF=0 SF=0", run: () => show(runProgram("01 00 14 01 20 0F 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-11", area: "ALU", name: "NOT 0x00", input: "01 00 26 00",
      expected: "AX=FF ZF=0 CF=0 SF=1", run: () => show(runProgram("01 00 26 00"), ["AX", "ZF", "CF", "SF"]) },
    { id: "A-12", area: "ALU", name: "ADD AX, BX (register mode)", input: "01 14 02 0A 12 00",
      expected: "AX=1E BX=0A ZF=0 CF=0 SF=0", run: () => show(runProgram("01 14 02 0A 12 00"), ["AX", "BX", "ZF", "CF", "SF"]) },

    // Memory
    { id: "M-01", area: "Memory", name: "LOAD AX, [00h] (lowest address)", input: "05 00 00",
      expected: "AX=05", run: () => show(runProgram("05 00 00"), ["AX"]) },
    { id: "M-02", area: "Memory", name: "STORE and LOAD at FFh (highest address)", input: "01 AB 07 FF 01 00 05 FF 00",
      expected: "AX=AB RAM[FFh]=AB", run: () => show(runProgram("01 AB 07 FF 01 00 05 FF 00"), ["AX", "RAM[FFh]"]) },
    { id: "M-03", area: "Memory", name: "STORE at 80h (first Data address)", input: "01 11 07 80 00",
      expected: "RAM[80h]=11", run: () => show(runProgram("01 11 07 80 00"), ["RAM[80h]"]) },
    { id: "M-04", area: "Memory", name: "STORE into Code Segment is rejected", input: "01 22 07 00 00",
      expected: "RAM[00h]=01 rejected=true",
      run: () => { const s = runProgram("01 22 07 00 00"); return `${show(s, ["RAM[00h]"])} rejected=${logHas(s, "REJECTED")}`; } },
    { id: "M-05", area: "Memory", name: "STORE into Reserved Segment is rejected", input: "01 22 07 20 00",
      expected: "RAM[20h]=00 rejected=true",
      run: () => { const s = runProgram("01 22 07 20 00"); return `${show(s, ["RAM[20h]"])} rejected=${logHas(s, "REJECTED")}`; } },
    { id: "M-06", area: "Memory", name: "Invalid addresses", input: "ReadRAM(0x100), ReadRAM(-1)",
      expected: "throws / throws",
      run: () => { const s = createSimulator(createSheet()); return `${throws(s, "ReadRAM(0x100)")} / ${throws(s, "ReadRAM(-1)")}`; } },
    { id: "M-07", area: "Memory", name: "Invalid values", input: "WriteRAM(0x80, 256), WriteRAM(0x80, 1.5)",
      expected: "throws / throws",
      run: () => { const s = createSimulator(createSheet()); return `${throws(s, "WriteRAM(0x80, 256)")} / ${throws(s, "WriteRAM(0x80, 1.5)")}`; } },
    { id: "M-08", area: "Memory", name: "Program larger than the Code Segment", input: "33 bytes",
      expected: "loaded=false",
      run: () => { const s = createSimulator(createSheet()); return `loaded=${s.ev("LoadProgramFromBytes(new Array(33).fill(0))")}`; } },
    { id: "M-09", area: "Memory", name: "Invalid hex token in K25", input: "K25 = \"01 ZZ\"",
      expected: "loaded=false error=true",
      run: () => {
          const sheet = createSheet();
          sheet.values[CELL.programSource] = "01 ZZ";
          const s = createSimulator(sheet);
          return `loaded=${s.ev("LoadProgram()")} error=${logHas(s, "invalid byte token")}`;
      } },

    // Control flow
    { id: "C-01", area: "Control", name: "JZ taken (ZF=1) skips MOV", input: "01 00 1C 00 31 08 01 11 00",
      expected: "AX=00 PC=09 halted=true", run: () => show(runProgram("01 00 1C 00 31 08 01 11 00"), ["AX", "PC", "halted"]) },
    { id: "C-02", area: "Control", name: "JZ not taken (ZF=0)", input: "01 01 1C 00 31 08 01 11 00",
      expected: "AX=11 PC=09 halted=true", run: () => show(runProgram("01 01 1C 00 31 08 01 11 00"), ["AX", "PC", "halted"]) },
    { id: "C-03", area: "Control", name: "JNZ taken (ZF=0) skips MOV", input: "01 01 1C 00 32 08 01 11 00",
      expected: "AX=01 PC=09 halted=true", run: () => show(runProgram("01 01 1C 00 32 08 01 11 00"), ["AX", "PC", "halted"]) },
    { id: "C-04", area: "Control", name: "JNZ not taken (ZF=1)", input: "01 00 1C 00 32 08 01 11 00",
      expected: "AX=11 PC=09 halted=true", run: () => show(runProgram("01 00 1C 00 32 08 01 11 00"), ["AX", "PC", "halted"]) },
    { id: "C-05", area: "Control", name: "JMP forward", input: "30 04 01 11 00",
      expected: "AX=00 PC=05 halted=true", run: () => show(runProgram("30 04 01 11 00"), ["AX", "PC", "halted"]) },
    { id: "C-06", area: "Control", name: "JMP backward", input: "30 05 01 22 00 02 33 30 02",
      expected: "AX=22 BX=33 PC=05 halted=true", run: () => show(runProgram("30 05 01 22 00 02 33 30 02"), ["AX", "BX", "PC", "halted"]) },
    { id: "C-07", area: "Control", name: "HLT stops the clock (3 extra STEPs)", input: "00, then Step() x3",
      expected: "steps=6 -> 6 PC=01 halted=true",
      run: () => {
          const s = runProgram("00");
          const before = s.ev("stepCounter");
          s.ev("Step(); Step(); Step();");
          return `steps=${before} -> ${s.ev("stepCounter")} ${show(s, ["PC", "halted"])}`;
      } },
    { id: "C-08", area: "Control", name: "Illegal opcode halts", input: "01 05 FF",
      expected: "AX=05 halted=true illegal=true",
      run: () => { const s = runProgram("01 05 FF"); return `${show(s, ["AX", "halted"])} illegal=${logHas(s, "ILLEGAL OPCODE 0xFF")}`; } },
    { id: "C-09", area: "Control", name: "RUN stops by itself on illegal opcode", input: "01 05 FF, RUN (delay 0)",
      expected: "running=false halted=true",
      run: async () => {
          const sheet = createSheet();
          sheet.values[CELL.programSource] = "01 05 FF";
          sheet.values[CELL.delay] = "0";
          click(sheet, "LOAD");
          click(sheet, "RUN");
          await waitFor(() => !savedState(sheet).isRunning, 3000);
          const st = savedState(sheet);
          return `running=${st.isRunning} halted=${st.execution.halted}`;
      } },

    // RESET and LOAD
    { id: "R-01", area: "Reset/Load", name: "RESET mid-program, then run again", input: "demo, 50 STEPs, RESET, run",
      expected: "AX=00 BX=00 PC=00 ZF=0 CF=0 SF=0 steps=0 log=0 highlights=0 RAM[00h]=01 -> rerun AX=1E",
      run: () => {
          const s = createSimulator(createSheet());
          s.ev("LoadDemoProgram(); for (let i = 0; i < 50; i++) Step(); Reset();");
          const after = `${show(s, ["AX", "BX", "PC", "ZF", "CF", "SF", "steps"])} log=${s.ev("logBuffer.length")} highlights=${s.ev("UI.highlightedCells.length")} ${show(s, ["RAM[00h]"])}`;
          s.ev("RunBatch(2000)");
          return `${after} -> rerun ${show(s, ["AX"])}`;
      } },
    { id: "R-02", area: "Reset/Load", name: "Repeated LOAD PROGRAM gives the same result", input: "demo, run, LOAD, run",
      expected: "AX=1E RAM[80h]=1E steps=173 | AX=1E RAM[80h]=1E steps=173",
      run: () => {
          const s = createSimulator(createSheet());
          s.ev("LoadDemoProgram(); RunBatch(2000);");
          const first = show(s, ["AX", "RAM[80h]", "steps"]);
          s.ev("LoadDemoProgram(); RunBatch(2000);");
          return `${first} | ${show(s, ["AX", "RAM[80h]", "steps"])}`;
      } },
    { id: "R-03", area: "Reset/Load", name: "Shorter program clears the rest of the Code Segment", input: "demo, then LOAD 01 07 00",
      expected: "RAM[03h..0Bh] all 00=true",
      run: () => {
          const s = createSimulator(createSheet());
          s.ev(`LoadDemoProgram(); LoadProgramFromBytes(${JSON.stringify(bytes("01 07 00"))});`);
          const cleared = s.ev("Array.from({ length: 9 }, (_, i) => ReadRAM(0x03 + i)).every(v => v === 0)");
          return `RAM[03h..0Bh] all 00=${cleared}`;
      } },
    { id: "R-04", area: "Reset/Load", name: "RESET button stops RUN (separate macro runs)", input: "LOAD, RUN (5 ms), RESET",
      expected: "steps=0 running=false (still 0 after 100 ms)",
      run: async () => {
          const sheet = createSheet();
          sheet.values[CELL.delay] = "5";
          click(sheet, "LOAD");
          click(sheet, "RUN");
          await sleep(60);
          click(sheet, "RESET");
          await sleep(100);
          const st = savedState(sheet);
          return `steps=${st.stepCounter} running=${st.isRunning} (still ${st.stepCounter} after 100 ms)`;
      } },
    { id: "R-05", area: "Reset/Load", name: "PAUSE keeps state, RUN resumes to the end", input: "LOAD, RUN (2 ms), PAUSE, RUN",
      expected: "paused and steady=true | AX=1E BX=00 ZF=1 RAM[80h]=1E halted=true",
      run: async () => {
          const sheet = createSheet();
          sheet.values[CELL.delay] = "2";
          click(sheet, "LOAD");
          click(sheet, "RUN");
          await sleep(60);
          click(sheet, "PAUSE");
          const pausedAt = savedState(sheet).stepCounter;
          await sleep(60);
          const steady = savedState(sheet).stepCounter === pausedAt && pausedAt > 0 && pausedAt < 173;
          click(sheet, "RUN");
          await waitFor(() => savedState(sheet).execution.halted, 5000);
          return `paused and steady=${steady} | ${describeSaved(savedState(sheet))}`;
      } },

    // Demonstration program
    { id: "D-01", area: "Demo", name: "LOAD PROGRAM with empty K25 loads the demo (no manual RAM editing)", input: "K25 empty, LOAD, RUN_TO_END",
      expected: `K25=${DEMO} | AX=1E BX=00 ZF=1 RAM[80h]=1E halted=true`,
      run: () => {
          const sheet = createSheet();
          click(sheet, "LOAD");
          click(sheet, "RUN_TO_END");
          return `K25=${sheet.values[CELL.programSource]} | ${describeSaved(savedState(sheet))}`;
      } },
    { id: "D-02", area: "Demo", name: "Loop count, JNZ fall-through and cycle counts", input: DEMO,
      expected: "instructions=19 steps=173 ADD=5 JNZ taken=4 not-taken=1 ZF on fall-through=1",
      run: () => {
          const s = createSimulator(createSheet());
          s.ev("LoadDemoProgram()");
          let instructions = 0, adds = 0, taken = 0, notTaken = 0, fallZF = null;
          while (!s.ev("executionState.halted")) {
              if (s.ev("executionState.phase === 'FETCH' && executionState.microStep === 0")) instructions++;
              s.ev("Step()");
              const done = s.ev("executionState.phase === 'FETCH' && executionState.microStep === 0");
              if (done && s.ev("registers.IR") === 0x10) adds++;
              if (done && s.ev("registers.IR") === 0x32) {
                  if (s.ev("registers.PC") === 0x04) taken++;
                  else { notTaken++; fallZF = s.ev("flags.ZF"); }
              }
          }
          return `instructions=${instructions} steps=${s.ev("stepCounter")} ADD=${adds} JNZ taken=${taken} not-taken=${notTaken} ZF on fall-through=${fallZF}`;
      } },
    { id: "D-03", area: "Demo", name: "Step mode and run mode give the same final state", input: "173 STEP clicks vs RUN (delay 0)",
      expected: "identical=true AX=1E BX=00 ZF=1 RAM[80h]=1E halted=true",
      run: async () => {
          const stepSheet = createSheet();
          click(stepSheet, "LOAD");
          for (let i = 0; i < 173; i++) click(stepSheet, "STEP");
          const runSheet = createSheet();
          runSheet.values[CELL.delay] = "0";
          click(runSheet, "LOAD");
          click(runSheet, "RUN");
          await waitFor(() => savedState(runSheet).execution.halted, 5000);
          const a = describeSaved(savedState(stepSheet));
          const b = describeSaved(savedState(runSheet));
          return `identical=${a === b} ${a}`;
      } },
    { id: "D-04", area: "Demo", name: "Variant 7 x 3 typed into K25 (data changed live)", input: VARIANT_7X3,
      expected: "AX=15 BX=00 ZF=1 RAM[80h]=15 halted=true",
      run: () => {
          const sheet = createSheet();
          sheet.values[CELL.programSource] = VARIANT_7X3;
          click(sheet, "LOAD");
          click(sheet, "RUN_TO_END");
          return describeSaved(savedState(sheet));
      } },

    // Live-modification scenarios (docs/defense.md, section 3)
    { id: "L-01", area: "Live edit", name: "Opcode ADD -> SUB at 04h", input: "01 00 02 05 14 06 1B 32 04 07 80 00",
      expected: "AX=E2 RAM[80h]=E2 ZF=1 CF=0 SF=0",
      run: () => show(runProgram("01 00 02 05 14 06 1B 32 04 07 80 00"), ["AX", "RAM[80h]", "ZF", "CF", "SF"]) },
    { id: "L-02", area: "Live edit", name: "Loop count 5 -> 4", input: "01 00 02 04 10 06 1B 32 04 07 80 00",
      expected: "AX=18 RAM[80h]=18", run: () => show(runProgram("01 00 02 04 10 06 1B 32 04 07 80 00"), ["AX", "RAM[80h]"]) },
    { id: "L-03", area: "Live edit", name: "Immediate 6 -> 7", input: "01 00 02 05 10 07 1B 32 04 07 80 00",
      expected: "AX=23 RAM[80h]=23", run: () => show(runProgram("01 00 02 05 10 07 1B 32 04 07 80 00"), ["AX", "RAM[80h]"]) },
    { id: "L-04", area: "Live edit", name: "Operands 7 x 3", input: VARIANT_7X3,
      expected: "AX=15 RAM[80h]=15", run: () => show(runProgram(VARIANT_7X3), ["AX", "RAM[80h]"]) },
    { id: "L-05", area: "Live edit", name: "Store address 80h -> 90h", input: "01 00 02 05 10 06 1B 32 04 07 90 00",
      expected: "RAM[90h]=1E RAM[80h]=00", run: () => show(runProgram("01 00 02 05 10 06 1B 32 04 07 90 00"), ["RAM[90h]", "RAM[80h]"]) },
    { id: "L-06", area: "Live edit", name: "Store address into the Code Segment (10h)", input: "01 00 02 05 10 06 1B 32 04 07 10 00",
      expected: "AX=1E RAM[10h]=00 rejected=true",
      run: () => { const s = runProgram("01 00 02 05 10 06 1B 32 04 07 10 00"); return `${show(s, ["AX", "RAM[10h]"])} rejected=${logHas(s, "REJECTED - address 0x10 is in the CODE segment")}`; } },
    { id: "L-07", area: "Live edit", name: "Extra SUB AX, 0x01 after the loop", input: "01 00 02 05 10 06 1B 32 04 14 01 07 80 00",
      expected: "AX=1D RAM[80h]=1D", run: () => show(runProgram("01 00 02 05 10 06 1B 32 04 14 01 07 80 00"), ["AX", "RAM[80h]"]) },
    { id: "L-08", area: "Live edit", name: "Count up with INC + CMP", input: "01 00 02 00 10 06 19 1D 05 32 04 07 80 00",
      expected: "AX=1E BX=05 ZF=1 RAM[80h]=1E", run: () => show(runProgram("01 00 02 00 10 06 19 1D 05 32 04 07 80 00"), ["AX", "BX", "ZF", "RAM[80h]"]) },

    // Step debugger highlighting
    { id: "H-01", area: "Highlight", name: "One phase color per STEP, matching the phase indicator; RESET clears all", input: "demo, 173 STEP clicks, RESET",
      expected: "mixed=0 mismatched=0 leftAfterReset=0",
      run: () => {
          const sheet = createSheet();
          click(sheet, "LOAD");
          let mixed = 0, mismatched = 0;
          for (let i = 0; i < 173; i++) {
              click(sheet, "STEP");
              const cells = savedState(sheet).highlightedCells;
              const colors = new Set(cells.map(c => sheet.fills[`${c.row},${c.col}`]));
              if (colors.size > 1) mixed++;
              if (colors.size === 1 && PHASE_COLORS[[...colors][0]] !== sheet.values[CELL.phase]) mismatched++;
          }
          click(sheet, "RESET");
          const left = Object.values(sheet.fills).filter(rgb => PHASE_COLORS[rgb]).length;
          return `mixed=${mixed} mismatched=${mismatched} leftAfterReset=${left}`;
      } }
];

// --- Runner ---
async function main() {
    const rows = [];
    let passed = 0;
    for (const t of TESTS) {
        let observed;
        try {
            observed = await t.run();
        } catch (e) {
            observed = `ERROR: ${e.message}`;
        }
        const ok = observed === t.expected;
        if (ok) passed++;
        rows.push({ ...t, observed, ok });
        console.log(`${ok ? "PASS" : "FAIL"}  ${t.id}  ${t.name}${ok ? "" : `\n      expected: ${t.expected}\n      observed: ${observed}`}`);
    }

    const cell = text => String(text).replace(/\|/g, "\\|");
    const md = [
        "# Test Results",
        "",
        `Generated by \`node tests/run-tests.js\` on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. See [test-plan.md](test-plan.md) for the method.`,
        "",
        `**${passed} / ${TESTS.length} passed.**`,
        "",
        "| ID | Area | Test | Input | Expected | Observed | Result |",
        "|----|------|------|-------|----------|----------|--------|",
        ...rows.map(r => `| ${r.id} | ${r.area} | ${cell(r.name)} | \`${cell(r.input)}\` | ${cell(r.expected)} | ${cell(r.observed)} | ${r.ok ? "PASS" : "FAIL"} |`),
        ""
    ].join("\n");
    fs.writeFileSync(path.join(__dirname, "test-results.md"), md);

    console.log(`\n${passed} / ${TESTS.length} passed -> tests/test-results.md`);
    process.exitCode = passed === TESTS.length ? 0 : 1;
}

main();
