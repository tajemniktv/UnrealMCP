import { normalizeMountedAssetPath } from './validation.js';

export function sanitizePath(path: string, allowedRoots: string[] = ['/Game', '/Engine']): string {
    if (!path || typeof path !== 'string') {
        throw new Error('Invalid path: must be a non-empty string');
    }

    const trimmed = path.trim();
    if (trimmed.length === 0) {
        throw new Error('Invalid path: cannot be empty');
    }

    const normalized = normalizeMountedAssetPath(trimmed);

    // Ensure path starts with a valid root
    // We check case-insensitive for the root prefix to be user-friendly, 
    // but Unreal paths are typically case-insensitive anyway.
    const normalizedAllowedRoots = allowedRoots.map(root => normalizeMountedAssetPath(root));
    const isAllowed = normalizedAllowedRoots.some(root =>
        normalized.toLowerCase() === root.toLowerCase() ||
        normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    );

    if (!isAllowed && !/^\/[A-Za-z_][A-Za-z0-9_]*(?:\/|$)/.test(normalized)) {
        throw new Error(`Invalid path: must start with one of [${normalizedAllowedRoots.join(', ')}] or another mounted Unreal root`);
    }

    // Basic character validation (Unreal strictness)
    // Blocks: < > : " | ? * (Windows reserved) and control characters
    // allowing spaces, dots, underscores, dashes, slashes
    // Note: Unreal allows spaces in some contexts but it's often safer to restrict them if strict mode is desired.
    // For now, we block the definitely invalid ones.
    // eslint-disable-next-line no-control-regex
    const invalidChars = /[<>:"|?*\x00-\x1f]/;
    if (invalidChars.test(normalized)) {
        throw new Error('Invalid path: contains illegal characters');
    }

    return normalized;
}
