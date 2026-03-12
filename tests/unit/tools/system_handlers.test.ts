import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSystemTools } from '../../../src/tools/handlers/system-handlers';
import * as pythonFallback from '../../../src/python-fallback';

describe('System Handlers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const automationStatus = {
        enabled: true,
        host: '127.0.0.1',
        port: 8091,
        configuredPorts: [8090, 8091],
        listeningPorts: [],
        connected: false,
        connectedAt: null,
        activePort: null,
        negotiatedProtocol: null,
        supportedProtocols: ['mcp-automation-bridge-v1'],
        supportedOpcodes: ['automation_request'],
        expectedResponseOpcodes: ['automation_response'],
        capabilityTokenRequired: true,
        lastHandshakeAt: null,
        lastHandshakeMetadata: null,
        lastHandshakeAck: null,
        lastHandshakeFailure: { reason: 'missing capability token', at: '2026-03-11T10:00:00.000Z' },
        lastDisconnect: null,
        lastError: null,
        lastMessageAt: null,
        lastRequestSentAt: null,
        pendingRequests: 0,
        pendingRequestDetails: [],
        connections: [],
        webSocketListening: false,
        serverLegacyEnabled: false,
        serverName: 'unreal-engine-mcp-server',
        serverVersion: '0.5.18',
        maxConcurrentConnections: 1,
        maxPendingRequests: 32,
        heartbeatIntervalMs: 30000
    };

    const createMockTools = () => ({
        automationBridge: {
            isConnected: vi.fn().mockReturnValue(false),
            sendAutomationRequest: vi.fn(),
            getStatus: vi.fn().mockReturnValue(automationStatus)
        },
        bridge: {
            isConnected: false,
            getEngineVersion: vi.fn().mockResolvedValue({ version: '5.7.0', major: 5, minor: 7, patch: 0, isUE56OrAbove: true }),
            getFeatureFlags: vi.fn().mockResolvedValue({ subsystems: { unrealEditor: true, levelEditor: true, editorActor: true } }),
            executeEditorFunction: vi.fn().mockResolvedValue({ success: true, pythonPluginEnabled: true, templates: ['list_selected_assets'] })
        }
    });

    it('returns combined bridge status', async () => {
        const result = await handleSystemTools('get_bridge_status', {}, createMockTools() as any);

        expect(result.success).toBe(true);
        expect((result.automationBridge as Record<string, unknown>).host).toBe('127.0.0.1');
        expect((result.tools as Record<string, unknown>).totalTools).toBeGreaterThan(0);
    });

    it('reports transport self-check findings when disconnected', async () => {
        const result = await handleSystemTools('transport_self_check', {}, createMockTools() as any);

        expect(result.success).toBe(false);
        expect(Array.isArray(result.issues)).toBe(true);
        expect((result.issues as Array<Record<string, unknown>>).some((issue) => issue.code === 'AUTOMATION_BRIDGE_DISCONNECTED')).toBe(true);
        expect(Array.isArray(result.remediation)).toBe(true);
    });

    it('reports python fallback status even when disabled by configuration', async () => {
        const result = await handleSystemTools('get_python_fallback_status', {}, createMockTools() as any);

        expect(result.success).toBe(true);
        expect(Array.isArray(result.templates)).toBe(true);
        expect(result.enabled).toBe(false);
        expect(result.unsafeEnabled).toBe(false);
    });

    it('blocks python template execution when the scaffold is disabled', async () => {
        const result = await handleSystemTools('run_python_template', { template: 'list_selected_assets' }, createMockTools() as any);

        expect(result.success).toBe(false);
        expect(result.error).toBe('PYTHON_FALLBACK_DISABLED');
    });

    it('blocks unsafe python code execution when unsafe mode is disabled', async () => {
        const result = await handleSystemTools('run_python_code', { code: 'result = {"success": True}' }, createMockTools() as any);

        expect(result.success).toBe(false);
        expect(result.error).toBe('PYTHON_FALLBACK_UNSAFE_DISABLED');
    });

    it('blocks unsafe python file execution when unsafe mode is disabled', async () => {
        const result = await handleSystemTools('run_python_file', { filePath: 'C:/temp/test.py' }, createMockTools() as any);

        expect(result.success).toBe(false);
        expect(result.error).toBe('PYTHON_FALLBACK_UNSAFE_DISABLED');
    });

    it('accepts legacy aliases for python code execution arguments', async () => {
        vi.spyOn(pythonFallback, 'getPythonFallbackConfig').mockReturnValue({
            enabled: true,
            unsafeEnabled: true,
            timeoutMs: 15000,
            templates: [...pythonFallback.PYTHON_TEMPLATE_NAMES]
        });

        const tools = createMockTools() as any;
        const result = await handleSystemTools('run_python_code', { script: 'result = {"success": True}' }, tools);

        expect(result.success).toBe(true);
        expect(tools.bridge.executeEditorFunction).toHaveBeenCalledWith(
            'RUN_PYTHON_CODE',
            expect.objectContaining({
                code: 'result = {"success": True}',
                resultVariable: 'result'
            }),
            expect.anything()
        );
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('');
        expect(Array.isArray(result.artifacts)).toBe(true);
    });

    it('forwards structured params for python code execution', async () => {
        vi.spyOn(pythonFallback, 'getPythonFallbackConfig').mockReturnValue({
            enabled: true,
            unsafeEnabled: true,
            timeoutMs: 15000,
            templates: [...pythonFallback.PYTHON_TEMPLATE_NAMES]
        });

        const tools = createMockTools() as any;
        const result = await handleSystemTools('run_python_code', {
            code: 'result = {"success": True, "echo": mcp_params}',
            params: { assetPath: '/Game/TestAsset', recursive: true }
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.bridge.executeEditorFunction).toHaveBeenCalledWith(
            'RUN_PYTHON_CODE',
            expect.objectContaining({
                code: 'result = {"success": True, "echo": mcp_params}',
                scriptParams: {
                    assetPath: '/Game/TestAsset',
                    recursive: true
                }
            }),
            expect.anything()
        );
    });

    it('accepts path alias for python file execution arguments', async () => {
        vi.spyOn(pythonFallback, 'getPythonFallbackConfig').mockReturnValue({
            enabled: true,
            unsafeEnabled: true,
            timeoutMs: 15000,
            templates: [...pythonFallback.PYTHON_TEMPLATE_NAMES]
        });

        const tools = createMockTools() as any;
        const result = await handleSystemTools('run_python_file', { path: 'C:/temp/test.py' }, tools);

        expect(result.success).toBe(true);
        expect(tools.bridge.executeEditorFunction).toHaveBeenCalledWith(
            'RUN_PYTHON_FILE',
            expect.objectContaining({
                filePath: 'C:/temp/test.py',
                resultVariable: 'result'
            }),
            expect.anything()
        );
    });

    it('merges template fallback fields into template params', async () => {
        vi.spyOn(pythonFallback, 'getPythonFallbackConfig').mockReturnValue({
            enabled: true,
            unsafeEnabled: true,
            timeoutMs: 15000,
            templates: [...pythonFallback.PYTHON_TEMPLATE_NAMES]
        });

        const tools = createMockTools() as any;
        const result = await handleSystemTools('run_python_template', {
            template: 'find_assets_by_class',
            path: '/Game/Test',
            recursive: true,
            className: 'StaticMesh',
            params: { extraFilter: 'demo' }
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.bridge.executeEditorFunction).toHaveBeenCalledWith(
            'RUN_PYTHON_TEMPLATE',
            expect.objectContaining({
                templateName: 'find_assets_by_class',
                templateParams: {
                    path: '/Game/Test',
                    recursive: true,
                    className: 'StaticMesh',
                    extraFilter: 'demo'
                }
            }),
            expect.anything()
        );
    });

    it('wraps run_editor_utility through the python template path', async () => {
        vi.spyOn(pythonFallback, 'getPythonFallbackConfig').mockReturnValue({
            enabled: true,
            unsafeEnabled: true,
            timeoutMs: 15000,
            templates: [...pythonFallback.PYTHON_TEMPLATE_NAMES]
        });

        const tools = createMockTools() as any;
        const result = await handleSystemTools('run_editor_utility', {
            path: '/Game/EditorUtilities/EUW_Test.EUW_Test'
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.bridge.executeEditorFunction).toHaveBeenCalledWith(
            'RUN_PYTHON_TEMPLATE',
            expect.objectContaining({
                templateName: 'run_editor_utility',
                templateParams: {
                    path: '/Game/EditorUtilities/EUW_Test.EUW_Test'
                }
            }),
            expect.anything()
        );
    });

    it('wraps audit_assets_in_path through the python template path', async () => {
        vi.spyOn(pythonFallback, 'getPythonFallbackConfig').mockReturnValue({
            enabled: true,
            unsafeEnabled: true,
            timeoutMs: 15000,
            templates: [...pythonFallback.PYTHON_TEMPLATE_NAMES]
        });

        const tools = createMockTools() as any;
        const result = await handleSystemTools('audit_assets_in_path', {
            path: '/Game/Test',
            recursive: true,
            className: 'StaticMesh',
            limit: 25
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.bridge.executeEditorFunction).toHaveBeenCalledWith(
            'RUN_PYTHON_TEMPLATE',
            expect.objectContaining({
                templateName: 'audit_assets_in_path',
                templateParams: {
                    path: '/Game/Test',
                    recursive: true,
                    className: 'StaticMesh',
                    limit: 25
                }
            }),
            expect.anything()
        );
    });

    it('wraps list_assets_by_mount_root through the python template path', async () => {
        vi.spyOn(pythonFallback, 'getPythonFallbackConfig').mockReturnValue({
            enabled: true,
            unsafeEnabled: true,
            timeoutMs: 15000,
            templates: [...pythonFallback.PYTHON_TEMPLATE_NAMES]
        });

        const tools = createMockTools() as any;
        const result = await handleSystemTools('list_assets_by_mount_root', {
            mountRoot: '/TajsGraph',
            recursive: true
        }, tools);

        expect(result.success).toBe(true);
        expect(tools.bridge.executeEditorFunction).toHaveBeenCalledWith(
            'RUN_PYTHON_TEMPLATE',
            expect.objectContaining({
                templateName: 'list_assets_by_mount_root',
                templateParams: {
                    mountRoot: '/TajsGraph',
                    path: '/TajsGraph',
                    recursive: true
                }
            }),
            expect.anything()
        );
    });
});
