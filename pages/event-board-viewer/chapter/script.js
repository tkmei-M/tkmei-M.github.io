// Supabaseクライアントは auth.js で初期化されます
const client = window.supabaseClient;

// events.jsonとgameCharacters.jsonをキャッシュ
let eventsCache = null;
let gameCharactersCache = null;
let chaptersCache = null;

// テーブル表示時に除外するカラム
const EXCLUDE_COLUMNS = [
  "id",
  "TimeStamp",
  "userId",
  "word",
  "twitterId",
  "gameCharacterId",
];

// タグ名から表示用のテキストへ変換するマッピング
const TAG_MAPPING = [
  { tagName: "mawashi", displayTag: "回し" },
  { tagName: "trade", displayTag: "買い垢" },
  { tagName: "fusei", displayTag: "不正周回" },
];
const TAG_DISPLAY_MAP = TAG_MAPPING.reduce((m, o) => {
  m[o.tagName] = o.displayTag;
  return m;
}, {});

// データ取得関数
async function fetchAndDisplayData() {
  const session = await requireAuth();

  if (!session) {
    // console.log("Authorization Error. To login page.");
    window.location.href = "../login.html";
    return; // 認証されていない場合は処理を中断
  }
  const params = new URLSearchParams(window.location.search);
  const characterId = params.get("chapterCharaId");
  try {
    // 現在のイベントボードのデータをSupabaseから取得
    const { data, error } = await client
      .from("Current_Chapter_eventBoard")
      .select("TimeStamp,id,rank,score,name,userId, gameCharacterId")
      .eq("gameCharacterId", characterId);

    if (error) {
      // console.error("データ取得エラー:", error);
      document.getElementById("data").innerHTML =
        "<tr><td>データの取得に失敗しました</td></tr>";
      return;
    }

    // 1時間前のタイムスタンプを計算（秒以下切り捨て、JST時間へ変換）
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    oneHourAgo.setSeconds(0, 0);
    oneHourAgo.setHours(oneHourAgo.getHours() + 9); // JSTに変換

    // 1時間前のイベントボードのデータをSupabaseから取得
    // フィルタロジック->TimeStamp>=oneHourAgo TimeStamp<oneHourAgoの1分後
    const { data: oldData, error: oldDataError } = await client
      .from("Chapter_eventBoard_archive")
      .select("TimeStamp,id,rank,score,name,userId, gameCharacterId") // タイムスタンプはデバッグ用に取得しているが、HTMLには表示しない
      .gte("TimeStamp", oneHourAgo.toISOString())
      .lt("TimeStamp", new Date(oneHourAgo.getTime() + 60 * 1000).toISOString())
      .eq("gameCharacterId", characterId);

    //10分前のデータも取得
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    tenMinutesAgo.setSeconds(0, 0);
    tenMinutesAgo.setHours(tenMinutesAgo.getHours() + 9); // JSTに変換
    const { data: tenMinutesOldData, error: tenMinutesOldDataError } =
      await client
        .from("Chapter_eventBoard_archive")
        .select("TimeStamp,id,rank,score,name,userId") // タイムスタンプはデバッグ用に取得しているが、HTMLには表示しない
        .gte("TimeStamp", tenMinutesAgo.toISOString())
        .lt(
          "TimeStamp",
          new Date(tenMinutesAgo.getTime() + 60 * 1000).toISOString(),
        )
        .eq("gameCharacterId", characterId);

    if (!data || data.length === 0) {
      // console.log("データがありません");
      document.getElementById("data").innerHTML =
        "<tr><td>データがありません</td></tr>";
      return;
    }

    // テーブルを作成
    const table = document.getElementById("data");
    table.innerHTML = "";

    // すべてのカラムから除外カラムを除外
    const allColumns = Object.keys(data[0]);
    const displayColumns = allColumns.filter(
      (col) => !EXCLUDE_COLUMNS.includes(col),
    );
    // rankをキーにしてデータをソート
    data.sort((a, b) => a.rank - b.rank);
    oldData.sort((a, b) => a.rank - b.rank);
    tenMinutesOldData.sort((a, b) => a.rank - b.rank);

    // 各ユーザの1時間前とのスコア差分を計算して表示
    const oldDataMap = {};
    oldData.forEach((row) => {
      oldDataMap[row.userId] = row;
    });

    data.forEach((row) => {
      const oldRow = oldDataMap[row.userId];
      if (oldRow) {
        row.scoreDiff = row.score - oldRow.score;
      } else {
        row.scoreDiff = null; // 1時間前のデータがない場合はnull
      }
    });

    //現在のrankのスコアと1時間前のそのrankのスコアを比較してrankDiffを計算
    data.forEach((row) => {
      const oldRow = oldData.find((r) => r.rank === row.rank);
      if (oldRow) {
        row.rankDiff = row.score - oldRow.score;
        // console.log(`rank ${row.rank}のスコア差分: ${row.rankDiff}`);
      } else {
        row.rankDiff = null; // 1時間前のデータがない場合はnull
      }
    });

    //各ユーザの10分前とのスコア差分を計算して表示(HTMLに挿入するのはこの値を6倍して1時間のスコア差分と同等にする)
    const tenMinutesOldDataMap = {};
    tenMinutesOldData.forEach((row) => {
      tenMinutesOldDataMap[row.userId] = row;
    });

    data.forEach((row) => {
      const oldRow = tenMinutesOldDataMap[row.userId];
      // console.log(`ユーザID ${row.userId}の10分前のデータ:`, oldRow);
      if (oldRow) {
        row.tenMinutesScoreDiff = (row.score - oldRow.score) * 6; // 10分前のスコア差分を6倍して1時間のスコア差分と同等にする
      } else {
        row.tenMinutesScoreDiff = null; // 10分前のデータがない場合はnull
      }
    });

    // scoreDiffとrankDiffの列を表示するためにdisplayColumnsに追加
    if (!displayColumns.includes("scoreDiff")) {
      displayColumns.push("scoreDiff");
    }
    if (!displayColumns.includes("rankDiff")) {
      displayColumns.push("rankDiff");
    }
    if (!displayColumns.includes("tenMinutesScoreDiff")) {
      displayColumns.push("tenMinutesScoreDiff");
    }
    // score絡みのデータはカンマ区切りで見やすくする
    data.forEach((row) => {
      if (row.score !== null && row.score !== undefined) {
        row.score = row.score.toLocaleString();
      }
      if (row.scoreDiff !== null && row.scoreDiff !== undefined) {
        row.scoreDiff = row.scoreDiff.toLocaleString();
      }
      if (row.rankDiff !== null && row.rankDiff !== undefined) {
        row.rankDiff = row.rankDiff.toLocaleString();
      }
      if (
        row.tenMinutesScoreDiff !== null &&
        row.tenMinutesScoreDiff !== undefined
      ) {
        row.tenMinutesScoreDiff = row.tenMinutesScoreDiff.toLocaleString();
      }
    });

    // ヘッダー行を作成、ヘッダー名は日本語の方がわかりやすいので、カラム名に応じて日本語のヘッダー名を設定
    const headerNames = {
      TimeStamp: "タイムスタンプ",
      id: "ID",
      rank: "順位",
      score: "イベントPt",
      name: "ユーザー名",
      userId: "ユーザーID",
      scoreDiff: "直近1時間のランナー時速",
      rankDiff: "直近1時間のボーダー時速",
      tenMinutesScoreDiff: "直近10分のランナー時速",
    };
    // ヘッダーにはheaderクラスを付与してスタイルを適用
    const headerRow = document.createElement("tr");
    displayColumns.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = headerNames[col] || col;
      th.classList.add("header");
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // ブロックリストを取得
    const blockListMap = await fetchBlockList().catch((e) => {
      console.log("fetchBlockList failed:", e);
      return {};
    });

    // データ行を作成
    data.forEach((row) => {
      //各行に応じたユーザ分析ページへのURLを生成
      const userAnalyzerUrl = `/pages/event-board-viewer/chapter/userAnalysis.html?userId=${encodeURIComponent(
        String(row.userId),
      )}&chapterCharaId=${characterId}`;
      const tr = document.createElement("tr");
      // クラスを付与
      tr.classList.add("clickable-row");
      displayColumns.forEach((col) => {
        const td = document.createElement("td");
        tr.addEventListener("click", () => {
          window.location.href = userAnalyzerUrl;
        });
        let value = row[col];
        // ユーザー名列ならブロックリストのタグを名前の後ろに追記する
        if (col === "name") {
          const tags = blockListMap[String(row.userId)];
          if (Array.isArray(tags) && tags.length > 0) {
            const mapped = tags.map((t) =>
              TAG_DISPLAY_MAP[t] ? TAG_DISPLAY_MAP[t] : t,
            );
            const displayName =
              value !== null && value !== undefined ? value : "";
            td.textContent = displayName;
            mapped.forEach((displayTag) => {
              const codeEl = document.createElement("code");
              codeEl.textContent = displayTag;
              td.appendChild(codeEl);
            });
            tr.appendChild(td);
            return;
          }
        }
        td.textContent = value !== null && value !== undefined ? value : "";
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    // console.log("データ取得成功:", data.length, "件");
  } catch (err) {
    // console.error("予期しないエラー:", err);
    document.getElementById("data").innerHTML =
      "<tr><td>エラーが発生しました</td></tr>";
  }
}

async function loadStaticData() {
  try {
    if (!eventsCache) {
      const eventsResponse = await fetch(
        "https://sekai-world.github.io/sekai-master-db-diff/events.json",
      );
      eventsCache = await eventsResponse.json();
    }
    if (!chaptersCache) {
      const chaptersResponse = await fetch(
        "https://sekai-world.github.io/sekai-master-db-diff/worldBlooms.json",
      );
      chaptersCache = await chaptersResponse.json();
    }
    if (!gameCharactersCache) {
      const charactersResponse = await fetch("../gameCharacters.json");
      gameCharactersCache = await charactersResponse.json();
    }
  } catch (err) {
    console.error("Failed to load static data:", err);
  }
}

function floorTimestampToMinute(value) {
  const date = new Date(value);
  date.setSeconds(0, 0);
  return date;
}

function getMinuteTimestamp(value) {
  return floorTimestampToMinute(value).getTime();
}

function findCurrentEventTimeRange(events, nowTimestamp) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  const now = nowTimestamp ?? Date.now();
  let matchedEvent = null;

  events.forEach((event) => {
    const startAt = Number(event?.startAt);
    const closedAt = Number(event?.closedAt);

    if (!Number.isFinite(startAt) || !Number.isFinite(closedAt)) {
      return;
    }

    if (startAt <= now && now <= closedAt) {
      if (!matchedEvent || startAt > matchedEvent.startAt) {
        matchedEvent = event;
      }
    }
  });

  if (!matchedEvent) {
    return null;
  }

  const aggregateAt = Number(matchedEvent.aggregateAt);
  const endTimestamp = Number.isFinite(aggregateAt)
    ? getMinuteTimestamp(aggregateAt)
    : getMinuteTimestamp(Number(matchedEvent.closedAt));

  return {
    eventId: Number(matchedEvent.id),
    startTimestamp: getMinuteTimestamp(Number(matchedEvent.startAt)),
    endTimestamp,
  };
}

async function insertAvailableChapters(eventId) {
  const container = document.getElementById("available-chapters");
  if (!container) {
    return;
  }

  try {
    await loadStaticData();

    const currentEvent = eventId
      ? eventsCache?.find((event) => Number(event?.id) === Number(eventId)) ||
        null
      : findCurrentEventTimeRange(eventsCache, Date.now());

    const currentEventId = currentEvent?.eventId ?? currentEvent?.id ?? null;
    if (!currentEventId) {
      container.innerHTML = "<p>現在開催中のchapterはありません。</p>";
      return;
    }

    const matchingChapters = (chaptersCache || [])
      .filter(
        (chapter) =>
          chapter?.eventId === currentEventId &&
          chapter?.worldBloomChapterType === "game_character",
      )
      .sort((a, b) => Number(a.chapterNo || 0) - Number(b.chapterNo || 0));

    if (!matchingChapters.length) {
      container.innerHTML = "<p>該当するchapterがありません。</p>";
      return;
    }

    const characterMap = new Map(
      (gameCharactersCache || []).map((character) => [
        Number(character.id),
        character,
      ]),
    );

    const table = document.createElement("table");
    const row = document.createElement("tr");

    matchingChapters.forEach((chapter) => {
      const cell = document.createElement("td");
      const link = document.createElement("a");
      const character = characterMap.get(Number(chapter.gameCharacterId));
      const characterName = character?.name || "キャラクター";
      const chapterUrl = `/pages/event-board-viewer/chapter/index.html?chapterCharaId=${encodeURIComponent(String(chapter.gameCharacterId))}`;

      link.href = chapterUrl;
      link.textContent = `${characterName}チャプター`;
      cell.appendChild(link);
      row.appendChild(cell);
    });

    table.appendChild(row);

    container.innerHTML = "";
    container.appendChild(table);
  } catch (err) {
    console.log("fetchChapterList error:", err);
    container.innerHTML = "<p>chapter一覧の取得に失敗しました。</p>";
  }
}

// 指定URLからブロックリストを取得し、userId -> tags のマップを返す
async function fetchBlockList() {
  const url =
    "https://script.google.com/macros/s/AKfycbzDZIgCL3qSmiOOPVE6ioTDMRgWVI4kmvpKfNmoTa9bNpPSnJZrV4Q4-t3oL7Bj9g0kzg/exec";
  try {
    const target = url;
    const response = await fetch(target);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const list = await response.json();
    const map = {};
    if (Array.isArray(list)) {
      list.forEach((item) => {
        if (item && item.userId) map[String(item.userId)] = item.tags || [];
      });
    }
    return map;
  } catch (err) {
    console.log("fetchBlockList error:", err);
    return {};
  }
}
// ページ読み込み時にデータを取得
document.addEventListener("DOMContentLoaded", async () => {
  await insertAvailableChapters();
  await fetchAndDisplayData();
});
