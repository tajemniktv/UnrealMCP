import { handlePerformanceTools } from './dist/tools/handlers/performance-handlers.js';

// Mock the execution of the automation request
const mockTools = {
  automationBridge: {
    sendAutomationRequest: async (toolName, args, options) => {
      // Simulate network delay for the automation bridge
      return new Promise(resolve => setTimeout(() => resolve({ success: true }), 100));
    },
    isConnected: () => true
  }
};

async function runBenchmark() {
  console.log('Starting benchmark for apply_baseline_settings...');

  const startTime = Date.now();

  await handlePerformanceTools('apply_baseline_settings', {
    action: 'apply_baseline_settings',
    distanceScale: 1.0,
    skeletalBias: 0,
    vsync: false,
    maxFPS: 60,
    hzb: true
  }, mockTools);

  const endTime = Date.now();
  console.log(`Benchmark completed in ${endTime - startTime}ms`);
}

runBenchmark().catch(console.error);
