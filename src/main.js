import { Innertube, UniversalCache, Platform } from 'youtubei.js';
import { readFileSync, writeFileSync } from 'fs';
import vm from 'node:vm';

function evaluatePlayerScript(data, env) {
  const sandbox = {
    ...env,
    globalThis: {},
    window: {},
    self: {},
    document: {},
    navigator: { userAgent: 'node.js' },
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    encodeURIComponent,
    decodeURIComponent,
    atob: (input) => Buffer.from(input, 'base64').toString('binary'),
    btoa: (input) => Buffer.from(input, 'binary').toString('base64')
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  const wrappedOutput = `(function() {
${data.output}
})()`;
  const script = new vm.Script(wrappedOutput);
  return script.runInContext(context);
}

Platform.shim.eval = evaluatePlayerScript;

async function main() {
  const input = readFileSync('yt.txt', 'utf-8').trim();
  const isDecodedUrl = input.includes('googlevideo.com/videoplayback');

  if (isDecodedUrl) {
    console.log('既にデコード済みの再生URLです。');
    console.log(input);
    return;
  }

  const videoId = input.match(/(?:v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/)?.[1];

  if (!videoId) {
    throw new Error('有効なYouTube URLではありません: \n' + input);
  }

  const yt = await Innertube.create({
    cache: new UniversalCache(false)
  });

  const info = await yt.getInfo(videoId);

  if (!info.streaming_data) {
    const reason = info.playability_status
      ? ` (${info.playability_status.status}${info.playability_status.reason ? `: ${info.playability_status.reason}` : ''})`
      : '';
    throw new Error('Streaming data not available for this video. The video may be blocked, unavailable, or a live stream.' + reason);
  }

  let format;
  try {
    format = info.chooseFormat({ quality: 'best' });
  } catch (error) {
    throw new Error('フォーマットの選択に失敗しました: ' + (error.message || error));
  }

  const videoUrl = await format.decipher(yt.session.player);

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
