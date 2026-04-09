import { Innertube, UniversalCache, Platform } from 'youtubei.js';
import { readFileSync, writeFileSync } from 'fs';
import vm from 'node:vm';

Platform.shim.eval = async (data, env) => {
  const props = [];
  if (env.n) props.push(`n: exportedVars.nFunction("${env.n}")`);
  if (env.sig) props.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  const code = `(function(){
${data.output}
return { ${props.join(', ')} }
})()`;
  return vm.runInNewContext(code);
};

function extractVideoId(input) {
  const match = input.match(/(?:v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  return null;
}

async function decipherUrl(format, player) {
  const raw = await format.decipher(player);
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  return raw.url ?? null;
}

async function main() {
  const input = readFileSync('yt.txt', 'utf-8').trim();
  const isDecodedUrl = input.includes('googlevideo.com/videoplayback');

  if (isDecodedUrl) {
    console.log('既にデコード済みの再生URLです。');
    console.log(input);
    return;
  }

  const videoId = extractVideoId(input);

  if (!videoId) {
    throw new Error('有効なYouTube URLではありません: \n' + input);
  }

  const clients = ['WEB', 'ANDROID', 'IOS'];
  let info = null;
  let lastError = null;

  for (const client of clients) {
    try {
      console.log(`Trying with ${client} client...`);
      const yt = await Innertube.create({
        cache: new UniversalCache(true),
        generate_session_locally: true,
        client_name: client
      });

      info = await yt.getInfo(videoId);

      if (info.streaming_data) {
        console.log(`✓ Successfully retrieved streaming data with ${client} client`);
        break;
      }
    } catch (err) {
      lastError = err;
      console.log(`✗ Failed with ${client} client: ${err.message}`);
    }
  }

  if (!info || !info.streaming_data) {
    const reason = info?.playability_status
      ? ` (${info.playability_status.status}${info.playability_status.reason ? `: ${info.playability_status.reason}` : ''})`
      : '';
    throw new Error('Streaming data not available for this video. The video may be blocked, unavailable, or a live stream.' + reason);
  }

  const yt = await Innertube.create({
    cache: new UniversalCache(true),
    generate_session_locally: true
  });

  let format;
  try {
    format = info.chooseFormat({ quality: 'best' });
  } catch (error) {
    format = [
      ...(info.streaming_data?.formats ?? []),
      ...(info.streaming_data?.adaptive_formats ?? [])
    ]
      .filter(f => f.mime_type?.includes('video/mp4'))
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

    if (!format) {
      throw new Error('フォーマットの選択に失敗しました: ' + (error.message || error));
    }
  }

  const videoUrl = await decipherUrl(format, yt.session.player);

  if (!videoUrl) {
    throw new Error('Decipher returned an empty URL.');
  }

  writeFileSync('yt.txt', videoUrl);
  console.log('完了');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
