

define([
    'sugar-web/graphics/palette',
    'text!modepalette.html'
], function (palette, template) {

    'use strict';

    var modepalette = {};

    modepalette.ModePalette = function (invoker) {


        palette.Palette.call(this, invoker, 'Mode');

        var container = document.createElement('div');
        container.className   = 'mode-palette-container';
        container.innerHTML   = template;

        this.setContent([container]);

        var that = this;

        function dispatchMode(mode) {
            var evt;
            try {
                evt = new CustomEvent('modeSelected', {
                    bubbles:    true,
                    cancelable: true,
                    detail:     { mode: mode }
                });
            } catch (ex) {
                evt = document.createEvent('CustomEvent');
                evt.initCustomEvent('modeSelected', true, true, { mode: mode });
            }
            that.getPalette().dispatchEvent(evt);
            that.popDown();
        }

        var pokpokBtn = container.querySelector('#pokpok-mode-item');
        var numberBtn = container.querySelector('#number-mode-item');
        var gameBtn   = container.querySelector('#game-mode-item');

        if (pokpokBtn) {
            pokpokBtn.addEventListener('click', function () { dispatchMode('pokpok'); });
        }
        if (numberBtn) {
            numberBtn.addEventListener('click', function () { dispatchMode('number'); });
        }
        if (gameBtn) {
            gameBtn.addEventListener('click', function () { dispatchMode('game'); });
        }
    };

    var _addEventListener = function (type, listener, useCapture) {
        return this.getPalette().addEventListener(type, listener, useCapture);
    };

    modepalette.ModePalette.prototype = Object.create(
        palette.Palette.prototype, {
            addEventListener: {
                value:        _addEventListener,
                enumerable:   true,
                configurable: true,
                writable:     true
            }
        }
    );

    return modepalette;
});
