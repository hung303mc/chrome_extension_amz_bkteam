(function (data) {
  const { chrome, window } = data;
  try {
    chrome.storage.local.get(["omgActive"], (data) => {
      const { omgActive } = data;

      window.postMessage(
        { sender: "OMG", action: "evaluate-changes", payload: { omgActive } },
        location.origin,
      );
    });
  } catch (err) {}
})({ window, chrome });
