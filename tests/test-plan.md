# Test Plan

Validation of the simulator against the failure cases evaluated by the rubric: flags, memory boundaries, branches, halting, RESET/LOAD and the demonstration program.

## 1. Automated suite

```bash
node tests/run-tests.js
```

`tests/run-tests.js` loads every `/src` module into an isolated JavaScript context with a minimal mock of the ONLYOFFICE Api (cell values, number formats and fills; `SetFillColor` fails without an `ApiColor`, as in the desktop editor). Each case loads a program, executes it and compares the observed state with the expected one. Button tests (`RUN`, `PAUSE`, `RESET`, `STEP` clicks) create a new context per click and only share the sheet, reproducing how ONLYOFFICE runs each button macro.

The script writes the input, expected and observed result of every case to **[test-results.md](test-results.md)** and exits with code 1 if any case fails.

| Area | IDs | What is covered |
|------|-----|-----------------|
| ALU / flags | A-01 … A-12 | `0xFF+1`, `0x00−1`, `0x7F+1`, `INC 0xFF`, `INC` keeps `CF`, `DEC 0x00`, `CMP` equal / greater / lesser, logic ops clear `CF`, `NOT`, register-mode `ADD` |
| Memory | M-01 … M-09 | Read at `00h`, write/read at `FFh`, write at `80h`, `STORE` rejected in Code and Reserved segments, invalid addresses and values, oversized program, invalid hex token |
| Control flow | C-01 … C-09 | `JZ`/`JNZ` taken and not taken, `JMP` forward and backward, `HLT` stops the clock, illegal opcode halts, RUN stops on illegal opcode |
| RESET / LOAD | R-01 … R-05 | RESET mid-program, repeated LOAD PROGRAM, shorter program clears the Code Segment, RESET stops RUN, PAUSE and resume |
| Demo program | D-01 … D-04 | LOAD PROGRAM without manual editing, 19 instructions / 173 micro-operations, loop runs 5 times and `JNZ` falls through with `ZF=1`, step mode = run mode, 7 × 3 variant |
| Live modification | L-01 … L-08 | Every scenario rehearsed for the defense ([docs/defense.md](../docs/defense.md)): opcode change, loop count, immediate, 7 × 3, store address (Data and Code), extra `SUB`, `INC` + `CMP` loop |
| Step debugger | H-01 | One phase color per STEP matching the phase indicator, RESET clears every highlight |

## 2. Manual checklist in ONLYOFFICE

These checks depend on the real editor (rendering, timers, shapes) and are verified by hand in `simulator.xlsx`.

| ID | Input | Expected | Observed |
|----|-------|----------|----------|
| O-01 | Press LOAD PROGRAM with `K25` empty | Demo bytes appear in `K25` and `K8:V8`; log shows `[LOAD] ... [build ...]` | |
| O-02 | Press STEP 4 times | Yellow on `PC`, `MAR`, `MDR`, `IR` and RAM `00h`; `C18` = `FETCH`, `C19` = 4 | |
| O-03 | Continue STEP through one instruction | Blue (Decode), green (Execute), red (Store); never two colors at once | |
| O-04 | RUN with `C24` = 50 (fast) | Reaches `HLT` without freezing; `AX = 1E`, `RAM[80h] = 1E` | |
| O-05 | RUN with `C24` = 500 (medium) | Same final state, visibly slower | |
| O-06 | RUN with `C24` = 1500 (slow) | Same final state; PAUSE stops it and RUN resumes | |
| O-07 | Change `C24` while RUN is active | Speed changes on the next micro-operation | |
| O-08 | Press RESET during RUN | Execution stops; registers, flags, step counter, highlights and log cleared; RAM kept | |
| O-09 | Type `01 00 02 03 10 07 1B 32 04 07 80 00` in `K25`, LOAD, RUN | `AX = 15`, `RAM[80h] = 15` | |

## 3. Failure handling

A failing case is fixed in `/src`, committed as `fix:` referencing the issue, and the suite is run again until [test-results.md](test-results.md) shows every case as PASS.
