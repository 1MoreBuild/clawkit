import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractDownloadUrl,
  looksLikeLoginPage,
  normalizeDetailsToDownloadUrl,
  parseBonusPerHour,
  parseSearchItems,
  parseSeedingStatus,
  parseTorrentDetail,
  parseUploads,
  parseUserIdFromIndex,
  parseUserInfoFromDetails,
} from "../src/domain/nexusphp/parser.js";

const FIXTURE_DIR = join(process.cwd(), "test", "fixtures", "byr");

function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

describe("NexusPHP parser fixtures", () => {
  it("parses search rows with extended fields", () => {
    const html = fixture("search-basic.html");
    const items = parseSearchItems(html, 10, "https://byr.pt/");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "1001",
      title: "[Movie][BluRay] The Matrix",
      subTitle: "1080p x265 DTS",
      size: "12.5 GB",
      seeders: 93,
      leechers: 7,
      category: "电影",
      completed: 120,
      comments: 8,
      author: "alice",
      extImdb: "tt0133093",
      extDouban: "1291843",
    });
    expect(items[0].url).toBe("https://byr.pt/details.php?id=1001");
    expect(items[0].link).toContain("download.php?id=1001");
    expect(items[0].sizeBytes).toBeGreaterThan(12_000_000_000);
  });

  it("parses promotions and status/progress", () => {
    const html = fixture("search-with-promotions.html");
    const items = parseSearchItems(html, 10, "https://byr.pt/");

    expect(items).toHaveLength(2);

    expect(items[0]).toMatchObject({
      id: "2001",
      category: "剧集",
      status: "seeding",
      progress: 100,
    });
    expect(items[0].tags).toEqual(expect.arrayContaining(["Free", "2xUp"]));

    expect(items[1]).toMatchObject({
      id: "2002",
      category: "动漫",
      status: "downloading",
      progress: 45,
    });
    expect(items[1].tags).toContain("H&R");
  });

  it("parses live-like table layout and ignores out-of-table detail links", () => {
    const html = fixture("search-live-layout.html");
    const items = parseSearchItems(html, 10, "https://byr.pt/");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "361268",
      title: "[PC][Wuthering Waves][鸣潮3.1预更新包][RPG][简体中文][压缩包]",
      subTitle: "鸣潮3.1预下载版本包",
      category: "游戏",
      size: "34.62 GiB",
      seeders: 7,
      leechers: 0,
      completed: 64,
      comments: 0,
      author: "promme",
      extImdb: "tt1234567",
    });
    expect(items[0].time).toContain("2026-02-03");
  });

  it("parses detail page and normalizes legacy download link", () => {
    const html = fixture("details-basic.html");
    const detail = parseTorrentDetail(html, "3001", "https://byr.pt/");

    expect(detail).toMatchObject({
      id: "3001",
      title: "[Movie] Interstellar",
      size: "15.3 GB",
      seeders: 52,
      leechers: 4,
      category: "电影",
      status: "completed",
      progress: 100,
      comments: 15,
      completed: 300,
      author: "bob",
      extImdb: "tt0816692",
      extDouban: "1889243",
    });

    expect(detail.link).toBe("https://byr.pt/download.php?id=3001");
    expect(detail.tags).toContain("2x50%");
  });

  it("parses live-like detail layout from rowtable scope", () => {
    const html = fixture("details-live-layout.html");
    const detail = parseTorrentDetail(html, "361268", "https://byr.pt/");

    expect(detail).toMatchObject({
      id: "361268",
      title: "[PC][Wuthering Waves][鸣潮3.1预更新包][RPG][简体中文][压缩包]",
      size: "34.62 GiB",
      category: "游戏",
      seeders: 7,
      leechers: 0,
      subTitle: "鸣潮3.1预下载版本包",
      author: "promme",
      link: "https://byr.pt/download.php?id=361268",
    });
    expect(detail.uploadedAt).toContain("2026-02-03");
  });

  it("falls back to default download link when detail page has no download anchor", () => {
    const html = fixture("details-missing-download-link.html");

    const extracted = extractDownloadUrl(html, "3002", "https://byr.pt/");
    expect(extracted).toBeUndefined();

    const detail = parseTorrentDetail(html, "3002", "https://byr.pt/");
    expect(detail.link).toBe("https://byr.pt/download.php?id=3002");
  });

  it("parses user profile blocks", () => {
    const indexHtml = fixture("user-index.html");
    const detailHtml = fixture("user-details.html");
    const bonusHtml = fixture("user-bonus.html");
    const seedingHtml = fixture("user-seeding-ajax.html");

    expect(parseUserIdFromIndex(indexHtml)).toBe("9527");

    const info = parseUserInfoFromDetails(detailHtml, "9527");
    expect(info).toMatchObject({
      id: "9527",
      name: "mock-user",
      levelName: "Power User",
      messageCount: 7,
      hnrPreWarning: 1,
      hnrUnsatisfied: 3,
    });
    expect(info.trueUploadedBytes).toBeGreaterThan(info.trueDownloadedBytes);
    expect(info.joinTime).toContain("2024-01-01T00:00:00.000Z");

    expect(parseBonusPerHour(bonusHtml)).toBe(12.5);

    const seeding = parseSeedingStatus(seedingHtml);
    expect(seeding).toMatchObject({
      seeding: 8,
    });
    expect(seeding.seedingSizeBytes).toBeGreaterThan(1_000_000_000_000);

    expect(parseUploads(seedingHtml)).toBe(14);
  });

  it("parses BYR user details page with noisy header blocks", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr>
              <td>
                <span class='color_bonus'>等级 </span>
                看板娘祝你新年快乐~
              </td>
            </tr>
          </table>

          欢迎,
          <a class='CrazyUser_Name' href='/userdetails.php?id=146005'>
            <span style='font-weight: bold'>MrWanted</span>
          </a>
          [<a href="logout.php?key=abc">退出</a>]

          <h1>
            <a class='CrazyUser_Name' href='/userdetails.php?id=146005'>
              <span style='font-weight: bold'>MrWanted</span>
            </a>
          </h1>

          <table>
            <tr>
              <td class="rowhead nowrap">加入日期</td>
              <td class="rowfollow">2012-09-07 13:49:43</td>
            </tr>
            <tr>
              <td class="rowhead nowrap">最近动向</td>
              <td class="rowfollow">2026-02-18 17:47:37</td>
            </tr>
            <tr>
              <td class="rowhead nowrap">传输</td>
              <td class="rowfollow">
                <strong>分享率</strong>: 2.382
                <strong>上传量</strong>: 12.519 TiB
                <strong>下载量</strong>: 5.255 TiB
              </td>
            </tr>
            <tr>
              <td class="rowhead nowrap">等级</td>
              <td class="rowfollow">
                <img alt="Crazy User" title="Crazy User" src="pic/crazy.gif" />
              </td>
            </tr>
            <tr>
              <td class="rowhead nowrap">魔力值</td>
              <td class="rowfollow">2275285.0</td>
            </tr>
          </table>

          <script>
            Swal.fire({ input: 'password' })
          </script>
        </body>
      </html>
    `;

    const info = parseUserInfoFromDetails(html, "146005");
    expect(info.id).toBe("146005");
    expect(info.name).toBe("MrWanted");
    expect(info.levelName).toBe("Crazy User");
    expect(info.ratio).toBeCloseTo(2.382, 3);
    expect(info.uploadedBytes).toBeGreaterThan(10_000_000_000_000);
    expect(info.downloadedBytes).toBeGreaterThan(5_000_000_000_000);
    expect(info.trueUploadedBytes).toBe(info.uploadedBytes);
    expect(info.trueDownloadedBytes).toBe(info.downloadedBytes);
  });

  it("normalizes details.php download URI", () => {
    expect(normalizeDetailsToDownloadUrl("https://byr.pt/details.php?id=99&hit=1")).toBe(
      "https://byr.pt/download.php?id=99",
    );
  });

  it("does not misclassify authenticated user profile page as login page", () => {
    const html = `
      <html>
        <body>
          欢迎, <a href="userdetails.php?id=9527">mock-user</a>
          [<a href="logout.php?key=abc123">退出</a>]
          <script>
            Swal.fire({
              input: 'password',
              title: '确认操作'
            });
          </script>
        </body>
      </html>
    `;

    expect(looksLikeLoginPage(html)).toBe(false);
  });

  it("detects classic login form page", () => {
    const html = `
      <html>
        <body>
          <form action="/takelogin.php" method="post">
            <input type="text" name="username" />
            <input type="password" name="password" />
          </form>
        </body>
      </html>
    `;

    expect(looksLikeLoginPage(html)).toBe(true);
  });
});
