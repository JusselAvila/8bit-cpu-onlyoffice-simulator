// src/cpu.js - CPU Registers, Status Flags, and Memory Segmentation Engine

// --- 1. CPU Registers (8-bit state objects) ---
let registers = {
    PC: 0x00, // Program Counter
    IR: 0x00, // Instruction Register
    MAR: 0x00, // Memory Address Register
    MDR: 0x00, // Memory Data Register
    AX: 0x00,  // Accumulator
    BX: 0x00   // General Purpose
};

// --- 2. Status Flags (1-bit state objects) ---
let flags = {
    ZF: 0, // Zero Flag
    CF: 0, // Carry Flag
    SF: 0  // Sign Flag
};

// --- 3. Memory Segment Constants & Helper ---
const SEGMENTS = {
    CODE: "CODE",
    RESERVED: "RESERVED",
    DATA: "DATA"
};

/**
 * Determines which logical segment a memory address belongs to.
 * Code: 00h–1Fh, Reserved: 20h–7Fh, Data: 80h–FFh.
 */
function GetSegment(address) {
    if (!Number.isInteger(address) || address < 0x00 || address > 0xFF) {
        throw new Error(`Invalid address for segment check: ${address}`);
    }

    if (address >= 0x00 && address <= 0x1F) {
        return SEGMENTS.CODE;
    } else if (address >= 0x20 && address <= 0x7F) {
        return SEGMENTS.RESERVED;
    } else {
        return SEGMENTS.DATA;
    }
}

/**
 * Writes a value to a register, ensuring it is masked to 8 bits (& 0xFF)
 * and delegates the sheet update to the UI module.
 */
function SetRegister(regName, value) {
    if (!registers.hasOwnProperty(regName)) {
        console.error(`[CPU Error] Unknown register: ${regName}`);
        throw new Error(`Unknown register: ${regName}`);
    }
    if (!Number.isInteger(value)) {
        throw new Error(`Register value must be an integer: ${value}`);
    }

    // Force truncation to 8 bits (0 - 255)
    registers[regName] = value & 0xFF;

    // Delegate visual update to ui.js
    UI.updateRegister(regName, registers[regName]);
}

/**
 * Updates status flags (ZF, CF, SF).
 */
function SetFlag(flagName, value) {
    if (!flags.hasOwnProperty(flagName)) {
        console.error(`[CPU Error] Unknown flag: ${flagName}`);
        throw new Error(`Unknown flag: ${flagName}`);
    }

    // Flags are logical binary values (0 or 1)
    flags[flagName] = value ? 1 : 0;

    // Delegate visual update to ui.js
    UI.updateFlag(flagName, flags[flagName]);
}

function ResetCPU() {
    // Reset registers to 0
    for (let reg in registers) {
        registers[reg] = 0x00;
        UI.updateRegister(reg, 0x00);
    }

    // Reset flags to 0
    for (let flag in flags) {
        flags[flag] = 0;
        UI.updateFlag(flag, 0);
    }

    // Reset the instruction-cycle control unit (main.js)
    executionState.phase = "FETCH";
    executionState.microStep = 0;
    executionState.halted = false;
    stepCounter = 0;
    ClearLog();

    // Delegate phase/step-counter visual reset to ui.js
    UI.resetPhaseIndicator();

    console.log("[CPU] CPU reset successfully (RAM contents preserved, Phase reset).");
}
