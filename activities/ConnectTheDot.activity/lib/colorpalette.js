

define(["sugar-web/graphics/palette", "text!colorpalette.html"], function (palette, template) {

    var colorpalette = {};

    colorpalette.ColorPalette = function (invoker, primaryText) {
        palette.Palette.call(this, invoker, primaryText);

        var container = document.createElement('div');
        container.innerHTML = template;
        this.setContent([container]);

        var that = this;
        var swatches = container.querySelectorAll('.cp-swatch');

        swatches.forEach(function (swatch) {
            swatch.addEventListener('click', function () {
                var color = swatch.getAttribute('data-color');

                // Create a fresh CustomEvent every time so .detail is never
                // read-only (initCustomEvent freezes the object).
                var evt;
                try {
                    evt = new CustomEvent('colorChanged', {
                        bubbles: true, cancelable: true,
                        detail: { color: color }
                    });
                } catch (ex) {
                    evt = document.createEvent('CustomEvent');
                    evt.initCustomEvent('colorChanged', true, true, { color: color });
                }
                // Also stamp top-level .color for any legacy listeners
                evt.color = color;

                swatches.forEach(function (s) { s.classList.remove('cp-active'); });
                swatch.classList.add('cp-active');
                that.getPalette().dispatchEvent(evt);
                that.popDown();
            });
        });
    };

    var addEventListener = function (type, listener, useCapture) {
        return this.getPalette().addEventListener(type, listener, useCapture);
    };

    colorpalette.ColorPalette.prototype = Object.create(palette.Palette.prototype, {
        addEventListener: {
            value:        addEventListener,
            enumerable:   true,
            configurable: true,
            writable:     true
        }
    });

    return colorpalette;
});
