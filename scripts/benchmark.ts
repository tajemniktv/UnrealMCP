import { EditorTools } from '../src/tools/editor.js';
import { UnrealBridge } from '../src/unreal-bridge.js';

process.env.MOCK_UNREAL_CONNECTION = 'true';

async function runBenchmark() {
    console.log('Starting benchmark...');
    const bridge = new UnrealBridge();
    await bridge.tryConnect();
    const editor = new EditorTools(bridge);

    const steps = 100;

    const start = performance.now();
    await editor.stepPIEFrame(steps);
    const end = performance.now();

    console.log(`Time taken to step ${steps} frames: ${(end - start).toFixed(2)} ms`);

    bridge.dispose();
}

runBenchmark().catch(console.error);
