import { describe, expect, it, vi } from 'vitest';
import { handleBlueprintTools } from '../../../src/tools/handlers/blueprint-handlers';

describe('Blueprint Handlers', () => {
    const createMockTools = () => ({
        automationBridge: {
            isConnected: vi.fn().mockReturnValue(true),
            sendAutomationRequest: vi.fn().mockResolvedValue({ success: true, message: 'ok' })
        }
    });

    it('normalizes human-friendly connect_pins arguments', async () => {
        const tools = createMockTools() as any;

        const result = await handleBlueprintTools('connect_pins', {
            blueprintPath: '/Game/Test/BP_Test',
            sourceNode: 'NodeA',
            sourcePin: 'Then',
            targetNode: 'NodeB',
            targetPin: 'Execute'
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.automationBridge.sendAutomationRequest).toHaveBeenCalledWith(
            'manage_blueprint_graph',
            expect.objectContaining({
                subAction: 'connect_pins',
                blueprintPath: '/Game/Test/BP_Test',
                assetPath: '/Game/Test/BP_Test',
                fromNodeId: 'NodeA',
                fromPinName: 'Then',
                toNodeId: 'NodeB',
                toPinName: 'Execute'
            }),
            {}
        );
    });

    it('supports Node.Pin shorthand for connect_pins', async () => {
        const tools = createMockTools() as any;

        const result = await handleBlueprintTools('connect_pins', {
            blueprintPath: '/Game/Test/BP_Test',
            sourceNode: 'NodeA.Then',
            targetNode: 'NodeB.Execute'
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.automationBridge.sendAutomationRequest).toHaveBeenCalledWith(
            'manage_blueprint_graph',
            expect.objectContaining({
                fromNodeId: 'NodeA',
                fromPinName: 'Then',
                toNodeId: 'NodeB',
                toPinName: 'Execute'
            }),
            {}
        );
    });

    it('returns a clear validation error when connect_pins is underspecified', async () => {
        const tools = createMockTools() as any;

        const result = await handleBlueprintTools('connect_pins', {
            blueprintPath: '/Game/Test/BP_Test',
            sourceNode: 'NodeA'
        }, tools);

        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_CONNECT_PINS_ARGUMENTS');
        expect(String(result.message)).toContain('Missing source pin');
        expect(tools.automationBridge.sendAutomationRequest).not.toHaveBeenCalled();
    });

    it('executes batch_graph_actions with shared blueprint context', async () => {
        const tools = createMockTools() as any;

        const result = await handleBlueprintTools('batch_graph_actions', {
            blueprintPath: '/Game/Test/BP_Test',
            graphName: 'EventGraph',
            actions: [
                { label: 'create-knot', action: 'create_reroute_node', args: { x: 100, y: 200 } },
                { label: 'comment-node', action: 'set_node_property', args: { nodeId: 'Node123', propertyName: 'Comment', value: 'demo' } }
            ]
        }, tools);

        expect(result.success).toBe(true);
        expect(result.actionCount).toBe(2);
        expect(Array.isArray(result.results)).toBe(true);
        expect((result.sharedResults as Record<string, unknown>)['create-knot']).toBeTruthy();
        expect((result.sharedResults as Record<string, unknown>)['comment-node']).toBeTruthy();
        expect(tools.automationBridge.sendAutomationRequest).toHaveBeenNthCalledWith(
            1,
            'manage_blueprint_graph',
            expect.objectContaining({
                subAction: 'create_reroute_node',
                blueprintPath: '/Game/Test/BP_Test',
                graphName: 'EventGraph',
                x: 100,
                y: 200
            }),
            {}
        );
        expect(tools.automationBridge.sendAutomationRequest).toHaveBeenNthCalledWith(
            2,
            'manage_blueprint_graph',
            expect.objectContaining({
                subAction: 'set_node_property',
                blueprintPath: '/Game/Test/BP_Test',
                graphName: 'EventGraph',
                nodeId: 'Node123',
                propertyName: 'Comment',
                value: 'demo'
            }),
            {}
        );
    });

    it('stops batch_graph_actions on error by default', async () => {
        const tools = createMockTools() as any;
        tools.automationBridge.sendAutomationRequest
            .mockResolvedValueOnce({ success: true, message: 'ok' })
            .mockResolvedValueOnce({ success: false, error: 'NODE_NOT_FOUND', message: 'missing node' });

        const result = await handleBlueprintTools('batch_graph_actions', {
            blueprintPath: '/Game/Test/BP_Test',
            actions: [
                { action: 'create_reroute_node', args: { x: 100, y: 200 } },
                { action: 'delete_node', args: { nodeId: 'MissingNode' } },
                { action: 'create_reroute_node', args: { x: 300, y: 400 } }
            ]
        }, tools);

        expect(result.success).toBe(false);
        expect(result.error).toBe('BATCH_ACTION_FAILED');
        expect(tools.automationBridge.sendAutomationRequest).toHaveBeenCalledTimes(2);
    });

    it('returns a dry-run plan for batch_graph_actions without executing bridge calls', async () => {
        const tools = createMockTools() as any;

        const result = await handleBlueprintTools('batch_graph_actions', {
            blueprintPath: '/Game/Test/BP_Test',
            dryRun: true,
            actions: [
                { label: 'preview-knot', action: 'create_reroute_node', args: { x: 10, y: 20 } }
            ]
        }, tools);

        expect(result.success).toBe(true);
        expect(result.dryRun).toBe(true);
        expect(Array.isArray(result.plan)).toBe(true);
        expect((result.plan as Array<Record<string, unknown>>)[0]?.label).toBe('preview-knot');
        expect(tools.automationBridge.sendAutomationRequest).not.toHaveBeenCalled();
    });

    it('forwards find_nodes to the blueprint graph bridge action', async () => {
        const tools = createMockTools() as any;

        const result = await handleBlueprintTools('find_nodes', {
            blueprintPath: '/Game/Test/BP_Test',
            query: 'shadow',
            commentTag: 'config-binding',
            includeSubGraphs: true,
            includePins: true
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.automationBridge.sendAutomationRequest).toHaveBeenCalledWith(
            'manage_blueprint_graph',
            expect.objectContaining({
                subAction: 'find_nodes',
                blueprintPath: '/Game/Test/BP_Test',
                query: 'shadow',
                commentTag: 'config-binding',
                includeSubGraphs: true,
                includePins: true
            }),
            {}
        );
    });

    it('forwards list_graphs so collapsed/nested graphs can be discovered', async () => {
        const tools = createMockTools() as any;

        const result = await handleBlueprintTools('list_graphs', {
            blueprintPath: '/Game/Test/BP_Test'
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.automationBridge.sendAutomationRequest).toHaveBeenCalledWith(
            'manage_blueprint_graph',
            expect.objectContaining({
                subAction: 'list_graphs',
                blueprintPath: '/Game/Test/BP_Test',
                assetPath: '/Game/Test/BP_Test'
            }),
            {}
        );
    });

    it('forwards disable_subgraph to the blueprint graph bridge action', async () => {
        const tools = createMockTools() as any;

        const result = await handleBlueprintTools('disable_subgraph', {
            blueprintPath: '/Game/Test/BP_Test',
            commentNodeId: 'Comment123',
            reason: 'legacy path replaced',
            statusTag: 'disabled',
            dryRun: true
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.automationBridge.sendAutomationRequest).toHaveBeenCalledWith(
            'manage_blueprint_graph',
            expect.objectContaining({
                subAction: 'disable_subgraph',
                blueprintPath: '/Game/Test/BP_Test',
                commentNodeId: 'Comment123',
                reason: 'legacy path replaced',
                statusTag: 'disabled',
                dryRun: true
            }),
            {}
        );
    });

    it('retargets a binding cluster by updating its literal nodes', async () => {
        const tools = {
            automationBridge: {
                isConnected: vi.fn().mockReturnValue(true),
                sendAutomationRequest: vi.fn().mockImplementation(async (_toolName: string, args: Record<string, unknown>) => {
                    if (args.subAction === 'list_comment_groups') {
                        return {
                            success: true,
                            commentGroups: [
                                {
                                    commentNodeId: 'Comment123',
                                    nodes: [
                                        { nodeId: 'SectionLiteral', comment: 'Section literal' },
                                        { nodeId: 'PropertyLiteral', comment: 'Property literal' },
                                        { nodeId: 'TypeLiteral', comment: 'Type literal' }
                                    ]
                                }
                            ]
                        };
                    }
                    return { success: true, message: 'ok' };
                })
            }
        } as any;

        const result = await handleBlueprintTools('retarget_binding_cluster', {
            blueprintPath: '/Game/Test/BP_Test',
            commentNodeId: 'Comment123',
            newSection: 'Rendering',
            newPropertyName: 'ShadowSteps',
            newExpectedType: 'int'
        }, tools);

        expect(result.success).toBe(true);
        const calls = tools.automationBridge.sendAutomationRequest.mock.calls;
        const setPinCalls = calls.filter((entry: unknown[]) => entry[1]?.subAction === 'set_pin_default_value');
        expect(setPinCalls.length).toBe(3);
        expect(setPinCalls.some((entry: unknown[]) => entry[1]?.nodeId === 'SectionLiteral' && entry[1]?.value === 'Rendering')).toBe(true);
        expect(setPinCalls.some((entry: unknown[]) => entry[1]?.nodeId === 'PropertyLiteral' && entry[1]?.value === 'ShadowSteps')).toBe(true);
        expect(setPinCalls.some((entry: unknown[]) => entry[1]?.nodeId === 'TypeLiteral' && entry[1]?.value === 'int')).toBe(true);
    });

    it('replaces a binding cluster by duplicating, retargeting, and disabling the original', async () => {
        const tools = {
            automationBridge: {
                isConnected: vi.fn().mockReturnValue(true),
                sendAutomationRequest: vi.fn().mockImplementation(async (_toolName: string, args: Record<string, unknown>) => {
                    if (args.subAction === 'duplicate_subgraph') {
                        return {
                            success: true,
                            oldToNewNodeIds: {
                                CommentOld: 'CommentNew'
                            },
                            duplicatedNodes: [
                                { nodeId: 'CommentNew', nodeType: 'EdGraphNode_Comment' }
                            ]
                        };
                    }
                    if (args.subAction === 'list_comment_groups') {
                        return {
                            success: true,
                            commentGroups: [
                                {
                                    commentNodeId: 'CommentNew',
                                    nodes: [
                                        { nodeId: 'SectionLiteralNew', comment: 'Section literal' },
                                        { nodeId: 'PropertyLiteralNew', comment: 'Property literal' }
                                    ]
                                }
                            ]
                        };
                    }
                    return { success: true, message: 'ok' };
                })
            }
        } as any;

        const result = await handleBlueprintTools('replace_binding_cluster', {
            blueprintPath: '/Game/Test/BP_Test',
            commentNodeId: 'CommentOld',
            newSection: 'Rendering',
            newPropertyName: 'ShadowSteps',
            disableOriginal: true,
            reason: 'migrated'
        }, tools);

        expect(result.success).toBe(true);
        expect(result.duplicatedCommentNodeId).toBe('CommentNew');
        const calls = tools.automationBridge.sendAutomationRequest.mock.calls;
        expect(calls.some((entry: unknown[]) => entry[1]?.subAction === 'duplicate_subgraph')).toBe(true);
        expect(calls.some((entry: unknown[]) => entry[1]?.subAction === 'set_pin_default_value' && entry[1]?.nodeId === 'SectionLiteralNew')).toBe(true);
        expect(calls.some((entry: unknown[]) => entry[1]?.subAction === 'disable_subgraph' && entry[1]?.commentNodeId === 'CommentOld')).toBe(true);
    });
});
