// Cloudflare Pages Function：BGG API 專屬代理
// 對應網址：/api/bgg?endpoint=search&qs=...   或   /api/bgg?endpoint=thing&qs=...
// 由後端代為呼叫 BGG，回傳給前端時加上 CORS 與快取標頭，徹底避開瀏覽器 CORS 限制。

const ALLOWED = new Set(["search", "thing"]);

export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const endpoint = reqUrl.searchParams.get("endpoint") || "";
  const qs = reqUrl.searchParams.get("qs") || "";

  if (!ALLOWED.has(endpoint)) {
    return json({ error: "invalid endpoint" }, 400);
  }

  const target = `https://boardgamegeek.com/xmlapi2/${endpoint}?${qs}`;

  let body = "";
  let status = 502;
  // BGG 對 thing 查詢可能回 202（資料排隊中），最多重試 5 次
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BoardgameShelf/1.0)",
          "Accept": "application/xml,text/xml,*/*",
        },
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
      if (r.status === 202) {
        await sleep(1500);
        continue;
      }
      status = r.status;
      body = await r.text();
      break;
    } catch (e) {
      status = 502;
      body = "<error>upstream fetch failed</error>";
      await sleep(800);
    }
  }

  return new Response(body, {
    status,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}
