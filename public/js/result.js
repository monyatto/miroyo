document.addEventListener("DOMContentLoaded", () => {
  const MAX_HASH_LENGTH = 4096;
  const MAX_SHARE_BYTES = 2800;
  const PAKO_PREFIX = "z_";

  initConfetti();
  setupDjImageFallback();

  let data = null;
  let isPreviewMode = false;

  // データ取得：URLハッシュ or sessionStorage
  const hash = window.location.hash.slice(1);
  if (hash) {
    // シェア閲覧モード
    try {
      data = decodeShareData(hash);
    } catch (e) {
      console.error("Failed to decode share data:", e);
    }
  } else {
    // プレビューモード
    const stored = sessionStorage.getItem("miroyo_result");
    if (stored) {
      data = JSON.parse(stored);
      isPreviewMode = true;
    }
  }

  if (!data) {
    window.location.href = "/";
    return;
  }

  renderResult(data);

  if (isPreviewMode) {
    const actionButtons = document.getElementById("action-buttons");
    actionButtons.classList.remove("hidden");

    document.getElementById("edit-btn").addEventListener("click", () => {
      const originalText = sessionStorage.getItem("miroyo_original_text");
      if (originalText) {
        sessionStorage.setItem("miroyo_input_text", originalText);
      }
      window.location.href = "/";
    });

    document.getElementById("share-btn").addEventListener("click", async () => {
      try {
        const encoded = encodeShareData(data);
        const url = `${window.location.origin}/result#${encoded}`;
        await navigator.clipboard.writeText(url);
        showShareToast("URLをクリップボードにコピーしました！", false);
      } catch (error) {
        if (error?.message === "share_data_too_large") {
          showShareToast("シェアURLが長すぎます。成果を短くして再度試してたもれ。", true);
          return;
        }

        showShareToast("コピーに失敗したでおじゃ。ブラウザ権限を確認してたもれ。", true);
      }
    });
  }

  function renderResult(result) {
    const achievements = Array.isArray(result.achievements) ? result.achievements : [];

    // DJコメント
    document.getElementById("dj-comment").textContent = String(result.djComment || "");

    // 期間ラベル
    document.getElementById("period-text").textContent = String(result.periodLabel || "今日");

    // 成果リスト
    const listEl = document.getElementById("achievement-list");
    listEl.textContent = "";

    achievements.forEach((a) => {
      const item = document.createElement("div");
      item.className = "achievement-item";

      const contentEl = document.createElement("div");
      contentEl.className = "achievement-content";
      contentEl.textContent = String(a?.content || "がんばり");

      const valueEl = document.createElement("div");
      valueEl.className = "achievement-value";
      const valueText = `${String(a?.value ?? 1)} ${String(a?.unit || "")}`.trim();
      const freqText = a?.frequency ? `（${String(a.frequency)}）` : "";
      valueEl.textContent = `${valueText}${freqText}`;

      item.appendChild(contentEl);
      item.appendChild(valueEl);
      listEl.appendChild(item);
    });

    // DJトリビア（数値の偉大さ紹介）
    if (result.djTrivia) {
      document.getElementById("dj-trivia").textContent = String(result.djTrivia);
      document.getElementById("dj-trivia-section").classList.remove("hidden");
    }
  }

  function encodeShareData(obj) {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);

    if (bytes.length > MAX_SHARE_BYTES) {
      throw new Error("share_data_too_large");
    }

    const compressed = window.pako.deflate(bytes);
    const base64 = bytesToBase64(compressed);
    return PAKO_PREFIX + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeShareData(encoded) {
    if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > MAX_HASH_LENGTH) {
      throw new Error("invalid_share_data");
    }

    if (encoded.startsWith(PAKO_PREFIX)) {
      // pako圧縮形式
      const bytes = base64UrlToBytes(encoded.slice(PAKO_PREFIX.length));
      const decompressed = window.pako.inflate(bytes);
      const json = new TextDecoder().decode(decompressed);
      return JSON.parse(json);
    }

    // 旧形式（非圧縮Base64）との後方互換
    const bytes = base64UrlToBytes(encoded);
    if (bytes.length > MAX_SHARE_BYTES) {
      throw new Error("share_data_too_large");
    }

    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  }

  function base64UrlToBytes(input) {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/");
    const rest = padded.length % 4;
    const base64 = rest === 0 ? padded : padded + "=".repeat(4 - rest);

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  function showShareToast(message, isError) {
    const toast = document.getElementById("share-toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.classList.toggle("share-toast-error", Boolean(isError));
    setTimeout(() => {
      toast.classList.add("hidden");
      toast.classList.remove("share-toast-error");
    }, 3000);
  }

  function setupDjImageFallback() {
    const image = document.getElementById("dj-image");
    if (!image) {
      return;
    }

    image.addEventListener("error", () => {
      image.src = "";
      image.alt = "DJ";
      image.classList.add("dj-placeholder-lg");
    });
  }

  function initConfetti() {
    const canvas = document.getElementById("confetti");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const colors = [
      [255, 215, 0],
      [255, 0, 255],
      [0, 255, 255],
      [255, 68, 68],
      [0, 255, 136],
      [170, 0, 255],
      [255, 140, 0],
      [255, 255, 255],
    ];

    const pieces = [];
    for (let i = 0; i < 80; i++) {
      pieces.push(createPiece());
    }

    function createPiece() {
      const color = colors[Math.floor(Math.random() * colors.length)];
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        w: Math.random() * 10 + 4,
        h: Math.random() * 6 + 2,
        speedY: Math.random() * 2.5 + 0.8,
        speedX: (Math.random() - 0.5) * 2,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: Math.random() * 0.7 + 0.3,
        color,
      };
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.opacity})`;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();

        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotationSpeed;

        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      });
      requestAnimationFrame(draw);
    }
    draw();
  }
});
