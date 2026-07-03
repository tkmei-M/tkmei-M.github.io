// Supabaseクライアントは auth.js で初期化されます
const client = window.supabaseClient;

// テーブル表示時に除外するカラム
const EXCLUDE_COLUMNS = ["id", "TimeStamp", "userId", "word", "twitterId"];

// データ取得関数
async function fetchAndDisplayData() {
  const session = await requireAuth();

  if (!session) {
    // console.log("Authorization Error. To login page.");
    window.location.href = "login.html";
    return; // 認証されていない場合は処理を中断
  }
  try {
    // 現在のイベントボードのデータをSupabaseから取得
    const { data, error } = await client
      .from("Current_eventBoard")
      .select("TimeStamp,id,rank,score,name,userId");

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
      .from("eventboard_archive")
      .select("TimeStamp,id,rank,score,name,userId") // タイムスタンプはデバッグ用に取得しているが、HTMLには表示しない
      .gte("TimeStamp", oneHourAgo.toISOString())
      .lt(
        "TimeStamp",
        new Date(oneHourAgo.getTime() + 60 * 1000).toISOString(),
      );

    //10分前のデータも取得
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    tenMinutesAgo.setSeconds(0, 0);
    tenMinutesAgo.setHours(tenMinutesAgo.getHours() + 9); // JSTに変換
    const { data: tenMinutesOldData, error: tenMinutesOldDataError } =
      await client
        .from("eventboard_archive")
        .select("TimeStamp,id,rank,score,name,userId") // タイムスタンプはデバッグ用に取得しているが、HTMLには表示しない
        .gte("TimeStamp", tenMinutesAgo.toISOString())
        .lt(
          "TimeStamp",
          new Date(tenMinutesAgo.getTime() + 60 * 1000).toISOString(),
        );

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

    // データ行を作成
    data.forEach((row) => {
      //各行に応じたユーザ分析ページへのURLを生成
      const userAnalyzerUrl = `/pages/event-board-viewer/userAnalysis.html?userId=${encodeURIComponent(
        String(row.userId),
      )}`;
      const tr = document.createElement("tr");
      // クラスを付与
      tr.classList.add("clickable-row");
      displayColumns.forEach((col) => {
        const td = document.createElement("td");
        tr.addEventListener("click", () => {
          window.location.href = userAnalyzerUrl;
        });
        const value = row[col];
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

// ページ読み込み時にデータを取得
document.addEventListener("DOMContentLoaded", fetchAndDisplayData);
