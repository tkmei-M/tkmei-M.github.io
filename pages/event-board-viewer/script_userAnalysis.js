// Supabaseクライアントは auth.js で初期化されます
const client = window.supabaseClient;

// events.jsonとgameCharacters.jsonをキャッシュ
let eventsCache = null;
let gameCharactersCache = null;

// URLパラメータからuserIdを取得（String型として保証）
function getUserIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId");
  return userId ? String(userId) : null;
}

// events.jsonとgameCharacters.jsonを取得
async function loadStaticData() {
  try {
    if (!eventsCache) {
      // const eventsResponse = await fetch("events.json");
      const eventsResponse = await fetch(
        "https://sekai-world.github.io/sekai-master-db-diff/events.json",
      );
      eventsCache = await eventsResponse.json();
    }
    if (!gameCharactersCache) {
      const charactersResponse = await fetch("gameCharacters.json");
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

let scoreChartInstance = null;

function getMinuteTimestamp(value) {
  return floorTimestampToMinute(value).getTime();
}

function buildMinuteTimestamps(startMs, endMs) {
  const timestamps = [];
  const step = 60 * 1000;
  let current = startMs;
  while (current <= endMs) {
    timestamps.push(current);
    current += step;
  }
  return timestamps;
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
    startTimestamp: getMinuteTimestamp(Number(matchedEvent.startAt)),
    endTimestamp,
  };
}

function getChartEndTimestamp(eventEndTimestamp, nowTimestamp, graphMethod, viewType) {
  if (graphMethod === "before" || viewType === "diff") {
    return nowTimestamp;
  }
  return eventEndTimestamp ? Math.max(nowTimestamp, eventEndTimestamp) : nowTimestamp;
}

function buildSeriesFromMap(timestampKeys, valueMap) {
  return timestampKeys.map((ts) =>
    valueMap.has(ts) ? valueMap.get(ts) : null,
  );
}

function computeScoreDiffs(scores) {
  const diffs = [];
  let previousScore = null;

  scores.forEach((score) => {
    if (score === null || score === undefined) {
      diffs.push(null);
      previousScore = null;
      return;
    }

    if (previousScore === null) {
      // 直前の1分前データがない場合は差分も表示しない
      diffs.push(null);
    } else {
      diffs.push(score - previousScore);
    }
    previousScore = score;
  });

  return diffs;
}

function getSelectedGraphMethod() {
  return (
    document.getElementById("graph-setting")?.value || "before"
  );
}

function calculateLeastSquaresPrediction(timestampKeys, scores, nowTimestamp, tableLength) {
  console.log("最小二乗法に基づく予測");
  // y軸のデータ（スコア）の数だけ，連番の配列（x軸のデータ）を作成する
  const xValues = scores.map((_, index) => index);
  // 最小二乗法の計算を行う
  const n = scores.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  xValues.forEach((x, i) => {
    const y = scores[i];
    if (y === null || y === undefined) {
      return;
    }
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return timestampKeys.map(() => null);
  }
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  // 求まった傾きと切片をもとに，グラフにプロットする直線のデータを作成する
  const predictedScores = [];
  for (let i = 0; i < tableLength; i++) {
    const predictedScore = slope * i + intercept;
    predictedScores.push(Math.max(0, Math.round(predictedScore)));
  }
  return predictedScores;
}

function calculateLastHourSpeedPrediction(timestampKeys, scores, nowTimestamp, tableLength) {
  console.log("直近1時間の時速に基づく予測");
  // 最終データの60コ前（1時間前）のデータを取得
  const lastIndex = scores.length - 1;
  const oneHourAgoIndex = Math.max(0, lastIndex - 60);
  let lastScore = scores[lastIndex];
  const oneHourAgoScore = scores[oneHourAgoIndex];
  // 1時間前のデータが存在しない場合は予測できない
  if (oneHourAgoScore === null || oneHourAgoScore === undefined) {
    return timestampKeys.map(() => null);
  }
  // 1時間のスコア変化量を計算
  const scoreChange = lastScore - oneHourAgoScore;
  const scoreChangePerMinute = scoreChange / 60; // 1分あたりのスコア変化量
  // scoreChangeを使って，今後のスコアを予測する
  const speed = scoreChange; // 1時間あたりのスコア変化量
  let predictedScores = scores.slice(); // 既存のスコアをコピー
  // 59コnullを入れて，次に予測値を入れる（これで1時間単位）←これをtableLengthの長さと合うまで繰り返す，最後の1時間はscoreChangePerMinuteを使って予測する
  while (predictedScores.length + 60 < tableLength) {
    //59コnullを入れる
    for (let i = 0; i < 59; i++) {
      predictedScores.push(null);
    }
    // 1時間後の予測値を入れる
    const nextScore = lastScore + speed;
    predictedScores.push(Math.max(0, Math.round(nextScore)));
    lastScore = nextScore;
  }
  //最後は1分ごとの予測値を使って，残りの分を埋める
  while (predictedScores.length < tableLength) {
    const nextScore = lastScore + scoreChangePerMinute;
    predictedScores.push(Math.max(0, Math.round(nextScore)));
    lastScore = nextScore;
  }
  return predictedScores;
}

function buildPredictionDataset(timestampKeys, scores, nowTimestamp, graphMethod) {
  const tableLength = scores.length
  //現在のスコアより後のデータは切り捨ててからそれぞれの予測関数に渡す
  const maxscoreIndex = scores.reduce((maxIndex, score, index) => {
    if (score !== null && score !== undefined) {
      return index;
    }
    return maxIndex;
  }, -1);
  // スコアは減らないので，最大スコアのインデックスまでのデータを使用すればよい
  const filteredTimestampKeys = timestampKeys.slice(0, maxscoreIndex + 1);
  const filteredScores = scores.slice(0, maxscoreIndex + 1);
  if (graphMethod === "least-squares") {
    return calculateLeastSquaresPrediction(filteredTimestampKeys, filteredScores, nowTimestamp, tableLength);
  }
  if (graphMethod === "last-an-hour-speed") {
    return calculateLastHourSpeedPrediction(filteredTimestampKeys, filteredScores, nowTimestamp, tableLength);
  }
  return timestampKeys.map(() => null);
}

// ユーザーデータを取得して表示
async function fetchAndDisplayUserData() {
  const session = await requireAuth();

  if (!session) {
    window.location.href = "login.html";
    return; // 認証されていない場合は処理を中断
  }
  try {
    const userId = getUserIdFromURL();

    if (!userId) {
      // console.error("userIdが指定されていません");
      document.getElementById("userName").textContent =
        "ユーザーが見つかりません";
      return;
    }

    await loadStaticData();

    // eventboard_archiveテーブルからデータを取得（userIdはString型）
    const { data, error } = await client
      .from("eventboard_archive")
      .select("name, word, twitterId, TimeStamp, score, rank")
      .eq("userId", String(userId))
      .order("TimeStamp", { ascending: true });

    if (error) {
      // console.error("データ取得エラー:", error);
      document.getElementById("userName").textContent =
        "データの取得に失敗しました";
      return;
    }

    if (!data || data.length === 0) {
      // console.log("ユーザーデータがありません");
      document.getElementById("userName").textContent =
        "ユーザーデータがありません";
      return;
    }
    //レスポンスをタイムスタンプ順にソート（念のため）
    data.sort((a, b) => new Date(a.TimeStamp) - new Date(b.TimeStamp));
    // ユーザー情報の取得（最後=最新のレコードから）
    const lastRecord = data[data.length - 1];
    const firstRecord = data[0];
    document.getElementById("userName").textContent = lastRecord.name || "不明";
    document.getElementById("word").textContent = lastRecord.word || "";
    document.getElementById("twitterId").innerHTML = lastRecord.twitterId //twitterIdが存在する場合はそのアカウントへのハイパーリンクを作成、存在しない場合は「不明」と表示
      ? `<a href="https://twitter.com/${lastRecord.twitterId}" target="_blank">@${lastRecord.twitterId}</a>`
      : "不明";

    // グラフ用のデータ準備: 秒以下を切り捨てて分単位にする
    const playerScoreMap = new Map();
    data.forEach((record) => {
      if (
        record.TimeStamp &&
        record.score !== null &&
        record.score !== undefined
      ) {
        const timestamp = getMinuteTimestamp(record.TimeStamp);
        playerScoreMap.set(timestamp, record.score);
      }
    });

    const playerPoints = Array.from(playerScoreMap, ([timestamp, score]) => ({
      timestamp,
      score,
    }));

    const currentRank = lastRecord.rank;

    let rankOneStartTimestamp = null;
    const { data: rankOneData, error: rankOneError } = await client
      .from("eventboard_archive")
      .select("TimeStamp")
      .eq("rank", 1)
      .order("TimeStamp", { ascending: true })
      .limit(1);

    if (!rankOneError && rankOneData && rankOneData.length > 0) {
      rankOneStartTimestamp = getMinuteTimestamp(rankOneData[0].TimeStamp);
    }

    const rankScoreMap = new Map();
    let rankPoints = [];
    const { data: rankData, error: rankError } = await client
      .from("eventboard_archive")
      .select("score, TimeStamp")
      .eq("rank", currentRank)
      .order("TimeStamp", { ascending: true });

    if (!rankError && rankData) {
      rankData.forEach((record) => {
        if (
          record.TimeStamp &&
          record.score !== null &&
          record.score !== undefined
        ) {
          const timestamp = getMinuteTimestamp(record.TimeStamp);
          rankScoreMap.set(timestamp, record.score);
        }
      });
      rankPoints = Array.from(rankScoreMap, ([timestamp, score]) => ({
        timestamp,
        score,
      }));
    }

    const nowTimestamp = getMinuteTimestamp(Date.now());
    const playerStartTimestamp =
      playerPoints.length > 0 ? playerPoints[0].timestamp : null;
    const currentEventTimeRange = findCurrentEventTimeRange(
      eventsCache,
      nowTimestamp,
    );
    const startTimestamp = currentEventTimeRange
      ? currentEventTimeRange.startTimestamp
      : rankOneStartTimestamp ?? playerStartTimestamp ?? nowTimestamp;
    const endTimestamp = currentEventTimeRange
      ? Math.max(nowTimestamp, currentEventTimeRange.endTimestamp)
      : Math.max(nowTimestamp, startTimestamp);

    const timestampKeys = buildMinuteTimestamps(startTimestamp, endTimestamp);
    const timestamps = timestampKeys.map((ts) =>
      new Date(ts).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    );

    const rankPointsMap = new Map(
      rankPoints.map((item) => [item.timestamp, item.score]),
    );

    const scores = timestampKeys.map((ts) =>
      playerScoreMap.has(ts) ? playerScoreMap.get(ts) : null,
    );
    const rankScores = timestampKeys.map((ts) =>
      rankPointsMap.has(ts) ? rankPointsMap.get(ts) : null,
    );
    const scoreDiffs = computeScoreDiffs(scores);

    // グラフを作成
    if (timestamps.length > 0) {
      setupChartControls(
        startTimestamp,
        currentEventTimeRange?.endTimestamp,
        nowTimestamp,
        playerScoreMap,
        rankPointsMap,
      );
    }

    // 1時間ごとのイベントPt変動数を計算して表示
    if (data.length > 0) {
      createHourlyChangeTable(data);
      createScoreDifferenceTable(timestampKeys, scores);
      createScoreDifferenceHourlyTable(timestampKeys, scores);
      setupTableViewToggle();
    }

    // イベント履歴を取得して表示
    await fetchAndDisplayEventHistory(userId);

    // console.log("ユーザーデータ取得成功");
  } catch (err) {
    // console.error("予期しないエラー:", err);
    document.getElementById("userName").textContent = "エラーが発生しました";
  }
}

function replaceZeroToBefore(data) {
  //指定した時間までのゼロを手前のデータに置換する
  // 例: [2000,0,1000,0,0,0,1000] -> [2000,2000,1000,1000,1000,1000,1000]
  let max_zero_count = 3; // 何個までゼロが連続していてよいか
  let temp = 0;
  let zero_count = 0;
  let j = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0 && zero_count <= max_zero_count) {
      j = 0;
      while (j <= max_zero_count) {
        // max_zero_count 以内に1以上が出るかチェック
        if (i + j < data.length && data[i + j] > 0) {
          // max_zero_count 以内に1以上が出た場合は置換
          zero_count++;
          data[i] = temp;
          break;
        }
        j++;
      }
    } else if (data[i] > 0) {
      zero_count = 0;
      temp = data[i];
    }
  }
  return data;
}

function renderScoreChart(
  timestamps,
  scores,
  rankScores,
  scoreDiffs,
  predictedScores,
  viewType,
) {
  const canvas = document.getElementById("scoreChart");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (scoreChartInstance) {
    scoreChartInstance.destroy();
  }

  const datasets = [];
  const isDiffView = viewType === "diff";

  if (isDiffView) {
    datasets.push({
      label: "イベントPt差分",
      data: replaceZeroToBefore(scoreDiffs),
      borderColor: "#FF6B9D",
      backgroundColor: "rgba(255, 107, 157, 0.1)",
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointBackgroundColor: "#FF6B9D",
      pointBorderColor: "#fff",
      pointBorderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 6,
      spanGaps: true,
    });
  } else {
    if (rankScores && rankScores.length > 0) {
      datasets.push({
        label: "同rankのイベントPt",
        data: rankScores,
        borderColor: "#4A90E2",
        backgroundColor: "rgba(74, 144, 226, 0.1)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#4A90E2",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        spanGaps: true,
      });
    }

    datasets.push({
      label: "イベントPt",
      data: scores,
      borderColor: "#FF6B9D",
      backgroundColor: "rgba(255, 107, 157, 0.1)",
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointBackgroundColor: "#FF6B9D",
      pointBorderColor: "#fff",
      pointBorderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 6,
      spanGaps: true,
    });

    if (predictedScores && predictedScores.some((value) => value !== null)) {
      datasets.push({
        label: "予測イベントPt",
        data: predictedScores,
        borderColor: "#00B894",
        backgroundColor: "rgba(0, 184, 148, 0.08)",
        borderWidth: 2,
        borderDash: [6, 4],
        fill: false,
        tension: 0.4,
        pointBackgroundColor: "#00B894",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        spanGaps: true,
      });
    }
  }

  scoreChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: timestamps,
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#333",
            font: {
              size: 12,
            },
          },
        },
        title: {
          display: true,
          text: isDiffView
            ? "1分ごとのイベントPt差分"
            : "時間ごとのイベントPt推移",
          font: {
            size: 14,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: !isDiffView,
          ticks: {
            color: "#666",
          },
          grid: {
            color: "rgba(0, 0, 0, 0.1)",
          },
        },
        x: {
          ticks: {
            color: "#666",
            maxRotation: 45,
            minRotation: 0,
            display: false,
          },
          grid: {
            display: false,
          },
        },
      },
    },
  });
}

