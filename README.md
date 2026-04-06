# gdrive-as-storage

Use Google Drive as a Node.js storage backend with an S3-like interface.

[![npm version](https://img.shields.io/npm/v/gdrive-as-storage.svg)](https://www.npmjs.com/package/gdrive-as-storage)



https://github.com/user-attachments/assets/d847a21d-7043-4205-8d84-9b98f85f9e28



## Features

- **S3-style slash paths** — write to `/images/avatar.jpg` and intermediate folders are created automatically
- **Stream-based uploads** — accepts any Node.js `Readable` stream; MIME type inferred from file extension
- **Public file sharing** — pass `isPublic: true` to make a file publicly readable in one step
- **Upload progress** — optional `onProgress` callback receives bytes uploaded during the transfer
- **Automatic retry** — exponential backoff on transient Drive API errors (rate limits, 5xx)

## Installation

```bash
npm install gdrive-as-storage
```

> Requires Node.js 18 or later.

## Quick Start

```typescript
import 'dotenv/config'; // load .env file
import { DriveStorage } from 'gdrive-as-storage';
import { createReadStream } from 'fs';

const storage = new DriveStorage({
  clientId:     process.env.DRIVE_CLIENT_ID!,
  clientSecret: process.env.DRIVE_CLIENT_SECRET!,
  refreshToken: process.env.DRIVE_REFRESH_TOKEN!,
  rootFolderId: process.env.DRIVE_ROOT_FOLDER_ID!,
});

const result = await storage.upload({
  filePath:   '/images/avatar.jpg',
  fileStream: createReadStream('./avatar.jpg'),
});

console.log(result.downloadUrl); // direct download link
console.log(result.viewUrl);     // Google Drive viewer link
```

## Google Cloud Setup

1. Open [Google Cloud Console](https://console.cloud.google.com) and create or select a project.
2. Go to **APIs & Services → Library**, search for **Google Drive API**, and enable it.
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Desktop app**
   - Note your **Client ID** and **Client Secret**.
4. Run the interactive setup wizard. It will prompt for your **Client ID** and **Client Secret**, then open a browser for Google sign-in, capture the OAuth callback, and append credentials to your `.env` file:

```bash
npx gdrive-as-storage
```

5. When prompted, paste your **Root Folder ID** — the alphanumeric string at the end of your Drive folder's URL (`https://drive.google.com/drive/folders/<ROOT_FOLDER_ID>`).

After the wizard completes, your `.env` will contain:

```
DRIVE_CLIENT_ID="..."
DRIVE_CLIENT_SECRET="..."
DRIVE_REFRESH_TOKEN="..."
DRIVE_ROOT_FOLDER_ID="..."
```

## API Reference

### `new DriveStorage(config)`

| Field | Type | Description |
|---|---|---|
| `rootFolderId` | `string` | Drive folder ID used as the storage root |
| `clientId` | `string` | OAuth 2.0 Client ID from Google Cloud Console |
| `clientSecret` | `string` | OAuth 2.0 Client Secret |
| `refreshToken` | `string` | Long-lived refresh token obtained via the init wizard |

### `upload(params): Promise<UploadResult>`

| Field | Type | Required | Description |
|---|---|---|---|
| `filePath` | `string` | ✓ | Slash path relative to root, e.g. `/images/avatar.jpg` |
| `fileStream` | `Readable` | ✓ | Node.js Readable stream of the file contents |
| `mimeType` | `string` | — | MIME type override; inferred from extension if omitted |
| `isPublic` | `boolean` | — | Make the file publicly readable (default: `false`) |
| `onProgress` | `(bytesUploaded: number) => void` | — | Called periodically with bytes read from the source stream |

Returns:

| Field | Type | Description |
|---|---|---|
| `fileId` | `string` | Google Drive file ID |
| `downloadUrl` | `string` | Direct download link (works without auth for public files) |
| `viewUrl` | `string` | Google Drive viewer URL |

### `delete(filePath: string): Promise<void>`

Deletes the file at the given slash path. Throws an error if the file is not found.

## License

MIT
