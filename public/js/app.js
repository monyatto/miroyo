document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("achievement-text");
  const charCount = document.getElementById("char-count");
  const submitBtn = document.getElementById("submit-btn");
  const loading = document.getElementById("loading");
  const errorMessage = document.getElementById("error-message");

  // 編集モードで戻ってきた場合、テキストを復元
  const savedText = sessionStorage.getItem("miroyo_input_text");
  if (savedText) {
    textarea.value = savedText;
    charCount.textContent = savedText.length;
    submitBtn.disabled = false;
    sessionStorage.removeItem("miroyo_input_text");
  }

  textarea.addEventListener("input", () => {
    const len = textarea.value.trim().length;
    charCount.textContent = textarea.value.length;
    submitBtn.disabled = len === 0;
  });

  submitBtn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) return;

    submitBtn.disabled = true;
    loading.classList.remove("hidden");
    errorMessage.classList.add("hidden");

    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (res.status === 429) {
        showRateLimit();
        return;
      }

      if (!res.ok) {
        showError("エラーが発生しました。文章を変えてもう一度お試しください。");
        return;
      }

      const data = await res.json();

      if (data.error) {
        showError("エラーが発生しました。文章を変えてもう一度お試しください。");
        return;
      }

      // 結果とオリジナルテキストをsessionStorageに保存
      sessionStorage.setItem("miroyo_result", JSON.stringify(data));
      sessionStorage.setItem("miroyo_original_text", text);

      // 結果画面に遷移
      window.location.href = "/result";
    } catch (err) {
      showError("通信エラーが発生しました。ネットワーク接続を確認してください。");
    } finally {
      loading.classList.add("hidden");
      submitBtn.disabled = textarea.value.trim().length === 0;
    }
  });

  function showError(message) {
    errorMessage.innerHTML = "";
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
    errorMessage.classList.remove("rate-limit-message");
  }

  function showRateLimit() {
    errorMessage.classList.remove("hidden");
    errorMessage.classList.add("rate-limit-message");
    errorMessage.innerHTML = `
      <div class="rate-limit-dj">😴</div>
      <div class="rate-limit-text">DJは休憩中です</div>
      <div class="rate-limit-sub">しばらく時間を置いてから再度お試しください</div>
    `;
  }
});
