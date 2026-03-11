import { spawn } from 'child_process';
const child = spawn('node', ['benchmark.ts']);
child.stdout.on('data', (data) => process.stdout.write(data));
child.stderr.on('data', (data) => process.stderr.write(data));
setTimeout(() => { child.kill(); process.exit(); }, 10000);
