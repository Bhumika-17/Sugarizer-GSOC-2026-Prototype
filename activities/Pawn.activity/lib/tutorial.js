define(["l10n"], function (l10n) {
	var tutorial = {};

	tutorial.start = function() {
		var steps = [
			{
				title: "Pawn Activity",
				intro: "Welcome into the Pawn activity. This activity is an activity to test Sugarizer development."
			},
			{
				element: "#add-button",
				position: "bottom",
				title: "Add pawn",
				intro: "Click here to add one to three pawns on the board."
			},
			{
				element: "#picture-button",
				title: "Change background",
				intro: "Click here to choose a new background for the board."
			}
		];
    steps= steps.filter(function (obj) {
        return !('element' in obj) || ((obj.element).length && document.querySelector(obj.element) && document.querySelector(obj.element).style.display != 'none');
    });
		introJs().setOptions({
			tooltipClass:  'customTooltip',
	steps:  steps,
	prevLabel:  l10n.get("TutoPrev"),
	nextLabel:  l10n.get("TutoNext"),
	exitOnOverlayClick:  false,
	nextToDone:  false,
	showBullets:  false
		}).start();

	};

	return tutorial;
});