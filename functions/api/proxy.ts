export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    const targetUrl = new URL(target);
    const origin = targetUrl.origin;

    const response = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": context.request.headers.get("User-Agent") || "",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });

    const headers = new Headers(response.headers);

    // Strip frame-blocking headers
    headers.delete("X-Frame-Options");
    headers.delete("Content-Security-Policy");
    headers.delete("Content-Security-Policy-Report-Only");

    // Allow framing
    headers.set("Access-Control-Allow-Origin", "*");

    const contentType = headers.get("Content-Type") || "";

    // For HTML responses, inject <base> tag so relative URLs
    // (CSS, JS, images) resolve against the original domain
    if (contentType.includes("text/html")) {
      let html = await response.text();

      const baseTag = `<base href="${origin}/">`;
      if (html.includes("<head>")) {
        html = html.replace("<head>", `<head>${baseTag}`);
      } else if (html.includes("<HEAD>")) {
        html = html.replace("<HEAD>", `<HEAD>${baseTag}`);
      } else {
        html = baseTag + html;
      }

      return new Response(html, {
        status: response.status,
        headers,
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (err: any) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
};
