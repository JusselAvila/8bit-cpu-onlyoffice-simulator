# Live Defense Guide

15-minute oral evaluation: 10 minutes of presentation and live demo, 5 minutes of questions.

## 1. Before starting

- `simulator.xlsx` open in ONLYOFFICE with the button macros from `dist/macros/` (rebuilt with `node tools/build-macros.js` and synced with `python3 tools/sync-workbook-macros.py`).
- Press RESET, clear `K25`, set `C24` = `500`.
- Browser tabs: repository README, project board, issues list, `tests/test-results.md`.
- `program/*.hex` open in a text editor to copy the variants quickly.

## 2. Demo script (10 minutes)

| Time | Topic | What to show and say |
|------|-------|----------------------|
| 0:00–2:00 | Architecture | README Mermaid diagram: one memory for code and data (von Neumann), CPU = Control Unit + registers + ALU, `MAR` on the address bus, `MDR` on the data bus. Memory map: Code `00h–1Fh`, Reserved `20h–7Fh`, Data `80h–FFh`. ISA table: opcode, bytes, flags. |
| 2:00–4:00 | GitHub evidence | Project board columns and closed issues; commit history with `feat:` / `fix:` / `docs:` prefixes referencing issues; modular `/src` (bus, ram, cpu, alu, decoder, ui, logger, state, main); test plan and 100 % passing results. |
| 4:00–5:30 | Load + Fetch | Press LOAD PROGRAM with `K25` empty: demo bytes appear in RAM `00h–0Bh`. Press STEP 4 times: yellow `PC → MAR → MDR → IR`, phase indicator shows `FETCH`, log rows appear with step number and registers. |
| 5:30–7:00 | Decode / Execute / Store | Continue STEP: blue while reading the operand, green on the ALU/registers, red on the destination. Point out that the previous color is always cleared. Step through `DEC BX` and `JNZ` once to show `ZF` and the new `PC`. |
| 7:00–8:30 | RUN / PAUSE / speed | RUN at `500` ms, change `C24` to `50` while it runs, PAUSE, show state kept, RUN again until `HLT`. Final state: `AX = 1Eh`, `BX = 00h`, `ZF = 1`, `RAM[80h] = 1Eh`; 19 instructions, 173 micro-operations. |
| 8:30–10:00 | Live modification | One scenario from section 3 (loop count or store address), RESET, LOAD, RUN, explain the new result. |

## 3. Live-modification scenarios

Type the bytes into `K25`, press LOAD PROGRAM, then RUN (or `RUN_TO_END`). Each scenario is also an automated case (`L-01` … `L-08` in [tests/test-results.md](../tests/test-results.md)).

| # | Change | Machine code | Expected result |
|---|--------|--------------|-----------------|
| 1 | Change the opcode at `04h`: `ADD` (`10`) → `SUB` (`14`) | `01 00 02 05 14 06 1B 32 04 07 80 00` | `AX = RAM[80h] = E2h` (0 − 30 mod 256), `ZF = 1`, `CF = 0`, `SF = 0` (`SF`/`ZF` come from the last `DEC BX`; `CF` from the last `SUB`, `E8h − 06h` has no borrow) |
| 2 | Loop count `05` → `04` (byte `03h`) | `01 00 02 04 10 06 1B 32 04 07 80 00` | `AX = RAM[80h] = 18h` (24), 16 instructions |
| 3 | Immediate `06` → `07` (byte `05h`) | `01 00 02 05 10 07 1B 32 04 07 80 00` | `AX = RAM[80h] = 23h` (35) |
| 4 | Operands 7 × 3 (`program/multiplication-7x3.hex`) | `01 00 02 03 10 07 1B 32 04 07 80 00` | `AX = RAM[80h] = 15h` (21), 13 instructions |
| 5 | Store address `80` → `90` (byte `0Ah`) | `01 00 02 05 10 06 1B 32 04 07 90 00` | `RAM[90h] = 1Eh`, `RAM[80h]` unchanged |
| 6 | Store address into the Code Segment (`80` → `10`) | `01 00 02 05 10 06 1B 32 04 07 10 00` | Log: `STORE: REJECTED - address 0x10 is in the CODE segment`; `RAM[10h]` unchanged, `AX = 1Eh` |
| 7 | Add `SUB AX, 0x01` after the loop | `01 00 02 05 10 06 1B 32 04 14 01 07 80 00` | `AX = RAM[80h] = 1Dh` (29); the loop target `04h` does not move because the new instruction is after the loop |
| 8 | Count up with `INC` + `CMP` instead of `DEC` | `01 00 02 00 10 06 19 1D 05 32 04 07 80 00` | `AX = RAM[80h] = 1Eh`, `BX = 05h`, `ZF = 1` (`CMP BX, 0x05` sets `ZF` when the counter reaches 5) |

