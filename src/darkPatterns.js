// 다크 패턴 감지

(function () {
  const PATTERNS = {
    TEXT_RULES: [
      {
        label: '강제 동의 유도',
        regex: /동의하지\s*않으면\s*(가입|이용)\s*(불가|제한)|필수\s*동의|must\s*agree|cannot\s*proceed/gi,
        color: '#ffcccc', border: '#ff0000'
      },
      {
        label: '몰래 포함됨 (Sneaking)',
        regex: /자동으로\s*(갱신|결제)|체험\s*종료\s*후\s*청구|별도\s*해지\s*없으면|automatically\s*renew/gi,
        color: '#fff4e6', border: '#ffa500'
      },
      {
        label: '긴박함 조성 (Urgency)',
        regex: /지금만\s*(무료|할인)|남은\s*시간|선착순|limited\s*time|expires\s*soon/gi,
        color: '#fff0f0', border: '#dc3545'
      },
      {
        label: '취소 방해 (Roach Motel)',
        regex: /해지하려면\s*(전화|서면)|직접\s*방문|탈퇴\s*버튼이\s*없|cancel\s*by\s*phone/gi,
        color: '#e6f7ff', border: '#1890ff'
      }
    ],
    // 시각적 기준
    VISUAL_THRESHOLDS: {
      MIN_FONT_SIZE: 11,      // 11px 미만
      LOW_OPACITY: 0.6,       // 투명도 0.6 이하
      MIN_CONTRAST_RATIO: 3.0 // WCAG AA 기준(4.5)
    },
    // 스캔 제외 대상
    IGNORE_SELECTORS: 'nav, header, footer, aside, .gnb, .menu, .top-bar, .utility-menu, .btn, button, .tos-analyzer-ignore'
  };

  class Scanner {
    constructor() {
      this.targetRoots = [];
    }

    // 색상 계산
    parseColor(colorStr) {
      const match = colorStr.match(/\d+(\.\d+)?/g);
      if (!match || match.length < 3) return [255, 255, 255];
      return [parseFloat(match[0]), parseFloat(match[1]), parseFloat(match[2])];
    }

    getLuminance(r, g, b) {
      const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    getContrastRatio(fg, bg) {
      const l1 = this.getLuminance(fg[0], fg[1], fg[2]);
      const l2 = this.getLuminance(bg[0], bg[1], bg[2]);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    getRealBackgroundColor(el) {
      let current = el;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const style = window.getComputedStyle(current);
        const bgColor = style.backgroundColor;
        const match = bgColor.match(/\d+(\.\d+)?/g);
        
        // 투명하지 않은 배경색 발견 시 반환
        if (match) {
          const alpha = match[3] ? parseFloat(match[3]) : 1;
          if (alpha > 0.1) { 
            return [parseFloat(match[0]), parseFloat(match[1]), parseFloat(match[2])];
          }
        }
        current = current.parentElement;
      }
      return [255, 255, 255]; // 기본 흰색
    }

    // 본문 추정
    identifyContentRoots() {
      // 의미론적 태그 탐색
      const semanticTargets = document.querySelectorAll('main, article, .content, #content, .terms-wrap, .privacy-policy, .agreement-wrap');
      if (semanticTargets.length > 0) {
        // 너무 작은 영역(네비게이션 용도 등)은 제외
        return Array.from(semanticTargets).filter(el => el.innerText.length > 200);
      }

      // 텍스트 밀도 높은 div 탐색
      const divs = document.getElementsByTagName('div');
      let candidates = [];
      
      for (let div of divs) {
        // UI 영역 제외
        if (div.closest(PATTERNS.IGNORE_SELECTORS)) continue;
        
        const textLen = div.innerText.length;
        if (textLen > 500 && div.children.length < 50) {
          candidates.push(div);
        }
      }

      // 가장 텍스트가 많은 상위 3개 후보군 또는 전체 body
      return candidates.length > 0 ? candidates.slice(0, 3) : [document.body];
    }

    // 텍스트 패턴 감지
    highlightTextPatterns(rootElement) {
      const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentNode;
          if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest(PATTERNS.IGNORE_SELECTORS)) return NodeFilter.FILTER_REJECT;
          if (parent.classList.contains('tos-dp-highlight')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const nodesToReplace = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.nodeValue;
        if (/^[\|\.\-\/\>\<\·\]\[\s]+$/.test(text)) continue;

        for (const rule of PATTERNS.TEXT_RULES) {
          if (rule.regex.test(text)) {
            nodesToReplace.push({ node, rule });
            break; // 여러 룰 중복시 첫 번째만 적용
          }
        }
      }

      // DOM 조작 순회 후 일괄 처리
      nodesToReplace.forEach(({ node, rule }) => {
        try {
            const fragment = document.createDocumentFragment();
            const text = node.nodeValue;
            let lastIndex = 0;
            rule.regex.lastIndex = 0;
            let match;
            
            while ((match = rule.regex.exec(text)) !== null) {
              if (match.index > lastIndex) fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
              
              const span = document.createElement('span');
              span.className = 'tos-dp-highlight';
              span.textContent = match[0];
              span.dataset.dpType = rule.label;
              span.style.backgroundColor = rule.color;
              span.style.borderBottom = `2px solid ${rule.border}`;
              span.style.color = '#000';
              
              fragment.appendChild(span);
              lastIndex = rule.regex.lastIndex;
            }
            
            if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
            node.parentNode.replaceChild(fragment, node);
        } catch (e) {
            console.warn('[TermLens] 텍스트 하이라이트 중 오류:', e);
        }
      });
    }

    // 스타일 검사
    highlightVisualTricks(rootElement) {
      const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentNode;
          if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest(PATTERNS.IGNORE_SELECTORS)) return NodeFilter.FILTER_REJECT;
          // 버튼, 링크 내부 제외
          if (parent.closest('a, button, .btn')) return NodeFilter.FILTER_REJECT;
          if (parent.classList.contains('tos-visual-trick')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const nodesToCheck = [];
      while (walker.nextNode()) nodesToCheck.push(walker.currentNode);

      nodesToCheck.forEach(node => {
        const text = node.nodeValue.trim();
        // 한 글자, 숫자, 특수문자 제외
        if (text.length < 2 || /^[\|\.\-\/\>\<\·\]\[\s\d]+$/.test(text)) return;

        const parent = node.parentNode;
        const style = window.getComputedStyle(parent);

        if (style.display === 'none' || style.visibility === 'hidden') return;

        const fontSize = parseFloat(style.fontSize);
        const opacity = parseFloat(style.opacity);
        
        const width = parseFloat(style.width);
        const height = parseFloat(style.height);
        const isTinyBox = (width > 0 && width < 2) || (height > 0 && height < 2);

        // 명암비
        const fgColor = this.parseColor(style.color);
        const bgColor = this.getRealBackgroundColor(parent);
        const contrastRatio = this.getContrastRatio(fgColor, bgColor);

        let issue = null;

        if (isTinyBox) {
            issue = '숨겨진 텍스트 (1px Box)';
        }
        else if (fontSize < PATTERNS.VISUAL_THRESHOLDS.MIN_FONT_SIZE) {
          issue = `깨알 글씨 (${Math.round(fontSize)}px)`;
        }
        else if (opacity < PATTERNS.VISUAL_THRESHOLDS.LOW_OPACITY) {
          issue = '흐린 텍스트 (Opacity Low)';
        }
        else if (contrastRatio < PATTERNS.VISUAL_THRESHOLDS.MIN_CONTRAST_RATIO) {
           issue = `가독성 낮음 (대비 ${contrastRatio.toFixed(1)}:1)`;
        }

        if (issue) {
          if (!parent.classList.contains('tos-visual-trick')) {
              parent.classList.add('tos-visual-trick');
              parent.dataset.dpType = issue;
          }
        }
      });
    }

    // 미리 체크된 체크박스 감지
    detectPrecheckedInputs(rootElement) {
      // 체크박스 중 'checked' 상태인 것 탐색
      const checkboxes = rootElement.querySelectorAll('input[type="checkbox"]:checked');
      
      checkboxes.forEach(box => {
        if (box.disabled) return;
        
        // 라벨 텍스트 확인
        const id = box.id;
        let labelText = '';
        
        // <label for="id"> 확인
        if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) labelText += label.innerText;
        }
        // 부모 텍스트 확인
        if (box.parentElement) labelText += box.parentElement.innerText;

        // 마케팅 관련 키워드
        const marketingRegex = /마케팅|광고|홍보|이벤트|혜택|marketing|adver|promo/i;
        
        if (marketingRegex.test(labelText)) {
            const wrapper = box.parentElement;
            if (wrapper && !wrapper.classList.contains('tos-dp-highlight-box')) {
                wrapper.classList.add('tos-dp-highlight-box'); // 박스 형태로 강조
                wrapper.dataset.dpType = '마케팅 자동 동의 (Pre-checked)';
                wrapper.style.outline = '2px dashed #ffa500';
            }
        }
      });
    }

    scan() {
      console.log('[TermLens] 스캔 영역 식별 중...');
      this.targetRoots = this.identifyContentRoots();
      
      if (this.targetRoots.length === 0) {
        console.warn('[TermLens] 본문 영역을 찾지 못해 전체 검사를 수행합니다.');
        this.targetRoots = [document.body];
      } else {
        console.log(`[TermLens] ${this.targetRoots.length}개의 주요 약관 영역을 식별했습니다.`);
      }

      this.targetRoots.forEach(root => {
        this.highlightTextPatterns(root);
        this.highlightVisualTricks(root);
        this.detectPrecheckedInputs(root);
      });
      
      console.log('[TermLens] 다크 패턴 분석 완료');
    }
  }

  window.DarkPatternScanner = new Scanner();
})();
