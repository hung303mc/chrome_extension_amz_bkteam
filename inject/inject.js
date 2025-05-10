(function (data) {
  const { window } = data;
  const swallow = () => {};

  const callHasFailed = (status) => status >= 400;

  try {
    const originalFetch = window.fetch;
    const originalXMLHttpRequest = window.XMLHttpRequest;
    const originalOpen = originalXMLHttpRequest.prototype.open;
    const originalSend = originalXMLHttpRequest.prototype.send;
    const originalGetResponseHeader =
      originalXMLHttpRequest.prototype.getResponseHeader;

    const contentTypeHeader = "Content-Type";
    const contentTypeApplicationJson = "application/json";

    let omgActive;

    const isJson = (contentType = "") =>
      contentType && contentType.indexOf(contentTypeApplicationJson) !== -1;

    const isValidJson = (data) => {
      try {
        JSON.parse(data);
        return true;
      } catch (e) {
        return false;
      }
    };

    const removePrefix = (data) => {
      let dataWithoutPrefix = data;

      if (typeof dataWithoutPrefix === "string") {
        dataWithoutPrefix = dataWithoutPrefix.replace(/[\r\n]/g, "");
        while (dataWithoutPrefix && !isValidJson(dataWithoutPrefix)) {
          dataWithoutPrefix = dataWithoutPrefix.substring(1);
        }
      }

      return dataWithoutPrefix;
    };

    const parse = (data) => {
      let parsedData = data;

      if (typeof parsedData === "string") {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          swallow(e);
        }
      }

      return parsedData;
    };

    // ============ FETCH PATCHING ============
    const patchedFetch = async (...args) => {
      try {
        const [request, config = {}] = args;
        const url = request?.url ?? request;

        let response = await originalFetch(request, config);
        let { headers } = response;
        let status = response.status;
        const callFailed = callHasFailed(status);
        const contentType = headers.get(contentTypeHeader);

        const originalResponseContent = await response.clone().text();

        if (callFailed || !contentType || isJson(contentType)) {
          const content = parse(removePrefix(originalResponseContent));
          window.postMessage({
            sender: "OMG",
            subject: "fetch_request",
            payload: { data: content, endpoint: url },
          });
        }

        return response;
      } catch (err) {}
    };

    // ============ XML HTTP REQUEST PATCHING ============
    originalXMLHttpRequest.prototype.open = function () {
      this.setMethod(arguments[0]);
      this.setUrl(arguments[1]);

      try {
        return originalOpen.apply(this, arguments);
      } catch (e) {
        swallow(e);
      }
    };

    originalXMLHttpRequest.prototype.getResponseHeader = function () {
      try {
        if (
          callHasFailed(this.status) &&
          arguments.length &&
          arguments[0] === contentTypeHeader
        ) {
          return contentTypeApplicationJson;
        }

        return originalGetResponseHeader.apply(this, arguments);
      } catch (e) {
        swallow(e);
      }
    };

    originalXMLHttpRequest.prototype.send = function () {
      try {
        if (arguments.length && arguments[0]) {
          this.setRequestContent(arguments[0]);
        }

        return originalSend.apply(this, arguments);
      } catch (e) {
        swallow(e);
      }
    };

    originalXMLHttpRequest.prototype.setRequestContent = function (
      requestContent,
    ) {
      this.requestContent = requestContent;
    };

    originalXMLHttpRequest.prototype.setMethod = function (method) {
      this.method = method;
    };

    originalXMLHttpRequest.prototype.setUrl = function (url) {
      this.url = url;
    };

    const patchedXMLHttpRequest = function () {
      const original = new originalXMLHttpRequest();
      const patched = this;

      original.onreadystatechange = function () {
        if (this.readyState === originalXMLHttpRequest.DONE) {
          const url = this.url;
          const contentType = this.getResponseHeader(contentTypeHeader);
          let status = original.status;
          const callFailed = callHasFailed(status);
          const originalResponseContent = original.response;

          patched.statusText = original.statusText;
          patched.status = original.status * 1;
          patched.response = original.response;

          if (patched.responseType === "" || patched.responseType === "text") {
            patched.responseText = original.responseText;
          }

          setTimeout(() => {
            if (callFailed || !contentType || isJson(contentType)) {
              const content = parse(removePrefix(originalResponseContent));

              window.postMessage({
                sender: "OMG",
                subject: "xhr_request",
                payload: { data: content, endpoint: url },
              });
            }

            if (patched.onreadystatechange) {
              return patched.onreadystatechange();
            }
          }, 0);
        } else {
          if (patched.onreadystatechange) {
            return patched.onreadystatechange();
          }
        }
      };

      ["readyState", "responseURL", "responseXML", "upload"].forEach((item) => {
        Object.defineProperty(patched, item, {
          get: function () {
            try {
              return original[item];
            } catch (e) {
              swallow(e);
            }
          },
        });
      });

      [
        "responseType",
        "timeout",
        "withCredentials",
        "method",
        "onabort",
        "onerror",
        "onload",
        "onloadend",
        "onloadstart",
        "onprogress",
        "ontimeout",
      ].forEach((item) => {
        Object.defineProperty(patched, item, {
          get: function () {
            try {
              return original[item];
            } catch (e) {
              swallow(e);
            }
          },
          set: function (val) {
            try {
              original[item] = val;
            } catch (e) {
              swallow(e);
            }
          },
        });
      });

      [
        "abort",
        "getAllResponseHeaders",
        "getResponseHeader",
        "open",
        "overrideMimeType",
        "send",
        "setRequestHeader",
        "addEventListener",
        "setMethod",
      ].forEach((item) => {
        Object.defineProperty(patched, item, {
          value: function () {
            try {
              return original[item].apply(original, arguments);
            } catch (e) {
              swallow(e);
            }
          },
        });
      });
    };

    // Listen for any OMG definition changes coming in
    window.addEventListener("message", (evt = {}) => {
      if (
        evt.data?.sender === "OMG" &&
        evt.data?.action === "evaluate-changes"
      ) {
        const { payload = {} } = evt.data;
        const { omgActive: oActive } = payload;

        omgActive = !!oActive;

        if (omgActive === false) {
          window.fetch = originalFetch;
          window.XMLHttpRequest = originalXMLHttpRequest;
        } else {
          window.fetch = patchedFetch;
          window.XMLHttpRequest = patchedXMLHttpRequest;
        }
      }
    });

    if (omgActive === false) {
      window.fetch = originalFetch;
      window.XMLHttpRequest = originalXMLHttpRequest;
    } else {
      window.fetch = patchedFetch;
      window.XMLHttpRequest = patchedXMLHttpRequest;
    }
  } catch (err) {}
})({ window });
