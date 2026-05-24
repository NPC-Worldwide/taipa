import { ProjectManifest, MANIFEST_DIR, MANIFEST_FILE } from '../types/project';

const MANIFEST_PATH = `${MANIFEST_DIR}/${MANIFEST_FILE}`;

export async function readManifest(rootPath: string): Promise<ProjectManifest | null> {
  try {
    const result = await window.api?.readFileContent?.(`${rootPath}/${MANIFEST_PATH}`);
    if (result?.content) {
      const parsed = JSON.parse(result.content);
      // Basic validation
      if (parsed.version && parsed.type && Array.isArray(parsed.chapters)) {
        return parsed as ProjectManifest;
      }
    }
  } catch {
    // Manifest doesn't exist or is invalid
  }
  return null;
}

export async function writeManifest(rootPath: string, manifest: ProjectManifest): Promise<boolean> {
  try {
    // Ensure .taipa directory exists
    await window.api?.ensureDir?.(`${rootPath}/${MANIFEST_DIR}`);
    await window.api?.writeFileContent?.(
      `${rootPath}/${MANIFEST_PATH}`,
      JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2)
    );
    return true;
  } catch {
    return false;
  }
}

export function createDefaultManifest(
  name: string,
  type: ProjectManifest['type'],
  rootDocument?: string
): ProjectManifest {
  return {
    version: '1.0.0',
    name,
    type,
    chapters: [],
    ...(rootDocument ? { rootDocument } : {}),
    updatedAt: new Date().toISOString(),
  };
}
