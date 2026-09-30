// src/alu.js - Pure arithmetic/logic operations. No register writes, no UI calls.
// Every function returns { result, ZF, CF, SF }. CF is null for INC/DEC,
// meaning "leave the current CF unchanged" - the caller must not overwrite it.

function ALU_ADD(a, b) {
    const raw = a + b;
    const result = raw & 0xFF;
    return { result, ZF: result === 0 ? 1 : 0, CF: raw > 0xFF ? 1 : 0, SF: (result & 0x80) ? 1 : 0 };
}

function ALU_SUB(a, b) {
    const raw = a - b;
    const result = raw & 0xFF;
    return { result, ZF: result === 0 ? 1 : 0, CF: a < b ? 1 : 0, SF: (result & 0x80) ? 1 : 0 };
}

function ALU_INC(a) {
    const result = (a + 1) & 0xFF;
    return { result, ZF: result === 0 ? 1 : 0, CF: null, SF: (result & 0x80) ? 1 : 0 };
}

function ALU_DEC(a) {
    const result = (a - 1) & 0xFF;
    return { result, ZF: result === 0 ? 1 : 0, CF: null, SF: (result & 0x80) ? 1 : 0 };
}

// CMP performs the same subtraction as SUB; the caller must not write back the result.
function ALU_CMP(a, b) {
    return ALU_SUB(a, b);
}

function ALU_AND(a, b) {
    const result = (a & b) & 0xFF;
    return { result, ZF: result === 0 ? 1 : 0, CF: 0, SF: (result & 0x80) ? 1 : 0 };
}

function ALU_OR(a, b) {
    const result = (a | b) & 0xFF;
    return { result, ZF: result === 0 ? 1 : 0, CF: 0, SF: (result & 0x80) ? 1 : 0 };
}

function ALU_XOR(a, b) {
    const result = (a ^ b) & 0xFF;
    return { result, ZF: result === 0 ? 1 : 0, CF: 0, SF: (result & 0x80) ? 1 : 0 };
}

function ALU_NOT(a) {
    const result = (~a) & 0xFF;
    return { result, ZF: result === 0 ? 1 : 0, CF: 0, SF: (result & 0x80) ? 1 : 0 };
}

// Node.js-only export, used by the standalone test suite (Task 6.2) run via `node`.
// Guarded so this file loads safely inside ONLYOFFICE's macro environment too,
// where `module` does not exist.
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        ALU_ADD,
        ALU_SUB,
        ALU_INC,
        ALU_DEC,
        ALU_CMP,
        ALU_AND,
        ALU_OR,
        ALU_XOR,
        ALU_NOT
    };
}
