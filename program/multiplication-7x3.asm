; multiplication-7x3.asm - variant of the demo with different operands (7 x 3)
; Same code, only the two immediates change: loop count 05h -> 03h, addend 06h -> 07h.
; Paste multiplication-7x3.hex into K25 and press LOAD PROGRAM to change the data live.
;
; Expected final state: AX = 15h (21), BX = 00h, ZF = 1, RAM[80h] = 15h, CPU halted.
; Executed instructions: 2 + 3 x 3 + 1 + 1 = 13

; Addr  Bytes   Assembly             Comment
  00h:  01 00   MOV AX, 0x00      ; accumulator = 0
  02h:  02 03   MOV BX, 0x03      ; loop counter = 3
  04h:  10 07   ADD AX, 0x07      ; loop: AX += 7
  06h:  1B      DEC BX            ; counter -= 1 (sets ZF)
  07h:  32 04   JNZ 0x04          ; repeat while BX != 0
  09h:  07 80   STORE [0x80], AX  ; save result
  0Bh:  00      HLT               ; stop
