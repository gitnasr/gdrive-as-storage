#!/usr/bin/env node

/**
 * gdrive-as-storage init wizard
 *
 * Invoked via: npx gdrive-as-storage
 *
 * Runs an OAuth 2.0 installed-app flow:
 *   1. Prompts for client_id + client_secret
 *   2. Opens the browser; captures the auth code via a localhost redirect
 *   3. Exchanges the code for a refresh token
 *   4. Appends all credentials + root folder ID to .env
 */

import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { google } from 'googleapis';

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32'  ? 'start' :
                                    'xdg-open';
  exec(`${cmd} "${url}"`);
}

function waitForCallback(
  server: http.Server,
  port: number,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for OAuth callback (2 minutes). Re-run init to try again.'));
    }, timeoutMs);

    server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const code  = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Authentication successful — you can close this tab.</h1>');

      server.close();
      clearTimeout(timer);

      if (error) {
        reject(new Error(`Google OAuth error: ${error}`));
      } else if (code) {
        resolve(code);
      } else {
        reject(new Error('Callback received but no auth code found in URL.'));
      }
    });
  });
}

async function main(): Promise<void> {
  const rl = createInterface({ input, output });

  console.log('\ngdrive-as-storage Setup Wizard');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('You need an OAuth 2.0 Client ID and Secret from Google Cloud Console.');
  console.log('Go to: APIs & Services → Credentials → Create Credentials → OAuth client ID');
  console.log('Application type: Desktop app\n');

  try {
    const clientId = (await rl.question('Client ID: ')).trim();
    if (!clientId) {
      console.error('\nError: Client ID cannot be empty.');
      process.exit(1);
    }

    const clientSecret = (await rl.question('Client Secret: ')).trim();
    if (!clientSecret) {
      console.error('\nError: Client Secret cannot be empty.');
      process.exit(1);
    }

    // Bind server to port 0 — OS picks a free port
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    const redirectUri = `http://localhost:${port}`;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive'],
    });

    console.log('\nOpening browser for Google authentication...');
    console.log('If the browser does not open, visit this URL manually:\n');
    console.log(`  ${authUrl}\n`);
    openBrowser(authUrl);

    const code = await waitForCallback(server, port, 2 * 60 * 1000);

    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      console.error('\nError: Google did not return a refresh token.');
      console.error('This happens when the app was previously authorized without prompt=consent.');
      console.error('Revoke access at https://myaccount.google.com/permissions and re-run init.\n');
      process.exit(1);
    }

    const rootFolderId = (
      await rl.question('\nYour root Google Drive Folder ID (from the URL): ')
    ).trim();

    if (!rootFolderId) {
      console.error('\nError: Root folder ID cannot be empty.');
      process.exit(1);
    }

    const envPath = path.resolve(process.cwd(), '.env');
    const envLines = [
      '',
      '# Added by gdrive-as-storage init',
      `DRIVE_CLIENT_ID="${clientId}"`,
      `DRIVE_CLIENT_SECRET="${clientSecret}"`,
      `DRIVE_REFRESH_TOKEN="${refreshToken}"`,
      `DRIVE_ROOT_FOLDER_ID="${rootFolderId}"`,
    ];

    fs.appendFileSync(envPath, envLines.join('\n') + '\n', 'utf-8');

    console.log(`\nAppended credentials to ${envPath}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Initialise the client in your app:\n');
    console.log('  import { DriveStorage } from "gdrive-as-storage";');
    console.log('  const storage = new DriveStorage({');
    console.log('    clientId:     process.env.DRIVE_CLIENT_ID!,');
    console.log('    clientSecret: process.env.DRIVE_CLIENT_SECRET!,');
    console.log('    refreshToken: process.env.DRIVE_REFRESH_TOKEN!,');
    console.log('    rootFolderId: process.env.DRIVE_ROOT_FOLDER_ID!,');
    console.log('  });');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } finally {
    rl.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nSetup failed: ${message}`);
  process.exit(1);
});
