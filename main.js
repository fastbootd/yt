import { Innertube } from 'youtubei.js';
import { readFileSync, writeFileSync } from 'fs';


const youtubeUrl = readFileSync('yt.txt', 'utf-8').trim();
const videoId = youtubeUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];

if (!videoId) {
  console.error('有効なYouTube URLではありません: ' + youtubeUrl);
  process.exit(1);
}

const yt = await Innertube.create({
  cache: new Innertube.UniversalCache(false)
});

const info = await yt.getInfo(videoId);
const format = info.chooseFormat({ quality: 'best' });
const videoUrl = format.decipher(yt.session.player);

writeFileSync('yt.txt', videoUrl);
console.log('完了');
console.log(videoUrl);