Assembly of scenario 8:

```asm
00: MOV AX, 0x00      ; 01 00
02: MOV BX, 0x00      ; 02 00
04: ADD AX, 0x06      ; 10 06   loop
06: INC BX            ; 19
07: CMP BX, 0x05      ; 1D 05   ZF = 1 when BX == 5
09: JNZ 0x04          ; 32 04
0B: STORE [0x80], AX  ; 07 80
0D: HLT               ; 00
```

Rules to remember when editing live: 2-byte instructions shift every later address by 2; jump targets are absolute addresses; the program must fit in 32 bytes (`00h–1Fh`); `STORE` only writes to `80h–FFh`.

## 4. Theory questions

**Von Neumann vs Harvard.** Von Neumann uses one memory and one set of buses for both instructions and data, so an instruction fetch and a data access cannot happen at the same time (the von Neumann bottleneck). Harvard uses separate instruction and data memories with their own buses, allowing both accesses in parallel. This simulator is von Neumann: the program (`00h–1Fh`) and the result (`80h`) live in the same RAM and every access goes through the same `MAR`/`MDR` pair.

**Purpose of MAR and MDR.** They are the CPU's interface to memory. `MAR` holds the address placed on the address bus; `MDR` holds the byte that travels on the data bus, read from `RAM[MAR]` or about to be written there. Every memory access in the simulator is two micro-operations: `MAR <- address`, then `MDR <- RAM[MAR]` (read) or `RAM[MAR] <- MDR` (write).

**CF vs SF.** `CF` (carry) is about unsigned arithmetic: 1 when an addition exceeds 255 (`FFh + 1`) or a subtraction needs a borrow (`00h − 1`, `CMP 3, 5`). `SF` (sign) is a copy of bit 7 of the result, i.e. the result is negative in two's complement (`7Fh + 1 = 80h` gives `SF = 1` with `CF = 0`). `INC`/`DEC` do not change `CF`; logic operations clear it.

**How the PC changes on a jump.** During Fetch and Decode the PC is incremented once per byte read, so after reading `JNZ 0x04` at `07h` it already points to `09h`. In Execute the condition is evaluated from `ZF`; if the jump is taken, Store writes the target into the PC (`PC <- 04h`), otherwise the PC keeps `09h` and execution continues sequentially. `JMP` always writes the target.

**Why FETCH is needed before DECODE.** The instruction lives in memory, not in the CPU. The Control Unit can only decode what is in `IR`, and `IR` is filled by Fetch (`MAR <- PC`, `MDR <- RAM[MAR]`, `IR <- MDR`). Fetch also advances the PC, which is how Decode knows where the operand byte is and where the next instruction starts.

**Other likely questions.**

- *Why is `ZF` = 1 at the end?* The last `DEC BX` produced `00h`; `JNZ` falls through because of it, and `STORE`/`HLT` do not change flags.
- *What happens with an illegal opcode?* Decode finds no ISA entry, logs `ILLEGAL OPCODE`, halts the CPU and stops RUN.
- *Why 173 micro-operations?* Fetch is 4 per instruction; 2-byte instructions add 4 in Decode; Store is 1 for registers and 3 for a memory write; `HLT` ends in Execute (see README, section 5).
- *How does the simulator keep state between button clicks?* ONLYOFFICE runs each macro separately, so the state is saved as JSON in `BH1` after every action and restored at the start of the next one.
