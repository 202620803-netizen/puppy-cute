(function () {
  "use strict";

  var els = {
    form: document.getElementById("search-form"),
    search: document.getElementById("region-search"),
    grid: document.getElementById("region-grid"),
    detail: document.getElementById("detail-panel"),
    filters: document.getElementById("filter-chips"),
    sort: document.getElementById("sort-select"),
    count: document.getElementById("result-count"),
    title: document.getElementById("list-title"),
    empty: document.getElementById("empty-state"),
    total: document.getElementById("region-total"),
    reset: document.getElementById("reset-filters"),
    favoritesNav: document.getElementById("favorites-nav"),
    favoriteCount: document.getElementById("favorite-count"),
    themeToggle: document.getElementById("theme-toggle")
  };

  var state = {
    query: "",
    filter: "all",
    sort: "recommended",
    selected: "seoul",
    favoritesOnly: false,
    favorites: readFavorites()
  };

  function readFavorites() {
    try {
      var stored = JSON.parse(localStorage.getItem("eodisal-favorites") || "[]");
      return Array.isArray(stored) ? stored.filter(function (id) {
        return window.REGIONS.some(function (region) { return region.id === id; });
      }) : [];
    }
    catch (error) { return []; }
  }

  function saveFavorites() {
    try { localStorage.setItem("eodisal-favorites", JSON.stringify(state.favorites)); }
    catch (error) { /* 저장소를 사용할 수 없는 환경에서는 현재 화면에서만 유지합니다. */ }
    els.favoriteCount.textContent = state.favorites.length;
  }

  function setTheme(theme) {
    var isDark = theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    els.themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
    els.themeToggle.setAttribute("aria-label", isDark ? "라이트 모드로 전환" : "다크 모드로 전환");
    els.themeToggle.title = isDark ? "라이트 모드로 전환" : "다크 모드로 전환";
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", isDark ? "#111713" : "#f7f7f2");
    try { localStorage.setItem("eodisal-theme", theme); }
    catch (error) { /* 저장소를 쓸 수 없어도 현재 화면에서는 테마를 바꿉니다. */ }
  }

  function initTheme() {
    var theme = "light";
    try { theme = localStorage.getItem("eodisal-theme") === "dark" ? "dark" : "light"; }
    catch (error) { /* 기본값은 라이트 모드입니다. */ }
    setTheme(theme);
    els.themeToggle.addEventListener("click", function () {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
  }

  function imageUrl(id, width) {
    return "https://images.unsplash.com/" + id + "?auto=format&fit=crop&w=" + (width || 720) + "&q=78";
  }

  function formatWon(value) {
    return value.toLocaleString("ko-KR");
  }

  function includesQuery(region, query) {
    if (!query) return true;
    var priceWords = "아파트 " + region.apartment + " 주택 " + region.house + " 빌라 " + region.villa + " 집값 주거비";
    var categoryWords = region.tags.join(" ").replace("coast", "바다 해안").replace("nature", "자연 산").replace("affordable", "저렴 부담 적은").replace("warm", "따뜻 온화");
    var localAreas = (window.LOCAL_AREAS[region.id] || []).join(" ");
    var haystack = [region.name, region.area, region.neighborhood, region.tagline, region.keywords,
      region.economy, region.specialty, region.disasters, region.location, region.description, priceWords, categoryWords, localAreas, "범죄 범죄율 치안 안전"].join(" ").toLowerCase();
    var related = {
      "싼": ["저렴", "부담", "낮은"], "저렴": ["저렴", "부담", "낮은"], "부담": ["저렴", "부담"], "낮은": ["저렴", "부담", "낮은"], "낮": ["저렴", "부담", "낮은"],
      "집값": ["집값", "아파트", "주거비"], "해변": ["바다", "해안"], "시원": ["연평균", "산"],
      "따뜻": ["따뜻", "온화"], "산": ["산", "자연"], "바다": ["바다", "해안"],
      "조용": ["차분", "여유", "한적"], "제주도": ["제주"], "강원도": ["강원"], "전라도": ["전북", "전주"]
    };
    var ignoredWords = { "가까이": true, "싶은": true, "싶어요": true, "싶어": true, "찾아줘": true, "찾고": true, "동네": true, "지역": true, "날씨": true, "생활": true, "살기": true, "좋은": true, "곳": true };
    var words = query.toLowerCase().replace(/[.,!?;:()[\]{}"'~^]/g, " ").split(/\s+/).filter(Boolean).map(function (word) {
      if (ignoredWords[word]) return "";
      return word.replace(/(가까이|에서|으로|에게|한|은|는|이|가|을|를|에|로)$/g, "") || word;
    }).filter(Boolean);
    return words.every(function (word) {
      if (haystack.indexOf(word) !== -1) return true;
      return (related[word] || []).some(function (synonym) { return haystack.indexOf(synonym) !== -1; });
    });
  }

  function getVisibleRegions() {
    var results = window.REGIONS.filter(function (region) {
      if (state.favoritesOnly && state.favorites.indexOf(region.id) === -1) return false;
      if (!includesQuery(region, state.query)) return false;
      if (state.filter === "coast" && region.tags.indexOf("coast") === -1) return false;
      if (state.filter === "nature" && region.tags.indexOf("nature") === -1) return false;
      if (state.filter === "warm" && region.tags.indexOf("warm") === -1) return false;
      if (state.filter === "affordable" && (parseFloat(region.apartment) > 4 || region.costIndex > 96)) return false;
      return true;
    });

    if (state.sort === "price") results.sort(function (a, b) { return parseFloat(a.apartment) - parseFloat(b.apartment); });
    if (state.sort === "cost") results.sort(function (a, b) { return a.costIndex - b.costIndex; });
    if (state.sort === "crime") results.sort(function (a, b) { return a.crimeRate - b.crimeRate; });
    if (state.sort === "name") results.sort(function (a, b) { return a.name.localeCompare(b.name, "ko"); });
    return results;
  }

  function makeCard(region) {
    var article = document.createElement("article");
    article.className = "region-card" + (state.selected === region.id ? " selected" : "");
    article.tabIndex = 0;
    article.setAttribute("aria-label", region.name + " 지역 정보 보기");
    article.setAttribute("aria-current", state.selected === region.id ? "true" : "false");

    var cover = document.createElement("div");
    cover.className = "region-image";
    var img = document.createElement("img");
    img.src = imageUrl(region.image, 650);
    img.alt = region.alt;
    img.loading = "lazy";
    cover.appendChild(img);
    var place = document.createElement("div");
    place.className = "region-place";
    place.innerHTML = "<strong></strong>";
    place.querySelector("strong").textContent = region.name;
    place.appendChild(document.createTextNode(region.area));
    cover.appendChild(place);

    var save = document.createElement("button");
    save.type = "button";
    save.className = "save-button" + (state.favorites.indexOf(region.id) !== -1 ? " saved" : "");
    save.setAttribute("aria-label", state.favorites.indexOf(region.id) !== -1 ? region.name + " 저장 취소" : region.name + " 저장");
    save.setAttribute("aria-pressed", state.favorites.indexOf(region.id) !== -1 ? "true" : "false");
    save.textContent = state.favorites.indexOf(region.id) !== -1 ? "♥" : "♡";
    save.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleFavorite(region.id);
    });
    cover.appendChild(save);

    var info = document.createElement("div");
    info.className = "region-info";
    var tagline = document.createElement("p");
    tagline.className = "region-tagline";
    tagline.textContent = region.tagline;
    info.appendChild(tagline);

    var meta = document.createElement("div");
    meta.className = "region-meta";
    meta.innerHTML = '<div class="meta-item"><span>아파트 참고가</span><strong></strong></div><i class="meta-divider"></i><div class="meta-item"><span>생활물가</span><strong></strong></div><i class="meta-divider"></i><div class="meta-item"><span>범죄율 · 10만 명당</span><strong></strong></div>';
    meta.querySelectorAll(".meta-item strong")[0].textContent = region.apartment;
    meta.querySelectorAll(".meta-item strong")[1].textContent = "전국 평균 " + region.costIndex;
    meta.querySelectorAll(".meta-item strong")[2].textContent = formatWon(Math.round(region.crimeRate)) + "건";
    info.appendChild(meta);
    article.appendChild(cover);
    article.appendChild(info);

    article.addEventListener("click", function () { selectRegion(region.id); });
    article.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        if (event.target === article) { event.preventDefault(); selectRegion(region.id); }
      }
    });
    return article;
  }

  function renderMap(region) {
    var x = Math.max(20, Math.min(80, (region.lng - 124) * 13));
    var y = Math.max(17, Math.min(82, (39 - region.lat) * 13));
    return '<div class="location-map" aria-hidden="true"><svg viewBox="0 0 150 100"><path class="map-land" d="M66 5 78 9 83 18 94 22 91 31 99 39 92 47 96 55 88 62 91 72 82 80 76 93 65 89 58 80 60 70 51 62 55 52 48 44 56 34 53 25 60 17z"/><path class="map-island" d="m52 82 5 2-1 4-6-1z"/><circle class="map-pulse" cx="' + x + '" cy="' + y + '" r="7"/><circle class="map-pin" cx="' + x + '" cy="' + y + '" r="3"/></svg><span>대한민국 <b>' + region.name + '</b></span></div>';
  }

  function renderLocalAreas(region) {
    var areas = window.LOCAL_AREAS[region.id] || [];
    return '<div class="detail-section-title">잘 알려진 동네 <span>' + areas.length + '곳 · 지도에서 보기</span></div><div class="local-area-list">' +
      areas.map(function (area) {
        var query = region.name + " " + area;
        return '<a class="local-area-chip" href="https://map.naver.com/p/search/' + encodeURIComponent(query) + '" target="_blank" rel="noreferrer"><span class="area-pin" aria-hidden="true">⌖</span>' + area + '<span class="area-arrow" aria-hidden="true">↗</span></a>';
      }).join("") +
      '</div><p class="local-area-note">동네 예시는 각 시·도 안의 대표적인 생활·관광권을 소개합니다.</p>';
  }

  function renderDetail(region) {
    if (!region) {
      els.detail.innerHTML = '<div class="detail-empty"><span>♡</span><strong>저장한 지역이 아직 없어요.</strong><p>마음에 드는 동네의 하트를 눌러 모아보세요.</p></div>';
      return;
    }
    var saved = state.favorites.indexOf(region.id) !== -1;
    var crimeDelta = ((region.crimeRate - window.NATIONAL_CRIME_RATE) / window.NATIONAL_CRIME_RATE) * 100;
    var crimeDifference = Math.abs(crimeDelta).toFixed(1) + "%";
    var crimeDirection = crimeDelta > 0 ? "전국 평균보다" : crimeDelta < 0 ? "전국 평균보다" : "전국 평균과";
    var crimeComparison = crimeDelta > 0 ? "높음" : crimeDelta < 0 ? "낮음" : "같음";
    els.detail.innerHTML =
      '<div class="detail-cover"><img src="' + imageUrl(region.photo, 850) + '" alt="' + region.alt + '" loading="lazy" />' +
        '<div class="detail-heading"><div><span class="detail-kicker">A CLOSER LOOK AT</span><h3>' + region.name + '</h3><p>' + region.neighborhood + '</p></div>' +
        '<button class="detail-save' + (saved ? ' saved' : '') + '" type="button" aria-pressed="' + saved + '">' + (saved ? '♥ 저장됨' : '♡ 저장하기') + '</button></div></div>' +
      '<div class="detail-body"><div class="detail-intro"><p>' + region.description + '</p><span class="detail-badge">' + region.area + '</span></div>' +
        renderLocalAreas(region) +
        '<div class="detail-section-title">이 지역의 날씨 <span>기후 평년 특성</span></div>' +
        '<div class="weather-strip"><div class="weather-symbol" aria-hidden="true">' + region.icon + '</div><div class="weather-main"><strong>' + region.temperature + '</strong><span>사계절 기후 특성</span></div><div class="weather-stat"><strong>' + region.rainfall + '</strong><span>지역별 편차 있음</span></div></div>' +
        '<div class="detail-section-title">주거 형태별 평균 집값 <span>참고용 추정치</span></div>' +
        '<div class="price-grid"><div class="price-item"><span>아파트 · 84㎡</span><strong>' + region.apartment + '</strong><em>매매가 예시</em></div><div class="price-item"><span>단독주택 · 60㎡</span><strong>' + region.house + '</strong><em>매매가 예시</em></div><div class="price-item"><span>빌라 · 60㎡</span><strong>' + region.villa + '</strong><em>매매가 예시</em></div></div>' +
        '<div class="detail-section-title">범죄 발생 통계 <span>2024년 · 건/인구 10만 명</span></div>' +
        '<div class="crime-panel"><div class="crime-numbers"><div><strong>' + region.crimeRate.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '</strong><span>이 지역</span></div><div class="crime-average"><strong>' + window.NATIONAL_CRIME_RATE.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '</strong><span>전국 평균</span></div><div class="crime-delta ' + (crimeDelta > 0 ? "above" : crimeDelta < 0 ? "below" : "") + '"><strong>' + crimeDifference + '</strong><span>' + crimeDirection + ' ' + crimeComparison + '</span></div></div><div class="crime-track" aria-label="전국 평균 대비 범죄 발생 건수"><span style="width:' + Math.min(100, (region.crimeRate / 5000) * 100) + '%"></span><i style="left:' + Math.min(100, (window.NATIONAL_CRIME_RATE / 5000) * 100) + '%"></i></div><div class="crime-scale"><span>0건</span><span>전국 평균 표시</span><span>5,000건</span></div></div>' +
        '<div class="detail-section-title">동네 생활 정보</div><div class="detail-facts">' +
          '<div class="fact"><span>지역 경기</span><strong>' + region.economy + '</strong></div><div class="fact"><span>생활물가 지수</span><strong>전국 평균 100 대비 ' + region.costIndex + '</strong></div>' +
          '<div class="fact"><span>지역 특산품</span><strong>' + region.specialty + '</strong></div><div class="fact"><span>1인 월 생활비</span><strong>' + region.monthlyCost + ' · 주거비 제외</strong></div>' +
          '<div class="fact"><span>자주 살펴볼 자연재해</span><strong>' + region.disasters + '</strong></div><div class="fact"><span>위치</span><strong>' + region.location + '</strong></div>' +
        '</div>' + renderMap(region) +
        '<a class="map-link" href="https://map.naver.com/p/search/' + encodeURIComponent(region.mapQuery) + '" target="_blank" rel="noreferrer"><span>지도에서 ' + region.name + ' 위치 확인</span><b aria-hidden="true">↗</b></a>' +
        '<p class="detail-source">범죄율 출처: 검찰청 「범죄분석통계」와 국가데이터처 「장래인구추계」(2022년 기준 인구, 2024년 범죄 발생). 인구 대비 발생 건수로, 관광객·유동인구와 개인의 피해 가능성을 반영한 안전도는 아닙니다. 집값·물가는 참고용 예시 추정치입니다. <a href="https://kosis.kr/search/search.do?query=%EC%8B%9C%EB%8F%84%EB%B3%84%20%EB%B2%94%EC%A3%84%EC%9C%A8" target="_blank" rel="noreferrer">공식 통계 보기 ↗</a></p></div>';
    els.detail.querySelector(".detail-save").addEventListener("click", function () { toggleFavorite(region.id); });
  }

  function render() {
    var results = getVisibleRegions();
    els.grid.innerHTML = "";
    results.forEach(function (region) { els.grid.appendChild(makeCard(region)); });
    els.total.textContent = window.REGIONS.length;
    els.count.textContent = results.length + "개 지역";
    els.empty.hidden = results.length !== 0;
    els.grid.hidden = results.length === 0;
    els.title.textContent = state.favoritesOnly ? "저장한 동네" : state.query || state.filter !== "all" ? "찾아본 지역" : "지금 눈여겨볼 동네";
    els.favoritesNav.classList.toggle("active", state.favoritesOnly);
    els.favoritesNav.setAttribute("aria-pressed", state.favoritesOnly ? "true" : "false");

    var selected = results.find(function (region) { return region.id === state.selected; }) || results[0];
    if (selected) {
      state.selected = selected.id;
      renderDetail(selected);
    } else if (state.favoritesOnly) {
      renderDetail(null);
    } else {
      els.detail.innerHTML = '<div class="detail-empty"><span>⌕</span><strong>검색 결과가 없어요.</strong><p>다른 지역이나 생활환경으로 검색해 보세요.</p></div>';
    }
  }

  function selectRegion(id) {
    state.selected = id;
    render();
    if (window.matchMedia("(max-width: 680px)").matches) {
      els.detail.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function toggleFavorite(id) {
    var index = state.favorites.indexOf(id);
    if (index === -1) state.favorites.push(id);
    else state.favorites.splice(index, 1);
    saveFavorites();
    render();
  }

  function setFilter(filter, button) {
    state.filter = filter;
    state.favoritesOnly = false;
    els.filters.querySelectorAll(".filter-chip").forEach(function (chip) {
      var active = chip === button;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });
    render();
  }

  function init() {
    initTheme();
    saveFavorites();
    els.filters.querySelectorAll(".filter-chip").forEach(function (chip) {
      chip.setAttribute("aria-pressed", chip.classList.contains("active") ? "true" : "false");
    });
    els.form.addEventListener("submit", function (event) {
      event.preventDefault();
      state.query = els.search.value.trim();
      state.favoritesOnly = false;
      render();
      document.getElementById("regions").scrollIntoView({ behavior: "smooth" });
    });
    els.search.addEventListener("input", function () {
      state.query = els.search.value.trim();
      state.favoritesOnly = false;
      render();
    });
    document.querySelectorAll(".popular-searches button").forEach(function (button) {
      button.addEventListener("click", function () {
        els.search.value = button.dataset.query;
        state.query = els.search.value;
        state.favoritesOnly = false;
        render();
        document.getElementById("regions").scrollIntoView({ behavior: "smooth" });
      });
    });
    els.filters.addEventListener("click", function (event) {
      var button = event.target.closest(".filter-chip");
      if (button) setFilter(button.dataset.filter, button);
    });
    els.sort.addEventListener("change", function () {
      state.sort = els.sort.value;
      render();
    });
    els.favoritesNav.addEventListener("click", function () {
      state.favoritesOnly = !state.favoritesOnly;
      state.query = "";
      els.search.value = "";
      state.filter = "all";
      els.filters.querySelectorAll(".filter-chip").forEach(function (chip) {
        var active = chip.dataset.filter === "all";
        chip.classList.toggle("active", active);
        chip.setAttribute("aria-pressed", active ? "true" : "false");
      });
      render();
      document.getElementById("regions").scrollIntoView({ behavior: "smooth" });
    });
    els.reset.addEventListener("click", function () {
      state.query = "";
      state.filter = "all";
      state.favoritesOnly = false;
      els.search.value = "";
      var all = els.filters.querySelector('[data-filter="all"]');
      setFilter("all", all);
    });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
