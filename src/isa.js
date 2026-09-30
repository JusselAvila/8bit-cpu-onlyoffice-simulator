// src/isa.js - Single source of truth for the 8-bit ISA
// Used by: decoder.js, main.js (loader), ram.js (toMnemonic disassembly), README

const ADDRESSING_MODES = {
    IMPLIED: "IMPLIED",                 // no operand (HLT, INC, DEC, NOT, register-to-register handled below)
    IMMEDIATE: "IMMEDIATE",             // reg, imm8
    REGISTER: "REGISTER",               // reg, reg
    DIRECT: "DIRECT"                    // [dir] memory address
};

// Table indexed by opcode (number). Each entry documents exactly what the
// specification's "Opcode Encoding Table" objective asks for:
// Opcode, Mnemonic, Addressing Mode, Bytes, Flags affected, Description.
const ISA = {
    0x00: { mnemonic: "HLT",         bytes: 1, mode: ADDRESSING_MODES.IMPLIED,   dest: null, src: null,        flags: [],                description: "Stops the clock. No further micro-operations execute until RESET." },

    0x01: { mnemonic: "MOV AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM",        flags: [],                description: "Loads an 8-bit immediate value into AX." },
    0x02: { mnemonic: "MOV BX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "BX", src: "IMM",        flags: [],                description: "Loads an 8-bit immediate value into BX." },
    0x03: { mnemonic: "MOV AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",         flags: [],                description: "Copies BX into AX." },
    0x04: { mnemonic: "MOV BX, AX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "BX", src: "AX",         flags: [],                description: "Copies AX into BX." },

    0x05: { mnemonic: "LOAD AX, [dir]",  bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "AX", src: "MEM",       flags: [],                description: "Loads AX from the memory cell at the given address." },
    0x06: { mnemonic: "LOAD BX, [dir]",  bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "BX", src: "MEM",       flags: [],                description: "Loads BX from the memory cell at the given address." },
    0x07: { mnemonic: "STORE [dir], AX", bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "MEM", src: "AX",       flags: [],                description: "Stores AX into the memory cell at the given address (Data Segment only)." },
    0x08: { mnemonic: "STORE [dir], BX", bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "MEM", src: "BX",       flags: [],                description: "Stores BX into the memory cell at the given address (Data Segment only)." },

    0x10: { mnemonic: "ADD AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM",        flags: ["ZF", "CF", "SF"], description: "AX = AX + imm." },
    0x11: { mnemonic: "ADD BX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "BX", src: "IMM",        flags: ["ZF", "CF", "SF"], description: "BX = BX + imm." },
    0x12: { mnemonic: "ADD AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",         flags: ["ZF", "CF", "SF"], description: "AX = AX + BX." },
    0x13: { mnemonic: "ADD BX, AX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "BX", src: "AX",         flags: ["ZF", "CF", "SF"], description: "BX = BX + AX." },

    0x14: { mnemonic: "SUB AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM",        flags: ["ZF", "CF", "SF"], description: "AX = AX - imm." },
    0x15: { mnemonic: "SUB BX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "BX", src: "IMM",        flags: ["ZF", "CF", "SF"], description: "BX = BX - imm." },
    0x16: { mnemonic: "SUB AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",         flags: ["ZF", "CF", "SF"], description: "AX = AX - BX." },
    0x17: { mnemonic: "SUB BX, AX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "BX", src: "AX",         flags: ["ZF", "CF", "SF"], description: "BX = BX - AX." },

    0x18: { mnemonic: "INC AX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "AX", src: null, flags: ["ZF", "SF"], description: "AX = AX + 1. CF is not affected." },
    0x19: { mnemonic: "INC BX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "BX", src: null, flags: ["ZF", "SF"], description: "BX = BX + 1. CF is not affected." },
    0x1A: { mnemonic: "DEC AX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "AX", src: null, flags: ["ZF", "SF"], description: "AX = AX - 1. CF is not affected." },
    0x1B: { mnemonic: "DEC BX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "BX", src: null, flags: ["ZF", "SF"], description: "BX = BX - 1. CF is not affected." },

    0x1C: { mnemonic: "CMP AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF", "CF", "SF"], description: "Computes AX - imm to set flags only; AX is unchanged." },
    0x1D: { mnemonic: "CMP BX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "BX", src: "IMM", flags: ["ZF", "CF", "SF"], description: "Computes BX - imm to set flags only; BX is unchanged." },
    0x1E: { mnemonic: "CMP AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF", "CF", "SF"], description: "Computes AX - BX to set flags only; registers are unchanged." },
    0x1F: { mnemonic: "CMP BX, AX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "BX", src: "AX",  flags: ["ZF", "CF", "SF"], description: "Computes BX - AX to set flags only; registers are unchanged." },

    0x20: { mnemonic: "AND AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF", "SF"], description: "AX = AX & imm. CF is cleared." },
    0x21: { mnemonic: "AND AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF", "SF"], description: "AX = AX & BX. CF is cleared." },
    0x22: { mnemonic: "OR AX, imm",  bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF", "SF"], description: "AX = AX | imm. CF is cleared." },
    0x23: { mnemonic: "OR AX, BX",   bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF", "SF"], description: "AX = AX | BX. CF is cleared." },
    0x24: { mnemonic: "XOR AX, imm", bytes: 2, mode: ADDRESSING_MODES.IMMEDIATE, dest: "AX", src: "IMM", flags: ["ZF", "SF"], description: "AX = AX ^ imm. CF is cleared." },
    0x25: { mnemonic: "XOR AX, BX",  bytes: 1, mode: ADDRESSING_MODES.REGISTER,  dest: "AX", src: "BX",  flags: ["ZF", "SF"], description: "AX = AX ^ BX. CF is cleared." },
    0x26: { mnemonic: "NOT AX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "AX", src: null, flags: ["ZF", "SF"], description: "AX = ~AX (8-bit). CF is cleared." },
    0x27: { mnemonic: "NOT BX", bytes: 1, mode: ADDRESSING_MODES.IMPLIED, dest: "BX", src: null, flags: ["ZF", "SF"], description: "BX = ~BX (8-bit). CF is cleared." },

    0x30: { mnemonic: "JMP dir", bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "PC", src: null, flags: [], description: "Unconditional jump: PC = dir." },
    0x31: { mnemonic: "JZ dir",  bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "PC", src: null, flags: [], description: "Jump if ZF == 1: PC = dir." },
    0x32: { mnemonic: "JNZ dir", bytes: 2, mode: ADDRESSING_MODES.DIRECT, dest: "PC", src: null, flags: [], description: "Jump if ZF == 0: PC = dir." }
};

/**
 * Looks up an opcode in the ISA table.
 * Returns undefined for opcodes not present in the table -
 * callers (decoder.js) are responsible for raising ILLEGAL OPCODE and halting.
 */
function GetInstruction(opcode) {
    return ISA[opcode];
}

/**
 * Returns true if the opcode is defined in the ISA.
 */
function IsValidOpcode(opcode) {
    return ISA.hasOwnProperty(opcode);
}

/**
 * Self-check: throws if any opcode is duplicated (guards against copy-paste errors
 * when new instructions are added later).
 * Since ISA is a JS object keyed by numeric opcode, duplicate keys are structurally
 * impossible - this function instead validates that every entry has the required fields.
 */
function ValidateISA() {
    for (const opcode in ISA) {
        const entry = ISA[opcode];
        const required = ["mnemonic", "bytes", "mode", "flags", "description"];
        for (const field of required) {
            if (!entry.hasOwnProperty(field)) {
                throw new Error(`[ISA Error] Opcode 0x${Number(opcode).toString(16)} is missing field "${field}"`);
            }
        }
        if (entry.bytes !== 1 && entry.bytes !== 2) {
            throw new Error(`[ISA Error] Opcode 0x${Number(opcode).toString(16)} has invalid byte length: ${entry.bytes}`);
        }
    }
    console.log(`[ISA] Validated ${Object.keys(ISA).length} instructions successfully.`);
}
