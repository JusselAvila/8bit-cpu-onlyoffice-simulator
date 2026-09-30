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

function toMnemonic(address, val) {
    if (address > 0x1F) return toHex(val);

    const instruction = GetInstruction(val);
    if (!instruction) return `DB ${toHex(val)}`; // operand byte or illegal opcode shown as raw data

    return instruction.mnemonic;
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



/**
 * Clears only the Code Segment (00h-1Fh), leaving the rest of RAM untouched.
 * Used by the loader so a shorter program fully overwrites a previous longer one.
 */
function ClearCodeSegment() {
    for (let addr = 0x00; addr <= 0x1F; addr++) {
        memory[addr] = 0;
    }
    console.log("[RAM] Code segment cleared (00h-1Fh).");
}
