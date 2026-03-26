define(['sugar-web/graphics/palette'], function (palette) {
    'use strict';

    // Shapes sorted by dot count — preview pts on 80x80 viewport
    var SHAPES = [
        { id: 'pentagon',  label: 'Pentagon',  dots: 5,
          pts: [[40,7],[71,30],[59,67],[21,67],[9,30]] },
        { id: 'hexagon',   label: 'Hexagon',   dots: 6,
          pts: [[73,40],[56,69],[24,69],[7,40],[23,11],[56,11]] },
        { id: 'arrow',     label: 'Arrow',     dots: 7,
          pts: [[40,5],[70,38],[55,38],[55,75],[25,75],[25,38],[10,38]] },
        { id: 'star',      label: 'Star',      dots: 10,
          pts: [[40,5],[48,29],[73,29],[53,44],[61,68],[40,54],[19,68],[27,44],[7,29],[32,29]] },
        { id: 'starburst', label: 'Starburst', dots: 16,
          pts: [[40,5],[45,27],[65,15],[53,35],[75,40],[53,45],[65,65],[45,53],[40,75],[35,53],[15,65],[27,45],[5,40],[27,35],[15,15],[35,27]] }
    ];

    function _drawShape(canvas, pts, isActive) {
        var size  = canvas.width;
        var scale = size / 80;
        var ctx   = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.moveTo(pts[0][0] * scale, pts[0][1] * scale);
        for (var i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][0] * scale, pts[i][1] * scale);
        }
        ctx.closePath();
        ctx.fillStyle   = isActive ? '#ffffff' : '#b5c8f0';
        ctx.globalAlpha = isActive ? 0.95 : 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isActive ? '#ffffff' : 'rgba(255,255,255,0.75)';
        ctx.lineWidth   = 1.6 * scale;
        ctx.lineJoin    = 'round';
        ctx.stroke();
    }

    var connectpalette = {};

    connectpalette.ConnectPalette = function (invoker) {
        palette.Palette.call(this, invoker, 'Connect');

        var container = document.createElement('div');
        container.className = 'cp2-container';

        var grid = document.createElement('div');
        grid.className = 'cp2-grid';
        container.appendChild(grid);

        var that  = this;
        var cards = [];

        SHAPES.forEach(function (s) {
            var card = document.createElement('div');
            card.className = 'cp2-card';
            card.setAttribute('data-shape', s.id);

            var cvs = document.createElement('canvas');
            cvs.width  = 40;
            cvs.height = 40;
            cvs.className = 'cp2-canvas';
            _drawShape(cvs, s.pts, false);

            var name = document.createElement('div');
            name.className   = 'cp2-name';
            name.textContent = s.label;

            var dots = document.createElement('div');
            dots.className   = 'cp2-dots';
            dots.textContent = s.dots + ' dots';

            card.appendChild(cvs);
            card.appendChild(name);
            card.appendChild(dots);

            card.addEventListener('click', function () {
                cards.forEach(function(c) {
                    c.card.classList.remove('cp2-card-active');
                    _drawShape(c.cvs, c.pts, false);
                });
                card.classList.add('cp2-card-active');
                _drawShape(cvs, s.pts, true);

                var evt;
                try {
                    evt = new CustomEvent('shapeSelected', {
                        bubbles: true, cancelable: true,
                        detail: { shape: s.id }
                    });
                } catch (ex) {
                    evt = document.createEvent('CustomEvent');
                    evt.initCustomEvent('shapeSelected', true, true, { shape: s.id });
                }
                that.getPalette().dispatchEvent(evt);
                that.popDown();
            });

            cards.push({ card: card, cvs: cvs, pts: s.pts, id: s.id });
            grid.appendChild(card);
        });

        this.setContent([container]);
        this._cards     = cards;
        this._drawShape = _drawShape;
    };

    var _addEventListener = function (type, listener, useCapture) {
        return this.getPalette().addEventListener(type, listener, useCapture);
    };

    connectpalette.ConnectPalette.prototype = Object.create(
        palette.Palette.prototype, {
            addEventListener: {
                value: _addEventListener,
                enumerable: true, configurable: true, writable: true
            }
        }
    );

    connectpalette.SHAPES = SHAPES;
    return connectpalette;
});