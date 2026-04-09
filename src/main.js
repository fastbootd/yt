import { Innertube, UniversalCache, Platform, ProtoUtils } from 'youtubei.js';
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

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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

  // Generate visitor_data for BotGuard bypass
  const visitorData = ProtoUtils.encodeVisitorData(
    generateRandomString(11),
    Math.floor(Date.now() / 1000)
  );

  console.log(`Generated visitor_data: ${visitorData.substring(0, 20)}...`);

  const clients = ['WEB', 'ANDROID', 'IOS', 'TV', 'MWEB'];
  let info = null;
  let usedClient = null;
  let yt = null;

  // Try to use cookies from environment variable if available
  const cookies = process.env.YOUTUBE_COOKIES || null;

  for (const client of clients) {
    try {
      console.log(`\nTrying with ${client} client...`);
      
      const createOptions = {
        cache: new UniversalCache(true),
        generate_session_locally: true,
        client_name: client,
        retrieve_innertube_config: true,
        visitor_data: visitorData,
        enable_session_cache: true
      };

      if (cookies) {
        createOptions.cookie = cookies;
      }

      yt = await Innertube.create(createOptions);

      info = await yt.getInfo(videoId);

      if (info.streaming_data) {
        console.log(`✓ Successfully retrieved streaming data with ${client} client`);
        usedClient = client;
        break;
      }
    } catch (err) {
      console.log(`✗ Failed with ${client} client: ${err.message}`);
    }
  }

  if (!info || !info.streaming_data) {
    const status = info?.playability_status?.status || 'UNKNOWN';
    const reason = info?.playability_status?.reason || '';

    if (status === 'LOGIN_REQUIRED') {
      throw new Error(
        `YouTube がボット確認を要求しています。\n` +
        `このリポジトリに YOUTUBE_COOKIES シークレットを追加するか、\n` +
        `ログイン不要な動画 URL を使用してください。\n` +
        `(${status}${reason ? `: ${reason}` : ''})`
      );
    }

    throw new Error(`Streaming data not available for this video. The video may be blocked, unavailable, or a live stream. (${status}${reason ? `: ${reason}` : ''})`);
  }

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
