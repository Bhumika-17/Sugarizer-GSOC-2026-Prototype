define([], function () {

    'use strict';

    var DOT_SPACING = 40;   
    var DOT_RADIUS  = 4;
    var HIT_RADIUS  = 18;
    var MASK_LINE_W = 2;

    // Module state 
    var _canvas      = null;
    var _ctx         = null;
    var _lines       = [];
    var _fills       = [];
    var _activeColor = '#b5c8f0';
    var _dragging    = false;
    var _dragPath    = [];
    var _pointerPos  = null;
    var _COLS        = 0;
    var _ROWS        = 0;
    var _offX        = 0;
    var _offY        = 0;
    var _onLineAdded = null;
    var _onEraseAll  = null;
    var _rafPending  = false;
    var _bgCanvas    = null;
    var _undoStack   = [];
    var _redoStack   = [];
    var _overlay     = null;
    var _octx        = null;

    //Geometry
    function _canvasPos(e) {
        var r = _canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function _xy(r, c) {
        return { x: _offX + c * DOT_SPACING, y: _offY + r * DOT_SPACING };
    }
    function _nearest(px, py) {
        var best = null, bd = HIT_RADIUS;
        for (var r = 0; r < _ROWS; r++)
            for (var c = 0; c < _COLS; c++) {
                var p = _xy(r, c), d = Math.hypot(px - p.x, py - p.y);
                if (d < bd) { bd = d; best = { r: r, c: c }; }
            }
        return best;
    }
    function _eq(a, b) { return a && b && a.r === b.r && a.c === b.c; }
    function _lineExists(a, b) {
        return _lines.some(function (l) {
            return (l.r1===a.r&&l.c1===a.c&&l.r2===b.r&&l.c2===b.c)||
                   (l.r1===b.r&&l.c1===b.c&&l.r2===a.r&&l.c2===a.c);
        });
    }

    //  Undo / Redo 
    function _snapshot() {
        return {
            lines: _lines.map(function(l) { return Object.assign({}, l); }),
            fills: _fills.map(function(f) { return Object.assign({}, f); })
        };
    }
    function _saveSnapshot() {
        _undoStack.push(_snapshot());
        if (_undoStack.length > 60) _undoStack.shift();
        _redoStack = [];
        _updateUndoRedoBtns();
    }
    function _updateUndoRedoBtns() {
        var u = document.getElementById('undo-button');
        var rv = document.getElementById('redo-button');
        if (u)  u.disabled  = (_undoStack.length === 0);
        if (rv) rv.disabled = (_redoStack.length === 0);
    }
    function _undo() {
        if (!_undoStack.length) return;
        _redoStack.push(_snapshot());
        var snap = _undoStack.pop();
        _lines = snap.lines;
        _fills = snap.fills;
        _render();
        _updateUndoRedoBtns();
    }
    function _redo() {
        if (!_redoStack.length) return;
        _undoStack.push(_snapshot());
        var snap = _redoStack.pop();
        _lines = snap.lines;
        _fills = snap.fills;
        _render();
        _updateUndoRedoBtns();
    }
    function _onKeyDown(e) {
        if (!_canvas) return;
        if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); _undo(); }
        if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); _redo(); }
    }

    // ── Resize ────────────────────────────────────────────────
    function _onResize() {
        if (!_canvas) return;
        var p = _canvas.parentElement;
        _canvas.width  = p.clientWidth;
        _canvas.height = p.clientHeight;

        _COLS = Math.max(2, Math.floor(_canvas.width  / DOT_SPACING));
        _ROWS = Math.max(2, Math.floor(_canvas.height / DOT_SPACING));
        _offX = (_canvas.width  - (_COLS - 1) * DOT_SPACING) / 2;
        _offY = (_canvas.height - (_ROWS - 1) * DOT_SPACING) / 2;

        if (_overlay) {
            _overlay.width  = _canvas.width;
            _overlay.height = _canvas.height;
        }
        _buildBgCache();
        _recomputeAllFills();
        _render();
    }

    // ── Event handlers ────────────────────────────────────────
    function _onDown(e) {
        if (!_canvas) return;
        _canvas.setPointerCapture(e.pointerId);
        var pos = _canvasPos(e);
        var dot = _nearest(pos.x, pos.y);
        if (!dot) return;
        _saveSnapshot();
        _dragging = true; _dragPath = [dot]; _pointerPos = pos;
        _render();
        if (_overlay) _overlay.style.display = 'block';
    }

    function _onMove(e) {
        if (!_dragging || !_canvas) return;
        _pointerPos = _canvasPos(e);
        var dot = _nearest(_pointerPos.x, _pointerPos.y);
        if (dot) {
            var prev   = _dragPath[_dragPath.length - 1];
            var penult = _dragPath.length >= 2 ? _dragPath[_dragPath.length - 2] : null;
            if (!_eq(dot, prev) && !_eq(dot, penult) && !_lineExists(prev, dot)) {
                var lo = { r1: prev.r, c1: prev.c, r2: dot.r, c2: dot.c, color: _activeColor };
                _lines.push(lo);
                if (_onLineAdded) { _onLineAdded(lo); }
                _dragPath.push(dot);
                // Fast incremental redraw — BFS fill runs only on pointerup
                _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
                _fills.forEach(function (f) {
                    if (f.offscreen && f.w === _canvas.width && f.h === _canvas.height) {
                        _ctx.drawImage(f.offscreen, 0, 0);
                    }
                });
                _lines.forEach(function (l) {
                    var a = _xy(l.r1, l.c1), b = _xy(l.r2, l.c2);
                    _ctx.beginPath(); _ctx.moveTo(a.x, a.y); _ctx.lineTo(b.x, b.y);
                    _ctx.strokeStyle = l.color || _activeColor;
                    _ctx.lineWidth = 3; _ctx.lineCap = 'round'; _ctx.stroke();
                });
                if (_bgCanvas) { _ctx.drawImage(_bgCanvas, 0, 0); }
            }
        }
        _renderOverlay();
    }

    // ── Touch helpers ─────────────────────────────────────────
    function _canvasPosFromTouch(t) {
        var r = _canvas.getBoundingClientRect();
        return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function _onTouchStart(e) {
        if (!_canvas || !e.touches.length) return;
        e.preventDefault();
        var pos = _canvasPosFromTouch(e.touches[0]);
        var dot = _nearest(pos.x, pos.y);
        if (!dot) return;
        _saveSnapshot();
        _dragging = true; _dragPath = [dot]; _pointerPos = pos;
        _render();
        if (_overlay) _overlay.style.display = 'block';
    }
    function _onTouchMove(e) {
        if (!_dragging || !_canvas || !e.touches.length) return;
        e.preventDefault();
        _pointerPos = _canvasPosFromTouch(e.touches[0]);
        var dot = _nearest(_pointerPos.x, _pointerPos.y);
        if (dot) {
            var prev   = _dragPath[_dragPath.length - 1];
            var penult = _dragPath.length >= 2 ? _dragPath[_dragPath.length - 2] : null;
            if (!_eq(dot, prev) && !_eq(dot, penult) && !_lineExists(prev, dot)) {
                var lo = { r1: prev.r, c1: prev.c, r2: dot.r, c2: dot.c, color: _activeColor };
                _lines.push(lo);
                if (_onLineAdded) { _onLineAdded(lo); }
                _dragPath.push(dot);
                _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
                _fills.forEach(function (f) {
                    if (f.offscreen && f.w === _canvas.width && f.h === _canvas.height) {
                        _ctx.drawImage(f.offscreen, 0, 0);
                    }
                });
                _lines.forEach(function (l) {
                    var a = _xy(l.r1, l.c1), b = _xy(l.r2, l.c2);
                    _ctx.beginPath(); _ctx.moveTo(a.x, a.y); _ctx.lineTo(b.x, b.y);
                    _ctx.strokeStyle = l.color || _activeColor;
                    _ctx.lineWidth = 3; _ctx.lineCap = 'round'; _ctx.stroke();
                });
                if (_bgCanvas) { _ctx.drawImage(_bgCanvas, 0, 0); }
            }
        }
        _renderOverlay();
    }
    function _onTouchEnd(e) {
        e.preventDefault();
        _onUp();
    }

    function _onUp() {
        if (_dragging) {
            _dragging = false;
            if (_overlay) {
                _overlay.style.display = 'none';
                if (_octx) _octx.clearRect(0, 0, _overlay.width, _overlay.height);
            }
            // Synchronous fill + render — fill appears the instant the finger lifts,
            // no deferred setTimeout that caused the visible lag.
            _updateFills();
            _render();
        } else {
            if (_overlay) {
                _overlay.style.display = 'none';
                if (_octx) _octx.clearRect(0, 0, _overlay.width, _overlay.height);
            }
        }
        _dragPath = []; _pointerPos = null;
    }

    function _parseColor(color) {
        var tmp = document.createElement('canvas');
        tmp.width = tmp.height = 1;
        var tc = tmp.getContext('2d');
        tc.fillStyle = color; tc.fillRect(0, 0, 1, 1);
        var d = tc.getImageData(0, 0, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2] };
    }

    /**
     * Build a 1-bit mask: lines + dot outlines as black on white.
     * Thin strokes so the BFS fills flush to the visible line edge.
     */
    function _buildMask(w, h) {
        var mc = document.createElement('canvas');
        mc.width = w; mc.height = h;
        var cx = mc.getContext('2d');
        cx.fillStyle = '#ffffff';
        cx.fillRect(0, 0, w, h);
        cx.strokeStyle = '#000000';
        cx.lineWidth   = MASK_LINE_W;
        cx.lineCap     = 'round';
        _lines.forEach(function (l) {
            var a = _xy(l.r1, l.c1), b = _xy(l.r2, l.c2);
            cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
        });
        // Dots intentionally NOT drawn on mask — they are not line barriers
        // and drawing them as filled circles causes white unfilled halos around each dot.
        return cx.getImageData(0, 0, w, h);
    }

    /**
     * Fast BFS flood fill using an index pointer instead of .shift().
     * Returns array of [x,y] pixel pairs, or null if fill escapes canvas edge.
     */
    function _bfsFill(imageData, sx, sy, w, h) {
        var data    = imageData.data;
        var visited = new Uint8Array(w * h);
        // Pre-allocate flat queue as two parallel typed arrays for speed
        var qx = new Int32Array(w * h);
        var qy = new Int32Array(w * h);
        var head = 0, tail = 0;
        var points  = [];
        var escaped = false;

        function isWhite(x, y) { return data[(y * w + x) * 4] > 200; }
        if (!isWhite(sx, sy)) return null;

        visited[sy * w + sx] = 1;
        qx[tail] = sx; qy[tail] = sy; tail++;

        while (head < tail) {
            var x = qx[head], y = qy[head]; head++;
            points.push([x, y]);
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
                escaped = true; break;
            }
            // 4-connected neighbours
            var nx, ny, ni;
            nx = x+1; ny = y;   ni = ny*w+nx; if (!visited[ni] && isWhite(nx,ny)) { visited[ni]=1; qx[tail]=nx; qy[tail]=ny; tail++; }
            nx = x-1; ny = y;   ni = ny*w+nx; if (!visited[ni] && isWhite(nx,ny)) { visited[ni]=1; qx[tail]=nx; qy[tail]=ny; tail++; }
            nx = x;   ny = y+1; ni = ny*w+nx; if (!visited[ni] && isWhite(nx,ny)) { visited[ni]=1; qx[tail]=nx; qy[tail]=ny; tail++; }
            nx = x;   ny = y-1; ni = ny*w+nx; if (!visited[ni] && isWhite(nx,ny)) { visited[ni]=1; qx[tail]=nx; qy[tail]=ny; tail++; }
        }
        return escaped ? null : points;
    }

    /** Paint an array of [x,y] pixels onto an offscreen canvas in the given color. */
    function _pointsToCanvas(points, rgb, w, h) {
        var oc = document.createElement('canvas');
        oc.width = w; oc.height = h;
        var cx = oc.getContext('2d');
        var id = cx.createImageData(w, h);
        var fd = id.data;
        var R = rgb.r, G = rgb.g, B = rgb.b;
        for (var i = 0; i < points.length; i++) {
            var idx = (points[i][1] * w + points[i][0]) * 4;
            fd[idx] = R; fd[idx+1] = G; fd[idx+2] = B; fd[idx+3] = 255;
        }
        cx.putImageData(id, 0, 0);
        return oc;
    }


    function _updateFills() {
        if (!_canvas) return;
        var w = _canvas.width, h = _canvas.height;
        var maskData = _buildMask(w, h);
        // Color comes from the last line added (the one that closed the shape)
        var triggerLineIdx = _lines.length - 1;
        var triggerColor = triggerLineIdx >= 0 ? _lines[triggerLineIdx].color : _activeColor;
        var alreadyFilled = new Uint8Array(w * h);
        _fills.forEach(function (f) {
            if (f.w !== w || f.h !== h) return;
            for (var i = 0; i < f.points.length; i++) {
                alreadyFilled[f.points[i][1] * w + f.points[i][0]] = 1;
            }
        });
        var rgb = _parseColor(triggerColor);
        for (var r = 0; r < _ROWS - 1; r++) {
            for (var c = 0; c < _COLS - 1; c++) {
                var tl = _xy(r, c), br = _xy(r+1, c+1);
                var sx = Math.round((tl.x + br.x) / 2);
                var sy = Math.round((tl.y + br.y) / 2);
                if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
                if (alreadyFilled[sy * w + sx]) continue;
                var points = _bfsFill(maskData, sx, sy, w, h);
                if (!points || points.length === 0) continue;
                for (var pi = 0; pi < points.length; pi++) {
                    alreadyFilled[points[pi][1] * w + points[pi][0]] = 1;
                }
                var oc = _pointsToCanvas(points, rgb, w, h);
                // Store lineIdx so color can be recovered on resize without using pixel coords
                _fills.push({ points: points, color: triggerColor, rgb: rgb,
                               lineIdx: triggerLineIdx, w: w, h: h, offscreen: oc });
            }
        }
    }

    function _recomputeAllFills() {
        if (!_canvas || _lines.length === 0) { _fills = []; return; }
        var w = _canvas.width, h = _canvas.height;

        var maskData = _buildMask(w, h);
        var alreadyFilled = new Uint8Array(w * h);
        var newFills = [];

        // Rebuild fills from existing fill list — use stored color directly.
        // Each fill already knows its color; we just need to regenerate the
        // offscreen pixel data for the new canvas size.
        for (var fi = 0; fi < _fills.length; fi++) {
            var f = _fills[fi];
            var fc = f.color;
            // Find a seed point for this fill's region using its stored points
            // mapped back to canvas coords (take midpoint of first two points)
            if (!f.points || !f.points.length) continue;
            // Use the centre of the fill's bounding box as seed
            var minX=w,minY=h,maxX=0,maxY=0;
            for (var pi2=0;pi2<f.points.length;pi2++){
                var px2=Math.round(f.points[pi2][0]*(w/f.w));
                var py2=Math.round(f.points[pi2][1]*(h/f.h));
                if(px2<minX)minX=px2; if(px2>maxX)maxX=px2;
                if(py2<minY)minY=py2; if(py2>maxY)maxY=py2;
            }
            var sx=Math.round((minX+maxX)/2), sy=Math.round((minY+maxY)/2);
            if(sx<0||sy<0||sx>=w||sy>=h)continue;
            if(alreadyFilled[sy*w+sx])continue;
            var pts=_bfsFill(maskData,sx,sy,w,h);
            if(!pts||!pts.length)continue;
            for(var pi3=0;pi3<pts.length;pi3++)
                alreadyFilled[pts[pi3][1]*w+pts[pi3][0]]=1;
            var rgb=_parseColor(fc);
            var oc=_pointsToCanvas(pts,rgb,w,h);
            newFills.push({points:pts,color:fc,rgb:rgb,lineIdx:f.lineIdx,w:w,h:h,offscreen:oc});
        }
        _fills = newFills;
    }

    // ── RAF throttle ───────────────────────────────────────────
    function _scheduleRender() {
        if (_rafPending) return;
        _rafPending = true;
        requestAnimationFrame(function () { _rafPending = false; _render(); });
    }

    // ── Background dot cache ───────────────────────────────────
    function _buildBgCache() {
        if (!_canvas) return;
        _bgCanvas = document.createElement('canvas');
        _bgCanvas.width  = _canvas.width;
        _bgCanvas.height = _canvas.height;
        var cx = _bgCanvas.getContext('2d');
        for (var r = 0; r < _ROWS; r++)
            for (var c = 0; c < _COLS; c++) {
                var pos = _xy(r, c);
                cx.beginPath(); cx.arc(pos.x, pos.y, DOT_RADIUS, 0, Math.PI * 2);
                cx.fillStyle = '#7a8aaa'; cx.fill();
            }
    }

    // ── Overlay ────────────────────────────────────────────────
    function _renderOverlay() {
        if (!_octx || !_overlay) return;
        _octx.clearRect(0, 0, _overlay.width, _overlay.height);
        if (!_dragging || !_pointerPos || !_dragPath.length) return;
        var last = _dragPath[_dragPath.length - 1];
        var la = _xy(last.r, last.c);
        _octx.save();
        _octx.beginPath(); _octx.moveTo(la.x, la.y);
        _octx.lineTo(_pointerPos.x, _pointerPos.y);
        _octx.strokeStyle = _activeColor; _octx.lineWidth = 3;
        _octx.globalAlpha = 0.45; _octx.lineCap = 'round';
        _octx.setLineDash([6, 4]); _octx.stroke();
        _octx.restore();
    }

    // ── Render ─────────────────────────────────────────────────
    function _render() {
        if (!_ctx) return;
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
        _fills.forEach(function (f) {
            if (!f.offscreen) return;
            if (f.w !== _canvas.width || f.h !== _canvas.height) return;
            _ctx.drawImage(f.offscreen, 0, 0);
        });
        _lines.forEach(function (l) {
            var a = _xy(l.r1, l.c1), b = _xy(l.r2, l.c2);
            _ctx.beginPath(); _ctx.moveTo(a.x, a.y); _ctx.lineTo(b.x, b.y);
            _ctx.strokeStyle = l.color || _activeColor;
            _ctx.lineWidth = 3; _ctx.lineCap = 'round'; _ctx.stroke();
        });
        // Dots: faded inside fills, normal outside (one getImageData total)
        if (_fills.length === 0) {
            if (_bgCanvas) { _ctx.drawImage(_bgCanvas, 0, 0); }
        } else {
            var w2 = _canvas.width, h2 = _canvas.height;
            var fp = _ctx.getImageData(0, 0, w2, h2).data;
            _ctx.save();
            for (var dr = 0; dr < _ROWS; dr++) {
                for (var dc = 0; dc < _COLS; dc++) {
                    var dpos = _xy(dr, dc);
                    var dpx = Math.min(w2-1, Math.round(dpos.x));
                    var dpy = Math.min(h2-1, Math.round(dpos.y));
                    _ctx.beginPath();
                    _ctx.arc(dpos.x, dpos.y, DOT_RADIUS, 0, Math.PI * 2);
                    _ctx.globalAlpha = fp[(dpy*w2+dpx)*4+3] > 10 ? 0.25 : 1.0;
                    _ctx.fillStyle = '#7a8aaa';
                    _ctx.fill();
                }
            }
            _ctx.restore();
        }
    }

    // ── Public API ─────────────────────────────────────────────
    var pokpok = {};
    var _resizeObserver = null;

    pokpok.init = function (canvasEl, lineCallback, eraseCallback) {
        _canvas = canvasEl; _ctx = _canvas.getContext('2d');
        _lines = []; _fills = [];
        _dragging = false; _dragPath = []; _pointerPos = null;
        _rafPending = false; _bgCanvas = null;
        _undoStack = []; _redoStack = [];
        _onLineAdded = lineCallback  || function () {};
        _onEraseAll  = eraseCallback || function () {};

        _overlay = document.createElement('canvas');
        _overlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;display:none;';
        var par = _canvas.parentElement;
        par.style.overflow = 'hidden';
        par.appendChild(_overlay);
        _octx = _overlay.getContext('2d');

        _canvas.addEventListener('pointerdown',   _onDown);
        _canvas.addEventListener('pointermove',   _onMove);
        _canvas.addEventListener('pointerup',     _onUp);
        _canvas.addEventListener('pointercancel', _onUp);
        _canvas.addEventListener('touchstart',    _onTouchStart, { passive: false });
        _canvas.addEventListener('touchmove',     _onTouchMove,  { passive: false });
        _canvas.addEventListener('touchend',      _onTouchEnd,   { passive: false });
        _canvas.addEventListener('touchcancel',   _onTouchEnd,   { passive: false });
        document.addEventListener('keydown', _onKeyDown);

        // ResizeObserver fires on split-screen, zoom, and window resize —
        // more reliable than window 'resize' which misses layout-only changes.
        if (typeof ResizeObserver !== 'undefined') {
            _resizeObserver = new ResizeObserver(function () { _onResize(); });
            _resizeObserver.observe(par);
        } else {
            window.addEventListener('resize', _onResize);
        }
        _onResize();
    };

    pokpok.undo = _undo;
    pokpok.redo = _redo;
    pokpok.setColor = function (c) { _activeColor = c; };

    pokpok.clearBoard = function (broadcast) {
        _lines = []; _fills = []; _dragging = false; _dragPath = [];
        if (broadcast && _onEraseAll) { _onEraseAll(); }
        _render();
    };

    pokpok.getState = function () {
        return { lines: _lines, activeColor: _activeColor, mode: 'pokpok' };
    };

    pokpok.loadState = function (state) {
        _lines = state.lines || []; _activeColor = state.activeColor || '#b5c8f0';
        _fills = [];
        if (_canvas) { _recomputeAllFills(); _render(); }
    };

    pokpok.applyRemoteLine = function (lineObj) {
        lineObj.color = lineObj.color || _activeColor;
        _lines.push(lineObj); _updateFills(); _scheduleRender();
    };

    pokpok.destroy = function () {
        if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null; }
        else { window.removeEventListener('resize', _onResize); }
        document.removeEventListener('keydown', _onKeyDown);
        if (_canvas) {
            _canvas.removeEventListener('pointerdown',   _onDown);
            _canvas.removeEventListener('pointermove',   _onMove);
            _canvas.removeEventListener('pointerup',     _onUp);
            _canvas.removeEventListener('pointercancel', _onUp);
            _canvas.removeEventListener('touchstart',    _onTouchStart);
            _canvas.removeEventListener('touchmove',     _onTouchMove);
            _canvas.removeEventListener('touchend',      _onTouchEnd);
            _canvas.removeEventListener('touchcancel',   _onTouchEnd);
            if (_ctx) { _ctx.clearRect(0, 0, _canvas.width, _canvas.height); }
        }
        if (_overlay && _overlay.parentElement) { _overlay.parentElement.removeChild(_overlay); }
        _canvas = _ctx = null; _bgCanvas = null; _overlay = _octx = null;
        _dragging = false; _dragPath = []; _pointerPos = null; _fills = [];
    };

    return pokpok;
});
