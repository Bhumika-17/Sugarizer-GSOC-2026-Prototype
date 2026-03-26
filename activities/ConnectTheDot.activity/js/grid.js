define([], function () {

var grid = {};

var COLS = 10;
var ROWS = 10;
var DOT_RADIUS = 7;
var HIT_RADIUS = 28;

var activeColor = "#b5c8f0";

var mode = "draw";
var numberTemplate = null;
var currentNumber = 1;

var canvas, ctx;
var dotSpacingX, dotSpacingY, offsetX, offsetY;

var lines = [];
var fills = [];

var dragging = false;
var dragPath = [];
var pointerPos = null;

var onLineAdded = null;
var onEraseAll = null;



grid.init = function (canvasEl, lineCallback, eraseCallback) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");

    onLineAdded = lineCallback || function () {};
    onEraseAll  = eraseCallback || function () {};

    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("pointerdown",  onPointerDown);
    canvas.addEventListener("pointermove",  onPointerMove);
    canvas.addEventListener("pointerup",    onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

    render();
};

grid.setColor = function (c) {
    activeColor = c;
};


grid.setMode = function (m, template) {

    mode = m;

    dragPath = [];
    dragging = false;

    if (mode === "number") {
        numberTemplate = template || [];
        currentNumber   = 1;
        lines = [];
        fills = [];
    } else {
        numberTemplate = null;
        currentNumber  = 1;
    }

    render();
};

grid.loadState = function (state) {

    lines  = state.lines  || [];
    fills  = state.fills  || [];

    activeColor    = state.activeColor    || "#b5c8f0";
    mode           = state.mode           || "draw";
    numberTemplate = state.numberTemplate || null;
    currentNumber  = state.currentNumber  || 1;

    render();
};

grid.getState = function () {
    return {
        lines:          lines,
        fills:          fills,
        activeColor:    activeColor,
        mode:           mode,
        numberTemplate: numberTemplate,
        currentNumber:  currentNumber
    };
};

grid.applyRemoteLine = function (lineObj) {
    _commitLine(lineObj, false);
};

grid.clearBoard = function (broadcast) {

    lines = [];
    fills = [];

    // Also reset number-mode progress so the puzzle can be retried.
    if (mode === "number") {
        currentNumber = 1;
    }

    if (broadcast && onEraseAll) {
        onEraseAll();
    }

    render();
};



function resize() {

    var c = canvas.parentElement;

    canvas.width  = c.clientWidth;
    canvas.height = c.clientHeight;

    var padX = canvas.width  * 0.07;
    var padY = canvas.height * 0.07;

    dotSpacingX = (canvas.width  - 2 * padX) / (COLS - 1);
    dotSpacingY = (canvas.height - 2 * padY) / (ROWS - 1);

    offsetX = padX;
    offsetY = padY;

    render();
}

function dotXY(r, c) {
    return {
        x: offsetX + c * dotSpacingX,
        y: offsetY + r * dotSpacingY
    };
}

function nearestDot(px, py) {

    var best     = null;
    var bestDist = HIT_RADIUS;

    for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {

            var pos  = dotXY(r, c);
            var dist = Math.hypot(px - pos.x, py - pos.y);

            if (dist < bestDist) {
                bestDist = dist;
                best     = { r: r, c: c };
            }
        }
    }

    return best;
}


function nearestTemplateDot(px, py) {

    if (!numberTemplate) return null;

    var best     = null;
    var bestDist = HIT_RADIUS;

    numberTemplate.forEach(function (d) {
        var pos  = dotXY(d.r, d.c);
        var dist = Math.hypot(px - pos.x, py - pos.y);
        if (dist < bestDist) {
            bestDist = dist;
            best     = { r: d.r, c: d.c };
        }
    });

    return best;
}

function dotsEqual(a, b) {
    return a && b && a.r === b.r && a.c === b.c;
}

function lineExists(a, b) {
    return lines.some(function (l) {
        return (l.r1 === a.r && l.c1 === a.c && l.r2 === b.r && l.c2 === b.c) ||
               (l.r1 === b.r && l.c1 === b.c && l.r2 === a.r && l.c2 === a.c);
    });
}

function dotInPath(dot) {
    return dragPath.some(function (d) {
        return dotsEqual(d, dot);
    });
}



function getCanvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function onPointerDown(e) {

    canvas.setPointerCapture(e.pointerId);

    var pos = getCanvasPos(e);

   
    var dot = (mode === "number")
        ? nearestTemplateDot(pos.x, pos.y)
        : nearestDot(pos.x, pos.y);

    if (!dot) return;

    if (mode === "number") {

        if (!numberTemplate || numberTemplate.length === 0) return;

        // The user must start from dot #1.
        var first = numberTemplate[0];
        if (dot.r !== first.r || dot.c !== first.c) return;

        currentNumber = 1;
    }

    dragging   = true;
    dragPath   = [dot];
    pointerPos = pos;

    render();
}

function onPointerMove(e) {

    if (!dragging) return;

    pointerPos = getCanvasPos(e);

    var dot = (mode === "number")
        ? nearestTemplateDot(pointerPos.x, pointerPos.y)
        : nearestDot(pointerPos.x, pointerPos.y);

    if (!dot) { render(); return; }

    var prev = dragPath[dragPath.length - 1];

    if (dotsEqual(dot, prev)) { render(); return; }

    var blocked = (mode === "number")
        ? dotInPath(dot)
        : dotsEqual(dot, dragPath.length >= 2 ? dragPath[dragPath.length - 2] : null);

    if (!blocked && !lineExists(prev, dot)) {

        if (mode === "number") {

            var nextDot = numberTemplate[currentNumber];

            if (!nextDot || nextDot.r !== dot.r || nextDot.c !== dot.c) {
                render();
                return;
            }

            currentNumber++;
        }

        var lineObj = {
            r1: prev.r, c1: prev.c,
            r2: dot.r,  c2: dot.c
        };

        _commitLine(lineObj, true);
        dragPath.push(dot);

        if (mode === "number" && currentNumber >= numberTemplate.length) {
            console.log("Puzzle completed!");
            _onPuzzleComplete();
        }
    }
}

function onPointerUp() {

    dragging   = false;
    dragPath   = [];
    pointerPos = null;

    render();
}



function _commitLine(lineObj, broadcast) {

    lineObj.color = activeColor;
    lines.push(lineObj);

    if (broadcast) {
        onLineAdded(lineObj);
    }

    render();
}

function _onPuzzleComplete() {

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle   = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    ctx.fillStyle    = "#4caf50";
    ctx.font         = "bold " + Math.round(canvas.width / 12) + "px sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★ Well done! ★", canvas.width / 2, canvas.height / 2);

    ctx.restore();

    setTimeout(render, 1500);
}



