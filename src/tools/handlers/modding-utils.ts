import fs from 'node:fs';
import path from 'node:path';
import { normalizeMountedAssetPath } from '../../utils/validation.js';

export interface PluginDescriptorSummary {
  mountRoot: string;
  pluginName: string;
  pluginPath: string;
  pluginFile: string;
  contentRoot: string;
  sourceRoot: string;
  type: 'mod' | 'plugin' | 'engine' | 'game' | 'unknown';
  descriptor: Record<string, unknown>;
}

export interface ProjectContextSummary {
  repoRoot: string;
  projectFile?: string;
  projectName?: string;
}

function safeReadJson(filePath: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function findProjectContext(startDir: string = process.cwd()): ProjectContextSummary {
  let current = path.resolve(startDir);
  while (true) {
    try {
      const entries = fs.readdirSync(current);
      const projectFile = entries.find((entry) => entry.endsWith('.uproject'));
      if (projectFile) {
        return {
          repoRoot: current,
          projectFile: path.join(current, projectFile),
          projectName: projectFile.replace(/\.uproject$/i, '')
        };
      }
    } catch {
      // Ignore and continue walking upward.
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return { repoRoot: path.resolve(startDir) };
    }
    current = parent;
  }
}

export function getMountRoot(value: string | undefined): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const normalized = normalizeMountedAssetPath(value.trim());
  const match = normalized.match(/^\/[^/]+/);
  return match?.[0];
}

export function classifyMountRoot(root: string | undefined): 'mod' | 'plugin' | 'engine' | 'game' | 'unknown' {
  if (!root) return 'unknown';
  if (root === '/Game') return 'game';
  if (root === '/Engine') return 'engine';
  return 'mod';
}

export function listTargetFiles(projectRoot: string): Array<{ name: string; path: string }> {
  const sourceDir = path.join(projectRoot, 'Source');
  if (!fs.existsSync(sourceDir)) {
    return [];
  }

  return fs.readdirSync(sourceDir)
    .filter((entry) => entry.endsWith('.Target.cs'))
    .map((entry) => ({
      name: entry.replace(/\.Target\.cs$/i, ''),
      path: path.join(sourceDir, entry)
    }));
}

export function listPluginDescriptors(projectRoot: string): PluginDescriptorSummary[] {
  const bases = [
    { dir: path.join(projectRoot, 'Mods'), type: 'mod' as const },
    { dir: path.join(projectRoot, 'Plugins'), type: 'plugin' as const }
  ];

  const descriptors: PluginDescriptorSummary[] = [];

  for (const base of bases) {
    if (!fs.existsSync(base.dir)) continue;
    for (const entry of fs.readdirSync(base.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(base.dir, entry.name);
      const pluginFile = path.join(pluginDir, `${entry.name}.uplugin`);
      if (!fs.existsSync(pluginFile)) continue;

      const descriptor = safeReadJson(pluginFile) ?? {};
      descriptors.push({
        mountRoot: `/${entry.name}`,
        pluginName: entry.name,
        pluginPath: pluginDir,
        pluginFile,
        contentRoot: path.join(pluginDir, 'Content'),
        sourceRoot: path.join(pluginDir, 'Source'),
        type: base.type,
        descriptor
      });
    }
  }

  return descriptors.sort((a, b) => a.pluginName.localeCompare(b.pluginName));
}

export function findPluginDescriptorByRoot(projectRoot: string, mountRoot: string | undefined): PluginDescriptorSummary | undefined {
  if (!mountRoot) return undefined;
  return listPluginDescriptors(projectRoot).find((plugin) => plugin.mountRoot.toLowerCase() === mountRoot.toLowerCase());
}

export function findPluginDescriptorByName(projectRoot: string, pluginName: string | undefined): PluginDescriptorSummary | undefined {
  if (!pluginName) return undefined;
  return listPluginDescriptors(projectRoot).find((plugin) => plugin.pluginName.toLowerCase() === pluginName.toLowerCase());
}

export function deriveBlueprintVariants(inputPath: string): Record<string, unknown> {
  const normalized = normalizeMountedAssetPath(inputPath.trim());
  const root = getMountRoot(normalized);
  const packagePath = normalized.includes('.') ? normalized.split('.')[0] : normalized;
  const objectName = normalized.includes('.') ? normalized.split('.').pop() ?? '' : path.posix.basename(normalized);

  let assetObjectPath: string;
  let generatedClassPath = '';
  let cdoPath = '';

  if (objectName.startsWith('Default__')) {
    const className = objectName.substring('Default__'.length);
    generatedClassPath = `${packagePath}.${className}`;
    const assetName = className.endsWith('_C') ? className.substring(0, className.length - 2) : className;
    assetObjectPath = `${packagePath}.${assetName}`;
    cdoPath = normalized;
  } else if (objectName.endsWith('_C')) {
    generatedClassPath = normalized;
    const assetName = objectName.substring(0, objectName.length - 2);
    assetObjectPath = `${packagePath}.${assetName}`;
    cdoPath = `${packagePath}.Default__${objectName}`;
  } else {
    assetObjectPath = normalized.includes('.') ? normalized : `${packagePath}.${objectName}`;
    generatedClassPath = `${packagePath}.${objectName}_C`;
    cdoPath = `${packagePath}.Default__${objectName}_C`;
  }

  return {
    inputPath: normalized,
    mountRoot: root,
    packagePath,
    assetObjectPath,
    generatedClassPath,
    cdoPath,
    objectName
  };
}

export function summarizeDescriptor(descriptor: PluginDescriptorSummary): Record<string, unknown> {
  const rawDescriptor = descriptor.descriptor;
  const modules = Array.isArray(rawDescriptor.Modules) ? rawDescriptor.Modules : [];
  const plugins = Array.isArray(rawDescriptor.Plugins) ? rawDescriptor.Plugins : [];

  return {
    mountRoot: descriptor.mountRoot,
    pluginName: descriptor.pluginName,
    pluginPath: descriptor.pluginPath,
    pluginFile: descriptor.pluginFile,
    contentRoot: descriptor.contentRoot,
    sourceRoot: descriptor.sourceRoot,
    type: descriptor.type,
    friendlyName: rawDescriptor.FriendlyName,
    versionName: rawDescriptor.VersionName,
    semVersion: rawDescriptor.SemVersion,
    description: rawDescriptor.Description,
    category: rawDescriptor.Category,
    docsUrl: rawDescriptor.DocsURL,
    supportUrl: rawDescriptor.SupportURL,
    canContainContent: rawDescriptor.CanContainContent === true,
    modules,
    plugins
  };
}

export function getCandidateLogFiles(projectRoot: string): string[] {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local');
  const candidates = [
    path.join(localAppData, 'FactoryGame', 'Saved', 'Logs', 'FactoryGame.log'),
    path.join(projectRoot, 'Saved', 'Logs', 'FactoryGame.log'),
    path.join(projectRoot, 'Logs', 'FactoryGame.log')
  ];

  return candidates.filter((filePath, index) => candidates.indexOf(filePath) === index);
}
