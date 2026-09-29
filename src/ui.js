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

    updateRegister: function(regName, value) {
        const sheet = Api.GetActiveSheet();
        if (!this.registerRows.hasOwnProperty(regName)) return;
        const row = this.registerRows[regName];
        sheet.GetCells(row, 3).SetValue(toHex(value));
        sheet.GetCells(row, 4).SetValue(toBin(value));
        sheet.GetCells(row, 5).SetValue(toDec(value));
    },

    updateFlag: function(flagName, value) {
        const sheet = Api.GetActiveSheet();
        if (!this.flagRows.hasOwnProperty(flagName)) return;
        const row = this.flagRows[flagName];
        sheet.GetCells(row, 3).SetValue(value);
    },

    resetPhaseIndicator: function() {
        const sheet = Api.GetActiveSheet();
        sheet.GetCells(18, 3).SetValue("FETCH");
        sheet.GetCells(19, 3).SetValue(0);
    },

    updateRamCell: function(address, value, mode) {
        const sheet = Api.GetActiveSheet();
        const rowOffset = Math.floor(address / 16);
        const colOffset = address % 16;
        const excelRow = this.ramOrigin.row + rowOffset;
        const excelCol = this.ramOrigin.col + colOffset;
        const cell = sheet.GetCells(excelRow, excelCol);

        let displayValue = "";
        switch (mode) {
            case "BIN": displayValue = toBin(value); break;
            case "DEC": displayValue = toDec(value); break;
            case "MNEMONIC": displayValue = toMnemonic(address, value); break;
            case "HEX":
            default: displayValue = toHex(value); break;
        }
        cell.SetValue(displayValue);
    },

    refreshRamGrid: function(mode) {
        for (let addr = 0x00; addr <= 0xFF; addr++) {
            this.updateRamCell(addr, ReadRAM(addr), mode);
        }
    }
};
