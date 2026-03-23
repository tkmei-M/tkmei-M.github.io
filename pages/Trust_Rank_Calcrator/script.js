const uploader = document.getElementById("uploader");
const startBtn = document.getElementById("start");
const status = document.getElementById("status");
const result1 = document.getElementById("result1");
const result2 = document.getElementById("result2");
const processedImage1 = document.getElementById("processedImage1");
const processedImage2 = document.getElementById("processedImage2");
const targetRank = document.getElementById("targetRank");
const scoreRank = document.getElementById("scoreRank");
const liveBoost = document.getElementById("liveBoost");
const songSelect = document.getElementById("songSelect");
const calculationResult = document.getElementById("calculationResult");

// Rank_table.json を読み込む
let rankTable = [];
fetch("/pages/Trust_Rank_Calcrator/Table/Rank_table.json")
  .then((response) => response.json())
  .then((data) => {
    rankTable = data;
  })
  .catch((error) => console.error("Rank_table.json の読み込みエラー:", error));

// EXP_Score_Table.json を読み込む
let expScoreTable = [];
fetch("/pages/Trust_Rank_Calcrator/Table/EXP_Score_Table.json")
  .then((response) => response.json())
  .then((data) => {
    expScoreTable = data;
  })
  .catch((error) =>
    console.error("EXP_Score_Table.json の読み込みエラー:", error),
  );

// LIVE_Boost_table.json を読み込む
let liveBoostTable = [];
fetch("/pages/Trust_Rank_Calcrator/Table/LIVE_Boost_table.json")
  .then((response) => response.json())
  .then((data) => {
    liveBoostTable = data;
  })
  .catch((error) =>
    console.error("LIVE_Boost_table.json の読み込みエラー:", error),
  );

// Music_Length_Table.json を読み込む
let musicLengthTable = [];
fetch("/pages/Trust_Rank_Calcrator/Table/Music_Length_Table.json")
  .then((response) => response.json())
  .then((data) => {
    musicLengthTable = data;
  })
  .catch((error) =>
    console.error("Music_Length_Table.json の読み込みエラー:", error),
  );

// 計算関数
function calculateRemainingEXP(currentRank, remainingEXP, targetRank) {
  if (!rankTable.length) {
    return "Rank_table.json が読み込まれていません";
  }

  const currentRankIndex = currentRank - 1;
  const targetRankIndex = targetRank - 1;

  if (
    currentRankIndex < 0 ||
    targetRankIndex >= rankTable.length ||
    targetRankIndex < currentRankIndex
  ) {
    return "ランクの範囲が不正です";
  }

  const nextRankCumulativeEXP = parseInt(
    rankTable[currentRankIndex + 1]["必要累積EXP"],
  );
  const targetCumulativeEXP = parseInt(
    rankTable[targetRankIndex]["必要累積EXP"],
  );

  // 計算式: 目標ランクの累積EXP - (次のランクの累積EXP - 残りEXP)
  const result = targetCumulativeEXP - (nextRankCumulativeEXP - remainingEXP);

  return result > 0 ? result : 0; // 負の値は0に
}

// プレイ回数計算関数
function calculatePlaysNeeded(remainingEXP, scoreRankValue, liveBoostValue) {
  if (!expScoreTable.length || !liveBoostTable.length) {
    return "テーブルが読み込まれていません";
  }

  const scoreEntry = expScoreTable.find(
    (entry) => entry.Score_Rank === scoreRankValue,
  );
  const boostEntry = liveBoostTable.find(
    (entry) => entry.LIVE_Boost === liveBoostValue,
  );

  if (!scoreEntry || !boostEntry) {
    return "選択値が不正です";
  }

  const scoreEXP = parseInt(scoreEntry.EXP);
  const boostMultiplier = parseInt(boostEntry.Boost);

  const totalEXPPerPlay = scoreEXP * boostMultiplier;
  const playsNeeded = Math.ceil(remainingEXP / totalEXPPerPlay);

  return playsNeeded;
}

// 総時間計算関数
function calculateTotalTime(playsNeeded, songName) {
  if (!musicLengthTable.length) {
    return "楽曲テーブルが読み込まれていません";
  }

  const songEntry = musicLengthTable.find((entry) => entry.楽曲 === songName);

  if (!songEntry) {
    return "楽曲が見つかりません";
  }

  // "0:01:14" を秒に変換
  const [hours, minutes, seconds] = songEntry.長さ.split(":").map(Number);
  const songSeconds = hours * 3600 + minutes * 60 + seconds;

  // 1プレイの総時間: 楽曲 + 45秒
  const timePerPlay = songSeconds + 45;

  // 総秒数
  const totalSeconds = playsNeeded * timePerPlay;

  // 秒を h:mm:ss に変換
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// グレースケール変換関数
function toGrayscale(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  ctx.putImageData(imageData, 0, 0);
}

// 固定閾値による2値化関数
function simpleBinarization(ctx, width, height, threshold = 128) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] >= threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);
}

