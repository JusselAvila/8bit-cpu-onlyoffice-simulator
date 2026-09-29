// src/bus.js - System Bus abstraction (CPU never touches RAM array directly)

const Bus = {
    read: function(address) {
        return ReadRAM(address);
    },

    write: function(address, value) {
        WriteRAM(address, value);
    }
};
