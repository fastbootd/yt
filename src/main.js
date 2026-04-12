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
    // Base arguments with bot mitigation
    const args = [
      '--format=best[ext=mp4]',
      '--skip-download',
      '--get-url',
      // Add user agent to mimic real browser
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Add extra headers
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      '--add-header', 'Sec-Fetch-Mode:navigate',
      '--add-header', 'Sec-Fetch-Site:none',
      '--add-header', 'Sec-Fetch-User:?1',
      // Extractor args for YouTube
      '--extractor-args', 'youtube:player_client=android,web',
      '--extractor-args', 'youtube:player_skip=webpage,configs',
      // Retry options
      '--retries', '5',
      '--fragment-retries', '5',
      input
    ];

    if (cookiePath) {
      args.splice(args.indexOf(input), 0, '--cookies', cookiePath);
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
    
    // Fallback: Try with different player client
    try {
      console.log('\nTrying with Android client...');
      const args = [
        '--format=best[ext=mp4]',
        '--skip-download',
        '--get-url',
        '--user-agent', 'com.google.android.youtube/19.02.39 (Linux; U; Android 13) gzip',
        '--extractor-args', 'youtube:player_client=android',
        '--no-check-certificate',
        input
      ];

      if (cookiePath) {
        args.push('--cookies', cookiePath);
      }

      const url = await runCommand('yt-dlp', args);
      
      if (url) {
        writeFileSync('yt.txt', url);
        console.log('✓ Retrieved URL using Android client');
        console.log('完了');
        return;
      }
    } catch (androidError) {
      console.error('✗ Android client method failed:', androidError.message);
    }

    // Final fallback: Try to get info in JSON format with iOS client
    try {
      console.log('\nTrying with iOS client...');
      const args = [
        '--dump-json',
        '--skip-download',
        '--user-agent', 'com.google.ios.youtube/19.02.3 (iPhone16,2; U; CPU iOS 17_2 like Mac OS X)',
        '--extractor-args', 'youtube:player_client=ios',
        input
      ];

      if (cookiePath) {
        args.push('--cookies', cookiePath);
      }

      const jsonOutput = await runCommand('yt-dlp', args);
      const info = JSON.parse(jsonOutput);
      
      if (info.url) {
        writeFileSync('yt.txt', info.url);
        console.log('✓ Retrieved URL using iOS client');
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

      throw new Error('All methods failed to retrieve URL');
    } catch (fallbackError) {
      console.error('✗ All fallback methods failed:', fallbackError.message);
      
      const errorMsg = !cookiePath
        ? `Failed to retrieve video URL.\n` +
          `このリポジトリに YOUTUBE_COOKIES シークレットを追加してください。\n` +
          `GitHub Settings → Secrets and variables → Actions で YOUTUBE_COOKIES を追加し、\n` +
          `ブラウザから YouTube の cookies をエクスポートしてください。\n` +
          `\n特に重要な cookies:\n` +
          `- __Secure-1PSID\n` +
          `- __Secure-1PAPISID\n` +
          `- __Secure-3PSID\n` +
          `- __Secure-3PAPISID\n` +
          `- SAPISID\n` +
          `- APISID\n` +
          `- HSID\n` +
          `- SID\n` +
          `- SSID\n` +
          `- LOGIN_INFO\n` +
          `\n${error.message}`
        : `Failed to retrieve video URL even with cookies.\n` +
          `考えられる原因:\n` +
          `1. Cookies が期限切れ - 新しい cookies を取得してください\n` +
          `2. YouTube が新しい bot 対策を導入した - yt-dlp の更新が必要\n` +
          `3. 動画がプライベートまたは制限付き\n` +
          `4. IP アドレスが一時的にブロックされている\n` +
          `\n${error.message}`;
      
      throw new Error(errorMsg);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});