// 黒い領域の外側の白いピクセルを黒く塗りつぶす関数
function fillOuterWhitePixels(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const visited = new Array(width * height).fill(false);

  // スタックベースのflood fill
  const stack = [];
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]; // 上下左右

  // 境界の白いピクセルから開始
  for (let x = 0; x < width; x++) {
    // 上辺
    if (data[x * 4] === 255) {
      stack.push([x, 0]);
      visited[x] = true;
    }
    // 下辺
    if (data[((height - 1) * width + x) * 4] === 255) {
      stack.push([x, height - 1]);
      visited[(height - 1) * width + x] = true;
    }
  }
  for (let y = 0; y < height; y++) {
    // 左辺
    if (data[y * width * 4] === 255) {
      stack.push([0, y]);
      visited[y * width] = true;
    }
    // 右辺
    if (data[(y * width + width - 1) * 4] === 255) {
      stack.push([width - 1, y]);
      visited[y * width + width - 1] = true;
    }
  }

  // Flood fill
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const index = (y * width + x) * 4;

    // 白いピクセルを黒くする
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;

    // 隣接ピクセルをチェック
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIndex = (ny * width + nx) * 4;
        const nVisitedIndex = ny * width + nx;
        if (!visited[nVisitedIndex] && data[nIndex] === 255) {
          visited[nVisitedIndex] = true;
          stack.push([nx, ny]);
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// 画像を16:9にクロップ
function crop16x9(canvas, img) {
  const imgWidth = img.width;
  const imgHeight = img.height;
  const imgRatio = imgWidth / imgHeight;
  const targetRatio = 16 / 9;

  let cropWidth, cropHeight, cropX, cropY;

  if (imgRatio > targetRatio) {
    // 画像が横長 → 幅を削る
    cropHeight = imgHeight;
    cropWidth = imgHeight * targetRatio;
    cropX = (imgWidth - cropWidth) / 2;
    cropY = 0;
  } else {
    // 画像が縦長 → 高さを削る
    cropWidth = imgWidth;
    cropHeight = imgWidth / targetRatio;
    cropX = 0;
    cropY = (imgHeight - cropHeight) / 2;
  }

  const ctx = canvas.getContext("2d");
  canvas.width = cropWidth;
  canvas.height = cropHeight;

  ctx.drawImage(
    img,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );
}

// 画像を指定サイズにリサイズ
function resizeToSize(canvas, targetWidth, targetHeight) {
  const ctx = canvas.getContext("2d");
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  tempCanvas.getContext("2d").drawImage(canvas, 0, 0);

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
}

// 指定範囲をクロップ
function cropRange(canvas, x1, y1, x2, y2) {
  const ctx = canvas.getContext("2d");
  const cropWidth = x2 - x1;
  const cropHeight = y2 - y1;

  const imageData = ctx.getImageData(x1, y1, cropWidth, cropHeight);

  canvas.width = cropWidth;
  canvas.height = cropHeight;
  ctx.putImageData(imageData, 0, 0);
}

function processRegion(
  baseCanvas,
  region,
  outImageEl,
  outTextEl,
  threshold = 225,
) {
  const [x1, y1, x2, y2] = region;
  const width = x2 - x1;
  const height = y2 - y1;

  const regionCanvas = document.createElement("canvas");
  regionCanvas.width = width;
  regionCanvas.height = height;
  regionCanvas
    .getContext("2d")
    .drawImage(baseCanvas, x1, y1, width, height, 0, 0, width, height);

  const ctx = regionCanvas.getContext("2d");
  toGrayscale(ctx, width, height);
  simpleBinarization(ctx, width, height, threshold);
  fillOuterWhitePixels(ctx, width, height);

  outImageEl.src = regionCanvas.toDataURL("image/png");

  return new Promise((resolve, reject) => {
    regionCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Blob 生成に失敗しました。"));
        return;
      }

      Tesseract.recognize(blob, "jpn", {
        logger: (m) => {
          console.log(m);
          outTextEl.value = `${m.status}: ${Math.round(m.progress * 100)}%`;
        },
      })
        .then(({ data: { text } }) => {
          const digits = (text.match(/\d+/g) || []).join(" ");
          outTextEl.value = digits;
          resolve(text);
        })
        .catch(reject);
    }, "image/png");
  });
}

startBtn.addEventListener("click", () => {
  const file = uploader.files[0];
  if (!file) return;

  status.innerText = "認識中...";

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");

      // 1. 16:9にクロップ
      crop16x9(canvas, img);

      // 2. サイズを1920x1080にリサイズ
      resizeToSize(canvas, 1920, 1080);

      // 2領域を同時にOCR
      const region1 = [1016, 670, 1245, 711];
      const region2 = [860, 495, 1060, 610];

      try {
        await Promise.all([
          processRegion(canvas, region1, processedImage1, result1, 240),
          processRegion(canvas, region2, processedImage2, result2, 250),
        ]);

        // 計算実行
        const currentRankText = result2.value.trim();
        const remainingEXPText = result1.value.trim();
        const targetRankValue = parseInt(targetRank.value);
        const scoreRankValue = scoreRank.value;
        const liveBoostValue = liveBoost.value;
        const songName = songSelect.value;

        const currentRank = parseInt(currentRankText.split(" ")[0]); // 最初の数字
        const remainingEXP = parseInt(remainingEXPText.split(" ")[0]); // 最初の数字

        if (currentRank && remainingEXP && targetRankValue) {
          const remainingEXPResult = calculateRemainingEXP(
            currentRank,
            remainingEXP,
            targetRankValue,
          );
          const playsNeeded = calculatePlaysNeeded(
            remainingEXPResult,
            scoreRankValue,
            liveBoostValue,
          );
          const totalTime = calculateTotalTime(playsNeeded, songName);
          calculationResult.innerText = `目標ランク ${targetRankValue} までの残りEXP: ${remainingEXPResult}\nあと ${playsNeeded} 回プレイが必要です\n総時間: ${totalTime}`;
        } else {
          calculationResult.innerText = "数字の抽出に失敗しました";
        }

        status.innerText = "完了";
      } catch (err) {
        console.error(err);
        status.innerText = "OCR エラー";
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});
