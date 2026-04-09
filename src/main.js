import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
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

async function main() {
  const input = readFileSync('yt.txt', 'utf-8').trim();
  
  if (input.includes('googlevideo.com/videoplayback')) {
    console.log('既にデコード済みの再生URLです。');
    console.log(input);
    return;
  }

  console.log('Fetching streaming URL with yt-dlp...');
  
  try {
    // Use yt-dlp to get the best mp4 format
    const url = await runCommand('yt-dlp', [
      '--format=best[ext=mp4]',
      '--skip-download',
      '--get-url',
      input
    ]);

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
      const jsonOutput = await runCommand('yt-dlp', [
        '--dump-json',
        '--skip-download',
        input
      ]);

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
      throw new Error(`Failed to retrieve video URL: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