function render() {

    if (!ctx) return;          

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawLines();
    drawDots();
    drawDragPreview();         
}

function drawDragPreview() {

    if (!dragging || !pointerPos || dragPath.length === 0) return;

    var last = dragPath[dragPath.length - 1];
    var a    = dotXY(last.r, last.c);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(pointerPos.x, pointerPos.y);
    ctx.strokeStyle = activeColor;
    ctx.lineWidth   = 3;
    ctx.globalAlpha = 0.45;
    ctx.lineCap     = "round";
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
}

function drawLines() {

    lines.forEach(function (l) {

        var a = dotXY(l.r1, l.c1);
        var b = dotXY(l.r2, l.c2);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);

        ctx.strokeStyle = l.color;
        ctx.lineWidth   = 3;
        ctx.lineCap     = "round";

        ctx.stroke();
    });
}

function drawDots() {

    if (mode === "number") {
        drawNumberDots();
    } else {
        drawGridDots();
    }
}

function drawNumberDots() {

    if (!numberTemplate) return;

    var fontSize = Math.max(11, Math.round(DOT_RADIUS * 1.6));

    numberTemplate.forEach(function (d, i) {

        var pos       = dotXY(d.r, d.c);
        var isVisited = (i < currentNumber);          // already connected
        var isNext    = (i === currentNumber);         // the target dot

        // Dot circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, DOT_RADIUS + 2, 0, Math.PI * 2);

        ctx.fillStyle = isVisited ? activeColor
                      : isNext   ? "#ffcc00"
                      :            "#9ba8c0";
        ctx.fill();

        // Dot border so the "next" dot stands out clearly
        if (isNext) {
            ctx.strokeStyle = "#e67e00";
            ctx.lineWidth   = 2;
            ctx.stroke();
        }

        // Number label – centred above the dot
        ctx.font         = "bold " + fontSize + "px sans-serif";
        ctx.fillStyle    = "#222";
        ctx.textAlign    = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(i + 1, pos.x, pos.y - DOT_RADIUS - 2);
    });
}

function drawGridDots() {

    for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {

            var pos = dotXY(r, c);

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, DOT_RADIUS, 0, Math.PI * 2);

            ctx.fillStyle = "#9ba8c0";
            ctx.fill();
        }
    }
}

return grid;

});