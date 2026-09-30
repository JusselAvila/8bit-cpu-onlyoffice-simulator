const ISA = {
    0x00: { op: "HLT",  mnemonic: "HLT",         bytes: 1, mode: ADDRESSING_MODES.IMPLIED,   dest: null, src: null,  flags: [],                description: "Stops the clock. No further micro-operations execute until RESET." },

    0x01: { op: "MOV",  mnemonic: "MOV AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: [],                description: "Loads an 8-bit immediate value into AX." },
    0x02: { op: "MOV",  mnemonic: "MOV BX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "BX", src: "IMM", flags: [],                description: "Loads an 8-bit immediate value into BX." },
    0x03: { op: "MOV",  mnemonic: "MOV AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: [],                description: "Copies BX into AX." },
    0x04: { op: "MOV",  mnemonic: "MOV BX, AX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "BX", src: "AX",  flags: [],                description: "Copies AX into BX." },

    0x05: { op: "LOAD",  mnemonic: "LOAD AX, [dir]",  bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "AX", src: "MEM", flags: [], description: "Loads AX from the memory cell at the given address." },
    0x06: { op: "LOAD",  mnemonic: "LOAD BX, [dir]",  bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "BX", src: "MEM", flags: [], description: "Loads BX from the memory cell at the given address." },
    0x07: { op: "STORE", mnemonic: "STORE [dir], AX", bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "MEM", src: "AX", flags: [], description: "Stores AX into the memory cell at the given address (Data Segment only)." },
    0x08: { op: "STORE", mnemonic: "STORE [dir], BX", bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "MEM", src: "BX", flags: [], description: "Stores BX into the memory cell at the given address (Data Segment only)." },

    0x10: { op: "ADD", mnemonic: "ADD AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF","CF","SF"], description: "AX = AX + imm." },
    0x11: { op: "ADD", mnemonic: "ADD BX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "BX", src: "IMM", flags: ["ZF","CF","SF"], description: "BX = BX + imm." },
    0x12: { op: "ADD", mnemonic: "ADD AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF","CF","SF"], description: "AX = AX + BX." },
    0x13: { op: "ADD", mnemonic: "ADD BX, AX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "BX", src: "AX",  flags: ["ZF","CF","SF"], description: "BX = BX + AX." },

    0x14: { op: "SUB", mnemonic: "SUB AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF","CF","SF"], description: "AX = AX - imm." },
    0x15: { op: "SUB", mnemonic: "SUB BX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "BX", src: "IMM", flags: ["ZF","CF","SF"], description: "BX = BX - imm." },
    0x16: { op: "SUB", mnemonic: "SUB AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF","CF","SF"], description: "AX = AX - BX." },
    0x17: { op: "SUB", mnemonic: "SUB BX, AX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "BX", src: "AX",  flags: ["ZF","CF","SF"], description: "BX = BX - AX." },

    0x18: { op: "INC", mnemonic: "INC AX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "AX", src: null, flags: ["ZF","SF"], description: "AX = AX + 1. CF is not affected." },
    0x19: { op: "INC", mnemonic: "INC BX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "BX", src: null, flags: ["ZF","SF"], description: "BX = BX + 1. CF is not affected." },
    0x1A: { op: "DEC", mnemonic: "DEC AX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "AX", src: null, flags: ["ZF","SF"], description: "AX = AX - 1. CF is not affected." },
    0x1B: { op: "DEC", mnemonic: "DEC BX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "BX", src: null, flags: ["ZF","SF"], description: "BX = BX - 1. CF is not affected." },

    0x1C: { op: "CMP", mnemonic: "CMP AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF","CF","SF"], description: "Computes AX - imm to set flags only; AX is unchanged." },
    0x1D: { op: "CMP", mnemonic: "CMP BX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "BX", src: "IMM", flags: ["ZF","CF","SF"], description: "Computes BX - imm to set flags only; BX is unchanged." },
    0x1E: { op: "CMP", mnemonic: "CMP AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF","CF","SF"], description: "Computes AX - BX to set flags only; registers are unchanged." },
    0x1F: { op: "CMP", mnemonic: "CMP BX, AX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "BX", src: "AX",  flags: ["ZF","CF","SF"], description: "Computes BX - AX to set flags only; registers are unchanged." },

    0x20: { op: "AND", mnemonic: "AND AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF","SF"], description: "AX = AX & imm. CF is cleared." },
    0x21: { op: "AND", mnemonic: "AND AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF","SF"], description: "AX = AX & BX. CF is cleared." },
    0x22: { op: "OR",  mnemonic: "OR AX, imm",  bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF","SF"], description: "AX = AX | imm. CF is cleared." },
    0x23: { op: "OR",  mnemonic: "OR AX, BX",   bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF","SF"], description: "AX = AX | BX. CF is cleared." },
    0x24: { op: "XOR", mnemonic: "XOR AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF","SF"], description: "AX = AX ^ imm. CF is cleared." },
    0x25: { op: "XOR", mnemonic: "XOR AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF","SF"], description: "AX = AX ^ BX. CF is cleared." },
    0x26: { op: "NOT", mnemonic: "NOT AX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "AX", src: null, flags: ["ZF","SF"], description: "AX = ~AX (8-bit). CF is cleared." },
    0x27: { op: "NOT", mnemonic: "NOT BX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "BX", src: null, flags: ["ZF","SF"], description: "BX = ~BX (8-bit). CF is cleared." },

    0x30: { op: "JMP", mnemonic: "JMP dir", bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "PC", src: null, flags: [], description: "Unconditional jump: PC = dir." },
    0x31: { op: "JZ",  mnemonic: "JZ dir",  bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "PC", src: null, flags: [], description: "Jump if ZF == 1: PC = dir." },
    0x32: { op: "JNZ", mnemonic: "JNZ dir", bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "PC", src: null, flags: [], description: "Jump if ZF == 0: PC = dir." }
};
