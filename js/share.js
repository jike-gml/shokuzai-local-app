function toastShare(message){
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(window.__shareToastTimer);
  window.__shareToastTimer = setTimeout(() => box.classList.remove('show'), 2400);
}

async function ensureConsultText(){
  const textarea = document.getElementById('consultText');
  if (!textarea) return '';

  if (!textarea.value.trim()) {
    const createButton = document.getElementById('consultBtn');
    if (createButton) createButton.click();
    await Promise.resolve();
  }

  return textarea.value.trim();
}

async function shareConsultation(){
  const text = await ensureConsultText();

  if (!text) {
    toastShare('共有する相談文を作成できませんでした。');
    return;
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'こんだて相談',
        text
      });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    toastShare('共有機能に対応していないため、相談文をコピーしました。');
  } catch {
    const textarea = document.getElementById('consultText');
    if (textarea) {
      textarea.style.display = 'block';
      textarea.select();
      document.execCommand('copy');
      toastShare('相談文をコピーしました。');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('shareConsultBtn');
  if (button) button.addEventListener('click', shareConsultation);
});
