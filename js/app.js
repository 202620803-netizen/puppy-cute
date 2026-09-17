(function () {
  "use strict";

  var els = {
    tabBtns: document.querySelectorAll(".tab-btn"),
    panelPhoto: document.getElementById("panel-photo"),
    panelSearch: document.getElementById("panel-search"),
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("file-input"),
    previewArea: document.getElementById("preview-area"),
    previewImg: document.getElementById("preview-img"),
    analyzeBtn: document.getElementById("analyze-btn"),
    resetBtn: document.getElementById("reset-btn"),
    analyzeStatus: document.getElementById("analyze-status"),
    photoResult: document.getElementById("photo-result"),
    searchInput: document.getElementById("search-input"),
    searchClear: document.getElementById("search-clear"),
    filterChips: document.getElementById("filter-chips"),
    resultTitle: document.getElementById("result-title"),
    resultCount: document.getElementById("result-count"),
    searchResults: document.getElementById("search-results"),
    cardTemplate: document.getElementById("breed-card-template")
  };

  var state = {
    model: null,
    modelPromise: null,
    imageDataUrl: null,
    activeChips: {},
    lastDogMatches: []
  };

  var PARTICLE_RE = /(합니다|습니다|입니다|어요|에요|해요|이며|라는|다는|하고|부터|까지|으로|에서|적인|같은|은|는|이|가|을|를|의|와|과|도|만|에|로|고|다|요|랑|한)/;
  var STOPWORDS = { "개": 1, "견": 1, "아": 1, "의": 1, "를": 1, "을": 1, "은": 1, "는": 1, "이": 1, "가": 1, "도": 1, "만": 1, "와": 1, "과": 1, "에": 1, "로": 1, "고": 1, "다": 1, "요": 1, "랑": 1, "한": 1, "그": 1, "저": 1, "것": 1, "수": 1, "적": 1 };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function stripParticles(token) {
    var t = token;
    var prev = null;
    while (t !== prev && t.length >= 2) {
      prev = t;
      t = t.replace(PARTICLE_RE, "");
      if (t.length < 2) break;
    }
    return t.length >= 2 ? t : null;
  }

  function tokenize(query) {
    var raw = query.toLowerCase().replace(/[.,!?;:()[\]{}"'~^]/g, " ").split(/\s+/);
    var tokens = [];
    raw.forEach(function (w) {
      if (!w) return;
      if (w.length >= 2) tokens.push(w);
      var stripped = stripParticles(w);
      if (stripped && stripped !== w) tokens.push(stripped);
      var one = w.replace(PARTICLE_RE, "");
      if (one.length === 1 && !STOPWORDS[one]) tokens.push(one);
    });
    var expanded = [];
    tokens.forEach(function (t) {
      expanded.push(t);
      var syn = SYNONYMS[t];
      if (syn) syn.forEach(function (s) { expanded.push(s); });
    });
    return expanded.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function searchBreeds(query) {
    var tokens = tokenize(query);
    var chips = Object.keys(state.activeChips);
    if (!tokens.length && !chips.length) return BREEDS.slice();
    var hasTokens = tokens.length > 0;

    return BREEDS.map(function (b) {
      var score = hasTokens ? 0 : 1;
      var tagHay = b.tags.join("|");
      var allHay = (b.name + " " + b.en + " " + b.size + " " + b.personality + " " + b.desc + " " + tagHay).toLowerCase();
      tokens.forEach(function (t) {
        if (tagHay.indexOf(t) !== -1) score += 3;
        else if (allHay.indexOf(t) !== -1) score += 1;
      });
      return { breed: b, score: score };
    }).filter(function (x) {
      if (x.score <= 0) return false;
      for (var i = 0; i < chips.length; i++) {
        if (x.breed.tags.indexOf(chips[i]) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return b.score - a.score; })
      .map(function (x) { return x.breed; });
  }

  function loadBreedImage(cardEl, breed) {
    var img = cardEl.querySelector("img");
    var fallback = cardEl.querySelector(".card-img-fallback");
    if (!breed.imgPath) return;
    var cache = loadBreedImage._cache || (loadBreedImage._cache = {});
    var cached = cache[breed.id];
    var src = cached || null;
    var apply = function (url) {
      cache[breed.id] = url;
      img.onload = function () {
        img.classList.add("loaded");
        fallback.style.display = "none";
      };
      img.src = url;
    };
    if (src) { apply(src); return; }
    fetch("https://dog.ceo/api/breed/" + breed.imgPath + "/images/random")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.status === "success" && data.message) apply(data.message);
      })
      .catch(function () { });
  }

  function createCard(breed, confidence) {
    var node = els.cardTemplate.content.cloneNode(true);
    var card = node.querySelector(".card");
    node.querySelector(".card-name").textContent = breed.name;
    node.querySelector(".card-en").textContent = breed.en;
    var badge = node.querySelector(".size-badge");
    badge.textContent = breed.size + "견";
    node.querySelector(".stat-height").textContent = breed.height;
    node.querySelector(".stat-weight").textContent = breed.weight;
    node.querySelector(".stat-life").textContent = breed.life;
    node.querySelector(".card-desc").textContent = breed.desc;
    var tagsEl = node.querySelector(".card-tags");
    breed.tags.slice(0, 7).forEach(function (t) {
      var span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tagsEl.appendChild(span);
    });
    loadBreedImage(card, breed);
    if (typeof confidence === "number") {
      var bar = document.createElement("div");
      bar.className = "confidence";
      bar.innerHTML =
        '<div class="confidence-label"><span>AI 판정 신뢰도</span><em>' +
        Math.round(confidence * 100) + "%</em></div>" +
        '<div class="confidence-track"><div class="confidence-fill" style="width:' +
        Math.round(confidence * 100) + '%"></div></div>';
      card.querySelector(".card-body").prepend(bar);
    }
    return node;
  }

  function setTab(tab) {
    els.tabBtns.forEach(function (btn) {
      var active = btn.dataset.tab === tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    var photoActive = tab === "photo";
    els.panelPhoto.classList.toggle("active", photoActive);
    els.panelPhoto.hidden = !photoActive;
    els.panelSearch.classList.toggle("active", !photoActive);
    els.panelSearch.hidden = photoActive;
  }

  function showStatus(msg) {
    els.analyzeStatus.textContent = msg;
    els.analyzeStatus.classList.remove("hidden");
  }

  function hideStatus() {
    els.analyzeStatus.classList.add("hidden");
  }

  function ensureModel() {
    if (state.model) return Promise.resolve(state.model);
    if (state.modelPromise) return state.modelPromise;
    showStatus("AI 모델을 불러오는 중... (처음 한 번만 다운로드되며 몇 초 걸릴 수 있어요)");
    state.modelPromise = mobilenet.load().then(function (model) {
      state.model = model;
      return model;
    });
    return state.modelPromise;
  }

  function resetPhoto() {
    state.imageDataUrl = null;
    state.lastDogMatches = [];
    els.fileInput.value = "";
    els.previewArea.classList.add("hidden");
    els.photoResult.innerHTML = "";
    els.dropzone.classList.remove("hidden");
    hideStatus();
  }

  function handleFile(file) {
    if (!file || file.type.indexOf("image") !== 0) {
      showStatus("이미지 파일(JPG, PNG 등)만 업로드할 수 있어요.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      state.imageDataUrl = e.target.result;
      els.previewImg.src = state.imageDataUrl;
      els.dropzone.classList.add("hidden");
      els.previewArea.classList.remove("hidden");
      els.photoResult.innerHTML = "";
      hideStatus();
    };
    reader.readAsDataURL(file);
  }

  function renderPhotoMatch(match, candidates) {
    els.photoResult.innerHTML = "";
    var breed = match.breedId ? getBreedById(match.breedId) : null;
    var wrap = document.createElement("div");
    wrap.className = "photo-match";

    var head = document.createElement("div");
    head.className = "match-head";
    if (breed) {
      head.innerHTML = '<p class="match-label">AI가 예측한 견종은 <strong>' +
        escapeHtml(breed.name) + "</strong> 입니다</p>";
    } else {
      head.innerHTML = '<p class="match-label">AI가 예측한 품종: <strong>' +
        escapeHtml(match.label) + "</strong> (상세 정보 DB에 없음)</p>";
    }
    wrap.appendChild(head);

    if (breed) {
      wrap.appendChild(createCard(breed, match.prob));
    }

    if (candidates && candidates.length) {
      var other = document.createElement("div");
      other.className = "other-candidates";
      var title = document.createElement("p");
      title.className = "other-title";
      title.textContent = "다른 가능성 높은 견종 후보";
      other.appendChild(title);
      var chipRow = document.createElement("div");
      chipRow.className = "candidate-row";
      candidates.forEach(function (c) {
        var cb = c.breedId ? getBreedById(c.breedId) : null;
        var chip = document.createElement("button");
        chip.className = "candidate-chip" + (cb ? "" : " disabled");
        chip.innerHTML = escapeHtml(cb ? cb.name : c.label) +
          '<em>' + Math.round(c.prob * 100) + "%</em>";
        if (cb) {
          chip.addEventListener("click", function () {
            renderPhotoMatch({ label: c.label, breedId: c.breedId, prob: c.prob },
              state.lastDogMatches.filter(function (m) { return m !== c; }));
          });
        }
        chipRow.appendChild(chip);
      });
      other.appendChild(chipRow);
      wrap.appendChild(other);
    }

    els.photoResult.appendChild(wrap);
    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function analyze() {
    if (!state.imageDataUrl) return;
    els.analyzeBtn.disabled = true;
    els.photoResult.innerHTML = "";
    showStatus("사진을 분석하는 중...");
    ensureModel()
      .then(function (model) {
        showStatus("사진을 분석하는 중...");
        return model.classify(els.previewImg, 10);
      })
      .then(function (preds) {
        hideStatus();
        els.analyzeBtn.disabled = false;
        var dogMatches = preds.filter(function (p) { return isDogLabel(p.className); })
          .map(function (p) {
            return { label: p.className, breedId: mapLabelToBreedId(p.className), prob: p.probability };
          });
        state.lastDogMatches = dogMatches;
        if (!dogMatches.length) {
          var top = preds[0] ? preds[0].className : "알 수 없음";
          els.photoResult.innerHTML =
            '<div class="no-dog"><strong>강아지로 보이는 사진이 아니에요.</strong>' +
            "<p>AI는 이 사진을 다음과 같이 인식했습니다: " + escapeHtml(top) +
            "</p><p>강아지가 정면으로 잘 나온 사진으로 다시 시도해 주세요.</p></div>";
          return;
        }
        var primary = dogMatches[0];
        var rest = dogMatches.slice(1, 5);
        renderPhotoMatch(primary, rest);
      })
      .catch(function (err) {
        hideStatus();
        els.analyzeBtn.disabled = false;
        showStatus("분석 중 오류가 발생했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
        console.error(err);
      });
  }

  function renderSearch() {
    var q = els.searchInput.value.trim();
    els.searchClear.classList.toggle("hidden", q.length === 0);
    var results = searchBreeds(q);
    var chips = Object.keys(state.activeChips);

    els.searchResults.innerHTML = "";
    if (results.length) {
      els.resultTitle.textContent = q || chips.length ? "검색 결과" : "전체 견종";
      els.resultCount.textContent = results.length + "종";
      results.forEach(function (b) {
        els.searchResults.appendChild(createCard(b));
      });
    } else {
      els.resultTitle.textContent = "검색 결과";
      els.resultCount.textContent = "0종";
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = "<strong>조건에 맞는 견종이 없어요.</strong>" +
        "<p>키워드를 줄이거나 다른 표현으로 검색해 보세요. (예: 작은, 온순한, 활동적, 아파트, 초보)</p>";
      els.searchResults.appendChild(empty);
    }
  }

  function bindEvents() {
    els.tabBtns.forEach(function (btn) {
      btn.addEventListener("click", function () { setTab(btn.dataset.tab); });
    });

    els.dropzone.addEventListener("click", function () { els.fileInput.click(); });
    els.dropzone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
    });
    els.fileInput.addEventListener("change", function () {
      if (els.fileInput.files && els.fileInput.files[0]) handleFile(els.fileInput.files[0]);
    });

    ["dragenter", "dragover"].forEach(function (ev) {
      els.dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        els.dropzone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      els.dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        els.dropzone.classList.remove("dragging");
      });
    });
    els.dropzone.addEventListener("drop", function (e) {
      var dt = e.dataTransfer;
      if (dt.files && dt.files[0]) handleFile(dt.files[0]);
    });

    document.addEventListener("paste", function (e) {
      if (!els.panelPhoto.classList.contains("active")) return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") === 0) {
          handleFile(items[i].getAsFile());
          break;
        }
      }
    });

    els.analyzeBtn.addEventListener("click", analyze);
    els.resetBtn.addEventListener("click", resetPhoto);

    var debounceTimer = null;
    els.searchInput.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderSearch, 120);
    });
    els.searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); renderSearch(); }
    });
    els.searchClear.addEventListener("click", function () {
      els.searchInput.value = "";
      renderSearch();
      els.searchInput.focus();
    });

    els.filterChips.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      var key = chip.dataset.chip;
      if (state.activeChips[key]) {
        delete state.activeChips[key];
        chip.classList.remove("active");
      } else {
        state.activeChips[key] = true;
        chip.classList.add("active");
      }
      renderSearch();
    });
  }

  function init() {
    bindEvents();
    setTab("photo");
    renderSearch();
    if (typeof tf === "undefined" || typeof mobilenet === "undefined") {
      console.warn("TensorFlow.js 로드에 실패했습니다. 인터넷 연결을 확인하세요.");
      els.analyzeBtn.disabled = true;
      els.analyzeBtn.title = "AI 라이브러리를 불러올 수 없습니다. 인터넷 연결 후 새로고침 해주세요.";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
