export default function flipbook(opts) {
    var _container;
    var _graphic;
    var _canvas;
    var _context;

    var _canvasWidth;
    var _canvasHeight;
    var _containerH;
    var _graphicH;
    var _graphicLeft;
    var _start;
    var _end;

    var _naturalWidth;
    var _naturalHeight;
    var _aspectRatio;
    var _crop = {};

    var _images;
    var _frames;
    var _ready;
    var _ticking;
    var _previousFrame = -1;
    var _mobile;

    var init = function() {
        var isInvalid = hasInvalidParams();

        if (isInvalid) {
            error('invalid options, missing ' + isInvalid);
        } else {
            setupDefaultParams();
            setupDom();
            setupStyles();
            loadImages(function(err) {
                if (err) {
                    error(err);
                } else {
                    kickoff();
                }
            });
        }
    };

    var hasInvalidParams = function() {
        var isInvalid;
        var requiredParams;

        if (opts.sprite) {
            requiredParams = ['id', 'path', 'extension', 'filename', 'rows'];
        } else {
            requiredParams = ['id', 'path', 'extension', 'filename', 'count'];
        }

        requiredParams.forEach(function(p) {
            if (!opts[p]) {
                isInvalid = p;
            }
        });

        return isInvalid;
    };

    var setupDefaultParams = function() {
        opts.speed = isNaN(opts.speed) ? 0.5 : Math.min(Math.max(0, parseFloat(opts.speed)), 1);

        if (opts.sprite) {
            opts.count = opts.rows.reduce(function(a, b) { return a + b; });
        } else {
            opts.count = parseInt(opts.count);
        }

        opts.path = opts.path.trim();
        if (opts.path.lastIndexOf('/') !== opts.path.length - 1) {
            opts.path += '/';
        }

        _mobile = mobile() || opts.gif;
    };

    var kickoff = function() {
        if (opts.loaded && typeof opts.loaded === 'function') {
            opts.loaded();
        }
        _ready = true;
        onResize();
        setupEvents();
        drawFrame(0);

        if (_mobile) {
            loopFrames();
        }
    };

    var setupDom = function() {
        _container = document.getElementById(opts.id);
        _container.classList.add('sketchapedia-container');

        _graphic = document.createElement('div');
        _graphic.classList.add('sketchapedia-graphic');
        _container.appendChild(_graphic);
        _canvas = createCanvas(_graphic);
        _context = _canvas.getContext('2d');
    };

    var setupStyles = function() {
        setStyles(_container, {
            'position': 'relative',
            'width': '100%',
            'overflow': 'hidden'
        });

        setStyles(_graphic, {
            'position': 'absolute',
            'top': 0,
            'left': 0
        });

        setStyles(_canvas, {
            'position': 'absolute',
            'top': 0,
            'left': 0
        });
    };

    var setupEvents = function() {
        window.addEventListener('resize', onResize, false);
        if (!_mobile) {
            window.addEventListener('scroll', onScroll, false);
        }
    };

    var loadImages = function(cb) {
        var numImages = opts.sprite ? opts.rows.length : opts.count;

        _images = createImageData(numImages);
        _frames = [];

        loadNextImage(0, numImages, cb);
    };

    var loadNextImage = function(index, numImages, cb) {
        var image = _images[index];
        loadImage(image, function(err, img) {
            if (err) {
                cb('error loading image');
            } else {
                image.img = img;

                if (index === 0) {
                    setFrameSizes(img, image.rows);
                }

                for (var j = 0; j < image.rows; j++) {
                    _frames.push({
                        imageIndex: index,
                        x: 0,
                        y: j
                    });
                }

                updateProgress(index, numImages);

                index++;

                if (index < _images.length) {
                    loadNextImage(index, numImages, cb);
                } else {
                    cb();
                }
            }
        });
    };

    var setFrameSizes = function(img, rows) {
        _naturalWidth = img.naturalWidth;
        _naturalHeight = img.naturalHeight / rows;
        _aspectRatio = Math.round(_naturalWidth / _naturalHeight * 1000) / 1000;
    };

    var updateProgress = function(index, numImages) {
        if (opts.progress && typeof opts.progress === 'function') {
            opts.progress({
                frame: (index + 1),
                total: opts.count,
                percent: Math.round(index / (numImages - 1) * 100)
            });
        }
    };

    var createImageData = function(numImages) {
        var images = [];
        for (var i = 0; i < numImages; i++) {
            var src = createImageSrc(i + 1);
            images[i] = {
                src: src,
                rows: opts.sprite ? opts.rows[i] : 1
            };
        }
        return images;
    };

    var createImageSrc = function(index) {
        var match = opts.filename.match(/\%\dd/);
        var total = match[0].charAt(1);
        var len = index.toString().length;
        var toAdd = Math.max(total - len, 0);
        var name = opts.filename.split(/\%\dd/)[0];

        var src = opts.path + name;

        for (var i = 0; i < toAdd; i++) {
            src += '0';
        }

        src += index + '.' + opts.extension;
        return src;
    };

    var createCanvas = function(el) {
        var canvas = document.createElement('canvas');
        canvas.classList.add('sketchapedia-canvas');
        el.appendChild(canvas);
        return canvas;
    };

    var loopFrames = function() {
        var len = _frames.length;
        var cur = 0;

        var advance = function() {
            drawFrame(cur);
            cur++;
            if (cur >= len) cur = 0;
            setTimeout(advance, 60);
        };

        advance();
    };

    var onResize = function() {
        _canvasWidth = _container.offsetWidth;

        if (opts.cover && !_mobile) {
            _canvasHeight = innerHeight;
            var canvasRatio = _canvasWidth / _canvasHeight;

            if (canvasRatio < _aspectRatio) {
                _crop.width = Math.floor(canvasRatio * _naturalHeight);
                _crop.height = _naturalHeight;
                _crop.offsetX = Math.floor((_naturalWidth - _crop.width) / 2);
                _crop.offsetY = 0;
            } else {
                _crop.height = Math.floor(_naturalWidth / canvasRatio);
                _crop.width = _naturalWidth;
                _crop.offsetX = 0;
                _crop.offsetY = Math.floor((_naturalHeight - _crop.height) / 2);
            }
        } else {
            _canvasHeight = Math.floor(_canvasWidth / _aspectRatio);
        }

        var canvasMargin;
        if (_mobile) {
            canvasMargin = 20;
        } else {
            canvasMargin = innerHeight - _canvasHeight;
        }

        _graphicH = _canvasHeight + canvasMargin;

        _canvas.width = _canvasWidth;
        _canvas.height = _canvasHeight;
        _canvas.style.top = Math.floor(canvasMargin / 2) + 'px';

        _graphic.style.height = _graphicH + 'px';
        _graphic.style.width = _canvasWidth + 'px';

        var factor = getFactor();

        if (_mobile) {
            _containerH = _graphicH;
        } else {
            _containerH = innerHeight * factor;
        }

        _container.style.height = _containerH + 'px';

        setTriggerPoints();

        if (!_mobile && _start) {
            updateScroll();
            updateFrame(pageYOffset - _start, true);
        }
    };

    var setTriggerPoints = function() {
        var containerBB = _container.getBoundingClientRect();
        _graphicLeft = containerBB.left;
        _start = containerBB.top;
        _end = containerBB.bottom - _graphic.offsetHeight;
    };

    var onScroll = function() {
        if (!_ticking) {
            requestAnimationFrame(updateScroll);
        }
        _ticking = true;
    };

    var updateScroll = function() {
        _ticking = false;
        if (_ready) {
            setTriggerPoints();

            if (_start < 0 && _end > 0) {
                setStyles(_graphic, {
                    'position': 'fixed',
                    'top': 0,
                    'left': _graphicLeft + 'px',
                    'bottom': 'auto'
                });
                updateFrame(Math.abs(_start));
            } else if (_end < 0) {
                setStyles(_graphic, {
                    'position': 'absolute',
                    'top': 'auto',
                    'left': 0,
                    'bottom': 0
                });
                updateFrame(_containerH);
            } else if (_start > 0) {
                setStyles(_graphic, {
                    'position': 'absolute',
                    'top': 0,
                    'left': 0,
                    'bottom': 'auto'
                });
                updateFrame(0);
            }
        }
    };

    var updateFrame = function(top, redraw) {
        var percent = top / (_containerH - _graphicH);
        percent = Math.min(Math.max(percent, 0), 1);
        var index = Math.floor(percent * (opts.count - 1));

        if (redraw || _previousFrame !== index) {
            _previousFrame = index;
            drawFrame(index);
        }
    };

    var drawFrame = function(index) {
        _context.clearRect(0, 0, _canvasWidth, _canvasHeight);

        var sx, sy, sw, sh;
        var frame = _frames[index];
        var image = _images[frame.imageIndex];

        if (opts.cover && !_mobile) {
            sx = _crop.offsetX;
            sy = _crop.offsetY + _naturalHeight * frame.y;
            sw = _crop.width;
            sh = _crop.height;
        } else {
            sx = 0;
            sy = _naturalHeight * frame.y;
            sw = _naturalWidth;
            sh = _naturalHeight;
        }

        _context.drawImage(image.img, sx, sy, sw, sh, 0, 0, _canvasWidth, _canvasHeight);
    };

    var setStyles = function(el, attrs) {
        for (var prop in attrs) {
            el.style[prop] = attrs[prop];
        }
    };

    var getFactor = function() {
        var multiplier = 10;
        var min = 2;
        return min + multiplier * (1 - opts.speed);
    };

    var loadImage = function(f, cb) {
        var img = new Image();
        img.onload = function() { cb(null, img); };
        img.onerror = function() { cb('error loading image: ' + f.src); };
        img.src = f.src;
    };

    var mobile = function() {
        var ua = navigator.userAgent;
        return /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(ua);
    };

    var error = function(msg) {
        if (console && console.error) {
            console.error('::sketchapedia:: ' + msg);
        }
    };

    init();
}
