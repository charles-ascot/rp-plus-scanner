import puppeteer from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  RP_USERNAME?: string;
  RP_PASSWORD?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return new Response(JSON.stringify({ error: "Missing url parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    let browser: puppeteer.Browser | null = null;

    try {
      const targetUrl = new URL(target);

      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();

      // Mobile viewport to match the virtual device frame
      await page.setViewport({ width: 380, height: 650, deviceScaleFactor: 2 });
      await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      );

      // If Racing Post credentials are available, log in first
      const username = env.RP_USERNAME;
      const password = env.RP_PASSWORD;

      if (username && password && targetUrl.hostname.includes("racingpost")) {
        try {
          await page.goto("https://www.racingpost.com/login", {
            waitUntil: "networkidle0",
            timeout: 15000,
          });

          const emailSelector =
            'input[type="email"], input[name="email"], input[name="username"], input#email, input#username';
          const passwordSelector =
            'input[type="password"], input[name="password"], input#password';

          await page.waitForSelector(emailSelector, { timeout: 5000 });
          await page.type(emailSelector, username);
          await page.type(passwordSelector, password);

          const submitSelector = 'button[type="submit"], input[type="submit"]';
          await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
            page.click(submitSelector),
          ]);

          await new Promise((r) => setTimeout(r, 1000));
        } catch (loginErr) {
          console.log("Login attempt failed, continuing:", loginErr);
        }
      }

      // Navigate to target
      await page.goto(targetUrl.toString(), {
        waitUntil: "networkidle0",
        timeout: 20000,
      });

      // Wait for lazy-loaded content
      await new Promise((r) => setTimeout(r, 1500));

      // Screenshot
      const screenshot = await page.screenshot({ type: "png", fullPage: false });

      await browser.close();

      return new Response(screenshot, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=30",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err: any) {
      if (browser) await browser.close().catch(() => {});
      return new Response(
        JSON.stringify({ error: `Screenshot failed: ${err.message}` }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      );
    }
  },
};
