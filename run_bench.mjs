import { spawn } from 'child_process';

const start = Date.now();
const child = spawn('node', ['--loader', 'ts-node/esm', 'benchmark.ts']);

let out = '';
child.stdout.on('data', (data) => {
  out += data.toString();
  if (out.includes('Current:')) {
    console.log(out.split('\n').find(l => l.includes('Current:')));
    process.exit(0);
  }
});

child.stderr.on('data', (data) => {
  console.error(data.toString());
});

setTimeout(() => {
  console.log('Timeout hit');
  child.kill();
  process.exit(1);
}, 15000);
