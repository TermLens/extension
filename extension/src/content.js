// 약관 분석 요청 및 결과 표시

(function () {
  function autoCheckAgreements() {
    try {
      const boxes = document.querySelectorAll('input[type="checkbox"], [role="checkbox"]');

      boxes.forEach((el) => {
        // 주변 텍스트 수집
        const label = document.querySelector(`label[for="${el.id}"]`) || el.closest('label');
        const parent = el.closest('.terms_item, .check_wrap, li, div');
        const next = el.nextElementSibling;
        const ariaLabel = el.getAttribute('aria-label') || '';

        const combinedText = [
          label?.innerText,
          parent?.innerText,
          next?.innerText,
          ariaLabel,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        // "전체/모두 동의" 항목 제외
        if (/전체\s*동의|모두\s*동의|all\s*agree/.test(combinedText)) {
          console.log('[TermLens] 전체/모두 동의 버튼 제외:', combinedText.slice(0, 50));
          return;
        }

        // 필수/선택 구분
        const isRequired = /필수|required/.test(combinedText);
        const isOptional = /선택|optional|마케팅|광고|이벤트|위치|혜택/.test(combinedText);

        // 필수 항목만 체크
        if (isRequired && !isOptional) {
          const ariaChecked = el.getAttribute('aria-checked');
          const alreadyChecked = el.checked || ariaChecked === 'true';

          if (!alreadyChecked) {
            el.click();
            console.log('[TermLens] 필수 동의 자동 체크:', combinedText.slice(0, 80));
          }
        }
      });

      console.log('[TermLens] 모든 필수 항목 자동 동의 완료');
    } catch (err) {
      console.warn('[TermLens] 자동 체크 실패:', err);
    }
  }

  function waitForDomStable(callback) {
    let timeout;
    const observer = new MutationObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        observer.disconnect();
        callback();
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  const ui = window.termLensUi;
  if (!ui) {
    console.error('TermLens: UI 모듈이 로드되지 않았습니다.');
    return;
  }

  const modal = document.getElementById(ui.MODAL_ID);
  if (modal) {
    ui.removeModal();
    return;
  }

  ui.showLoadingModal();

  // HTML 전체 전송
  const pageHtml = document.documentElement.outerHTML;
  chrome.runtime.sendMessage({ type: 'analyzePage', html: pageHtml });

  // 서버 응답 처리
  chrome.runtime.onMessage.addListener(function handler(req) {
    if (req.type === 'analysisComplete') {
      ui.showResultsModal(req.data);
      waitForDomStable(autoCheckAgreements);
    } else if (req.type === 'analysisError') {
      ui.showError(req.error);
    }
    chrome.runtime.onMessage.removeListener(handler);
  });
})();
