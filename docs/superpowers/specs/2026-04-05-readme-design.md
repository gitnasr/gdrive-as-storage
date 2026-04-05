---
title: README — gdrive-as-storage
date: 2026-04-05
status: approved
---

# README Design: gdrive-as-storage

## Overview

A `README.md` at the repo root targeting JavaScript/TypeScript developers integrating the library into a Node.js app. Structure follows the quick-start-first pattern: value proposition and working code before setup details.

## Audience

Node.js/TypeScript developers who want to use Google Drive as a file storage backend. They can read code, but may not be familiar with Google Cloud Console or OAuth setup.

## File

**Path:** `README.md` (repo root)

---

## Section Breakdown

### 1. Header

- H1: `gdrive-as-storage`
- One-line description: "Use Google Drive as a Node.js storage backend with an S3-like interface."
- npm version badge linking to the npm package page

### 2. Features

Bullet list (5 items):
- S3-style slash paths — intermediate folders created automatically
- Upload any readable stream with MIME type inference
- Optional public file sharing via a single flag (`isPublic: true`)
- Upload progress callback
- Automatic retry with exponential backoff on transient Drive API errors

### 3. Installation

```bash
npm install gdrive-as-storage
```

### 4. Quick Start

Minimal TypeScript/JS snippet showing:
1. Import and construct `DriveStorage` with env vars
2. Call `upload()` with a `fs.createReadStream`
3. Log the `downloadUrl` from the result

Shows a realistic but minimal example — no progress callback, no public flag (those go in the API reference).

### 5. Google Cloud Setup

Numbered walkthrough (developer-friendly, not hand-holdy):
1. Go to [Google Cloud Console](https://console.cloud.google.com) → create or select a project
2. Enable the **Google Drive API** (APIs & Services → Library)
3. Create OAuth 2.0 credentials: APIs & Services → Credentials → Create Credentials → OAuth client ID → Application type: **Desktop app**
4. Note your **Client ID** and **Client Secret**
5. Run the interactive init wizard — it opens a browser, captures the OAuth callback, and appends credentials to `.env`:
   ```bash
   npx gdrive-as-storage
   ```
6. Get your **Root Folder ID** from the Drive folder URL (the long alphanumeric string after `/folders/`) — you'll be prompted for it during the wizard

Result: `.env` is populated with `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`, `DRIVE_ROOT_FOLDER_ID`.

### 6. API Reference

#### `new DriveStorage(config: DriveStorageConfig)`

| Field | Type | Description |
|---|---|---|
| `rootFolderId` | `string` | Drive folder ID that acts as the storage root |
| `clientId` | `string` | OAuth 2.0 Client ID from Google Cloud Console |
| `clientSecret` | `string` | OAuth 2.0 Client Secret |
| `refreshToken` | `string` | Long-lived refresh token from the init wizard |

#### `upload(params): Promise<UploadResult>`

| Field | Type | Required | Description |
|---|---|---|---|
| `filePath` | `string` | ✓ | Slash path relative to root, e.g. `/images/avatar.jpg` |
| `fileStream` | `Readable` | ✓ | Node.js Readable stream of file contents |
| `mimeType` | `string` | — | Override; inferred from extension if omitted |
| `isPublic` | `boolean` | — | Make file publicly readable (default: `false`) |
| `onProgress` | `(bytesUploaded: number) => void` | — | Progress callback during upload |

Returns `{ fileId, downloadUrl, viewUrl }`.

#### `delete(filePath: string): Promise<void>`

Deletes the file at the given slash path. Throws if the file is not found.

### 7. License

MIT
