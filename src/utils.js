// src/utils.js
function toHex(val) {
    return val.toString(16).toUpperCase().padStart(2, '0');
}
function toBin(val) {
    return val.toString(2).padStart(8, '0');
}
function toDec(val) {
    return val.toString(10);
}
function pad(n) {
    return n.toString().padStart(2, "0");
}
