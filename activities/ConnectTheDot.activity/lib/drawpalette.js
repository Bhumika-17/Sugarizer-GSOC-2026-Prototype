
define([
    'sugar-web/graphics/palette',
    'text!drawpalette.html'
], function (palette, template) {

    'use strict';

    var drawpalette = {};

    drawpalette.DrawPalette = function (invoker) {
        palette.Palette.call(this, invoker, 'Draw');

        var container = document.createElement('div');
        container.className = 'draw-palette-container';
        container.innerHTML = template;

        this.setContent([container]);

        var that = this;

        function dispatch(action) {
            var evt;
            try {
                evt = new CustomEvent('drawAction', {
                    bubbles: true, cancelable: true,
                    detail: { action: action }
                });
            } catch (ex) {
                evt = document.createEvent('CustomEvent');
                evt.initCustomEvent('drawAction', true, true, { action: action });
            }
            that.getPalette().dispatchEvent(evt);
            that.popDown();
        }

        var moreBtn     = container.querySelector('#draw-more-item');
        var triBtn      = container.querySelector('#draw-triangle-item');
        var squareBtn   = container.querySelector('#draw-square-item');
        var diamondBtn  = container.querySelector('#draw-diamond-item');

        if (moreBtn)    { moreBtn.addEventListener('click',    function () { dispatch('draw'); }); }
        if (triBtn)     { triBtn.addEventListener('click',     function () { dispatch('triangle'); }); }
        if (squareBtn)  { squareBtn.addEventListener('click',  function () { dispatch('square'); }); }
        if (diamondBtn) { diamondBtn.addEventListener('click', function () { dispatch('diamond'); }); }
    };

    var _addEventListener = function (type, listener, useCapture) {
        return this.getPalette().addEventListener(type, listener, useCapture);
    };

    drawpalette.DrawPalette.prototype = Object.create(
        palette.Palette.prototype, {
            addEventListener: {
                value:        _addEventListener,
                enumerable:   true,
                configurable: true,
                writable:     true
            }
        }
    );

    return drawpalette;
});
