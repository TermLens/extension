// 서버로 HTML을 전송하고 결과를 받아오는 백그라운드 스크립트

const API_ENDPOINT = '__Server__';

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['styles/modal.css']
  });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['src/ui.js', 'src/content.js']
  });
});

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.type === "analyzePage") {
    analyzeHtml(request.html, sender.tab.id, sender.tab.url);
    return true;
  }
});

async function analyzeHtml(html, tabId, url) {
  try {
    const res = await fetch(`${API_ENDPOINT}?url=${encodeURIComponent(url)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/html' },
      body: html
    });

    if (!res.ok) {
      let msg = `서버 오류: ${res.status} ${res.statusText}`;
      try {
        const err = await res.json();
        if (err?.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    chrome.tabs.sendMessage(tabId, { type: "analysisComplete", data });
  } catch (err) {
    chrome.tabs.sendMessage(tabId, { type: "analysisError", error: err.message });
  }
}
