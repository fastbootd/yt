import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

async function runCommand(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env }
    });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}:\n${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function writeCookies() {
  const cookiesJson = process.env.YOUTUBE_COOKIES;
  if (!cookiesJson) {
    console.log('Note: YOUTUBE_COOKIES environment variable not set');
    return null;
  }

  const cookieDir = join(process.cwd(), '.cookies');
  if (!existsSync(cookieDir)) {
    mkdirSync(cookieDir, { recursive: true });
  }

  const cookiePath = join(cookieDir, 'cookies.txt');
  
  try {
    // Parse JSON cookies and convert to netscape format
    const cookies = JSON.parse(cookiesJson);
    let netscapeCookies = '# Netscape HTTP Cookie File\n# This is a generated file!\n\n';
    
    for (const cookie of cookies) {
      const line = [
        cookie.domain || '.youtube.com',
        'TRUE',
        cookie.path || '/',
        cookie.secure ? 'TRUE' : 'FALSE',
        cookie.expirationDate || '0',
        cookie.name,
        cookie.value
      ].join('\t');
      netscapeCookies += line + '\n';
    }

    writeFileSync(cookiePath, netscapeCookies);
    console.log(`✓ Cookies loaded from environment: ${cookiePath}`);
    return cookiePath;
  } catch (error) {
    console.log(`YOUTUBE_COOKIES format error: ${error.message}`);
    return null;
  }
}

async function main() {
  const input = readFileSync('yt.txt', 'utf-8').trim();
  
  if (input.includes('googlevideo.com/videoplayback')) {
    console.log('既にデコード済みの再生URLです。');
    console.log(input);
    return;
  }

  console.log('Fetching streaming URL with yt-dlp...');
  
  // Try to set up cookies
  const cookiePath = writeCookies();
  
  try {
    const args = [
      '--format=best[ext=mp4]',
      '--skip-download',
      '--get-url',
      input
    ];

    if (cookiePath) {
      args.push('--cookies', cookiePath);
    }

    // Use yt-dlp to get the best mp4 format
    const url = await runCommand('yt-dlp', args);

    if (!url) {
      throw new Error('yt-dlp returned empty URL');
    }

    console.log('✓ Successfully retrieved streaming URL');
    writeFileSync('yt.txt', url);
    console.log('完了');
  } catch (error) {
    console.error('✗ yt-dlp failed:', error.message);
    
    // Fallback: Try to get info in JSON format
    try {
      console.log('\nTrying alternative method...');
      const args = [
        '--dump-json',
        '--skip-download',
        input
      ];

      if (cookiePath) {
        args.push('--cookies', cookiePath);
      }

      const jsonOutput = await runCommand('yt-dlp', args);

      const info = JSON.parse(jsonOutput);
      
      if (info.url) {
        writeFileSync('yt.txt', info.url);
        console.log('✓ Retrieved URL using alternative method');
        console.log('完了');
        return;
      }

      if (info.formats && info.formats.length > 0) {
        const mp4Format = info.formats
          .filter(f => f.ext === 'mp4' || f.format_note?.includes('mp4'))
          .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

        if (mp4Format?.url) {
          writeFileSync('yt.txt', mp4Format.url);
          console.log('✓ Retrieved URL from formats');
          console.log('完了');
          return;
        }
      }

      throw new Error('yt-dlp returned no usable URL in JSON');
    } catch (fallbackError) {
      console.error('✗ Fallback method also failed:', fallbackError.message);
      
      if (!cookiePath) {
        throw new Error(
          `Failed to retrieve video URL.\n` +
          `このリポジトリに YOUTUBE_COOKIES シークレットを追加してください。\n` +
          `GitHub Settings → Secrets and variables → Actions で YOUTUBE_COOKIES を追加し、\n` +
          `ブラウザから YouTube の cookies をエクスポートしてください。\n` +
          `${error.message}`
        );
      }
      
      throw new Error(`Failed to retrieve video URL: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

