import { Auth, drive_v3, google } from 'googleapis';
import * as mime from 'mime-types';
import type { Readable } from 'stream';
import { PathResolver } from './utils/pathResolver';
import { withRetry } from './utils/retryStrategy';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface DriveStorageConfig {
  /** The ID of the root Google Drive folder this instance operates within. */
  rootFolderId: string;
  /** OAuth 2.0 client ID (from Google Cloud Console → Credentials). */
  clientId: string;
  /** OAuth 2.0 client secret. */
  clientSecret: string;
  /**
   * Long-lived refresh token obtained by running `npx drive-bucket-node init`.
   * googleapis uses this to silently refresh short-lived access tokens.
   */
  refreshToken: string;
}

export interface UploadParams {
  /**
   * Logical file path relative to the root folder, e.g. `/assets/images/avatar.jpg`.
   * Intermediate folders are created automatically.
   */
  filePath: string;
  /** A Node.js Readable stream supplying the file contents. */
  fileStream: Readable;
  /**
   * MIME type override. When omitted, inferred from `filePath` extension.
   * Falls back to `application/octet-stream`.
   */
  mimeType?: string;
  /**
   * When `true`, the file is made publicly readable immediately after upload
   * via a second Drive Permissions API call.
   */
  isPublic?: boolean;
  /**
   * Progress callback invoked periodically during the resumable upload.
   * @param bytesUploaded Number of bytes confirmed uploaded so far.
   */
  onProgress?: (bytesUploaded: number) => void;
}

export interface UploadResult {
  /** The raw Google Drive file ID. */
  fileId: string;
  /** Direct download link (works for public files without auth). */
  downloadUrl: string;
  /** Google Drive viewer URL. */
  viewUrl: string;
}

// ─── Class ───────────────────────────────────────────────────────────────────

export class DriveStorage {
  private readonly drive: drive_v3.Drive;
  private readonly pathResolver: PathResolver;

  constructor(config: DriveStorageConfig) {
    const auth = DriveStorage.buildAuth(config);
    this.drive = google.drive({ version: 'v3', auth });
    this.pathResolver = new PathResolver(this.drive, config.rootFolderId);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async upload(params: UploadParams): Promise<UploadResult> {
    const { filePath, fileStream, isPublic = false, onProgress } = params;

    const { fileName, parentId } = await this.resolveUploadTarget(filePath);

    const contentType =
      params.mimeType ??
      (mime.lookup(fileName) || 'application/octet-stream');

    const res = await withRetry(() =>
      this.drive.files.create(
        {
          requestBody: {
            name: fileName,
            parents: [parentId],
          },
          media: {
            mimeType: contentType,
            body: fileStream,
          },
          fields: 'id',
        },
        {
          onUploadProgress: onProgress
            ? (evt: { bytesRead: number }) => onProgress(evt.bytesRead)
            : undefined,
        }
      )
    );

    const fileId = res.data.id;
    if (!fileId) {
      throw new Error(`Drive API did not return a file ID for upload: ${filePath}`);
    }

    if (isPublic) {
      await withRetry(() =>
        this.drive.permissions.create({
          fileId,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        })
      );
    }

    return {
      fileId,
      downloadUrl: `https://drive.usercontent.google.com/download?id=${fileId}`,
      viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
    };
  }

  async delete(filePath: string): Promise<void> {
    const fileId = await this.pathResolver.resolveFilePath(filePath);

    if (!fileId) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    await withRetry(() =>
      this.drive.files.delete({ fileId })
    );
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async resolveUploadTarget(
    filePath: string
  ): Promise<{ fileName: string; parentId: string }> {
    const trimmed = filePath.replace(/^\/+/, '');
    const lastSlash = trimmed.lastIndexOf('/');

    const fileName = lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
    const folderPath = lastSlash === -1 ? '' : trimmed.slice(0, lastSlash);

    if (!fileName) {
      throw new Error(`Invalid filePath — no file name component: ${filePath}`);
    }

    const parentId = await this.pathResolver.resolveFolderPath(folderPath);
    return { fileName, parentId };
  }

  private static buildAuth(config: DriveStorageConfig): Auth.OAuth2Client {
    const client = new google.auth.OAuth2(config.clientId, config.clientSecret);
    client.setCredentials({ refresh_token: config.refreshToken });
    return client;
  }
}
