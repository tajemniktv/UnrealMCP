import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginDescriptorSummary, ProjectContextSummary } from '../../../src/tools/handlers/modding-utils.js';

const mockedPluginDescriptor: PluginDescriptorSummary = {
    mountRoot: '/McpAutomationBridge',
    pluginName: 'McpAutomationBridge',
    pluginPath: 'E:/MockProject/Plugins/McpAutomationBridge',
    pluginFile: 'E:/MockProject/Plugins/McpAutomationBridge/McpAutomationBridge.uplugin',
    contentRoot: 'E:/MockProject/Plugins/McpAutomationBridge/Content',
    sourceRoot: 'E:/MockProject/Plugins/McpAutomationBridge/Source',
    type: 'plugin',
    descriptor: {
        FriendlyName: 'MCP Automation Bridge',
        VersionName: '0.1.1',
        CanContainContent: true,
        Modules: [{ Name: 'McpAutomationBridge', Type: 'Editor' }]
    }
};

const mockedProjectContext: ProjectContextSummary = {
    repoRoot: 'E:/MockProject',
    projectFile: 'E:/MockProject/FactoryGame.uproject',
    projectName: 'FactoryGame'
};

vi.mock('../../../src/tools/handlers/modding-utils.js', async () => {
    const actual = await vi.importActual<typeof import('../../../src/tools/handlers/modding-utils.js')>('../../../src/tools/handlers/modding-utils.js');
    return {
        ...actual,
        findProjectContext: vi.fn(() => mockedProjectContext),
        findPluginDescriptorByRoot: vi.fn((_projectRoot: string, mountRoot: string | undefined) =>
            mountRoot?.toLowerCase() === mockedPluginDescriptor.mountRoot.toLowerCase() ? mockedPluginDescriptor : undefined
        ),
        findPluginDescriptorByName: vi.fn((_projectRoot: string, pluginName: string | undefined) =>
            pluginName?.toLowerCase() === mockedPluginDescriptor.pluginName.toLowerCase() ? mockedPluginDescriptor : undefined
        ),
        listPluginDescriptors: vi.fn(() => [mockedPluginDescriptor]),
        listTargetFiles: vi.fn(() => [{ name: 'FactoryGameEditor', path: 'E:/MockProject/Source/FactoryGameEditor.Target.cs' }]),
        summarizeDescriptor: vi.fn(() => ({
            mountRoot: mockedPluginDescriptor.mountRoot,
            pluginName: mockedPluginDescriptor.pluginName,
            pluginPath: mockedPluginDescriptor.pluginPath,
            pluginFile: mockedPluginDescriptor.pluginFile,
            contentRoot: mockedPluginDescriptor.contentRoot,
            sourceRoot: mockedPluginDescriptor.sourceRoot,
            type: mockedPluginDescriptor.type,
            friendlyName: 'MCP Automation Bridge',
            versionName: '0.1.1',
            canContainContent: true,
            modules: [{ Name: 'McpAutomationBridge', Type: 'Editor' }],
            plugins: []
        }))
    };
});

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
                    if (action === 'get_mod_config_tree') {
                        return {
                            success: true,
                            tree: {
                                key: 'RootSection',
                                kind: 'section',
                                children: [
                                    {
                                        key: 'Graphics',
                                        kind: 'section',
                                        children: [
                                            {
                                                key: 'EnableFancyThing',
                                                kind: 'bool',
                                                value: true,
                                                displayName: 'Enable Fancy Thing',
                                                tooltip: 'Toggle fancy rendering',
                                                requiresWorldReload: false,
                                                hidden: false,
                                                path: 'Graphics/EnableFancyThing'
                                            }
                                        ]
                                    }
                                ]
                            }
                        };
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

    it('batches runtime blueprint loadability checks through the inspect bridge', async () => {
        mockTools.automationBridge.sendAutomationRequest.mockImplementation(async (_toolName: string, args: Record<string, unknown>) => {
            if (_toolName === 'asset_query' && args.subAction === 'search_assets') {
                return {
                    success: true,
                    assets: [
                        { path: '/McpAutomationBridge/Config/BP_Config.BP_Config' }
                    ]
                };
            }
            if (_toolName === 'inspect' && args.action === 'batch_inspect_objects') {
                return {
                    success: true,
                    results: [
                        {
                            objectPath: '/McpAutomationBridge/Config/BP_Config.BP_Config_C',
                            success: true,
                            loadable: true,
                            className: 'BlueprintGeneratedClass'
                        }
                    ]
                };
            }
            if (_toolName === 'inspect' && args.action === 'list_objects') {
                return {
                    success: true,
                    objects: [{ name: 'McpAutomationBridgeRuntimeActor' }]
                };
            }
            if (_toolName === 'system_control' && args.action === 'tail_logs') {
                return {
                    success: true,
                    lines: []
                };
            }
            return { success: true };
        });

        const result = await handleInspectTools('verify_mod_runtime', {
            pluginName: 'McpAutomationBridge'
        }, mockTools);

        expect(result.success).toBe(true);
        expect((result.configChecks as Array<Record<string, unknown>>)[0]?.target).toBe('/McpAutomationBridge/Config/BP_Config.BP_Config_C');
        expect(result.widgetChecks).toEqual([]);

        const calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        const batchCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'batch_inspect_objects');
        expect(batchCall).toBeTruthy();
        expect(batchCall[1]?.objectPaths).toEqual([
            '/McpAutomationBridge/Config/BP_Config.BP_Config_C'
        ]);

        const perItemChecks = calls.filter((entry: unknown[]) =>
            entry[0] === 'inspect' &&
            (entry[1]?.action === 'inspect_object' || entry[1]?.action === 'verify_class_loadability' || entry[1]?.action === 'verify_widget_loadability')
        );
        expect(perItemChecks).toEqual([]);
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

    it('forwards config root class replacement to the inspect bridge', async () => {
        await handleInspectTools('set_mod_config_root_class', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            classPath: '/SML/Interface/UI/Menu/Mods/ConfigProperties/BP_ConfigPropertySection.BP_ConfigPropertySection_C'
        }, mockTools);

        const calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        const inspectCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'set_mod_config_root_class');
        expect(inspectCall).toBeTruthy();
    });

    it('forwards section class replacement to the inspect bridge', async () => {
        await handleInspectTools('replace_mod_config_section_class', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            section: 'Graphics/Advanced',
            classPath: '/SML/Interface/UI/Menu/Mods/ConfigProperties/BP_ConfigPropertySection.BP_ConfigPropertySection_C'
        }, mockTools);

        const calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        const inspectCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'replace_mod_config_section_class');
        expect(inspectCall).toBeTruthy();
    });

    it('forwards config widget-class repair options to the inspect bridge', async () => {
        await handleInspectTools('repair_mod_config_widget_classes', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            dryRun: true,
            plainOnly: true,
            rewriteSections: true,
            rewriteProperties: true,
            sections: ['Graphics', 'Graphics/Advanced'],
            properties: ['Graphics/EnableFancyThing', 'Graphics/Advanced/ShadowSteps']
        }, mockTools);

        const calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        const inspectCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'repair_mod_config_widget_classes');
        expect(inspectCall).toBeTruthy();
        expect(inspectCall[1]?.dryRun).toBe(true);
        expect(inspectCall[1]?.sections).toEqual(['Graphics', 'Graphics/Advanced']);
        expect(inspectCall[1]?.properties).toEqual(['Graphics/EnableFancyThing', 'Graphics/Advanced/ShadowSteps']);
    });

    it('forwards repair_mod_config_tree selectors to the inspect bridge', async () => {
        await handleInspectTools('repair_mod_config_tree', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            dryRun: false,
            sectionPrefixes: ['Graphics'],
            propertyPrefixes: ['Graphics/Advanced']
        }, mockTools);

        const calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        const inspectCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'repair_mod_config_tree');
        expect(inspectCall).toBeTruthy();
        expect(inspectCall[1]?.sectionPrefixes).toEqual(['Graphics']);
        expect(inspectCall[1]?.propertyPrefixes).toEqual(['Graphics/Advanced']);
    });

    it('forces dryRun when diff_mod_config_tree is requested', async () => {
        await handleInspectTools('diff_mod_config_tree', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            dryRun: false
        }, mockTools);

        const calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        const inspectCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'diff_mod_config_tree');
        expect(inspectCall).toBeTruthy();
        expect(inspectCall[1]?.dryRun).toBe(true);
    });

    it('lists flattened mod-config properties through the dedicated schema-style alias', async () => {
        const result = await handleInspectTools('list_mod_config_properties', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig'
        }, mockTools);

        expect(result.success).toBe(true);
        expect(result.count).toBe(1);
        expect((result.properties as Array<Record<string, unknown>>)[0]?.path).toBe('Graphics/EnableFancyThing');
    });

    it('falls back across blueprint variants for mod-config tree reads', async () => {
        mockTools.automationBridge.sendAutomationRequest.mockImplementation(async (_toolName: string, args: Record<string, unknown>) => {
            if (args.action === 'get_mod_config_tree' && args.objectPath === '/Game/Test/BP_Config.BP_Config') {
                return { success: false, error: 'BLUEPRINT_NOT_FOUND' };
            }
            if (args.action === 'get_mod_config_tree' && args.objectPath === '/Game/Test/BP_Config.BP_Config_C') {
                return {
                    success: true,
                    tree: {
                        key: 'RootSection',
                        kind: 'section',
                        children: []
                    }
                };
            }
            return { success: true };
        });

        const result = await handleInspectTools('get_mod_config_tree', {
            objectPath: '/Game/Test/BP_Config.BP_Config'
        }, mockTools);

        expect(result.success).toBe(true);
        expect((result.tree as Record<string, unknown>).key).toBe('RootSection');
    });

    it('forwards live bridge capability checks to the inspect bridge', async () => {
        await handleInspectTools('check_live_bridge_capabilities', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig'
        }, mockTools);

        const calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        const inspectCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'check_live_bridge_capabilities');
        expect(inspectCall).toBeTruthy();
    });

    it('builds a Blueprint-aware asset inspection summary', async () => {
        mockTools.automationBridge.sendAutomationRequest.mockImplementation(async (_toolName: string, args: Record<string, unknown>) => {
            if (_toolName === 'blueprint_get') {
                return {
                    success: true,
                    variables: [{ name: 'ConfigSubsystem' }],
                    functions: [{ name: 'ApplyManagedPPVFromModConfig' }]
                };
            }
            if (_toolName === 'manage_blueprint_graph' && args.subAction === 'list_graphs') {
                return {
                    success: true,
                    graphs: [{ graphName: 'EventGraph', graphPath: '/Game/Test/BP_Test:EventGraph', isNestedGraph: false }]
                };
            }
            if (_toolName === 'manage_blueprint_graph' && args.subAction === 'get_graph_details') {
                return {
                    success: true,
                    graphName: 'EventGraph',
                    graphPath: '/Game/Test/BP_Test:EventGraph',
                    nodeCount: 3,
                    commentGroups: [{ commentNodeId: 'CommentA' }],
                    nodes: [{ connectionSummary: { totalLinkCount: 2 } }]
                };
            }
            if (args.action === 'inspect_object') {
                return { success: true, objectPath: args.objectPath, className: 'BlueprintGeneratedClass' };
            }
            return { success: true };
        });

        const result = await handleInspectTools('inspect_blueprint_asset', {
            objectPath: '/Game/Test/BP_Test.BP_Test'
        }, mockTools);

        expect(result.success).toBe(true);
        expect(result.graphCount).toBe(1);
        expect(Array.isArray(result.graphSummaries)).toBe(true);
        expect((result.graphSummaries as Array<Record<string, unknown>>)[0]?.nodeCount).toBe(3);
    });

    it('emits categorized mod-config issues from the live tree', async () => {
        mockTools.automationBridge.sendAutomationRequest.mockImplementation(async (_toolName: string, args: Record<string, unknown>) => {
            if (args.action === 'get_mod_config_tree') {
                return {
                    success: true,
                    tree: {
                        key: 'RootSection',
                        kind: 'section',
                        children: [
                            {
                                key: 'Graphics',
                                kind: 'section',
                                children: [
                                    {
                                        key: 'ShadowSteps',
                                        kind: 'int',
                                        value: 8,
                                        path: 'Graphics/ShadowSteps',
                                        classPath: '/Script/SML.ConfigPropertyInteger'
                                    }
                                ]
                            }
                        ]
                    }
                };
            }
            return { success: true };
        });

        const result = await handleInspectTools('validate_mod_config', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig'
        }, mockTools);

        expect(result.success).toBe(true);
        expect(Array.isArray(result.issues)).toBe(true);
        expect((result.issues as Array<Record<string, unknown>>).some((issue) => issue.category === 'missing_display_name')).toBe(true);
        expect((result.issues as Array<Record<string, unknown>>).some((issue) => issue.category === 'plain_base_class')).toBe(true);
    });

    it('diffs the live mod config tree against an expected descriptor list', async () => {
        const result = await handleInspectTools('diff_mod_config_expected_descriptor', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            descriptorEntries: [
                {
                    key: 'Graphics.EnableFancyThing',
                    kind: 'bool',
                    value: false,
                    displayName: 'Enable Fancy Thing',
                    tooltip: 'Toggle fancy rendering',
                    requiresWorldReload: false,
                    hidden: false
                },
                {
                    key: 'Graphics.ShadowSteps',
                    kind: 'int',
                    value: 8,
                    displayName: 'Shadow Steps',
                    tooltip: 'Step count'
                }
            ]
        }, mockTools);

        expect(result.success).toBe(true);
        expect(result.missingCount).toBe(1);
        expect(result.mismatchedCount).toBe(1);
        expect((result.missing as Array<Record<string, unknown>>)[0]?.key).toBe('Graphics.ShadowSteps');
        expect((result.mismatched as Array<Record<string, unknown>>)[0]?.key).toBe('Graphics.EnableFancyThing');
    });

    it('backfills missing descriptor entries into the mod config tree', async () => {
        const result = await handleInspectTools('backfill_mod_config_from_descriptor', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            descriptorEntries: [
                {
                    key: 'Graphics.ShadowSteps',
                    kind: 'int',
                    value: 8,
                    displayName: 'Shadow Steps',
                    tooltip: 'Step count',
                    requiresWorldReload: true
                }
            ],
            saveAfterApply: true
        }, mockTools);

        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(1);

        const calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        const upsertCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'upsert_mod_config_property');
        expect(upsertCall).toBeTruthy();
        expect(upsertCall[1]?.section).toBe('Graphics');
        expect(upsertCall[1]?.key).toBe('ShadowSteps');
        expect(upsertCall[1]?.propertyType).toBe('int');

        const saveCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'save_mod_config');
        expect(saveCall).toBeTruthy();
    });

    it('only rewrites mismatches when rewriteProperties is enabled', async () => {
        await handleInspectTools('backfill_mod_config_from_descriptor', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            descriptorEntries: [
                {
                    key: 'Graphics.EnableFancyThing',
                    kind: 'bool',
                    value: false,
                    displayName: 'Enable Fancy Thing',
                    tooltip: 'Toggle fancy rendering'
                }
            ],
            rewriteProperties: false
        }, mockTools);

        let calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        let upsertCalls = calls.filter((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'upsert_mod_config_property');
        expect(upsertCalls.length).toBe(0);

        (mockTools.automationBridge.sendAutomationRequest as any).mockClear();

        await handleInspectTools('backfill_mod_config_from_descriptor', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            descriptorEntries: [
                {
                    key: 'Graphics.EnableFancyThing',
                    kind: 'bool',
                    value: false,
                    displayName: 'Enable Fancy Thing',
                    tooltip: 'Toggle fancy rendering'
                }
            ],
            rewriteProperties: true
        }, mockTools);

        calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        upsertCalls = calls.filter((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'upsert_mod_config_property');
        expect(upsertCalls.length).toBe(1);
        expect(upsertCalls[0][1]?.key).toBe('EnableFancyThing');
    });

    it('runs a combined mod-config migration workflow from descriptor input', async () => {
        const result = await handleInspectTools('migrate_mod_config_from_descriptor', {
            objectPath: '/TajsGraph/Config/TajsGraph_ModConfig.TajsGraph_ModConfig',
            descriptorEntries: [
                {
                    key: 'Graphics.ShadowSteps',
                    kind: 'int',
                    value: 8,
                    displayName: 'Shadow Steps',
                    tooltip: 'Step count',
                    requiresWorldReload: true
                }
            ],
            sectionPrefixes: ['Graphics'],
            rewriteProperties: true,
            saveAfterApply: true
        }, mockTools);

        expect(result.success).toBe(true);
        expect((result.capabilityCheck as Record<string, unknown>).success).toBe(true);
        expect((result.repairResult as Record<string, unknown>).success).toBe(true);
        expect((result.backfillResult as Record<string, unknown>).success).toBe(true);
        expect((result.saveResult as Record<string, unknown>).success).toBe(true);

        const calls = (mockTools.automationBridge.sendAutomationRequest as any).mock.calls;
        const repairCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'repair_mod_config_tree');
        const capabilityCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'check_live_bridge_capabilities');
        const saveCall = calls.find((entry: unknown[]) => entry[0] === 'inspect' && entry[1]?.action === 'save_mod_config');

        expect(capabilityCall).toBeTruthy();
        expect(repairCall).toBeTruthy();
        expect(saveCall).toBeTruthy();
        expect(repairCall[1]?.sectionPrefixes).toEqual(['Graphics']);
    });
});