function setupChartControls(
  startTimestamp,
  eventEndTimestamp,
  nowTimestamp,
  playerScoreMap,
  rankPointsMap,
  initialLabels,
  scoreDiffs,
) {
  const chartRadios = document.querySelectorAll('input[name="chartView"]');
  const graphSetting = document.getElementById("graph-setting");

  function updateChart() {
    const viewType =
      document.querySelector('input[name="chartView"]:checked')?.value ||
      "score";
    const graphMethod = getSelectedGraphMethod();
    const endTimestamp = getChartEndTimestamp(
      eventEndTimestamp,
      nowTimestamp,
      graphMethod,
      viewType,
    );
    const timestampKeys = buildMinuteTimestamps(startTimestamp, endTimestamp);
    const timestamps = timestampKeys.map((ts) =>
      new Date(ts).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    );
    const scores = buildSeriesFromMap(timestampKeys, playerScoreMap);
    const rankScores = buildSeriesFromMap(timestampKeys, rankPointsMap);
    const scoreDiffsForView = computeScoreDiffs(scores);
    const predictedScores = buildPredictionDataset(
      timestampKeys,
      scores,
      nowTimestamp,
      graphMethod,
    );

    renderScoreChart(
      timestamps,
      scores,
      rankScores,
      scoreDiffsForView,
      predictedScores,
      viewType,
    );
  }

  chartRadios.forEach((radio) => {
    radio.addEventListener("change", updateChart);
  });

  if (graphSetting) {
    graphSetting.addEventListener("change", updateChart);
  }

  updateChart();
}

