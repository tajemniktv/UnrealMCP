import { describe, expect, it, vi } from 'vitest';
import { handleAssetTools } from '../../../src/tools/handlers/asset-handlers';

describe('Asset Handlers', () => {
  const createMockTools = () => ({
    automationBridge: {
      isConnected: vi.fn().mockReturnValue(true),
      sendAutomationRequest: vi.fn().mockResolvedValue({
        success: true,
        assets: [
          { path: '/TajsGraph/Blueprints/BP_RootGameInstance_TajsGraph.BP_RootGameInstance_TajsGraph' },
          { path: '/Game/Blueprints/BP_Unrelated.BP_Unrelated' }
        ]
      })
    }
  });

  it('enforces strict mount-root scoping for search_assets', async () => {
    const tools = createMockTools() as any;

    const result = await handleAssetTools('search_assets', {
      mountRoot: '/TajsGraph',
      scopeMode: 'strict',
      recursivePaths: true
    }, tools);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect((result.assets as Array<Record<string, unknown>>)[0]?.path).toBe('/TajsGraph/Blueprints/BP_RootGameInstance_TajsGraph.BP_RootGameInstance_TajsGraph');
    expect((result.effectiveSearchScope as Record<string, unknown>).scopeMode).toBe('strict');
  });

  it('prefers in-scope assets first when scopeMode is prefer', async () => {
    const tools = createMockTools() as any;

    const result = await handleAssetTools('search_assets', {
      mountRoot: '/TajsGraph',
      scopeMode: 'prefer',
      recursivePaths: true
    }, tools);

    expect(result.success).toBe(true);
    expect((result.assets as Array<Record<string, unknown>>)[0]?.path).toContain('/TajsGraph/');
  });

  it('uses python fallback for scoped asset discovery when explicitly requested', async () => {
    const tools = {
      ...createMockTools(),
      bridge: {
        executeEditorFunction: vi.fn().mockResolvedValue({
          success: true,
          items: ['/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig']
        })
      }
    } as any;

    const result = await handleAssetTools('search_assets', {
      mountRoot: '/TajsGraph',
      preferPythonFallback: true,
      scopeMode: 'strict'
    }, tools);

    expect(result.success).toBe(true);
    expect(result.pythonFallback).toBe(true);
    expect((result.effectiveSearchScope as Record<string, unknown>).transport).toBe('python_template');
    expect(tools.bridge.executeEditorFunction).toHaveBeenCalled();
  });
});
