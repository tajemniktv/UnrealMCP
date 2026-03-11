import { UnrealBridge } from './dist/unreal-bridge.js';
import { LightingTools } from './dist/tools/lighting.js';

class MockAutomationBridge {
  constructor() {}
  async sendAutomationRequest(action, payload) {
    if (action === 'console_command') return { success: true };
    if (action === 'configure_shadows') return { success: false }; // fallback to console
    if (action === 'setup_global_illumination') return { success: false }; // fallback to console
    if (action === 'set_ambient_occlusion') return { success: false }; // fallback to console
    if (action === 'set_exposure') return { success: false }; // fallback to console
    return { success: true };
  }
  isConnected() { return true; }
  on() {}
  off() {}
  start() {}
}

async function run() {
  process.env.MOCK_UNREAL_CONNECTION = 'true';
  const bridge = new UnrealBridge();
  const automation = new MockAutomationBridge();
  bridge.setAutomationBridge(automation);
  await bridge.tryConnect();

  const lighting = new LightingTools(bridge, automation);

  const start1 = Date.now();
  for (let i = 0; i < 50; i++) {
    await lighting.configureShadows({
      shadowQuality: 'Epic',
      cascadedShadows: true,
      shadowDistance: 10000,
      contactShadows: true,
      rayTracedShadows: true
    });
  }
  const end1 = Date.now();
  console.log(`Current: ${end1 - start1} ms`);

  process.exit(0);
}

run().catch(console.error);
