requirejs.config({
    baseUrl: "lib",
    paths: { activity: "../js" },
    urlArgs: "bust=" + (new Date()).getTime()
});
requirejs(["activity/activity"]);
