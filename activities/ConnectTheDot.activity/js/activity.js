define([
    "sugar-web/activity/activity",
    "sugar-web/env",
    "sugar-web/graphics/icon",
    "sugar-web/datastore",
    "l10n",
    "humane",
    "sugar-web/graphics/presencepalette",
    "activity/pokpok-grid",
    "activity/number-grid",
    "activity/game-mode",
    "activity/tutorial",
    "colorpalette",
    "connectpalette"
], function (
    activity, env, icon, datastore, l10n, humane,
    presencepalette,
    pokpokGrid, numberGrid, gameMode,
    tutorial,
    colorpalette,
    connectpalette
) {

requirejs(["domReady!"], function (doc) {

    activity.setup();

    var canvasEl    = document.getElementById("dots-canvas");
    var activeColor = "#b5c8f0";
    var currentMode    = null;
    var currentHandler = null;
    var currentenv     = null;
    var presence = null;
    var isHost   = false;

    function _setDrawOnlyVisible(v) {
        document.querySelectorAll(".draw-only").forEach(function(el) {
            el.style.display = v ? "inline-block" : "none";
        });
    }
    function _updateModeButtons(mode) {
        ["draw","number","game"].forEach(function(m) {
            var b = document.getElementById("btn-" + m);
            if (b) b.classList.toggle("mode-btn-active", m === mode);
        });
    }

    function switchMode(newMode) {
        if (newMode === currentMode && currentHandler !== null) return;

        if (currentHandler && typeof currentHandler.destroy === "function") {
            currentHandler.destroy();
        }
        currentHandler = null;
        currentMode    = newMode;

        _updateModeButtons(newMode);
        _setDrawOnlyVisible(newMode === "pokpok");

        if (newMode === "pokpok") {
            currentHandler = pokpokGrid;
            currentHandler.init(
                canvasEl,
                function(lineObj) {
                    if (presence) presence.sendMessage(presence.getSharedInfo().id, {
                        user: presence.getUserInfo(), content: { action: "line", data: lineObj }
                    });
                },
                function() {
                    if (presence) presence.sendMessage(presence.getSharedInfo().id, {
                        user: presence.getUserInfo(), content: { action: "clear" }
                    });
                }
            );
        } else if (newMode === "number") {
            currentHandler = numberGrid;
            currentHandler.init(canvasEl);
        } else if (newMode === "game") {
            currentHandler = gameMode;
            currentHandler.init(canvasEl, !!presence, function(payload) {
                if (presence) presence.sendMessage(presence.getSharedInfo().id, {
                    user: presence.getUserInfo(),
                    content: Object.assign({ action: payload.action }, payload)
                });
            }, null);
        }

        if (currentHandler) currentHandler.setColor(activeColor);
    }

    var netPalette = new presencepalette.PresencePalette(
        document.getElementById("network-button"), undefined
    );

    var colorPal = new colorpalette.ColorPalette(
        document.getElementById("color-button"), "Color"
    );
    colorPal.addEventListener("colorChanged", function(e) {
        activeColor = (e.detail && e.detail.color) ? e.detail.color : e.color;
        if (!activeColor) return;
        if (currentHandler) currentHandler.setColor(activeColor);
        document.getElementById("color-button").style.borderBottom = "4px solid " + activeColor;
        if (presence) presence.sendMessage(presence.getSharedInfo().id, {
            user: presence.getUserInfo(), content: { action: "color", data: activeColor }
        });
    });

    var connectPal = new connectpalette.ConnectPalette(
        document.getElementById("btn-number")
    );
    connectPal.addEventListener("shapeSelected", function(e) {
        var shape = e.detail && e.detail.shape ? e.detail.shape : "star";

        if (currentMode !== "number") switchMode("number");
        if (currentHandler && currentHandler.setShape) {
            currentHandler.setShape(shape);
        }
        connectPal.getPalette().querySelectorAll(".cp2-card").forEach(function(c) {
            c.classList.toggle("cp2-card-active", c.getAttribute("data-shape") === shape);
        });
    });

    document.getElementById("btn-draw").addEventListener("click", function() { switchMode("pokpok"); });
    document.getElementById("btn-game").addEventListener("click", function() { switchMode("game"); });

    document.getElementById("btn-number").addEventListener("click", function() {
        if (currentMode !== "number") switchMode("number");
    });

    document.getElementById("undo-button").addEventListener("click", function() {
        if (currentMode === "pokpok" && currentHandler && currentHandler.undo) currentHandler.undo();
    });
    document.getElementById("redo-button").addEventListener("click", function() {
        if (currentMode === "pokpok" && currentHandler && currentHandler.redo) currentHandler.redo();
    });

    var onNetworkDataReceived = function(msg) {
        if (presence.getUserInfo().networkId === msg.user.networkId) return;
        switch (msg.content.action) {
            case "init":  if (currentHandler && currentHandler.loadState) currentHandler.loadState(msg.content.data); break;
            case "line":  if (currentMode === "pokpok" && currentHandler && currentHandler.applyRemoteLine) currentHandler.applyRemoteLine(msg.content.data); break;
            case "clear": if (currentHandler) currentHandler.clearBoard(false); break;
            case "game-move": case "game-join": case "game-clear":
                if (currentMode === "game" && currentHandler && currentHandler.applyRemoteMove) currentHandler.applyRemoteMove(msg.content); break;
        }
    };
    var onNetworkUserChanged = function(msg) {
        if (isHost) presence.sendMessage(presence.getSharedInfo().id, {
            user: presence.getUserInfo(),
            content: { action: "init", data: currentHandler ? currentHandler.getState() : {} }
        });
    };

    env.getEnvironment(function(err, environment) {
        currentenv = environment;
        l10n.init(environment.user ? environment.user.language : navigator.language);

        switchMode("pokpok");

        if (environment.objectId) {
            activity.getDatastoreObject().loadAsText(function(error, metadata, data) {
                if (error === null && data !== null) {
                    try {
                        var state = JSON.parse(data);
                        if (state.mode === "number") switchMode("number");
                        if (state.mode === "game")   switchMode("game");
                        if (currentHandler && currentHandler.loadState) currentHandler.loadState(state);
                    } catch(ex) { console.error("parse error", ex); }
                }
            });
        }

        if (environment.sharedId) {
            presence = activity.getPresenceObject(function(error, network) {
                network.onDataReceived(onNetworkDataReceived);
                network.onSharedActivityUserChanged(onNetworkUserChanged);
            });
        }
    });

    netPalette.addEventListener("shared", function() {
        netPalette.popDown();
        presence = activity.getPresenceObject(function(error, network) {
            if (error) { console.error("sharing error", error); return; }
            network.createSharedActivity("org.sugarlabs.ConnectTheDot", function() { isHost = true; });
            network.onDataReceived(onNetworkDataReceived);
            network.onSharedActivityUserChanged(onNetworkUserChanged);
        });
    });

    document.getElementById("reset-button").addEventListener("click", function() {
        if (currentHandler) currentHandler.clearBoard(true);
    });

    document.getElementById("save-image-button").addEventListener("click", function() {
        var o = document.createElement("canvas");
        o.width = canvasEl.width; o.height = canvasEl.height;
        o.getContext("2d").drawImage(canvasEl, 0, 0);
        var mime = "image/png", data = o.toDataURL(mime, 1);
        var name = (currentenv && currentenv.user && currentenv.user.name) ? currentenv.user.name : "Student";
        datastore.create({ mimetype: mime, title: "ConnectTheDot by " + name,
            activity: "org.olpcfrance.MediaViewerActivity",
            timestamp: new Date().getTime(), creation_time: new Date().getTime(), file_size: 0 },
            function(err) { if (!err) humane.log(l10n.get("ImageSaved")); }, data);
    });

    document.getElementById("stop-button").addEventListener("click", function() {
        var state = currentHandler ? currentHandler.getState() : {};
        activity.getDatastoreObject().setDataAsText(JSON.stringify(state));
        activity.getDatastoreObject().save(function() {});
    });

    document.getElementById("help-button").addEventListener("click", function() { tutorial.start(); });

});
});
