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
  const wrappedOutput = `(function() {\n${data.output}\n})()`;
  const script = new vm.Script(wrappedOutput);
  return script.runInContext(context);
}

Platform.shim.eval = evaluatePlayerScript;

const youtubeUrl = readFileSync('yt.txt', 'utf-8').trim();
const videoId = youtubeUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];

if (!videoId) {
  console.error('有効なYouTube URLではありません: \n' + youtubeUrl);
  process.exit(1);
}

const yt = await Innertube.create({
  cache: new UniversalCache(false)
});

const info = await yt.getInfo(videoId);

if (!info.streaming_data) {
  console.error('Streaming data not available for this video. The video may be blocked, unavailable, or a live stream.');
  process.exit(1);
}

let format;
try {
  format = info.chooseFormat({ quality: 'best' });
}
catch (error) {
  console.error('フォーマットの選択に失敗しました:', error.message || error);
  process.exit(1);
}

const videoUrl = await format.decipher(yt.session.player);

writeFileSync('yt.txt', videoUrl);
console.log('完了');