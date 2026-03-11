import { ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { UnrealBridge } from '../unreal-bridge.js';
import { AutomationBridge } from '../automation/index.js';
import { AssetResources } from '../resources/assets.js';
import { ActorResources } from '../resources/actors.js';
import { LevelResources } from '../resources/levels.js';
import { HealthMonitor } from '../services/health-monitor.js';
import { findPluginDescriptorByRoot, findProjectContext, listPluginDescriptors, summarizeDescriptor } from '../tools/handlers/modding-utils.js';
import { dynamicToolManager } from '../tools/dynamic-tool-manager.js';
import { getPythonFallbackConfig } from '../python-fallback.js';

export class ResourceHandler {
  constructor(
    private server: Server,
    private bridge: UnrealBridge,
    private automationBridge: AutomationBridge,
    private assetResources: AssetResources,
    private actorResources: ActorResources,
    private levelResources: LevelResources,
    private healthMonitor: HealthMonitor,
    private ensureConnected: () => Promise<boolean>
  ) { }

  registerHandlers() {
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      if (uri === 'ue://assets') {
        const ok = await this.ensureConnected();
        if (!ok) {
          return { contents: [{ uri, mimeType: 'text/plain', text: 'Unreal Engine not connected (after 3 attempts).' }] };
        }
        const roots = await this.assetResources.getMountedRoots();
        const listings = await Promise.all(roots.map(async (root) => ({
          root,
          listing: await this.assetResources.list(root, true)
        })));
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ mountedRoots: roots, roots: listings }, null, 2)
          }]
        };
      }

      if (uri === 'ue://mods') {
        const context = findProjectContext();
        const mods = listPluginDescriptors(context.repoRoot).map((descriptor) => summarizeDescriptor(descriptor));
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              projectFile: context.projectFile,
              projectName: context.projectName,
              mods
            }, null, 2)
          }]
        };
      }

      if (uri.startsWith('ue://mods/')) {
        const rawRoot = decodeURIComponent(uri.substring('ue://mods/'.length));
        const mountRoot = rawRoot.startsWith('/') ? rawRoot : `/${rawRoot}`;
        const context = findProjectContext();
        const plugin = findPluginDescriptorByRoot(context.repoRoot, mountRoot);

        if (!plugin) {
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                success: false,
                error: 'MOD_NOT_FOUND',
                mountRoot,
                message: `No mod/plugin descriptor found for mount root ${mountRoot}`
              }, null, 2)
            }]
          };
        }

        const ok = await this.ensureConnected();
        const assets = ok ? await this.assetResources.list(mountRoot, true) : [];
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              success: true,
              mod: summarizeDescriptor(plugin),
              mountedRoot: mountRoot,
              connectedToUnreal: ok,
              assets
            }, null, 2)
          }]
        };
      }

      if (uri === 'ue://actors') {
        const ok = await this.ensureConnected();
        if (!ok) {
          return { contents: [{ uri, mimeType: 'text/plain', text: 'Unreal Engine not connected (after 3 attempts).' }] };
        }
        const list = await this.actorResources.listActors();
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(list, null, 2)
          }]
        };
      }

      if (uri === 'ue://level') {
        const ok = await this.ensureConnected();
        if (!ok) {
          return { contents: [{ uri, mimeType: 'text/plain', text: 'Unreal Engine not connected (after 3 attempts).' }] };
        }
        const level = await this.levelResources.getCurrentLevel();
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(level, null, 2)
          }]
        };
      }

      if (uri === 'ue://health') {
        const uptimeMs = Date.now() - this.healthMonitor.metrics.uptime;
        const automationStatus = this.automationBridge.getStatus();
        const toolStatus = dynamicToolManager.getStatus();
        const pythonFallback = getPythonFallbackConfig();

        let versionInfo: Record<string, unknown> = {};
        let featureFlags: Record<string, unknown> = {};
        if (this.bridge.isConnected) {
          try { versionInfo = await this.bridge.getEngineVersion(); } catch { }
          try { featureFlags = await this.bridge.getFeatureFlags(); } catch { }
        }

        const responseTimes = this.healthMonitor.metrics.responseTimes.slice(-25);
        const automationSummary = {
          connected: automationStatus.connected,
          activePort: automationStatus.activePort,
          pendingRequests: automationStatus.pendingRequests,
          listeningPorts: automationStatus.listeningPorts,
          lastHandshakeAt: automationStatus.lastHandshakeAt,
          lastRequestSentAt: automationStatus.lastRequestSentAt,
          maxPendingRequests: automationStatus.maxPendingRequests,
          maxConcurrentConnections: automationStatus.maxConcurrentConnections
        };

        const health = {
          status: this.healthMonitor.metrics.connectionStatus,
          uptimeSeconds: Math.floor(uptimeMs / 1000),
          performance: {
            totalRequests: this.healthMonitor.metrics.totalRequests,
            successfulRequests: this.healthMonitor.metrics.successfulRequests,
            failedRequests: this.healthMonitor.metrics.failedRequests,
            successRate: this.healthMonitor.metrics.totalRequests > 0 ? Number(((this.healthMonitor.metrics.successfulRequests / this.healthMonitor.metrics.totalRequests) * 100).toFixed(2)) : null,
            averageResponseTimeMs: Math.round(this.healthMonitor.metrics.averageResponseTime),
            recentResponseTimesMs: responseTimes
          },
          lastHealthCheckIso: this.healthMonitor.metrics.lastHealthCheck.toISOString(),
          unrealConnection: {
            status: this.bridge.isConnected ? 'connected' : 'disconnected',
            transport: 'automation_bridge',
            engineVersion: versionInfo,
            features: {
              pythonEnabled: pythonFallback.enabled,
              pythonUnsafeEnabled: pythonFallback.unsafeEnabled,
              pythonTemplates: pythonFallback.templates,
              subsystems: featureFlags.subsystems || {},
              automationBridgeConnected: automationStatus.connected
            }
          },
          recentErrors: this.healthMonitor.metrics.recentErrors.slice(-10),
          automationBridge: automationSummary,
          pythonFallback,
          toolStatus,
          raw: {
            metrics: this.healthMonitor.metrics,
            automationStatus,
            toolStatus
          }
        };

        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(health, null, 2)
          }]
        };
      }

      if (uri === 'ue://automation-bridge') {
        const status = this.automationBridge.getStatus();
        const toolStatus = dynamicToolManager.getStatus();
        const content = {
          summary: {
            enabled: status.enabled,
            connected: status.connected,
            host: status.host,
            port: status.port,
            capabilityTokenRequired: status.capabilityTokenRequired,
            pendingRequests: status.pendingRequests
          },
          connections: status.connections,
          timestamps: {
            connectedAt: status.connectedAt,
            lastHandshakeAt: status.lastHandshakeAt,
            lastMessageAt: status.lastMessageAt,
            lastRequestSentAt: status.lastRequestSentAt
          },
          lastDisconnect: status.lastDisconnect,
          lastHandshakeFailure: status.lastHandshakeFailure,
          lastError: status.lastError,
          lastHandshakeMetadata: status.lastHandshakeMetadata,
          pendingRequestDetails: status.pendingRequestDetails,
          listening: status.webSocketListening,
          toolStatus
        };

        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2)
          }]
        };
      }

      if (uri === 'ue://version') {
        const ok = await this.ensureConnected();
        if (!ok) {
          return { contents: [{ uri, mimeType: 'text/plain', text: 'Unreal Engine not connected (after 3 attempts).' }] };
        }
        const info = await this.bridge.getEngineVersion();
        const toolStatus = dynamicToolManager.getStatus();
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ ...info, toolStatus }, null, 2)
          }]
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }
}
