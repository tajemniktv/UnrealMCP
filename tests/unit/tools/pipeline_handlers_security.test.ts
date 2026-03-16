import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePipelineTools } from '../../../src/tools/handlers/pipeline-handlers.js';
import { ITools } from '../../../src/types/tool-interfaces.js';

// Mock the child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event, cb) => {
      if (event === 'close') {
        setTimeout(() => cb(0), 10);
      }
    }),
  })),
}));

// Mock filesystem and paths to pass initial basic checks
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => ['TestProject.uproject']),
  },
}));

vi.mock('../../../src/tools/handlers/modding-utils.js', () => ({
  findProjectContext: vi.fn(() => ({
    projectFile: 'TestProject.uproject',
    projectName: 'TestProject',
    repoRoot: '/path/to/repo'
  })),
  findPluginDescriptorByName: vi.fn(() => ({
    pluginName: 'TestPlugin',
    version: '1.0.0'
  })),
  findPluginDescriptorByRoot: vi.fn(),
  listPluginDescriptors: vi.fn(() => []),
  listTargetFiles: vi.fn(() => [{ name: 'TestProjectEditor' }]),
  summarizeDescriptor: vi.fn((desc) => desc),
}));

describe('Pipeline Handlers Security', () => {
  let mockTools: ITools;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UE_PROJECT_PATH = '/path/to/project';
    process.env.UE_ENGINE_PATH = '/path/to/engine';

    mockTools = {
      automationBridge: {
        sendAutomationRequest: vi.fn(),
      },
    } as unknown as ITools;
  });

  describe('run_ubt', () => {
    it('throws error when arguments contain shell metacharacters', async () => {
      const args = {
        target: 'TestProjectEditor',
        arguments: '-Progress & calc.exe'
      };

      await expect(handlePipelineTools('run_ubt', args, mockTools)).rejects.toThrow(
        /Command argument contains forbidden character\(s\) or switches and is blocked for safety/
      );
    });

    it('throws error when arguments contain cmd.exe flags', async () => {
      const args = {
        target: 'TestProjectEditor',
        arguments: '-Progress /c echo pwned'
      };

      await expect(handlePipelineTools('run_ubt', args, mockTools)).rejects.toThrow(
        /Command argument contains forbidden character\(s\) or switches and is blocked for safety/
      );
    });

    it('allows valid arguments', async () => {
      const args = {
        target: 'TestProjectEditor',
        arguments: '-Progress -ModuleWithSuffix="TestPlugin,MCP"'
      };

      const result = await handlePipelineTools('run_ubt', args, mockTools);
      expect((result as Record<string, unknown>).success).toBe(true);
    });
  });

  describe('package_mod', () => {
    // package_mod does not take an arbitrary "arguments" string in the handler itself right now
    // but we can test build_mod which uses run_ubt under the hood, or we can test if we can
    // inject somehow. Since package_mod uses hardcoded template arguments but injects projectFile etc.,
    // we can test the handler to verify it passes validateCommandArgs.
    it('allows valid packaging parameters', async () => {
      const args = {
        pluginName: 'TestPlugin',
        platform: 'Win64',
        configuration: 'Development'
      };

      const result = await handlePipelineTools('package_mod', args, mockTools);
      expect((result as Record<string, unknown>).success).toBe(true);
    });
  });
});
