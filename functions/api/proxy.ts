import puppeteer from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  RP_USERNAME?: string;
  RP_PASSWORD?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let browser: puppeteer.Browser | null = null;

  try {
    const targetUrl = new URL(target);

    browser = await puppeteer.launch(context.env.BROWSER);
    const page = await browser.newPage();

    // Mobile viewport to match the virtual device frame
    await page.setViewport({ width: 380, height: 650, deviceScaleFactor: 2 });
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );

    // If Racing Post credentials are available, log in first
    const username = context.env.RP_USERNAME;
    const password = context.env.RP_PASSWORD;

    if (username && password && targetUrl.hostname.includes("racingpost")) {
      try {
        await page.goto("https://www.racingpost.com/login", {
          waitUntil: "networkidle0",
          timeout: 15000,
        });

        // Try common login form selectors
        const emailSelector =
          'input[type="email"], input[name="email"], input[name="username"], input#email, input#username';
        const passwordSelector =
          'input[type="password"], input[name="password"], input#password';

        await page.waitForSelector(emailSelector, { timeout: 5000 });
        await page.type(emailSelector, username);
        await page.type(passwordSelector, password);

        // Click submit and wait for navigation
        const submitSelector =
          'button[type="submit"], input[type="submit"]';
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }),
          page.click(submitSelector),
        ]);

        // Brief pause to ensure session cookies are set
        await new Promise((r) => setTimeout(r, 1000));
      } catch (loginErr) {
        // Login failed — continue anyway, page may still load without auth
        console.log("Login attempt failed, continuing:", loginErr);
      }
    }

    // Navigate to the target URL
    await page.goto(targetUrl.toString(), {
      waitUntil: "networkidle0",
      timeout: 20000,
    });

    // Wait a moment for any lazy-loaded content
    await new Promise((r) => setTimeout(r, 1500));

    // Take screenshot
    const screenshot = await page.screenshot({
      type: "png",
      fullPage: false,
    });

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
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};
