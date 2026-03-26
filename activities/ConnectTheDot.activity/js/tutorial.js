
define(["l10n"], function (l10n) {

    var tutorial = {};

    tutorial.start = function () {
        var steps = [
            {
                title: l10n.get("TutoWelcomeTitle"),
                intro: l10n.get("TutoWelcomeContent")
            },
            {
                element:  "#dots-canvas",
                position: "top",
                title:    l10n.get("TutoDrawTitle"),
                intro:    l10n.get("TutoDrawContent")
            },
            {
                element:  "#color-button",
                position: "bottom",
                title:    l10n.get("TutoColorTitle"),
                intro:    l10n.get("TutoColorContent")
            },
            {
                element:  "#reset-button",
                position: "bottom",
                title:    l10n.get("TutoResetTitle"),
                intro:    l10n.get("TutoResetContent")
            },
            {
                element:  "#network-button",
                position: "bottom",
                title:    l10n.get("TutoShareTitle"),
                intro:    l10n.get("TutoShareContent")
            },
            {
                element:  "#stop-button",
                position: "left",
                title:    l10n.get("TutoSaveTitle"),
                intro:    l10n.get("TutoSaveContent")
            }
        ];

        steps = steps.filter(function (obj) {
            return !('element' in obj) ||
                   (obj.element.length &&
                    document.querySelector(obj.element) &&
                    document.querySelector(obj.element).style.display !== 'none');
        });

        introJs().setOptions({
            tooltipClass:       'customTooltip',
            steps:              steps,
            prevLabel:          l10n.get("TutoPrev"),
            nextLabel:          l10n.get("TutoNext"),
            exitOnOverlayClick: false,
            nextToDone:         false,
            showBullets:        false
        }).start();
    };

    return tutorial;
});
