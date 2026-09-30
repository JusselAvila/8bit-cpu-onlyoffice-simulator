// src/ui.js - All ONLYOFFICE sheet interaction lives here

const UI = {

    // --- Register/Flag row mapping ---
    registerRows: {
        PC: 6, IR: 7, MAR: 8, MDR: 9, AX: 10, BX: 11
    },
    flagRows: {
        ZF: 14, CF: 15, SF: 16
    },
    ramOrigin: { row: 8, col: 11 }, // K8 = address 00h
    programSourceCell: { row: 25, col: 11 }, // K25: text cell with space-separated hex bytes

    // --- Phase highlight colors ---
    COLORS: {
        FETCH:   [255, 255, 0],   // yellow
        DECODE:  [0, 176, 240],   // blue
        EXECUTE: [146, 208, 80],  // green
        STORE:   [255, 0, 0]      // red
    },

    // Original RAM grid fills (theme colors of the wireframe), restored when a highlight is cleared
    SEGMENT_FILLS: {
        CODE:     [189, 215, 238],
        RESERVED: [208, 206, 206],
        DATA:     [169, 209, 142]
    },

    highlightedCells: [], // {row, col} currently colored, so they can be cleared before the next phase

    phaseCell: { row: 18, col: 3 },       // C18
    stepCounterCell: { row: 19, col: 3 }, // C19
    microOpCell: { row: 20, col: 3 },     // C20
    speedCell: { row: 24, col: 3 },       // C24
    stateCell: { row: 1, col: 60 },       // BH1: serialized simulator state (see state.js)

    // Log table B28:Z43 -> B Step | C Phase | D PC | E IR | F MAR | G MDR | H AX | I BX | J Flags | K:Z Micro-operation
    logPanel: { startRow: 28, rows: 16, stepCol: 2, phaseCol: 3, firstRegCol: 4, flagsCol: 10, textCol: 11 },
    LOG_REGISTERS: ["PC", "IR", "MAR", "MDR", "AX", "BX"],

    cell: function(row, col) {
        return Api.GetActiveSheet().GetCells(row, col);
    },

    setText: function(row, col, text) {
        const c = this.cell(row, col);
        c.SetNumberFormat("@"); // keeps leading zeros in "0B" / "00001011"
        c.SetValue(text);
    },

    // SetFillColor(null) throws in the desktop editor, so "no fill" is painted as white
    NO_FILL: [255, 255, 255],

    setFill: function(row, col, rgb) {
        const c = rgb || this.NO_FILL;
        this.cell(row, col).SetFillColor(Api.CreateColorFromRGB(c[0], c[1], c[2]));
    },

    updateRegister: function(regName, value) {
        if (!this.registerRows.hasOwnProperty(regName)) return;
        const row = this.registerRows[regName];
        this.setText(row, 3, toHex(value));
        this.setText(row, 4, toBin(value));
        this.setText(row, 5, toDec(value));
    },

    updateFlag: function(flagName, value) {
        if (!this.flagRows.hasOwnProperty(flagName)) return;
        this.cell(this.flagRows[flagName], 3).SetValue(value);
    },

    resetPhaseIndicator: function() {
        this.cell(this.phaseCell.row, this.phaseCell.col).SetValue("FETCH");
        this.cell(this.stepCounterCell.row, this.stepCounterCell.col).SetValue(0);
        this.cell(this.microOpCell.row, this.microOpCell.col).SetValue("");
        this.clearHighlights();
    },

    updateRamCell: function(address, value, mode) {
        const ref = this.ramCellRef(address);

        let displayValue = "";
        switch (mode) {
            case "BIN": displayValue = toBin(value); break;
            case "DEC": displayValue = toDec(value); break;
            case "MNEMONIC": displayValue = toMnemonic(address, value); break;
            case "HEX":
            default: displayValue = toHex(value); break;
        }
        this.setText(ref.row, ref.col, displayValue);
    },

    refreshRamGrid: function(mode) {
        for (let addr = 0x00; addr <= 0xFF; addr++) {
            this.updateRamCell(addr, ReadRAM(addr), mode);
        }
    },

    getProgramSourceText: function() {
        const value = this.cell(this.programSourceCell.row, this.programSourceCell.col).GetValue();
        return value === null || value === undefined ? "" : String(value);
    },

    setProgramSourceText: function(text) {
        this.setText(this.programSourceCell.row, this.programSourceCell.col, text);
    },

    registerCellRef: function(regName) {
        return { row: this.registerRows[regName], col: 3 };
    },

    flagCellRef: function(flagName) {
        return { row: this.flagRows[flagName], col: 3 };
    },

    ramCellRef: function(address) {
        const rowOffset = Math.floor(address / 16);
        const colOffset = address % 16;
        return { row: this.ramOrigin.row + rowOffset, col: this.ramOrigin.col + colOffset };
    },

    /**
     * Fill a cell had before being highlighted: the segment color for RAM
     * grid cells, no fill for register and flag cells.
     */
    baseFill: function(ref) {
        const rowOffset = ref.row - this.ramOrigin.row;
        const colOffset = ref.col - this.ramOrigin.col;
        if (rowOffset >= 0 && rowOffset < 16 && colOffset >= 0 && colOffset < 16) {
            return this.SEGMENT_FILLS[GetSegment(rowOffset * 16 + colOffset)];
        }
        return null;
    },

    /**
     * Applies a fill color to the given cells and remembers them so they
     * can be cleared before the next phase's highlight is applied.
     */
    highlightCells: function(cellRefs, colorRgb) {
        for (const c of cellRefs) {
            this.setFill(c.row, c.col, colorRgb);
            this.highlightedCells.push({ row: c.row, col: c.col });
        }
    },

    /**
     * Restores every cell highlighted since the last clear. Must be called
     * before applying the next phase's highlight, and by RESET.
     */
    clearHighlights: function() {
        for (const c of this.highlightedCells) {
            this.setFill(c.row, c.col, this.baseFill(c));
        }
        this.highlightedCells = [];
    },

    /**
     * Updates the phase indicator: current phase name, step counter,
     * and a short description of the micro-operation just executed.
     */
    updatePhaseIndicator: function(phase, microOpText, stepNum) {
        this.cell(this.phaseCell.row, this.phaseCell.col).SetValue(phase);
        this.cell(this.stepCounterCell.row, this.stepCounterCell.col).SetValue(stepNum);
        this.setText(this.microOpCell.row, this.microOpCell.col, microOpText);
    },

    /**
     * Reads the RUN delay (ms) from the speed cell on every call, so it can
     * be changed while running. Invalid or negative values use DEFAULT_DELAY_MS.
     */
    DEFAULT_DELAY_MS: 500,

    getDelayMs: function() {
        const raw = this.cell(this.speedCell.row, this.speedCell.col).GetValue();
        const delay = parseInt(raw, 10);
        return (isNaN(delay) || delay < 0) ? this.DEFAULT_DELAY_MS : delay;
    },

    readStateText: function() {
        const value = this.cell(this.stateCell.row, this.stateCell.col).GetValue();
        return value === null || value === undefined ? "" : String(value);
    },

    writeStateText: function(text) {
        this.setText(this.stateCell.row, this.stateCell.col, text);
    },

    /**
     * Rewrites the log table from the in-memory buffer (oldest first).
     * Rows beyond the buffer's length are cleared to blank.
     */
    refreshLogPanel: function(entries) {
        const p = this.logPanel;
        for (let i = 0; i < p.rows; i++) {
            const row = p.startRow + i;
            const e = i < entries.length ? entries[i] : null;
            const snap = e && e.snapshot;

            this.setText(row, p.stepCol, e && e.step !== null ? pad(e.step) : "");
            this.setText(row, p.phaseCol, e && e.phase ? e.phase : "");
            for (let r = 0; r < this.LOG_REGISTERS.length; r++) {
                const name = this.LOG_REGISTERS[r];
                this.setText(row, p.firstRegCol + r, snap ? toHex(snap.registers[name]) : "");
            }
            this.setText(row, p.flagsCol, snap ? `Z${snap.flags.ZF} C${snap.flags.CF} S${snap.flags.SF}` : "");
            this.setText(row, p.textCol, e ? `[${e.time}] ${e.message}` : "");
        }
    }
};
