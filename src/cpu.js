// src/cpu.js - CPU Registers, Status Flags, and Memory Segmentation Engine

// --- 0. Helper Formatting Functions ---
function toHex(val) {
    return val.toString(16).toUpperCase().padStart(2, '0');
}

function toBin(val) {
    return val.toString(2).padStart(8, '0');
}

function toDec(val) {
    return val.toString(10);
}

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
 * and updates its visualization in the ONLYOFFICE sheet.
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
    
    // Update visual cells in the sheet
    updateRegisterInSheet(regName, registers[regName]);
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
    
    // Update visual flag cell in the sheet
    updateFlagInSheet(flagName, flags[flagName]);
}

/**
 * Resets the CPU to its initial state without clearing RAM contents,
 * and clears the current phase state and step counter in the UI.
 */
function ResetCPU() {
    // Reset registers to 0
    for (let reg in registers) {
        registers[reg] = 0x00;
        updateRegisterInSheet(reg, 0x00);
    }

    // Reset flags to 0
    for (let flag in flags) {
        flags[flag] = 0;
        updateFlagInSheet(flag, 0);
    }

    // Clear phase state and step counter in the sheet (Rows 18 & 19, Col 3)
    const sheet = Api.GetActiveSheet();
    sheet.GetCells(18, 3).SetValue("FETCH");
    sheet.GetCells(19, 3).SetValue(0);

    console.log("[CPU] CPU reset successfully (RAM contents preserved, Phase reset).");
}

// --- 4. Visual Mapping Functions for ONLYOFFICE Sheet ---

function updateRegisterInSheet(regName, value) {
    const sheet = Api.GetActiveSheet();
    
    // Exact row mapping for registers (PC=6 to BX=11)
    const registerRows = {
        PC: 6,
        IR: 7,
        MAR: 8,
        MDR: 9,
        AX: 10,
        BX: 11
    };

    if (registerRows.hasOwnProperty(regName)) {
        let row = registerRows[regName];
        
        // Columna C (3): Hex, Columna D (4): Binary, Columna E (5): Decimal
        sheet.GetCells(row, 3).SetValue(toHex(value));
        sheet.GetCells(row, 4).SetValue(toBin(value));
        sheet.GetCells(row, 5).SetValue(toDec(value));
    }
}

function updateFlagInSheet(flagName, value) {
    const sheet = Api.GetActiveSheet();
    
    // Exact row mapping for flags (ZF=14, CF=15, SF=16)
    const flagRows = {
        ZF: 14,
        CF: 15,
        SF: 16
    };

    if (flagRows.hasOwnProperty(flagName)) {
        let row = flagRows[flagName];
        sheet.GetCells(row, 3).SetValue(value);
    }
}

function testCPU() {
    // 1. Probar enmascaramiento a 8 bits (300 & 0xFF = 44)
    SetRegister("AX", 300);

    // 2. Probar otros registros
    SetRegister("PC", 0x15);
    SetRegister("IR", 0x01);
    SetRegister("MAR", 0x00);
    SetRegister("MDR", 0x1F);
    SetRegister("BX", 0xAB);

    // 3. Probar banderas de estado
    SetFlag("ZF", 1);
    SetFlag("CF", 0);
    SetFlag("SF", 1);

    // 4. Probar segmentación en consola
    console.log(`GetSegment(0x1F): ${GetSegment(0x1F)}`); // CODE
    console.log(`GetSegment(0x20): ${GetSegment(0x20)}`); // RESERVED
    console.log(`GetSegment(0x80): ${GetSegment(0x80)}`); // DATA
}

// Ejecutar pruebas
testCPU();
