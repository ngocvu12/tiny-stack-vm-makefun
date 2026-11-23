import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const i32 = (x: number) => x | 0;
const s8 = (x: number) => (x << 24) >> 24;

function run(p: Buffer, input: Buffer) {
  const st: number[] = [], calls: number[] = [], mem = new Int32Array(256), out: number[] = [];
  let pc = 0, ip = 0, steps = 0, code = 9;
  const trap = (n: number) => { code = n; return true; };
  const need = (n: number) => st.length < n;
  const push = (v: number) => st.push(i32(v));
  const print = (s: string) => {
    if (out.length + s.length > 65536) return false;
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return true;
  };
  for (;;) {
    if (steps++ >= 1000000) { trap(10); break; }
    if (pc < 0 || pc >= p.length) { trap(9); break; }
    const at = pc, op = p[pc++];
    const imm = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    if (pc + imm > p.length) { trap(9); break; }
    const rel = imm === 2 ? p.readInt16LE(pc) : 0;
    const u16 = imm === 2 ? p.readUInt16LE(pc) : 0;
    const val = op === 1 ? s8(p[pc]) : op === 2 ? p.readInt32LE(pc) : 0;
    pc += imm;
    let a: number, b: number;
    switch (op) {
      case 0: code = 0; return { out, code };
      case 1: if (st.length >= 256) { trap(3); break; } push(val); continue;
      case 2: if (st.length >= 256) { trap(3); break; } push(val); continue;
      case 3: if (need(1)) { trap(2); break; } st.pop(); continue;
      case 4: if (need(1)) { trap(2); break; } if (st.length >= 256) { trap(3); break; } push(st[st.length - 1]); continue;
      case 5: if (need(2)) { trap(2); break; } [st[st.length - 2], st[st.length - 1]] = [st[st.length - 1], st[st.length - 2]]; continue;
      case 6: if (need(2)) { trap(2); break; } if (st.length >= 256) { trap(3); break; } push(st[st.length - 2]); continue;
      case 7: if (need(3)) { trap(2); break; } a = st.pop()!; b = st.pop()!; st.push(b, a, st.pop()!); continue;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
        if (need(2)) { trap(2); break; }
        b = st.pop()!; a = st.pop()!;
        if ((op === 0x13 || op === 0x14 || op === 0x15 || op === 0x16) && b === 0) { trap(4); break; }
        if (op === 0x10) push(a + b);
        else if (op === 0x11) push(a - b);
        else if (op === 0x12) push(Math.imul(a, b));
        else if (op === 0x13) push(a === -2147483648 && b === -1 ? a : Math.trunc(a / b));
        else if (op === 0x14) push(a === -2147483648 && b === -1 ? 0 : a % b);
        else if (op === 0x15) push(Math.floor((a >>> 0) / (b >>> 0)));
        else if (op === 0x16) push((a >>> 0) % (b >>> 0));
        else if (op === 0x18) push(a & b);
        else if (op === 0x19) push(a | b);
        else if (op === 0x1a) push(a ^ b);
        else if (op === 0x1c) push(a << (b & 31));
        else if (op === 0x1d) push(a >> (b & 31));
        else push(a >>> (b & 31));
        continue;
      case 0x17: if (need(1)) { trap(2); break; } st[st.length - 1] = i32(-st[st.length - 1]); continue;
      case 0x1b: if (need(1)) { trap(2); break; } st[st.length - 1] = ~st[st.length - 1]; continue;
      case 0x20: case 0x21: case 0x22:
        if (need(2)) { trap(2); break; } b = st.pop()!; a = st.pop()!;
        push(op === 0x20 ? a === b : op === 0x21 ? a < b : (a >>> 0) < (b >>> 0)); continue;
      case 0x30: pc = pc + rel; continue;
      case 0x31: case 0x32:
        if (need(1)) { trap(2); break; } a = st.pop()!; if (op === 0x31 ? a === 0 : a !== 0) pc += rel; continue;
      case 0x33: if (calls.length >= 64) { trap(7); break; } calls.push(pc); pc = u16; continue;
      case 0x34: if (!calls.length) { trap(8); break; } pc = calls.pop()!; continue;
      case 0x40: if (need(1)) { trap(2); break; } a = st.pop()!; if (a < 0 || a > 255) { trap(6); break; } push(mem[a]); continue;
      case 0x41: if (need(2)) { trap(2); break; } a = st.pop()!; b = st.pop()!; if (a < 0 || a > 255) { trap(6); break; } mem[a] = i32(b); continue;
      case 0x50: if (need(1)) { trap(2); break; } a = st.pop()!; if (!print(String(a))) trap(11); else continue; break;
      case 0x51: if (need(1)) { trap(2); break; } a = st.pop()!; if (out.length >= 65536) trap(11); else { out.push(a & 255); continue; } break;
      case 0x52: if (st.length >= 256) { trap(3); break; } push(ip < input.length ? input[ip++] : -1); continue;
      case 0x53: if (need(1)) { trap(2); break; } code = st.pop()! & 255; return { out, code };
      default: trap(5); break;
    }
    break;
  }
  return { out, code };
}

for (const id of readdirSync(I).filter(x => /^i\d+$/.test(x)).sort()) {
  const dir = join(I, id), out = join(O, id);
  const r = run(readFileSync(join(dir, 'program.bin')), readFileSync(join(dir, 'input.bin')));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'stdout.bin'), Buffer.from(r.out));
  writeFileSync(join(out, 'exit.txt'), String(r.code) + '\n');
}
