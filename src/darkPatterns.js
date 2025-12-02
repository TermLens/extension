// 다크 패턴 감지

(function () {
  const PATTERNS = {
    TEXT_RULES: [
      {
        label: '강제 동의 유도',
        regex: /동의하지\s*않으면\s*(가입|이용)\s*(불가|제한)|필수\s*동의|must\s*agree|cannot\s*proceed/gi
      },
      {
        label: '몰래 포함됨 (Sneaking)',
        regex: /자동으로\s*(갱신|결제)|체험\s*종료\s*후\s*청구|별도\s*해지\s*없으면|automatically\s*renew/gi
      },
      {
        label: '긴박함 조성 (Urgency)',
        regex: /지금만\s*(무료|할인)|남은\s*시간|선착순|limited\s*time|expires\s*soon/gi
      },
      {
        label: '취소 방해 (Roach Motel)',
        regex: /해지하려면\s*(전화|서면)|직접\s*방문|탈퇴\s*버튼이\s*없|cancel\s*by\s*phone/gi
      }
    ],
    // 탐지 기준
    VISUAL_THRESHOLDS: {
      MIN_FONT_SIZE: 11,
      LOW_OPACITY: 0.6,
      MIN_CONTRAST_RATIO: 3.0
    },
    IGNORE_SELECTORS: 'nav, header, footer, aside, .gnb, .menu, .top-bar, .utility-menu, .btn, button, .tos-analyzer-ignore'
  };

  class Scanner {
    constructor() {
      this.targetRoots = [];
    }

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
        const match = style.backgroundColor.match(/\d+(\.\d+)?/g);
        if (match && (match[3] ? parseFloat(match[3]) : 1) > 0.1) {
             return [parseFloat(match[0]), parseFloat(match[1]), parseFloat(match[2])];
        }
        current = current.parentElement;
      }
      return [255, 255, 255];
    }

    identifyContentRoots() {
      const semanticTargets = document.querySelectorAll('main, article, .content, #content, .terms-wrap');
      if (semanticTargets.length > 0) return Array.from(semanticTargets).filter(el => el.innerText.length > 200);
      
      const divs = document.getElementsByTagName('div');
      let candidates = [];
      for (let div of divs) {
        if (div.closest(PATTERNS.IGNORE_SELECTORS)) continue;
        if (div.innerText.length > 500 && div.children.length < 50) candidates.push(div);
      }
      return candidates.length > 0 ? candidates.slice(0, 3) : [document.body];
    }


    // 탐지된 요소에 동일한 스타일을 적용
    applyWarningStyle(element, label) {
        // 기존 스타일 무력화
        element.style.setProperty('color', '#000000', 'important');
        element.style.setProperty('font-weight', '900', 'important');
        element.style.setProperty('font-size', '12px', 'important');
        element.style.setProperty('background-color', '#fff59d', 'important');
        element.style.setProperty('border', '2px solid #ff1744', 'important');
        element.style.setProperty('padding', '4px', 'important');
        element.style.setProperty('border-radius', '4px', 'important');
        element.style.setProperty('opacity', '1', 'important');
        element.style.setProperty('text-decoration', 'none', 'important');
        element.style.setProperty('text-shadow', 'none', 'important');
        element.style.setProperty('display', 'inline-block', 'important');
        element.style.setProperty('box-shadow', '0 4px 6px rgba(0,0,0,0.2)', 'important');

        // 숨김 속성 해제
        element.style.setProperty('width', 'auto', 'important');
        element.style.setProperty('height', 'auto', 'important');
        element.style.setProperty('overflow', 'visible', 'important');
        element.style.setProperty('position', 'relative', 'important');
        element.style.setProperty('visibility', 'visible', 'important');
        element.style.setProperty('clip', 'auto', 'important');
        element.style.setProperty('clip-path', 'none', 'important');
        element.style.setProperty('z-index', '9999', 'important');

        // 툴팁 표시
        element.title = `[TermLens] ${label}`;
        element.dataset.dpType = label;
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
            break; 
          }
        }
      }

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
              
              this.applyWarningStyle(span, rule.label);
              
              fragment.appendChild(span);
              lastIndex = rule.regex.lastIndex;
            }
            
            if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
            node.parentNode.replaceChild(fragment, node);
        } catch (e) { console.warn(e); }
      });
    }

    // 시각적 속임수 감지
    highlightVisualTricks(rootElement) {
      const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentNode;
          if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest(PATTERNS.IGNORE_SELECTORS)) return NodeFilter.FILTER_REJECT;
          if (parent.closest('a, button, .btn')) return NodeFilter.FILTER_REJECT;
          if (parent.classList.contains('tos-visual-trick')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const nodesToCheck = [];
      while (walker.nextNode()) nodesToCheck.push(walker.currentNode);

      nodesToCheck.forEach(node => {
        const text = node.nodeValue.trim();
        if (text.length < 2 || /^[\|\.\-\/\>\<\·\]\[\s\d]+$/.test(text)) return;

        const parent = node.parentNode;
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') return;

        const fontSize = parseFloat(style.fontSize);
        const opacity = parseFloat(style.opacity);
        const width = parseFloat(style.width);
        const height = parseFloat(style.height);
        const isTinyBox = (width > 0 && width < 2) || (height > 0 && height < 2);
        
        // 화면 밖으로 보낸 경우 
        const isOffScreen = style.position === 'absolute' && (parseFloat(style.left) < -100 || parseFloat(style.top) < -100);

        const fgColor = this.parseColor(style.color);
        const bgColor = this.getRealBackgroundColor(parent);
        const contrastRatio = this.getContrastRatio(fgColor, bgColor);

        let issue = null;

        if (isTinyBox || isOffScreen) issue = '숨겨진 텍스트 (Hidden)';
        else if (fontSize < PATTERNS.VISUAL_THRESHOLDS.MIN_FONT_SIZE) issue = `깨알 글씨 (${Math.round(fontSize)}px)`;
        else if (opacity < PATTERNS.VISUAL_THRESHOLDS.LOW_OPACITY) issue = '흐린 텍스트 (Low Opacity)';
        else if (contrastRatio < PATTERNS.VISUAL_THRESHOLDS.MIN_CONTRAST_RATIO) issue = `가독성 낮음 (${contrastRatio.toFixed(1)}:1)`;

        if (issue) {
          if (!parent.classList.contains('tos-visual-trick')) {
              parent.classList.add('tos-visual-trick');
              
              this.applyWarningStyle(parent, issue);
          }
        }
      });
    }

    // 체크박스 감지
    detectPrecheckedInputs(rootElement) {
      const checkboxes = rootElement.querySelectorAll('input[type="checkbox"]:checked');
      
      checkboxes.forEach(box => {
        if (box.disabled) return;
        
        const id = box.id;
        let labelText = '';
        let labelEl = null;

        if (id) {
            labelEl = document.querySelector(`label[for="${id}"]`);
            if (labelEl) labelText += labelEl.innerText;
        }
        if (box.parentElement) labelText += box.parentElement.innerText;

        if (/마케팅|광고|홍보|이벤트|혜택/i.test(labelText)) {
            const wrapper = box.parentElement;
            if (wrapper && !wrapper.classList.contains('tos-dp-highlight-box')) {
                wrapper.classList.add('tos-dp-highlight-box');
                
                this.applyWarningStyle(wrapper, '마케팅 자동 동의');
                
                if (labelEl) this.applyWarningStyle(labelEl, '마케팅 자동 동의');
            }
        }
      });
    }

    scan() {
      console.log('[TermLens] 스캔 시작...');
      this.targetRoots = this.identifyContentRoots();
      
      if (this.targetRoots.length === 0) this.targetRoots = [document.body];

      this.targetRoots.forEach(root => {
        this.highlightTextPatterns(root);
        this.highlightVisualTricks(root);
        this.detectPrecheckedInputs(root);
      });
      console.log('[TermLens] 완료');
    }
  }

  window.DarkPatternScanner = new Scanner();
})();
