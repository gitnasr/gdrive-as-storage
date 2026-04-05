import type { drive_v3 } from 'googleapis';
import { withRetry } from './retryStrategy';

const ROOT_KEY = '__root__';

/**
 * Translates human-readable slash paths into Google Drive folder/file IDs.
 *
 * All resolved path→ID pairs are stored in an in-memory Map so that each
 * unique folder is queried (or created) at most once per process lifetime.
 * This avoids Drive's eventual-consistency window causing duplicate folders.
 */
export class PathResolver {
  private readonly cache = new Map<string, string>();
  private readonly drive: drive_v3.Drive;

  constructor(drive: drive_v3.Drive, rootFolderId: string) {
    this.drive = drive;
    this.cache.set(ROOT_KEY, rootFolderId);
  }

  /**
   * Given a folder path like "/assets/images", returns the Drive folder ID,
   * creating intermediate folders as needed.
   */
  async resolveFolderPath(folderPath: string): Promise<string> {
    const normalized = folderPath.replace(/^\/+|\/+$/g, '');

    if (!normalized) {
      return this.cache.get(ROOT_KEY)!;
    }

    if (this.cache.has(normalized)) {
      return this.cache.get(normalized)!;
    }

    const segments = normalized.split('/');
    let parentId = this.cache.get(ROOT_KEY)!;

    for (let i = 0; i < segments.length; i++) {
      const partialPath = segments.slice(0, i + 1).join('/');

      if (this.cache.has(partialPath)) {
        parentId = this.cache.get(partialPath)!;
        continue;
      }

      const folderId = await this.findOrCreateFolder(segments[i]!, parentId);
      this.cache.set(partialPath, folderId);
      parentId = folderId;
    }

    return parentId;
  }

  /**
   * Given a file path like "/assets/images/avatar.jpg", resolves the
   * parent folder then searches for the file by name. Returns null if
   * the file does not exist.
   */
  async resolveFilePath(filePath: string): Promise<string | null> {
    const trimmed = filePath.replace(/^\/+/, '');
    const lastSlash = trimmed.lastIndexOf('/');

    const fileName = lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
    const folderPath = lastSlash === -1 ? '' : trimmed.slice(0, lastSlash);

    const parentId = await this.resolveFolderPath(folderPath);
    return this.findFile(fileName, parentId);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async findOrCreateFolder(name: string, parentId: string): Promise<string> {
    const existing = await this.queryFolder(name, parentId);
    if (existing !== null) return existing;
    return this.createFolder(name, parentId);
  }

  private async queryFolder(name: string, parentId: string): Promise<string | null> {
    const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const res = await withRetry(() =>
      this.drive.files.list({
        q: [
          `name = '${escapedName}'`,
          `mimeType = 'application/vnd.google-apps.folder'`,
          `'${parentId}' in parents`,
          `trashed = false`,
        ].join(' and '),
        fields: 'files(id)',
        spaces: 'drive',
        pageSize: 1,
      })
    );

    return res.data.files?.[0]?.id ?? null;
  }

  private async findFile(name: string, parentId: string): Promise<string | null> {
    const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const res = await withRetry(() =>
      this.drive.files.list({
        q: [
          `name = '${escapedName}'`,
          `'${parentId}' in parents`,
          `trashed = false`,
        ].join(' and '),
        fields: 'files(id)',
        spaces: 'drive',
        pageSize: 1,
      })
    );

    return res.data.files?.[0]?.id ?? null;
  }

  private async createFolder(name: string, parentId: string): Promise<string> {
    const res = await withRetry(() =>
      this.drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        fields: 'id',
      })
    );

    if (!res.data.id) {
      throw new Error(`Drive API returned no ID after creating folder: ${name}`);
    }

    return res.data.id;
  }
}
