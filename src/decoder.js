// src/decoder.js - Pure opcode decoding logic. No sheet/UI calls, no register writes.
// Consumes the ISA table (isa.js). Used by main.js's Decode_Step().

/**
 * Looks up the opcode in the ISA table.
 * Returns the ISA entry, or null if the opcode is not defined (illegal opcode).
 */
function DecodeOpcode(irValue) {
    if (!IsValidOpcode(irValue)) {
        return null;
    }
    return GetInstruction(irValue);
}

function BuildDecodedInstruction(opcodeId, entry, operandByte) {
    return {
        opcodeId: opcodeId,
        op: entry.op,          // <-- añadido, usado por Execute_Step para el dispatch
        mnemonic: entry.mnemonic,
        mode: entry.mode,
        dest: entry.dest,
        src: entry.src,
        operand: entry.bytes === 2 ? operandByte : null,
        length: entry.bytes
    };
}

/**
 * Produces a human-readable disassembly string, replacing the "imm"/"dir"
 * placeholder in the ISA mnemonic with the actual operand value.
 * e.g. entry.mnemonic = "ADD AX, imm", operandByte = 0x06 -> "ADD AX, 0x06"
 */
function Disassemble(entry, operandByte) {
    let text = entry.mnemonic;
    if (entry.bytes === 2 && operandByte !== null && operandByte !== undefined) {
        const operandHex = "0x" + toHex(operandByte);
        text = text.replace("imm", operandHex).replace("dir", operandHex);
    }
    return text;
}
