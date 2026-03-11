import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleInspectTools, normalizeInspectAction } from '../../../src/tools/handlers/inspect-handlers';

describe('Inspect Handlers', () => {
    let mockTools: any;

    beforeEach(() => {
        mockTools = {
            automationBridge: {
                isConnected: vi.fn().mockReturnValue(true),
                sendAutomationRequest: vi.fn().mockImplementation(async (_toolName: string, args: Record<string, unknown>) => {
                    const action = String(args.action ?? '');

                    if (action === 'get_viewport_info') {
                        return { success: true, actualWorldType: 'pie', hasActiveViewport: true, width: 1920, height: 1080 };
                    }
                    if (action === 'get_world_settings') {
                        return { success: true, actualWorldType: 'pie', worldName: 'PIE_World' };
                    }
                    if (action === 'get_scene_stats') {
                        return { success: true, actorCount: 42, componentCount: 128 };
                    }
                    if (action === 'get_performance_stats') {
                        return { success: true, approximateFps: 60 };
                    }
                    if (action === 'get_memory_stats') {
                        return { success: true, usedPhysicalMB: 1024 };
                    }
                    if (action === 'inspect_object') {
                        return { success: true, className: 'StaticMesh', objectPath: args.objectPath };
                    }
                    if (action === 'get_property' && args.objectPath === '/Game/Meshes/SM_Source.SM_Source' && args.propertyName === 'StaticMaterials') {
                        return { success: true, value: [{ slotName: 'A' }, { slotName: 'B' }] };
                    }
                    if (action === 'get_property' && args.objectPath === '/Game/Meshes/SM_Replacement.SM_Replacement' && args.propertyName === 'StaticMaterials') {
                        return { success: true, value: [{ slotName: 'A' }] };
                    }
                    if (action === 'get_property' && args.propertyName === 'NaniteSettings') {
                        return {
                            success: true,
                            value: args.objectPath === '/Game/Meshes/SM_Source.SM_Source'
                                ? { Enabled: true }
                                : { Enabled: false }
                        };
                    }

                    return { success: true };
                })
            }
        };
    });

    it('normalizes new inspect aliases', () => {
        expect(normalizeInspectAction('describe_class')).toBe('inspect_class');
        expect(normalizeInspectAction('validate_mod_runtime')).toBe('verify_mod_runtime');
    });

    it('builds a viewport render summary from native inspect actions', async () => {
        const result = await handleInspectTools('get_viewport_render_summary', { worldType: 'pie' }, mockTools);

        expect(result.success).toBe(true);
        expect(result.actualWorldType).toBe('pie');
        expect((result.viewport as Record<string, unknown>).width).toBe(1920);
        expect((result.performance as Record<string, unknown>).approximateFps).toBe(60);
    });

    it('emits issues for incompatible replacement meshes', async () => {
        const result = await handleInspectTools('validate_replacement_compatibility', {
            sourceMeshPath: '/Game/Meshes/SM_Source.SM_Source',
            replacementMeshPath: '/Game/Meshes/SM_Replacement.SM_Replacement'
        }, mockTools);

        expect(result.success).toBe(false);
        expect(Array.isArray(result.issues)).toBe(true);
        expect((result.issues as Array<Record<string, unknown>>).length).toBeGreaterThan(0);
    });
});
