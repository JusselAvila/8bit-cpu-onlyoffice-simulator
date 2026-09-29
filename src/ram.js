// src/ram.js - Physical 256-byte RAM & Converters for ONLYOFFICE

const memory = new Uint8Array(256);

// Modo de visualización actual de la grilla ("HEX" | "BIN" | "DEC" | "MNEMONIC")
let currentDisplayMode = "HEX";

/**
 * Lee un byte de la RAM con validación estricta de límites.
 */
function ReadRAM(address) {
    if (!Number.isInteger(address) || address < 0x00 || address > 0xFF) {
        console.error(`[RAM Error] ReadRAM: Invalid address 0x${address.toString(16)}. Must be between 0x00 and 0xFF.`);
        throw new Error(`Invalid RAM address: ${address}`);
    }
    return memory[address];
}

/**
 * Escribe un byte en la RAM con validación de límites y tipo de dato.
 */
function WriteRAM(address, value) {
    if (!Number.isInteger(address) || address < 0x00 || address > 0xFF) {
        console.error(`[RAM Error] WriteRAM: Invalid address 0x${address.toString(16)}.`);
        throw new Error(`Invalid RAM address: ${address}`);
    }
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        console.error(`[RAM Error] WriteRAM: Invalid value ${value} at 0x${address.toString(16)}. Must be 0-255.`);
        throw new Error(`Invalid RAM value: ${value}`);
    }

    memory[address] = value;
    UI.updateRamCell(address, value, currentDisplayMode);
}

/**
 * Reinicia toda la memoria a ceros y actualiza la hoja visual.
 */
function ClearRAM() {
    memory.fill(0);
    UI.refreshRamGrid(currentDisplayMode);
    console.log("[RAM] Memory cleared (all 256 cells set to 0).");
}

/**
 * Convierte un código máquina (opcode) a su Mnemónico correspondiente según la ISA.
 */
function toMnemonic(address, val) {
    // Si está fuera del Code Segment (00h - 1Fh), se muestra como formato hexadecimal plano
    if (address > 0x1F) return toHex(val);

    switch (val) {
        case 0x00: return "HLT";
        case 0x01: return "MOV AX, imm";
        case 0x02: return "MOV BX, imm";
        case 0x03: return "MOV AX, BX";
        case 0x04: return "MOV BX, AX";
        case 0x05: return "LOAD AX";
        case 0x06: return "LOAD BX";
        case 0x07: return "STORE AX";
        case 0x08: return "STORE BX";
        case 0x10: return "ADD AX, imm";
        case 0x11: return "ADD BX, imm";
        case 0x12: return "ADD AX, BX";
        case 0x13: return "ADD BX, AX";
        case 0x14: return "SUB AX, imm";
        case 0x15: return "SUB BX, imm";
        case 0x16: return "SUB AX, BX";
        case 0x17: return "SUB BX, AX";
        case 0x18: return "INC AX";
        case 0x19: return "INC BX";
        case 0x1A: return "DEC AX";
        case 0x1B: return "DEC BX";
        case 0x1C: return "CMP AX, imm";
        case 0x1D: return "CMP BX, imm";
        case 0x1E: return "CMP AX, BX";
        case 0x1F: return "CMP BX, AX";
        case 0x30: return "JMP dir";
        case 0x31: return "JZ dir";
        case 0x32: return "JNZ dir";
        default: return `DB ${toHex(val)}`; // Operando o byte de datos dentro del área de código
    }
}

/**
 * Cambia el modo de visualización global de toda la grilla RAM (HEX, BIN, DEC, MNEMONIC).
 */
function SetDisplayMode(mode) {
    const validModes = ["HEX", "BIN", "DEC", "MNEMONIC"];
    if (!validModes.includes(mode)) {
        console.error(`[RAM Error] Invalid display mode: ${mode}`);
        return;
    }
    currentDisplayMode = mode;
    UI.refreshRamGrid(currentDisplayMode);
    console.log(`[RAM] Display mode changed to: ${mode}`);
}
