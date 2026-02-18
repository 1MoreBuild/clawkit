import { describe, expect, it } from "vitest";

import { createByrClient } from "../src/domain/client.js";

type FetchImpl = typeof fetch;

type MockFetchRequest = {
  method: string;
  url: URL;
  headers: Headers;
  body: string;
};

type MockFetchHandler = (request: MockFetchRequest) => Response | Promise<Response>;

function createMockFetch(handler: MockFetchHandler): {
  fetchImpl: FetchImpl;
  calls: MockFetchRequest[];
} {
  const calls: MockFetchRequest[] = [];

  const fetchImpl: FetchImpl = async (input, init) => {
    const request = new Request(input, init);
    const body = request.body === null ? "" : await request.text();

    const call: MockFetchRequest = {
      method: request.method,
      url: new URL(request.url),
      headers: new Headers(request.headers),
      body,
    };

    calls.push(call);
    return handler(call);
  };

  return { fetchImpl, calls };
}

describe("real BYR upstream client", () => {
  it("requires authentication inputs", async () => {
    const { fetchImpl, calls } = createMockFetch(async () => new Response("", { status: 200 }));

    const client = createByrClient({
      fetchImpl,
      baseUrl: "https://byr.pt",
    });

    await expect(client.search("ubuntu", 1)).rejects.toMatchObject({
      code: "E_AUTH_REQUIRED",
    });
    expect(calls).toHaveLength(0);
  });

  it("uses BYR_COOKIE for authenticated search", async () => {
    const searchHtml = `
      <html>
        <body>
          <table>
            <tr>
              <td>category</td>
              <td><a href="details.php?id=101">[OS][Linux] Ubuntu 24.04 LTS</a></td>
              <td>4.6 GB</td>
              <td><a href="seeders.php?id=101">82</a></td>
              <td><a href="leechers.php?id=101">5</a></td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const { fetchImpl, calls } = createMockFetch(async (request) => {
      if (request.url.pathname === "/torrents.php") {
        return new Response(searchHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }

      return new Response("Not found", { status: 404 });
    });

    const client = createByrClient({
      fetchImpl,
      baseUrl: "https://byr.pt",
      cookie: "uid=abc; pass=def",
    });

    const items = await client.search("ubuntu", 5);

    expect(items).toMatchObject([
      {
        id: "101",
        title: "[OS][Linux] Ubuntu 24.04 LTS",
        size: "4.6 GB",
        seeders: 82,
        leechers: 5,
      },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("cookie")).toContain("uid=abc");
    expect(calls[0]?.headers.get("cookie")).toContain("pass=def");
  });

  it("can login with username/password before search", async () => {
    const loginHtml = `
      <html>
        <body>
          <form action="/takelogin.php" method="post">
            <input type="hidden" name="returnto" value="/" />
            <input type="text" name="username" value="" />
            <input type="password" name="password" value="" />
          </form>
        </body>
      </html>
    `;

    const verifyHtml = '<html><body><a href="torrents.php">torrents</a></body></html>';
    const searchHtml = `
      <html>
        <body>
          <table>
            <tr>
              <td><a href="details.php?id=202">[TV] Severance S02E05</a></td>
              <td>9.4 GB</td>
              <td><a href="seeders.php?id=202">18</a></td>
              <td><a href="leechers.php?id=202">2</a></td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const { fetchImpl, calls } = createMockFetch(async (request) => {
      if (request.method === "GET" && request.url.pathname === "/login.php") {
        return new Response(loginHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }

      if (request.method === "POST" && request.url.pathname === "/takelogin.php") {
        const headers = new Headers();
        headers.append("set-cookie", "uid=101; Path=/");
        headers.append("set-cookie", "pass=abc123; Path=/");

        return new Response("", {
          status: 302,
          headers,
        });
      }

      if (request.method === "GET" && request.url.pathname === "/torrents.php") {
        if (request.url.search.length === 0) {
          return new Response(verifyHtml, {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }

        return new Response(searchHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }

      return new Response("not found", { status: 404 });
    });

    const client = createByrClient({
      fetchImpl,
      baseUrl: "https://byr.pt",
      username: "alice",
      password: "secret",
    });

    const items = await client.search("severance", 1);
    expect(items[0]?.id).toBe("202");

    const loginPostCall = calls.find(
      (call) => call.method === "POST" && call.url.pathname === "/takelogin.php",
    );

    expect(loginPostCall?.body).toContain("username=alice");
    expect(loginPostCall?.body).toContain("password=secret");

    const searchCall = calls.find(
      (call) =>
        call.method === "GET" &&
        call.url.pathname === "/torrents.php" &&
        call.url.search.length > 0,
    );

    expect(searchCall?.headers.get("cookie")).toContain("uid=101");
    expect(searchCall?.headers.get("cookie")).toContain("pass=abc123");
  });

  it("auto-paginates search when --page is not specified", async () => {
    const createSearchHtml = (ids: string[], nextPage?: number): string => {
      const rows = ids
        .map(
          (id, index) => `
          <tr>
            <td><a href="details.php?id=${id}">[Movie] Item ${id}</a></td>
            <td>${index + 1}.0 GB</td>
            <td><a href="seeders.php?id=${id}">${10 - index}</a></td>
            <td><a href="leechers.php?id=${id}">${index}</a></td>
          </tr>
        `,
        )
        .join("");

      const pager =
        nextPage === undefined
          ? `<p style="text-align:center"><span class="gray"><b>3&nbsp;-&nbsp;3</b></span></p>`
          : `<p style="text-align:center"><span class="gray"><b>1&nbsp;-&nbsp;2</b></span> | <a href="torrents.php?page=${nextPage}"><b>3&nbsp;-&nbsp;3</b></a></p>`;

      return `
        <html>
          <body>
            ${pager}
            <table class="torrents">
              <tr>
                <th>标题</th>
                <th>大小</th>
                <th>做种</th>
                <th>下载</th>
              </tr>
              ${rows}
            </table>
          </body>
        </html>
      `;
    };

    const { fetchImpl, calls } = createMockFetch(async (request) => {
      if (request.url.pathname === "/torrents.php") {
        const page = request.url.searchParams.get("page");
        if (page === null) {
          return new Response(createSearchHtml(["1001", "1002"], 1), {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        if (page === "1") {
          return new Response(createSearchHtml(["1003"]), {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
      }
      return new Response("Not found", { status: 404 });
    });

    const client = createByrClient({
      fetchImpl,
      baseUrl: "https://byr.pt",
      cookie: "uid=abc; pass=def",
    });

    const result = await client.searchWithMeta?.("item", 3);
    expect(result?.items.map((item) => item.id)).toEqual(["1001", "1002", "1003"]);
    expect(result?.matchedTotal).toBe(3);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url.searchParams.get("page")).toBeNull();
    expect(calls[1]?.url.searchParams.get("page")).toBe("1");
  });

  it("builds plan and downloads torrent payload", async () => {
    const detailHtml = `
      <html>
        <head><title>BYRBT :: 种子详情 "[Movie] Sample Release" - Powered by NexusPHP</title></head>
        <body>
          <table>
            <tr>
              <td>大小</td><td>1.2 GB</td>
              <td>做种数</td><td>12</td>
              <td>下载数</td><td>3</td>
            </tr>
            <tr>
              <td>类型</td><td>电影</td>
              <td>发布时间</td><td>2026-02-12 08:30:45</td>
            </tr>
          </table>
          <a href="download.php?id=303&passkey=xyz">Download</a>
        </body>
      </html>
    `;

    const payload = new Uint8Array([1, 2, 3, 4]);

    const { fetchImpl } = createMockFetch(async (request) => {
      if (request.url.pathname === "/details.php") {
        return new Response(detailHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }

      if (request.url.pathname === "/download.php") {
        return new Response(payload, {
          status: 200,
          headers: {
            "content-type": "application/x-bittorrent",
            "content-disposition": "attachment; filename=sample-release.torrent",
          },
        });
      }

      return new Response("not found", { status: 404 });
    });

    const client = createByrClient({
      fetchImpl,
      baseUrl: "https://byr.pt",
      cookie: "uid=1; pass=ok",
    });

    const detail = await client.getById("303");
    expect(detail).toMatchObject({
      id: "303",
      title: "[Movie] Sample Release",
      size: "1.2 GB",
      seeders: 12,
      leechers: 3,
      category: "电影",
    });

    const plan = await client.getDownloadPlan("303");
    expect(plan.sourceUrl).toContain("download.php?id=303");

    const torrent = await client.downloadTorrent("303");
    expect(torrent.fileName).toBe("sample-release.torrent");
    expect(Array.from(torrent.content)).toEqual(Array.from(payload));
  });

  it("builds search URL with BYR advanced filters", async () => {
    const searchHtml = `
      <html>
        <body>
          <table>
            <tr>
              <td><a href="details.php?id=901">[Movie] Filtered</a></td>
              <td>1.0 GB</td>
              <td><a href="seeders.php?id=901">5</a></td>
              <td><a href="leechers.php?id=901">1</a></td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const { fetchImpl, calls } = createMockFetch(async (request) => {
      if (request.url.pathname === "/torrents.php") {
        return new Response(searchHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const client = createByrClient({
      fetchImpl,
      baseUrl: "https://byr.pt",
      cookie: "uid=abc; pass=def",
    });

    await client.search("", 5, {
      imdb: "tt0133093",
      categoryIds: [408, 401],
      incldead: 2,
      spstate: 4,
      bookmarked: 1,
      page: 3,
    });

    expect(calls).toHaveLength(1);
    const searchUrl = calls[0]?.url;
    expect(searchUrl?.searchParams.get("search")).toBe("tt0133093");
    expect(searchUrl?.searchParams.get("search_area")).toBe("4");
    expect(searchUrl?.searchParams.get("cat408")).toBe("1");
    expect(searchUrl?.searchParams.get("cat401")).toBe("1");
    expect(searchUrl?.searchParams.get("incldead")).toBe("2");
    expect(searchUrl?.searchParams.get("spstate")).toBe("4");
    expect(searchUrl?.searchParams.get("inclbookmarked")).toBe("1");
    expect(searchUrl?.searchParams.get("page")).toBe("3");
  });

  it("parses user info via multi-page workflow", async () => {
    const indexHtml = `
      <html><body><a href="userdetails.php?id=9527">mock-user</a></body></html>
    `;
    const detailHtml = `
      <html>
        <body>
          <table>
            <tr>
              <td>用户名</td><td>mock-user</td>
              <td>等级</td><td>Power User</td>
            </tr>
            <tr>
              <td>传输</td><td>Uploaded 1 TB Downloaded 300 GB Actual uploaded 900 GB Actual downloaded 200 GB</td>
              <td>消息</td><td>3</td>
            </tr>
            <tr>
              <td>魔力</td><td>100</td>
              <td>做种积分</td><td>20</td>
            </tr>
            <tr>
              <td>加入日期</td><td>2024-01-01 00:00:00</td>
              <td>最近动向</td><td>2026-02-10 00:00:00</td>
            </tr>
          </table>
          <a href="myhr.php">H&R 2/5</a>
        </body>
      </html>
    `;
    const bonusHtml = `<html><body><p>You are currently getting 9.5 bonus points per hour.</p></body></html>`;
    const seedingHtml = `<html><body>6 | 600 GB</body></html>`;
    const uploadedHtml = `<html><body><b>11</b>条记录</body></html>`;

    const { fetchImpl } = createMockFetch(async (request) => {
      if (request.url.pathname === "/index.php") {
        return new Response(indexHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (request.url.pathname === "/userdetails.php") {
        return new Response(detailHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (request.url.pathname === "/mybonus.php") {
        return new Response(bonusHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (request.url.pathname === "/getusertorrentlistajax.php") {
        if (request.url.searchParams.get("type") === "seeding") {
          return new Response(seedingHtml, {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        return new Response(uploadedHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const client = createByrClient({
      fetchImpl,
      baseUrl: "https://byr.pt",
      cookie: "uid=abc; pass=def",
    });

    const userInfo = await client.getUserInfo?.();
    expect(userInfo).toBeDefined();
    expect(userInfo).toMatchObject({
      id: "9527",
      name: "mock-user",
      levelName: "Power User",
      levelId: 2,
      bonusPerHour: 9.5,
      seeding: 6,
      uploads: 11,
      hnrPreWarning: 2,
      hnrUnsatisfied: 5,
    });
    expect(userInfo?.seedingSizeBytes).toBeGreaterThan(500_000_000_000);
  });

  it("re-logins when cookie is expired and username/password are provided", async () => {
    const loginHtml = `
      <html>
        <body>
          <form action="/takelogin.php" method="post">
            <input type="hidden" name="returnto" value="/" />
            <input type="text" name="username" value="" />
            <input type="password" name="password" value="" />
          </form>
        </body>
      </html>
    `;
    const searchHtml = `
      <html>
        <body>
          <table>
            <tr>
              <td><a href="details.php?id=777">[Movie] ReLogin Result</a></td>
              <td>1 GB</td>
              <td><a href="seeders.php?id=777">2</a></td>
              <td><a href="leechers.php?id=777">0</a></td>
            </tr>
          </table>
        </body>
      </html>
    `;

    let searchCalls = 0;

    const { fetchImpl, calls } = createMockFetch(async (request) => {
      if (request.method === "GET" && request.url.pathname === "/torrents.php") {
        searchCalls += 1;
        if (request.url.search.length === 0) {
          return new Response(searchHtml, {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        if (searchCalls === 1) {
          return new Response(loginHtml, {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        return new Response(searchHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }

      if (request.method === "GET" && request.url.pathname === "/login.php") {
        return new Response(loginHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }

      if (request.method === "POST" && request.url.pathname === "/takelogin.php") {
        const headers = new Headers();
        headers.append("set-cookie", "uid=101; Path=/");
        headers.append("set-cookie", "pass=xyz; Path=/");
        return new Response("", { status: 302, headers });
      }

      return new Response("Not found", { status: 404 });
    });

    const client = createByrClient({
      fetchImpl,
      baseUrl: "https://byr.pt",
      cookie: "uid=expired; pass=expired",
      username: "alice",
      password: "secret",
    });

    const items = await client.search("relogin", 1);
    expect(items[0]?.id).toBe("777");

    const loginPostCall = calls.find(
      (call) => call.method === "POST" && call.url.pathname === "/takelogin.php",
    );
    expect(loginPostCall).toBeDefined();
  });

  it("normalizes details.php links into download.php in plan", async () => {
    const detailHtml = `
      <html>
        <head><title>BYRBT :: 种子详情 "[Doc] Link Normalization" - Powered by NexusPHP</title></head>
        <body>
          <table>
            <tr><td>大小</td><td>700 MB</td><td>做种</td><td>10</td><td>下载</td><td>1</td></tr>
            <tr><td>类型</td><td>纪录</td><td>发布时间</td><td>2026-02-12 08:00:00</td></tr>
          </table>
          <a href="details.php?id=999&hit=1">legacy</a>
        </body>
      </html>
    `;

    const { fetchImpl } = createMockFetch(async (request) => {
      if (request.url.pathname === "/details.php") {
        return new Response(detailHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const client = createByrClient({
      fetchImpl,
      baseUrl: "https://byr.pt",
      cookie: "uid=1; pass=ok",
    });

    const plan = await client.getDownloadPlan("999");
    expect(plan.sourceUrl).toBe("https://byr.pt/download.php?id=999");
  });
});
