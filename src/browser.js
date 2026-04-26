import flipbook from './flipbook.js';
import canvid from './canvid.js';

function sketchapedia(opts) {
    return flipbook(opts);
}

sketchapedia.flipbook = flipbook;
sketchapedia.canvid = canvid;

if (typeof window !== 'undefined') {
    window.sketchapedia = sketchapedia;
}