// 1時間ごとのイベントPt変動数を計算して表示
function createHourlyChangeTable(data) {
  // データを日付ごと、1時間ごとにグループ化
  const dailyHourlyGroups = {};

  data.forEach((record) => {
    if (
      record.TimeStamp &&
      record.score !== null &&
      record.score !== undefined
    ) {
      const date = new Date(record.TimeStamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`; // ローカルの YYYY-MM-DD
      const hour = date.getHours();

      if (!dailyHourlyGroups[dateKey]) {
        dailyHourlyGroups[dateKey] = {};
      }
      if (!dailyHourlyGroups[dateKey][hour]) {
        dailyHourlyGroups[dateKey][hour] = [];
      }
      dailyHourlyGroups[dateKey][hour].push({
        timestamp: date,
        score: record.score,
      });
    }
  });

  const sortedDates = Object.keys(dailyHourlyGroups).sort(
    (a, b) => new Date(a) - new Date(b),
  );

  const tableContainer = document.getElementById("hourlyChangeTableContainer");
  if (!tableContainer) {
    // console.error("hourlyChangeTableContainerが見つかりません");
    return;
  }

  let tableHTML =
    '<table id="hourlyChangeTable" border="1" style="border-collapse: collapse; margin-top: 20px; width: 100%;"><tr>';
  tableHTML += '<th style="padding: 8px; text-align: center;">日付</th>';

  for (let hour = 0; hour < 24; hour++) {
    tableHTML += `<th style="padding: 8px; text-align: center;">${hour}</th>`;
  }
  tableHTML += "</tr>";

  sortedDates.forEach((dateKey) => {
    const hourlyGroups = dailyHourlyGroups[dateKey];
    let rowHTML = `<tr><th style="padding: 8px; text-align: center;">${dateKey}</th>`;

    for (let hour = 0; hour < 24; hour++) {
      let count = 0;
      const records = hourlyGroups[hour]
        ? hourlyGroups[hour].slice().sort((a, b) => a.timestamp - b.timestamp)
        : [];

      for (let i = 1; i < records.length; i++) {
        if (records[i].score !== records[i - 1].score) {
          count++;
        }
      }

      if (hour > 0 && records.length > 0 && hourlyGroups[hour - 1]) {
        const prevRecords = hourlyGroups[hour - 1]
          .slice()
          .sort((a, b) => a.timestamp - b.timestamp);
        if (
          prevRecords.length > 0 &&
          prevRecords[prevRecords.length - 1].score !== records[0].score
        ) {
          count++;
        }
      }

      rowHTML += `<td style="padding: 8px; text-align: center;">${count}</td>`;
    }

    rowHTML += "</tr>";
    tableHTML += rowHTML;
  });

  tableHTML += "</table>";
  const wrapper = document.getElementById("hourlyChangeTableWrapper");
  if (wrapper) {
    wrapper.innerHTML = tableHTML;
  }
}

// 1分ごとのイベントPt差分を計算して表示
function createScoreDifferenceTable(timestampKeys, scores) {
  let previousScore = null;
  let tableHTML =
    '<table id="scoreDiffTable" border="1" style="border-collapse: collapse; margin-top: 20px; width: 100%;">';
  tableHTML +=
    '<tr><th class="header" style="padding: 8px; text-align: center;">日時</th><th class="header" style="padding: 8px; text-align: center;">イベントPt</th><th class="header" style="padding: 8px; text-align: center;">差分</th></tr>';

  timestampKeys.forEach((timestamp, index) => {
    const score = scores[index];
    const diff =
      score === null || score === undefined || previousScore === null
        ? null
        : score - previousScore;
    const diffText = diff === null ? "-" : diff > 0 ? `+${diff}` : `${diff}`;
    const scoreText = score === null || score === undefined ? "-" : score;
    const formattedDate = new Date(timestamp).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    tableHTML += `<tr><td style="padding: 8px; text-align: center;">${formattedDate}</td><td style="padding: 8px; text-align: center;">${scoreText}</td><td style="padding: 8px; text-align: center;">${diffText}</td></tr>`;

    previousScore = score === null || score === undefined ? null : score;
  });

  tableHTML += "</table>";
  const wrapper = document.getElementById("scoreDiffTableWrapper");
  if (wrapper) {
    wrapper.innerHTML = tableHTML;
  }
}
function createScoreDifferenceHourlyTable(Timestamps, scores) {
  // 毎時0分のイベントPtを比較し、その差分を1時間ごとにテーブル化
  let tableHTML =
    '<table id="scoreDiffHourlyTable" border="1" style="border-collapse: collapse; margin-top: 20px; width: 100%;">';
  tableHTML +=
    '<tr><th class="header" style="padding: 8px; text-align: center;">日時</th><th class="header" style="padding: 8px; text-align: center;">イベントPt</th><th class="header" style="padding: 8px; text-align: center;">差分</th></tr>';
  // 毎時0分のデータのみをまず抽出
  const hourlyData = Timestamps.map((timestamp, index) => {
    const date = new Date(timestamp);
    if (date.getMinutes() === 0) {
      return {
        timestamp,
        score: scores[index],
        formattedDate: date.toLocaleString("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      };
    }
    return null;
  }).filter((item) => item !== null);
  // 0個目のスコアがnullの場合、0に置換
  if (hourlyData.length > 0 && hourlyData[0].score === null) {
    hourlyData[0].score = 0;
  }

  let previousScore = null;
  hourlyData.forEach((data) => {
    const { formattedDate, score } = data;
    const diff =
      score === null || score === undefined || previousScore === null
        ? null
        : score - previousScore;
    const diffText = diff === null ? "-" : diff > 0 ? `+${diff}` : `${diff}`;
    tableHTML += `<tr><td style="padding: 8px; text-align: center;">${formattedDate}</td><td style="padding: 8px; text-align: center;">${score}</td><td style="padding: 8px; text-align: center;">${diffText}</td></tr>`;
    previousScore = score;
  });

  tableHTML += "</table>";

  const wrapper = document.getElementById("scoreDiffHourlyTableWrapper");
  if (wrapper) {
    wrapper.innerHTML = tableHTML;
  }
}

// イベント履歴をAPIから取得
async function fetchAndDisplayEventHistory(userId) {
  try {
    const url = `https://script.google.com/macros/s/AKfycbzwrKsv4LfbxXFBeyfk9SRgxsj-7Bm3O46C1ZT1Hcx8psDzlHcAk3ve9ARA_fssmeus/exec?userId=${userId}`;
    const response = await fetch(url);
    const historyData = await response.json();

    if (Array.isArray(historyData) && historyData.length > 0) {
      createEventHistoryTable(historyData);
    }
  } catch (err) {
    console.error("Failed to fetch event history:", err);
  }
}

// イベント履歴テーブルを生成
function createEventHistoryTable(historyData) {
  let tableHTML =
    '<table id="eventHistoryTable" border="1" style="border-collapse: collapse; margin-top: 20px; width: 100%;">';
  tableHTML +=
    '<tr class="header"><th style="padding: 8px; text-align: center;">イベント名</th><th style="padding: 8px; text-align: center;">詳細名</th><th style="padding: 8px; text-align: center;">ランク</th></tr>';

  historyData.forEach((record) => {
    const eventId = parseInt(record.eventId);
    let eventName = "イベント名不明";

    // events.jsonからイベント情報を取得
    if (eventsCache) {
      const event = eventsCache.find((e) => e.id === eventId);
      if (event) {
        eventName = event.name;
        // world_bloomの場合、チャプター情報を追加
        if (event.eventType === "world_bloom") {
          if (
            record.chapterCharacterId === "" ||
            record.chapterCharacterId === null
          ) {
            eventName += "【総合】";
          } else {
            const chapterId = parseInt(record.chapterCharacterId);
            if (gameCharactersCache) {
              const character = gameCharactersCache.find(
                (c) => c.id === chapterId,
              );
              if (character) {
                eventName += `【${character.name}チャプター】`;
              }
            }
          }
        }
      }
    }

    const apiName = record.name || "-";
    const rank = record.rank || "-";
    tableHTML += `<tr><td style="padding: 8px; text-align: left;">${eventName}</td><td style="padding: 8px; text-align: left;">${apiName}</td><td style="padding: 8px; text-align: center;">${rank}</td></tr>`;
  });

  tableHTML += "</table>";
  const wrapper = document.getElementById("eventHistoryTableWrapper");
  if (wrapper) {
    wrapper.innerHTML = tableHTML;
  }
}

function setupTableViewToggle() {
  const toggleRadios = document.querySelectorAll('input[name="tableView"]');
  const hourlyWrapper = document.getElementById("hourlyChangeTableWrapper");
  const diffWrapper = document.getElementById("scoreDiffTableWrapper");
  const diffPerHourWrapper = document.getElementById(
    "scoreDiffHourlyTableWrapper",
  );
  const eventHistoryWrapper = document.getElementById(
    "eventHistoryTableWrapper",
  );

  if (!hourlyWrapper || !diffWrapper) {
    return;
  }

  function updateView() {
    const selectedValue = document.querySelector(
      'input[name="tableView"]:checked',
    )?.value;
    if (selectedValue === "diff") {
      hourlyWrapper.style.display = "none";
      diffWrapper.style.display = "block";
      diffPerHourWrapper.style.display = "none";
      eventHistoryWrapper.style.display = "none";
    } else if (selectedValue === "diffPerHour") {
      hourlyWrapper.style.display = "none";
      diffWrapper.style.display = "none";
      diffPerHourWrapper.style.display = "block";
      eventHistoryWrapper.style.display = "none";
    } else if (selectedValue === "eventHistory") {
      hourlyWrapper.style.display = "none";
      diffWrapper.style.display = "none";
      diffPerHourWrapper.style.display = "none";
      eventHistoryWrapper.style.display = "block";
    } else {
      hourlyWrapper.style.display = "block";
      diffWrapper.style.display = "none";
      diffPerHourWrapper.style.display = "none";
      eventHistoryWrapper.style.display = "none";
    }
  }

  toggleRadios.forEach((radio) => {
    radio.addEventListener("change", updateView);
  });

  updateView();
}

// ページ読み込み時にデータを取得
document.addEventListener("DOMContentLoaded", fetchAndDisplayUserData);
