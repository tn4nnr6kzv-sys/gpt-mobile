/* ==========================================================================
   Golf Tracker Mobile — app.js
   Stockage 100% local (localStorage) — aucune donnée ne quitte le téléphone
   avant export manuel. Le JSON exporté est directement compatible avec
   l'import « /import/mobile » de l'appli desktop.
   ========================================================================== */
(function () {
  "use strict";

  var APP_BUILD = "2026-07-03";

  var LS_COURSES = "gtm_courses_v1";
  var LS_ROUNDS = "gtm_rounds_v1";

  var TEE_CLUBS = [
    "Driver", "Bois 3", "Bois 5", "Bois 7", "Hybride",
    "Fer 3", "Fer 4", "Fer 5", "Fer 6", "Fer 7", "Fer 8", "Fer 9",
    "Pitching", "Wedge",
  ];

  // ------------------------------------------------------------------
  // Stockage
  // ------------------------------------------------------------------
  function loadCourses() {
    try { return JSON.parse(localStorage.getItem(LS_COURSES)) || {}; }
    catch (e) { return {}; }
  }
  function saveCourses(c) { localStorage.setItem(LS_COURSES, JSON.stringify(c)); }

  function loadRounds() {
    try { return JSON.parse(localStorage.getItem(LS_ROUNDS)) || []; }
    catch (e) { return []; }
  }
  function saveRounds(r) { localStorage.setItem(LS_ROUNDS, JSON.stringify(r)); }

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  var screens = ["home", "courses", "course-form", "round-setup", "hole", "finish", "export"];

  // Critères de sensations notés en fin de carte (ordre = ordre d'affichage).
  // Chaque critère est noté : "pos" (positif), "neu" (neutre), "neg" (négatif) ou null (non noté).
  var FEELING_CRITERIA = [
    { key: "tee_shots", label: "Tee shots / mises en jeu" },
    { key: "drives_consistency", label: "Constance / qualité des drives" },
    { key: "woods", label: "Jeu de bois de parcours (3w, 5w…)" },
    { key: "long_irons", label: "Jeu de fers longs (3i à 6i)" },
    { key: "irons", label: "Jeu de fers (7i à PW)" },
    { key: "wedges", label: "Jeu à moins de 100 m & wedges" },
    { key: "around_green", label: "Autour du green" },
    { key: "long_putts", label: "Ficelles & putts longs (>2 m)" },
    { key: "short_putts", label: "Putts courts (<2 m)" },
    { key: "overall", label: "Sensation générale" },
  ];
  var history = [];

  function showScreen(name, opts) {
    opts = opts || {};
    // Quitter l'écran d'un trou coupe le suivi GPS live (batterie).
    if (name !== "hole" && typeof stopLiveDistance === "function") stopLiveDistance();
    screens.forEach(function (s) {
      document.getElementById("screen-" + s).classList.toggle("active", s === name);
    });
    document.getElementById("btn-back").style.visibility = name === "home" ? "hidden" : "visible";
    if (!opts.skipHistory) history.push(name);
    window.scrollTo(0, 0);
  }

  document.getElementById("btn-back").addEventListener("click", function () {
    history.pop(); // écran courant
    var prev = history.pop() || "home";
    showScreen(prev);
  });

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._tm);
    toast._tm = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  // ------------------------------------------------------------------
  // ACCUEIL
  // ------------------------------------------------------------------
  function statusLabel(s) {
    return { draft: "en cours", ready: "prête", exported: "exportée" }[s] || s;
  }

  function renderHome() {
    var rounds = loadRounds().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    var groups = { draft: [], ready: [], exported: [] };
    rounds.forEach(function (r) { (groups[r.status] || groups.draft).push(r); });

    function renderList(el, list, emptyIcon, emptyText) {
      if (!list.length) {
        el.innerHTML = '<div class="empty"><span class="flag">' + emptyIcon + '</span>' + emptyText + '</div>';
        return;
      }
      el.innerHTML = "";
      list.forEach(function (r) {
        var played = r.holes.filter(function (h) { return h.strokes != null; }).length;
        var strokes = r.holes.reduce(function (s, h) { return s + (h.strokes || 0); }, 0);
        var div = document.createElement("div");
        div.className = "list-item";
        div.innerHTML =
          '<div class="li-main">' +
            '<div class="li-title">' + escapeHtml(r.course_name || "Parcours") + '</div>' +
            '<div class="li-sub">' + r.date + ' · ' + played + '/' + r.holes.length + ' trous' +
              (strokes ? ' · ' + strokes + ' coups' : '') + '</div>' +
          '</div>' +
          '<button type="button" class="li-del" data-id="' + r.id + '" title="Supprimer">🗑</button>' +
          '<span class="li-chev">›</span>';
        div.querySelector(".li-main").addEventListener("click", function () { openRound(r.id); });
        div.querySelector(".li-chev").addEventListener("click", function () { openRound(r.id); });
        div.querySelector(".li-del").addEventListener("click", function (e) {
          e.stopPropagation();
          if (!window.confirm("Supprimer définitivement cette carte (" + (r.course_name || "Parcours") +
              ", " + r.date + ") ? Cette action est irréversible.")) return;
          var all = loadRounds().filter(function (x) { return x.id !== r.id; });
          saveRounds(all);
          renderHome();
        });
        el.appendChild(div);
      });
    }
    renderList(document.getElementById("list-draft"), groups.draft, "⛳", "Aucune carte en cours.");
    renderList(document.getElementById("list-ready"), groups.ready, "📤", "Aucune carte terminée.");
    renderList(document.getElementById("list-exported"), groups.exported, "✅", "—");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var LS_SERVER = "gtm_server_address_v1";

  function loadServerAddress() { return localStorage.getItem(LS_SERVER) || ""; }
  function saveServerAddress(v) { localStorage.setItem(LS_SERVER, v); }

  function serverBaseUrl() {
    var raw = document.getElementById("server-address").value.trim();
    saveServerAddress(raw);
    if (!raw) return null;
    // Accepte "192.168.1.20:5000" comme "https://192.168.1.20:5000" ou une URL déjà complète.
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
    return raw.replace(/\/+$/, "");
  }

  document.getElementById("btn-manage-courses").addEventListener("click", function () {
    document.getElementById("server-address").value = loadServerAddress();
    renderCoursesList(); showScreen("courses");
  });
  document.getElementById("btn-new-round").addEventListener("click", function () {
    openRoundSetup(); showScreen("round-setup");
  });
  document.getElementById("btn-export").addEventListener("click", exportRounds);

  // ------------------------------------------------------------------
  // PARCOURS — liste & formulaire
  // ------------------------------------------------------------------
  function renderCoursesList() {
    var courses = loadCourses();
    var names = Object.keys(courses).sort(function (a, b) { return a.localeCompare(b); });
    var el = document.getElementById("list-courses");
    if (!names.length) {
      el.innerHTML = '<div class="empty"><span class="flag">⛳</span>Aucun parcours enregistré.</div>';
      return;
    }
    el.innerHTML = "";
    names.forEach(function (name) {
      var c = courses[name];
      var div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML =
        '<div class="li-main"><div class="li-title">' + escapeHtml(name) + '</div>' +
        '<div class="li-sub">' + c.num_holes + ' trous · par ' + c.holes.reduce(function (s, h) { return s + h.par; }, 0) + '</div></div>' +
        '<span class="li-chev">›</span>';
      div.addEventListener("click", function () { openCourseForm(name); showScreen("course-form"); });
      el.appendChild(div);
    });
  }

  var editingCourseName = null;

  function buildParGrid(numHoles, existingHoles) {
    // Filet de sécurité : si numHoles est manquant/invalide (ex. donnée synchronisée mal
    // formée), on retombe sur 18 plutôt que de générer une grille vide.
    numHoles = (numHoles === 9 || numHoles === 18) ? numHoles : 18;
    var wrap = document.getElementById("cf-holes");
    wrap.innerHTML = "";
    for (var i = 1; i <= numHoles; i++) {
      var existing = (existingHoles || []).find(function (h) { return h.hole_number === i; });
      var par = existing ? existing.par : 4;
      var note = existing && existing.note ? existing.note : "";
      var row = document.createElement("div");
      row.className = "par-grid-row";
      row.style.flexWrap = "wrap";
      row.innerHTML =
        '<span class="hn">' + i + '</span>' +
        '<div class="seg" data-hole="' + i + '">' +
          [3, 4, 5].map(function (p) {
            return '<button data-v="' + p + '" class="' + (p === par ? "active" : "") + '">' + p + '</button>';
          }).join("") +
        '</div>' +
        '<input type="text" class="hole-note-input" placeholder="Note de stratégie (facultatif)" ' +
          'value="' + escapeHtml(note) + '" style="flex:1 1 100%;margin-top:6px;font-size:14px;' +
          'padding:8px 10px;border-radius:8px;border:1px solid var(--line-strong)">';
      wrap.appendChild(row);
      row.querySelectorAll(".seg button").forEach(function (btn) {
        btn.addEventListener("click", function () {
          // Important : on retrouve la ligne du bouton cliqué via closest(), plutôt que de
          // s'appuyer sur la variable "row" de la boucle englobante — capturée dans ce closure,
          // elle pointerait toujours vers le DERNIER trou construit (piège classique de portée
          // "var" dans une boucle), pas vers le trou réellement cliqué.
          var ownRow = btn.closest(".par-grid-row");
          ownRow.querySelectorAll(".seg button").forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
        });
      });
    }
  }

  function mergeServerCourses(serverCourses) {
    var courses = loadCourses();
    var n = 0;
    (serverCourses || []).forEach(function (c) {
      if (!c.name || !c.holes || !c.holes.length) return;
      courses[c.name] = {
        num_holes: (c.num_holes === 9 || c.num_holes === 18) ? c.num_holes : (c.holes.length <= 9 ? 9 : 18),
        holes: c.holes.map(function (h) {
          return { hole_number: h.hole_number, par: h.par, note: h.note || "",
                   stroke_index: (h.stroke_index != null ? h.stroke_index : null),
                   yardage: (h.yardage != null ? h.yardage : null) };
        }),
      };
      n++;
    });
    saveCourses(courses);
    renderCoursesList();
    return n;
  }

  document.getElementById("btn-sync-courses").addEventListener("click", function () {
    var statusEl = document.getElementById("sync-status");
    var base = serverBaseUrl();
    if (!base) { statusEl.textContent = "Renseigne l'adresse du PC ci-dessus d'abord."; return; }
    statusEl.textContent = "Synchronisation…";
    fetch(base + "/api/courses.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (serverCourses) {
      var n = mergeServerCourses(serverCourses);
      statusEl.textContent = n + " parcours synchronisé(s) (par + notes de stratégie).";
    }).catch(function () {
      statusEl.textContent = "Synchronisation réseau impossible — vérifie l'adresse, que tu es sur " +
        "le même Wi-Fi, et que le PC a un certificat HTTPS valide. Sinon, utilise « Importer un " +
        "fichier JSON » ci-dessous (toujours fiable, aucun réseau requis).";
    });
  });

  document.getElementById("btn-import-courses-file").addEventListener("click", function () {
    document.getElementById("courses-file-input").click();
  });

  document.getElementById("courses-file-input").addEventListener("change", function (e) {
    var file = e.target.files[0];
    var statusEl = document.getElementById("sync-status");
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var serverCourses = JSON.parse(reader.result);
        var n = mergeServerCourses(serverCourses);
        statusEl.textContent = n + " parcours importé(s) depuis le fichier (par + notes de stratégie).";
      } catch (err) {
        statusEl.textContent = "Fichier illisible — vérifie qu'il s'agit bien du JSON exporté depuis Réglages sur le PC.";
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  function openCourseForm(name) {
    editingCourseName = name || null;
    var courses = loadCourses();
    var c = name ? courses[name] : null;
    document.getElementById("course-form-title").textContent = name ? "Modifier le parcours" : "Nouveau parcours";
    document.getElementById("cf-name").value = name || "";
    var numHoles = (c && (c.num_holes === 9 || c.num_holes === 18)) ? c.num_holes : 18;
    document.querySelectorAll("#cf-numholes button").forEach(function (b) {
      b.classList.toggle("active", parseInt(b.dataset.v, 10) === numHoles);
    });
    buildParGrid(numHoles, c ? c.holes : null);
  }

  document.getElementById("btn-new-course").addEventListener("click", function () {
    openCourseForm(null); showScreen("course-form");
  });

  document.querySelectorAll("#cf-numholes button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("#cf-numholes button").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      buildParGrid(parseInt(btn.dataset.v, 10), null);
    });
  });

  document.getElementById("btn-save-course").addEventListener("click", function () {
    var name = document.getElementById("cf-name").value.trim();
    if (!name) { toast("Donne un nom au parcours."); return; }
    var numHoles = parseInt(document.querySelector("#cf-numholes button.active").dataset.v, 10);
    var holes = [];
    document.querySelectorAll("#cf-holes .par-grid-row").forEach(function (row, idx) {
      var activeBtn = row.querySelector(".seg button.active");
      var noteInput = row.querySelector(".hole-note-input");
      holes.push({ hole_number: idx + 1, par: parseInt(activeBtn.dataset.v, 10),
                  note: noteInput ? noteInput.value.trim() : "" });
    });
    var courses = loadCourses();
    if (editingCourseName && editingCourseName !== name) delete courses[editingCourseName];
    courses[name] = { num_holes: numHoles, holes: holes };
    saveCourses(courses);
    toast("Parcours enregistré.");
    renderCoursesList();
    showScreen("courses", { skipHistory: true });
    history.pop();
  });

  // ------------------------------------------------------------------
  // NOUVELLE CARTE — setup
  // ------------------------------------------------------------------
  function segBind(containerId) {
    var el = document.getElementById(containerId);
    el.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        el.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
      });
    });
  }
  ["rs-segment", "rs-tees", "rs-type"].forEach(segBind);

  function segValue(containerId) {
    return document.querySelector("#" + containerId + " button.active").dataset.v;
  }

  function openRoundSetup() {
    var courses = loadCourses();
    var names = Object.keys(courses).sort(function (a, b) { return a.localeCompare(b); });
    var sel = document.getElementById("rs-course");
    sel.innerHTML = "";
    if (!names.length) {
      sel.innerHTML = '<option value="">— Aucun parcours, crée-en un d\'abord —</option>';
    } else {
      names.forEach(function (n) {
        var opt = document.createElement("option");
        opt.value = n; opt.textContent = n; sel.appendChild(opt);
      });
    }
    document.getElementById("rs-date").value = todayISO();
    document.getElementById("rs-compname").value = "";
    document.getElementById("rs-weather").value = "";
    document.getElementById("rs-temp").value = "";
    document.getElementById("rs-wind").value = "";
    document.getElementById("weather-detect-status").textContent = "";
    document.getElementById("rs-notes").value = "";
    document.getElementById("rs-official").checked = false;
    document.getElementById("rs-format").value = "medal";
  }

  // ------------------------------------------------------------------
  // Météo auto (GPS -> Open-Meteo, gratuit, sans clé)
  // ------------------------------------------------------------------
  var WMO_LABELS = {
    0: "Ensoleillé", 1: "Peu nuageux", 2: "Partiellement nuageux", 3: "Couvert",
    45: "Brouillard", 48: "Brouillard givrant",
    51: "Bruine légère", 53: "Bruine", 55: "Bruine forte",
    56: "Bruine verglaçante", 57: "Bruine verglaçante forte",
    61: "Pluie légère", 63: "Pluie", 65: "Pluie forte",
    66: "Pluie verglaçante", 67: "Pluie verglaçante forte",
    71: "Neige légère", 73: "Neige", 75: "Neige forte", 77: "Neige en grains",
    80: "Averses légères", 81: "Averses", 82: "Averses violentes",
    85: "Averses de neige", 86: "Averses de neige fortes",
    95: "Orage", 96: "Orage avec grêle", 99: "Orage avec grêle forte",
  };

  function windCategory(kmh) {
    if (kmh == null) return "";
    if (kmh < 10) return "calme";
    if (kmh < 20) return "leger";
    if (kmh < 35) return "modere";
    return "fort";
  }

  function fetchWeather(lat, lon, cb) {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
      "&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto";
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (data) {
      var cur = data.current || {};
      cb(null, {
        weather: WMO_LABELS[cur.weather_code] || "",
        temperature: (cur.temperature_2m != null) ? Math.round(cur.temperature_2m) + "°C" : "",
        wind: windCategory(cur.wind_speed_10m),
      });
    }).catch(function (err) { cb(err); });
  }

  document.getElementById("btn-detect-weather").addEventListener("click", function () {
    var statusEl = document.getElementById("weather-detect-status");
    statusEl.textContent = "Localisation…";
    captureGPS(function (pos) {
      statusEl.textContent = "Récupération de la météo…";
      fetchWeather(pos.lat, pos.lon, function (err, w) {
        if (err) {
          statusEl.textContent = "Météo indisponible (pas de connexion ?) — renseigne-la manuellement.";
          return;
        }
        if (w.weather) document.getElementById("rs-weather").value = w.weather;
        if (w.temperature) document.getElementById("rs-temp").value = w.temperature;
        if (w.wind) document.getElementById("rs-wind").value = w.wind;
        statusEl.textContent = "Météo détectée — corrige si besoin.";
      });
    });
  });

  document.getElementById("btn-start-round").addEventListener("click", function () {
    var courseName = document.getElementById("rs-course").value;
    if (!courseName) { toast("Choisis (ou crée) un parcours d'abord."); return; }
    var courses = loadCourses();
    var course = courses[courseName];
    var segment = segValue("rs-segment");
    var holeNumbers;
    if (segment === "front") holeNumbers = course.holes.filter(function (h) { return h.hole_number <= 9; });
    else if (segment === "back") holeNumbers = course.holes.filter(function (h) { return h.hole_number > 9; });
    else holeNumbers = course.holes.slice();

    var holes = holeNumbers.map(function (h) {
      return {
        hole_number: h.hole_number, par: h.par, strokes: h.par, putts: 2,
        stroke_index: (h.stroke_index != null ? h.stroke_index : null),
        yardage: (h.yardage != null ? h.yardage : null),
        fairway: null, gir: null, first_putt_ft: null,
        up_down_attempt: 0, up_down_success: 0, sand_attempt: 0, sand_success: 0,
        penalties: 0, tee_shot_distance: null, tee_shot_club: null, shots_json: null,
        pin: null, gps_shots: [], green_mark: null, tee_mark: null, strategy_note: h.note || "",
      };
    });

    var round = {
      id: uid("r"), status: "draft",
      started_at: new Date().toISOString(),
      finished_at: null,
      balls_lost: null,
      feelings: null,
      end_notes: null,
      course_name: courseName, date: document.getElementById("rs-date").value || todayISO(),
      tees: segValue("rs-tees"), segment: segment,
      round_type: segValue("rs-type"),
      competition_name: document.getElementById("rs-compname").value.trim() || null,
      format: document.getElementById("rs-format").value,
      official: document.getElementById("rs-official").checked ? 1 : 0,
      stableford_points: null, result_note: null,
      weather: document.getElementById("rs-weather").value.trim(),
      temperature: document.getElementById("rs-temp").value.trim(),
      wind: document.getElementById("rs-wind").value || null,
      notes: document.getElementById("rs-notes").value.trim(),
      holes: holes,
      current_index: 0,
    };
    var rounds = loadRounds();
    rounds.push(round);
    saveRounds(rounds);
    openRound(round.id);
  });

  // ------------------------------------------------------------------
  // SAISIE TROU PAR TROU
  // ------------------------------------------------------------------
  var currentRoundId = null;

  function getRound(id) {
    return loadRounds().find(function (r) { return r.id === id; });
  }
  function updateRound(id, fn) {
    var rounds = loadRounds();
    var idx = rounds.findIndex(function (r) { return r.id === id; });
    if (idx === -1) return;
    fn(rounds[idx]);
    saveRounds(rounds);
  }

  function openRound(id) {
    currentRoundId = id;
    var r = getRound(id);
    if (!r) return;
    populateClubSelect();
    renderProgress();
    loadHole(r.current_index || 0);
    showScreen("hole");
  }

  function populateClubSelect() {
    [document.getElementById("h-club"), document.getElementById("gps-club")].forEach(function (sel) {
      if (!sel || sel.options.length > 1) return;
      TEE_CLUBS.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c; opt.textContent = c; sel.appendChild(opt);
      });
    });
  }

  // ------------------------------------------------------------------
  // GPS — drapeau + log des coups
  // ------------------------------------------------------------------
  var LIE_LABELS = {
    tee: "Départ", fairway: "Fairway", rough: "Rough", sand: "Bunker", recovery: "Recovery",
    fringe: "Fringe", green: "Green (repère)",
  };
  var M_PER_YD = 0.9144;

  function haversineMeters(a, b) {
    var R = 6371000;
    var toRad = function (d) { return (d * Math.PI) / 180; };
    var dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    var la1 = toRad(a.lat), la2 = toRad(b.lat);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function captureGPS(cb) {
    if (!navigator.geolocation) { toast("GPS non disponible sur cet appareil."); return; }
    toast("Localisation en cours…");
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        cb({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) });
      },
      function (err) {
        toast("Position indisponible — vérifie que la localisation est autorisée pour cette app.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  // --- Distance live depuis le dernier point marqué -----------------------
  // Un watchPosition tourne tant qu'on est sur l'écran d'un trou ET que la section GPS est
  // ouverte. Il affiche en continu la distance depuis le dernier repère posé (dernier coup
  // marqué, ou à défaut le départ). Arrêté dès qu'on quitte l'écran, pour préserver la batterie.
  var _liveWatchId = null;
  var _lastLivePos = null;

  function _liveReference() {
    var r = loadRounds().find(function (x) { return x.id === currentRoundId; });
    if (!r) return null;
    var h = r.holes[r.current_index || 0];
    if (h.gps_shots && h.gps_shots.length) return h.gps_shots[h.gps_shots.length - 1];
    if (h.tee_mark) return h.tee_mark;
    return null;
  }

  function _renderLiveDist() {
    var box = document.getElementById("gps-live-dist");
    var valEl = document.getElementById("gps-live-val");
    var labEl = document.getElementById("gps-live-lab");
    if (!box || !valEl) return;
    var ref = _liveReference();
    if (!ref || !_lastLivePos) {
      box.style.display = "none";
      return;
    }
    var d = Math.round(haversineMeters(_lastLivePos, ref));
    valEl.textContent = d + " m";
    var r = loadRounds().find(function (x) { return x.id === currentRoundId; });
    var h = r ? r.holes[r.current_index || 0] : null;
    var fromTee = h && (!h.gps_shots || !h.gps_shots.length) && h.tee_mark;
    labEl.textContent = fromTee ? "depuis le départ" : "depuis le dernier coup";
    box.style.display = "";
  }

  function startLiveDistance() {
    if (_liveWatchId != null || !navigator.geolocation) return;
    // n'active le suivi que si la section GPS est ouverte (le <details>)
    var det = document.getElementById("gps-details");
    if (det && !det.open) return;
    _liveWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        _lastLivePos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        _renderLiveDist();
      },
      function () { /* silencieux : le bouton Marquer reste utilisable */ },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 2000 }
    );
  }

  function stopLiveDistance() {
    if (_liveWatchId != null) {
      navigator.geolocation.clearWatch(_liveWatchId);
      _liveWatchId = null;
    }
    _lastLivePos = null;
    var box = document.getElementById("gps-live-dist");
    if (box) box.style.display = "none";
  }

  function renderGpsSection() {
    var r = getRound(currentRoundId);
    var h = r.holes[r.current_index || 0];
    var pinLabel = document.getElementById("gps-pin-label");
    var pinSub = document.getElementById("gps-pin-sub");
    if (h.pin) {
      pinLabel.textContent = "🚩 Drapeau marqué";
      pinSub.textContent = "précision ±" + h.pin.acc + " m — tape à nouveau pour le remplacer";
    } else {
      pinLabel.textContent = "Drapeau non marqué";
      pinSub.textContent = (h.gps_shots || []).length
        ? "Les distances s'afficheront dès que le drapeau sera marqué."
        : "Marque-le une fois arrivé sur le green.";
    }

    var greenLabel = document.getElementById("gps-green-label");
    var greenSub = document.getElementById("gps-green-sub");
    if (h.green_mark) {
      greenLabel.innerHTML = '<span class="golf-ball-icon"></span> Position sur le green marquée';
      greenSub.textContent = "précision ±" + h.green_mark.acc + " m — tape à nouveau pour le remplacer";
    } else {
      greenLabel.textContent = "Position sur le green non marquée";
      greenSub.textContent = "Marque où se trouve ta balle une fois sur le green — sert de repère pour préciser le coup précédent, pas un vrai coup joué.";
    }

    var list = document.getElementById("gps-shots-list");
    list.innerHTML = "";
    (h.gps_shots || []).forEach(function (s, i) {
      var row = document.createElement("div");
      row.className = "gps-shot-row";
      var distTxt, overridden = s.dist_override_m != null;
      if (overridden) {
        distTxt = Math.round(s.dist_override_m) + " m restants";
      } else if (h.pin) {
        distTxt = Math.round(haversineMeters(s, h.pin)) + " m restants";
      } else {
        distTxt = "en attente du drapeau";
      }
      var accWarn = (!overridden && s.acc > 25) ? '<span class="gps-acc-warn"> · ±' + s.acc + 'm</span>' : "";
      var corrTag = overridden ? " · corrigée ✏️" : "";
      row.innerHTML =
        '<span class="gps-shot-num">' + (i + 1) + '</span>' +
        '<div class="gps-shot-main"><span class="gs-lie">' + (LIE_LABELS[s.lie] || s.lie) +
          (s.club ? " · " + escapeHtml(s.club) : "") + '</span><br>' +
          '<span class="gs-dist' + (overridden ? ' overridden' : '') + '">' + distTxt + accWarn + corrTag + '</span></div>' +
        '<button type="button" class="gps-shot-edit" data-i="' + i + '" title="Corriger la distance">✏️</button>' +
        '<button type="button" class="gps-shot-del" data-i="' + i + '">🗑</button>';
      list.appendChild(row);
    });
    list.querySelectorAll(".gps-shot-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = parseInt(btn.dataset.i, 10);
        var rr0 = getRound(currentRoundId);
        var h0 = rr0.holes[rr0.current_index || 0];
        var s0 = h0.gps_shots[i];
        var current = s0.dist_override_m != null ? s0.dist_override_m
          : (h0.pin ? Math.round(haversineMeters(s0, h0.pin)) : "");
        var input = window.prompt(
          "Distance restante au trou pour ce coup (en mètres).\nLaisse vide pour revenir au calcul GPS automatique.",
          current
        );
        if (input === null) return; // annulé
        input = input.trim();
        updateRound(currentRoundId, function (rr) {
          var h2 = rr.holes[rr.current_index || 0];
          if (input === "") {
            delete h2.gps_shots[i].dist_override_m;
          } else {
            var v = parseFloat(input.replace(",", "."));
            if (!isNaN(v) && v >= 0) h2.gps_shots[i].dist_override_m = v;
          }
        });
        renderGpsSection();
      });
    });
    list.querySelectorAll(".gps-shot-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = parseInt(btn.dataset.i, 10);
        updateRound(currentRoundId, function (rr) {
          rr.holes[rr.current_index || 0].gps_shots.splice(i, 1);
        });
        renderGpsSection();
      });
    });
  }

  document.getElementById("btn-mark-tee").addEventListener("click", function () {
    captureGPS(function (pos) {
      updateRound(currentRoundId, function (rr) {
        rr.holes[rr.current_index || 0].tee_mark = pos;
      });
      toast("Départ marqué (±" + pos.acc + " m).");
      renderTeeMark();
    });
  });

  document.getElementById("btn-mark-pin").addEventListener("click", function () {
    captureGPS(function (pos) {
      updateRound(currentRoundId, function (rr) {
        rr.holes[rr.current_index || 0].pin = pos;
      });
      toast("Drapeau marqué (±" + pos.acc + " m).");
      renderGpsSection();
      renderTeeMark();
    });
  });

  document.getElementById("btn-mark-green").addEventListener("click", function () {
    captureGPS(function (pos) {
      updateRound(currentRoundId, function (rr) {
        rr.holes[rr.current_index || 0].green_mark = pos;
      });
      toast("Position sur le green marquée (±" + pos.acc + " m).");
      renderGpsSection();
    });
  });

  document.getElementById("btn-mark-shot").addEventListener("click", function () {
    var lie = document.getElementById("gps-lie").value;
    var club = document.getElementById("gps-club").value || null;
    captureGPS(function (pos) {
      pos.lie = lie; pos.club = club;
      updateRound(currentRoundId, function (rr) {
        var h = rr.holes[rr.current_index || 0];
        h.gps_shots = h.gps_shots || [];
        h.gps_shots.push(pos);
      });
      toast("Coup marqué (±" + pos.acc + " m).");
      renderGpsSection();
      _renderLiveDist();
    });
  });

  // Suivi live piloté par l'ouverture/fermeture de la section détails/GPS
  (function () {
    var det = document.getElementById("gps-details");
    if (det) {
      det.addEventListener("toggle", function () {
        if (det.open) startLiveDistance();
        else stopLiveDistance();
      });
    }
  })();


  function renderProgress() {
    var r = getRound(currentRoundId);
    var wrap = document.getElementById("hole-progress");
    wrap.innerHTML = "";
    r.holes.forEach(function (h, i) {
      var dot = document.createElement("div");
      dot.className = "hp-dot" + (i === r.current_index ? " current" : (h._touched ? " done" : ""));
      dot.textContent = h.hole_number;
      dot.addEventListener("click", function () { saveCurrentHole(); r.current_index = i; updateRound(r.id, function (rr) { rr.current_index = i; }); loadHole(i); renderProgress(); });
      wrap.appendChild(dot);
    });
  }

  var optGroups = {
    fairway: ["opt-fairway", "fairway"],
    gir: ["opt-gir", "gir"],
    updown: ["opt-updown", null],
    sand: ["opt-sand", null],
  };

  function bindOptRow(elId) {
    document.getElementById(elId).querySelectorAll(".opt-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var siblings = btn.parentElement.querySelectorAll(".opt-btn");
        var isActive = btn.classList.contains("selected");
        siblings.forEach(function (b) {
          b.classList.remove("selected", "active-hit", "active-miss", "active-yes", "active-no", "active-ok", "active-na");
        });
        if (!isActive) {
          btn.classList.add("selected");
          var v = btn.dataset.v;
          if (v === "hit") btn.classList.add("active-hit");
          else if (v === "miss") btn.classList.add("active-miss");
          else if (v === "1") btn.classList.add("active-yes");
          else if (v === "0") btn.classList.add("active-no");
          else if (v === "ok") btn.classList.add("active-ok");
          else if (v === "att") btn.classList.add("active-na");
        }
        saveCurrentHole();
      });
    });
  }
  Object.keys(optGroups).forEach(function (k) { bindOptRow(optGroups[k][0]); });

  function setOptRow(elId, value) {
    var btns = document.getElementById(elId).querySelectorAll(".opt-btn");
    btns.forEach(function (b) {
      b.classList.remove("selected", "active-hit", "active-miss", "active-yes", "active-no", "active-ok", "active-na");
      if (b.dataset.v === String(value)) {
        b.classList.add("selected");
        var v = b.dataset.v;
        if (v === "hit") b.classList.add("active-hit");
        else if (v === "miss") b.classList.add("active-miss");
        else if (v === "1") b.classList.add("active-yes");
        else if (v === "0") b.classList.add("active-no");
        else if (v === "ok") b.classList.add("active-ok");
        else if (v === "att") b.classList.add("active-na");
      }
    });
  }
  function getOptRow(elId) {
    var sel = document.getElementById(elId).querySelector(".opt-btn.selected");
    return sel ? sel.dataset.v : "";
  }

  function bindStepper(elId, min, max) {
    var el = document.getElementById(elId);
    el.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var valEl = el.querySelector(".val");
        var v = parseInt(valEl.textContent, 10) + parseInt(btn.dataset.d, 10);
        if (min != null) v = Math.max(min, v);
        if (max != null) v = Math.min(max, v);
        valEl.textContent = v;
        saveCurrentHole();
      });
    });
  }
  bindStepper("st-score", 1, 15);
  bindStepper("st-putts", 0, 10);
  bindStepper("st-pen", 0, 10);

  ["h-fpd", "h-drivedist", "h-club"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", saveCurrentHole);
  });

  function renderStrategyNote(h) {
    var el = document.getElementById("h-strategy-note");
    if (h.strategy_note) {
      el.style.display = "flex";
      el.innerHTML = '<span class="sn-icon">📌</span><span style="flex:1">' + escapeHtml(h.strategy_note) +
        '</span><button type="button" class="sn-edit" id="btn-edit-strategy-note">modifier</button>';
    } else {
      el.style.display = "flex";
      el.innerHTML = '<span class="sn-icon">📌</span><span style="flex:1;font-style:italic">Aucune note pour ce trou.</span>' +
        '<button type="button" class="sn-edit" id="btn-edit-strategy-note">ajouter</button>';
    }
    document.getElementById("btn-edit-strategy-note").addEventListener("click", function () {
      var current = h.strategy_note || "";
      var input = window.prompt("Note de stratégie pour ce trou :", current);
      if (input === null) return;
      updateRound(currentRoundId, function (rr) {
        rr.holes[rr.current_index || 0].strategy_note = input.trim();
      });
      renderStrategyNote(getRound(currentRoundId).holes[getRound(currentRoundId).current_index || 0]);
    });
  }

  function loadHole(index) {
    var r = getRound(currentRoundId);
    var h = r.holes[index];
    if (h.gps_shots === undefined) h.gps_shots = [];
    if (h.pin === undefined) h.pin = null;
    if (h.green_mark === undefined) h.green_mark = null;
    if (h.tee_mark === undefined) h.tee_mark = null;
    if (h.stroke_index === undefined) h.stroke_index = null;
    if (h.yardage === undefined) h.yardage = null;
    renderStrategyNote(h);
    document.getElementById("h-number").textContent = "Trou " + h.hole_number;
    document.getElementById("h-par").textContent = "Par " + h.par;
    var metaParts = [];
    if (h.stroke_index != null) metaParts.push("SI " + h.stroke_index);
    if (h.yardage != null) metaParts.push(h.yardage + " m");
    document.getElementById("h-meta").textContent = metaParts.join(" · ");
    document.getElementById("v-score").textContent = h.strokes != null ? h.strokes : h.par;
    document.getElementById("v-putts").textContent = h.putts != null ? h.putts : 2;
    document.getElementById("v-pen").textContent = h.penalties || 0;
    document.getElementById("fairway-block").style.display = h.par === 3 ? "none" : "";
    setOptRow("opt-fairway", h.fairway || "");
    setOptRow("opt-gir", h.gir === 1 || h.gir === 0 ? h.gir : "");
    setOptRow("opt-updown", h.up_down_attempt ? (h.up_down_success ? "ok" : "att") : "");
    setOptRow("opt-sand", h.sand_attempt ? (h.sand_success ? "ok" : "att") : "");
    document.getElementById("h-fpd").value = h.first_putt_ft != null ? h.first_putt_ft : "";
    document.getElementById("h-drivedist").value = h.tee_shot_distance != null ? h.tee_shot_distance : "";
    document.getElementById("h-club").value = h.tee_shot_club || "";

    document.getElementById("btn-prev-hole").disabled = index === 0;
    document.getElementById("btn-next-hole").textContent = index === r.holes.length - 1 ? "Terminer la carte" : "Suivant →";
    renderGpsSection();
    renderTeeMark();
    updateTotalsInline();
    // Le trou a changé : on repart d'un état propre pour la distance live. Le <details> est
    // replié par défaut à chaque trou, donc on stoppe le watch ; il redémarrera si l'utilisateur
    // rouvre la section GPS.
    stopLiveDistance();
    var det = document.getElementById("gps-details");
    if (det) det.open = false;
  }

  function renderTeeMark() {
    var r = loadRounds().find(function (x) { return x.id === currentRoundId; });
    if (!r) return;
    var h = r.holes[r.current_index || 0];
    var label = document.getElementById("tee-mark-label");
    var sub = document.getElementById("tee-mark-sub");
    if (!label || !sub) return;
    if (h.tee_mark) {
      label.textContent = "⛳ Départ marqué";
      if (h.pin) {
        // Longueur réelle du trou = distance départ -> drapeau (m)
        var lenM = Math.round(haversineMeters(h.tee_mark, h.pin));
        sub.textContent = "Longueur mesurée : " + lenM + " m (départ → drapeau). Tape à nouveau pour re-marquer.";
      } else {
        sub.textContent = "précision ±" + h.tee_mark.acc + " m — marque aussi le drapeau pour obtenir la longueur du trou.";
      }
    } else {
      label.textContent = "Départ non marqué";
      sub.textContent = "Marque ta position au départ pour mesurer la longueur réelle du trou.";
    }
  }

  function updateTotalsInline() {
    // Rien à afficher pour l'instant en dehors du header ; réservé si besoin futur.
  }

  function saveCurrentHole() {
    var r = getRound(currentRoundId);
    var index = r.current_index || 0;
    updateRound(currentRoundId, function (rr) {
      var h = rr.holes[index];
      h.strokes = parseInt(document.getElementById("v-score").textContent, 10);
      h.putts = parseInt(document.getElementById("v-putts").textContent, 10);
      h.penalties = parseInt(document.getElementById("v-pen").textContent, 10);
      h.fairway = h.par === 3 ? null : (getOptRow("opt-fairway") || null);
      var girVal = getOptRow("opt-gir");
      h.gir = girVal === "" ? null : parseInt(girVal, 10);
      var ud = getOptRow("opt-updown");
      h.up_down_attempt = (ud === "att" || ud === "ok") ? 1 : 0;
      h.up_down_success = ud === "ok" ? 1 : 0;
      var sd = getOptRow("opt-sand");
      h.sand_attempt = (sd === "att" || sd === "ok") ? 1 : 0;
      h.sand_success = sd === "ok" ? 1 : 0;
      var fpd = document.getElementById("h-fpd").value;
      h.first_putt_ft = fpd !== "" ? parseFloat(fpd) : null;
      var dd = document.getElementById("h-drivedist").value;
      h.tee_shot_distance = dd !== "" ? parseFloat(dd) : null;
      h.tee_shot_club = document.getElementById("h-club").value || null;
      h._touched = true;
    });
  }

  document.getElementById("btn-prev-hole").addEventListener("click", function () {
    saveCurrentHole();
    var r = getRound(currentRoundId);
    var idx = Math.max(0, (r.current_index || 0) - 1);
    updateRound(currentRoundId, function (rr) { rr.current_index = idx; });
    loadHole(idx); renderProgress();
  });

  document.getElementById("btn-next-hole").addEventListener("click", function () {
    saveCurrentHole();
    var r = getRound(currentRoundId);
    var idx = r.current_index || 0;
    if (idx === r.holes.length - 1) {
      openFinishScreen();
    } else {
      idx += 1;
      updateRound(currentRoundId, function (rr) { rr.current_index = idx; });
      loadHole(idx); renderProgress();
    }
  });

  // ------------------------------------------------------------------
  // CLÔTURE DE CARTE (heure, balles perdues, sensations)
  // ------------------------------------------------------------------
  function _fmtTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return "—"; }
  }

  function _fmtDuration(startIso, endIso) {
    if (!startIso || !endIso) return "—";
    var ms = new Date(endIso) - new Date(startIso);
    if (isNaN(ms) || ms < 0) return "—";
    var mins = Math.round(ms / 60000);
    var h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? (h + " h " + (m < 10 ? "0" + m : m)) : (m + " min");
  }

  function openFinishScreen() {
    var r = getRound(currentRoundId);
    if (!r) return;
    // Fige l'heure de fin à l'ouverture du bilan (première fois seulement).
    if (!r.finished_at) {
      updateRound(currentRoundId, function (rr) { rr.finished_at = new Date().toISOString(); });
      r = getRound(currentRoundId);
    }
    document.getElementById("ft-start").textContent = _fmtTime(r.started_at);
    document.getElementById("ft-end").textContent = _fmtTime(r.finished_at);
    document.getElementById("ft-dur").textContent = _fmtDuration(r.started_at, r.finished_at);
    document.getElementById("v-balls").textContent = r.balls_lost != null ? r.balls_lost : 0;
    document.getElementById("finish-notes").value = r.end_notes || "";

    // Construire la liste des critères de sensations
    var feelings = r.feelings || {};
    var list = document.getElementById("feelings-list");
    list.innerHTML = "";
    FEELING_CRITERIA.forEach(function (c) {
      var current = feelings[c.key] || null;
      var row = document.createElement("div");
      row.className = "feeling-row";
      row.innerHTML =
        '<span class="feeling-label">' + c.label + '</span>' +
        '<div class="feeling-opts" data-key="' + c.key + '">' +
        '<button type="button" class="fbtn fbtn-neg' + (current === "neg" ? " active" : "") + '" data-v="neg" aria-label="Négatif">−</button>' +
        '<button type="button" class="fbtn fbtn-neu' + (current === "neu" ? " active" : "") + '" data-v="neu" aria-label="Neutre">=</button>' +
        '<button type="button" class="fbtn fbtn-pos' + (current === "pos" ? " active" : "") + '" data-v="pos" aria-label="Positif">+</button>' +
        '</div>';
      list.appendChild(row);
    });

    showScreen("finish");
  }

  // Délégation de clic pour les boutons de sensation
  document.getElementById("feelings-list").addEventListener("click", function (e) {
    var btn = e.target.closest(".fbtn");
    if (!btn) return;
    var opts = btn.closest(".feeling-opts");
    var key = opts.getAttribute("data-key");
    var val = btn.getAttribute("data-v");
    var r = getRound(currentRoundId);
    var currently = (r.feelings || {})[key] || null;
    var newVal = (currently === val) ? null : val; // re-tap = désélection
    updateRound(currentRoundId, function (rr) {
      rr.feelings = rr.feelings || {};
      if (newVal) rr.feelings[key] = newVal;
      else delete rr.feelings[key];
    });
    // maj visuelle
    opts.querySelectorAll(".fbtn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-v") === newVal);
    });
  });

  // Stepper balles perdues
  document.querySelectorAll("#st-balls button").forEach(function (b) {
    b.addEventListener("click", function () {
      var d = parseInt(b.getAttribute("data-d"), 10);
      var r = getRound(currentRoundId);
      var cur = r.balls_lost != null ? r.balls_lost : 0;
      cur = Math.max(0, cur + d);
      updateRound(currentRoundId, function (rr) { rr.balls_lost = cur; });
      document.getElementById("v-balls").textContent = cur;
    });
  });

  document.getElementById("finish-notes").addEventListener("input", function () {
    var v = this.value;
    updateRound(currentRoundId, function (rr) { rr.end_notes = v.trim() || null; });
  });

  document.getElementById("btn-finish-back").addEventListener("click", function () {
    // Revenir au dernier trou sans clôturer
    var r = getRound(currentRoundId);
    loadHole(r.current_index || 0);
    renderProgress();
    showScreen("hole");
  });

  document.getElementById("btn-finish-done").addEventListener("click", function () {
    updateRound(currentRoundId, function (rr) { rr.status = "ready"; });
    toast("Carte clôturée — elle est prête à être exportée.");
    showScreen("home", { skipHistory: true });
    history = ["home"];
    renderHome();
  });

  // ------------------------------------------------------------------
  // EXPORT
  // ------------------------------------------------------------------
  var pendingExportRounds = [];

  function exportRounds() {
    var rounds = loadRounds().filter(function (r) { return r.status === "ready"; });
    if (!rounds.length) {
      toast("Aucune carte prête à exporter (termine une carte d'abord).");
      return;
    }
    pendingExportRounds = rounds;
    var payload = {
      app: "golf-tracker-mobile", version: "1.0",
      exported_at: new Date().toISOString(),
      rounds: rounds.map(function (r) {
        return {
          course_name: r.course_name, date: r.date, tees: r.tees, segment: r.segment,
          weather: r.weather, temperature: r.temperature, wind: r.wind || null, notes: r.notes,
          round_type: r.round_type, competition_name: r.competition_name,
          format: r.format, official: r.official,
          stableford_points: r.stableford_points, result_note: r.result_note,
          started_at: r.started_at || null, finished_at: r.finished_at || null,
          balls_lost: r.balls_lost != null ? r.balls_lost : null,
          feelings: r.feelings || null, end_notes: r.end_notes || null,
          holes: r.holes.map(function (h) {
            var shotsJson = null;
            var arr = [];
            if (h.gps_shots && h.gps_shots.length) {
              arr = h.gps_shots.map(function (s) {
                var distM = s.dist_override_m != null ? s.dist_override_m
                  : (h.pin ? haversineMeters(s, h.pin) : null);
                if (distM == null) return null; // ni correction manuelle, ni drapeau connu
                var distYd = distM / M_PER_YD;
                return { lie: s.lie, distance: Math.round(distYd * 10) / 10, club: s.club || null, holed: null };
              }).filter(function (x) { return x !== null; });
            }
            if (h.green_mark && arr.length) {
              // Repère de position sur le green : ajouté en dernier, en PIEDS (convention du
              // système pour les distances sur le green — comme la distance du 1er putt saisie
              // à la main). Ne compte jamais comme un coup joué ; sert uniquement de repère pour
              // affiner le calcul du coup précédent.
              var gDistM = h.green_mark.dist_override_m != null ? h.green_mark.dist_override_m
                : (h.pin ? haversineMeters(h.green_mark, h.pin) : null);
              if (gDistM != null) {
                var gDistFt = Math.round((gDistM / M_PER_YD) * 3 * 10) / 10;
                arr.push({ lie: "green", distance: gDistFt, club: null, holed: null });
              }
            }
            if (arr.length) shotsJson = JSON.stringify(arr);
            // Longueur réelle du trou mesurée par GPS (départ -> drapeau), en mètres, seulement
            // si les DEUX points ont été marqués. Sert à enrichir le yardage book desktop.
            var measuredYardage = null;
            if (h.tee_mark && h.pin) {
              measuredYardage = Math.round(haversineMeters(h.tee_mark, h.pin));
            }
            return {
              hole_number: h.hole_number, par: h.par, strokes: h.strokes, putts: h.putts,
              fairway: h.fairway, gir: h.gir, first_putt_ft: h.first_putt_ft,
              up_down_attempt: h.up_down_attempt, up_down_success: h.up_down_success,
              sand_attempt: h.sand_attempt, sand_success: h.sand_success,
              penalties: h.penalties, tee_shot_distance: h.tee_shot_distance,
              tee_shot_club: h.tee_shot_club, shots_json: shotsJson,
              measured_yardage_m: measuredYardage,
            };
          }),
        };
      }),
    };
    var json = JSON.stringify(payload, null, 2);
    document.getElementById("export-intro").textContent =
      rounds.length + " carte(s) prête(s) à exporter.";
    document.getElementById("export-json-text").value = json;
    document.getElementById("copy-status").textContent = "";
    showScreen("export");
  }

  document.getElementById("btn-copy-export").addEventListener("click", function () {
    var text = document.getElementById("export-json-text").value;
    var statusEl = document.getElementById("copy-status");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        statusEl.textContent = "✓ Copié — colle-le maintenant côté ordinateur.";
      }).catch(function () {
        statusEl.textContent = "Échec de la copie automatique — sélectionne le texte manuellement ci-dessous (« Voir le JSON brut »).";
      });
    } else {
      statusEl.textContent = "Copie automatique indisponible — sélectionne le texte manuellement ci-dessous (« Voir le JSON brut »).";
    }
  });

  document.getElementById("btn-share-export").addEventListener("click", function () {
    var json = document.getElementById("export-json-text").value;
    var fname = "golf_mobile_export_" + todayISO() + ".json";
    var file = new File([json], fname, { type: "application/json" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: fname }).catch(function () {});
    } else if (navigator.share) {
      navigator.share({ text: json, title: fname }).catch(function () {});
    } else {
      toast("Le partage n'est pas disponible sur ce navigateur.");
    }
  });

  document.getElementById("btn-download-export").addEventListener("click", function () {
    var json = document.getElementById("export-json-text").value;
    var fname = "golf_mobile_export_" + todayISO() + ".json";
    var url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url; a.download = fname; a.target = "_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  });

  document.getElementById("btn-confirm-exported").addEventListener("click", function () {
    if (!pendingExportRounds.length) { showScreen("home"); return; }
    var ids = pendingExportRounds.map(function (r) { return r.id; });
    var all = loadRounds();
    all.forEach(function (r) { if (ids.indexOf(r.id) !== -1) r.status = "exported"; });
    saveRounds(all);
    toast(pendingExportRounds.length + " carte(s) marquée(s) comme exportées.");
    pendingExportRounds = [];
    showScreen("home", { skipHistory: true });
    history = ["home"];
    renderHome();
  });

  // ------------------------------------------------------------------
  // Service worker (hors-ligne) + init
  // ------------------------------------------------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  document.getElementById("app-version-footnote").textContent = "Version app : " + APP_BUILD;

  document.getElementById("btn-refresh-app").addEventListener("click", function () {
    toast("Mise à jour en cours…");
    // Mise à jour forcée fiable : on efface TOUS les caches du service worker (c'est ce qui
    // manquait — reg.update() seul ne purge rien si le nom de cache n'a pas changé), on demande
    // au SW de se ré-vérifier, puis on recharge la page depuis le réseau. Sur iOS le cache PWA
    // est têtu : purger les caches est le seul moyen fiable de récupérer un app.js/style.css
    // fraîchement déployés sans réinstaller l'app.
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      // reload(true) est ignoré par les navigateurs modernes, mais un simple reload après purge
      // des caches suffit : les fichiers ne sont plus en cache, ils seront re-téléchargés.
      location.reload();
    };

    var tasks = [];
    // 1. Effacer tous les caches (CacheStorage)
    if (window.caches && caches.keys) {
      tasks.push(
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).catch(function () {})
      );
    }
    // 2. Forcer le service worker à re-vérifier sa propre mise à jour
    if ("serviceWorker" in navigator) {
      tasks.push(
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg) { try { reg.update(); } catch (e) {} }
        }).catch(function () {})
      );
    }

    Promise.all(tasks).then(function () {
      // petit délai pour laisser les suppressions se propager, puis rechargement propre
      setTimeout(finish, 400);
    }).catch(finish);

    // Filet de sécurité absolu : quoi qu'il arrive, on recharge au bout de 3 s.
    setTimeout(finish, 3000);
  });

  // Chargement auto d'un fichier de données parcours déposé dans le dépôt (courses-data.json,
  // à côté de index.html) — mis à jour depuis Réglages → « Télécharger courses-data.json » côté
  // desktop. Silencieux : si le fichier n'existe pas, ne fait simplement rien. Le service worker
  // le récupère en priorité réseau (voir sw.js) pour toujours prendre la dernière version dispo,
  // avec repli sur la version en cache si hors-ligne.
  (function loadBundledCourses() {
    fetch("./courses-data.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("absent");
      return r.json();
    }).then(function (serverCourses) {
      mergeServerCourses(serverCourses);
    }).catch(function () { /* pas de bundle déposé, ou hors-ligne sans version en cache — ok */ });
  })();

  renderHome();
})();
