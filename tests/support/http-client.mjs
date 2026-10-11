/* A tiny HTTP client for the API tests that keeps cookies between requests,
   the way a browser does, and sends this site as the Origin. */

export function httpClient(site) {
  const jar = new Map();

  function cookieHeader() {
    const pairs = [];
    for (const [name, value] of jar) {
      pairs.push(name + "=" + value);
    }
    return pairs.join("; ");
  }

  async function request(method, path, body, extraHeaders) {
    const headers = Object.assign({ "content-type": "application/json", origin: site.url }, extraHeaders || {});
    if (jar.size) {
      headers.cookie = cookieHeader();
    }
    const response = await fetch(site.url + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookies = response.headers.getSetCookie();
    for (const line of setCookies) {
      const pair = line.split(";")[0];
      const name = pair.slice(0, pair.indexOf("="));
      const value = pair.slice(pair.indexOf("=") + 1);
      if (value) {
        jar.set(name, value);
      } else {
        jar.delete(name);
      }
    }
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status, json: json, setCookies: setCookies };
  }

  return {
    jar: jar,
    get: function (path) {
      return request("GET", path);
    },
    post: function (path, body, headers) {
      return request("POST", path, body === undefined ? {} : body, headers);
    },
    put: function (path, body, headers) {
      return request("PUT", path, body, headers);
    },
    delete: function (path) {
      return request("DELETE", path);
    }
  };
}
