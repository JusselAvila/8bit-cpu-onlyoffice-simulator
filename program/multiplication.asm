; multiplication.asm - 5 x 6 by successive additions
; Code Segment starts at 00h. Result is stored in the Data Segment (80h).
;
; Expected final state: AX = 1Eh (30), BX = 00h, ZF = 1, RAM[80h] = 1Eh, CPU halted.
; Executed instructions: 2 + 5 x 3 + 1 + 1 = 19
; Micro-operation steps: 173 (see README, section 5)

; Addr  Bytes   Assembly             Comment
  00h:  01 00   MOV AX, 0x00      ; accumulator = 0
  02h:  02 05   MOV BX, 0x05      ; loop counter = 5
  04h:  10 06   ADD AX, 0x06      ; loop: AX += 6
  06h:  1B      DEC BX            ; counter -= 1 (sets ZF)
  07h:  32 04   JNZ 0x04          ; repeat while BX != 0
  09h:  07 80   STORE [0x80], AX  ; save result
  0Bh:  00      HLT               ; stop
