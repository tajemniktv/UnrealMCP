import { UnrealBridge } from './dist/unreal-bridge.js';
import { LightingTools } from './dist/tools/lighting.js';
import { AutomationBridge } from './dist/automation/index.js';

async function run() {
  process.env.MOCK_UNREAL_CONNECTION = 'true';
  const bridge = new UnrealBridge();
  // To bypass "Automation bridge not connected" error in executeConsoleCommand
  const automation = new AutomationBridge();
  // mock the necessary method
  automation.sendAutomationRequest = async () => ({ success: true });
  automation.isConnected = () => true;
  bridge.setAutomationBridge(automation);

  await bridge.tryConnect();

  const lighting = new LightingTools(bridge);

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
