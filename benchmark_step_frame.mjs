import { handleEditorTools } from './dist/tools/handlers/editor-handlers.js';

async function run() {
  const mockTools = {
    automationBridge: {
      isConnected: () => true,
      sendAutomationRequest: async (toolName, args, options) => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({ success: true, message: 'Mocked request succeeded' });
          }, 10);
        });
      }
    }
  };

  const args = { action: 'step_frame', steps: 100 };

  console.log('Starting benchmark...');
  const startTime = performance.now();

  await handleEditorTools('step_frame', args, mockTools);

  const endTime = performance.now();
  console.log(`Benchmark completed in ${(endTime - startTime).toFixed(2)} ms.`);
}

run().catch(console.error);