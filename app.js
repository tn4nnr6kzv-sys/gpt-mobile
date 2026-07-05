/* ==========================================================================
   Golf Tracker Mobile — app.js
   Stockage 100% local (localStorage) — aucune donnée ne quitte le téléphone
   avant export manuel. Le JSON exporté est directement compatible avec
   l'import « /import/mobile » de l'appli desktop.
   ========================================================================== */
(function () {
  "use strict";

  // ---- Splash d'ouverture (cold start uniquement) -------------------------
  // On distingue un vrai démarrage à froid d'un simple retour depuis l'arrière-plan grâce à
  // sessionStorage : il est VIDE au lancement à froid (iOS a purgé le PWA de la mémoire) et
  // PERSISTE tant que l'app reste vivante. Donc si le drapeau n'y est pas, c'est un cold start.
  (function initSplash() {
    var splash = document.getElementById("splash");
    if (!splash) return;
    var alreadyLaunched = false;
    try { alreadyLaunched = sessionStorage.getItem("gt_launched") === "1"; } catch (e) {}
    if (alreadyLaunched) {
      // retour depuis l'arrière-plan : pas de splash
      splash.parentNode && splash.parentNode.removeChild(splash);
      return;
    }
    try { sessionStorage.setItem("gt_launched", "1"); } catch (e) {}

    // Afficher le splash
    splash.hidden = false;

    // Générer des particules dorées qui montent
    var sparkles = document.getElementById("splash-sparkles");
    if (sparkles) {
      var N = 14;
      for (var i = 0; i < N; i++) {
        var s = document.createElement("span");
        s.className = "spark";
        s.style.left = (5 + Math.random() * 90) + "vw";
        s.style.setProperty("--dur", (2.4 + Math.random() * 1.8).toFixed(2) + "s");
        s.style.setProperty("--delay", (Math.random() * 1.6).toFixed(2) + "s");
        s.style.setProperty("--rise", (55 + Math.random() * 35) + "vh");
        var sz = (4 + Math.random() * 5).toFixed(1);
        s.style.width = sz + "px"; s.style.height = sz + "px";
        sparkles.appendChild(s);
      }
    }

    var TOTAL = 3500;  // durée cible ~3,5 s
    var dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      splash.classList.add("splash-out");
      // retirer du DOM après l'animation de sortie
      setTimeout(function () {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 750);
    }
    // fin automatique
    var timer = setTimeout(dismiss, TOTAL);
    // bouton Passer
    var skip = document.getElementById("splash-skip");
    if (skip) skip.addEventListener("click", function () { clearTimeout(timer); dismiss(); });
    // sécurité : si l'utilisateur tape n'importe où après 1 s, on peut passer aussi
    splash.addEventListener("click", function (e) {
      if (e.target === skip) return;
    });
  })();

  // Version du PWA (sémantique, comme le desktop). RÈGLE : à CHAQUE modification du PWA,
  // incrémenter cette valeur ET le CACHE_NAME de sw.js à l'identique (ex. ici "v1.8.0" ->
  // cache "golftracker-mobile-1.8.0"). Changer le nom du cache est ce qui force la purge et
  // garantit que la nouvelle version s'installe proprement.
  var APP_BUILD = "v1.15.0";

  var LS_COURSES = "gtm_courses_v1";
  var LS_ROUNDS = "gtm_rounds_v1";
  var LS_PRACTICE = "gtm_practice_v1";

  var TEE_CLUBS = [
    "Driver", "Bois 3", "Bois 5", "Bois 7", "Hybride",
    "Fer 3", "Fer 4", "Fer 5", "Fer 6", "Fer 7", "Fer 8", "Fer 9",
    "Pitching", "Wedge",
  ];

  // Mêmes zones que le desktop (analytics.ZONES / ZONE_LABELS) — à garder synchronisé.
  var ZONES = ["putting", "chipping", "pitching", "bunker", "approach", "driving"];
  var ZONE_LABELS = {
    putting: "Putting", chipping: "Chipping", pitching: "Pitching",
    bunker: "Bunker", approach: "Approche (wedges/fers)", driving: "Driving / grand jeu",
  };

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

  function loadPractice() {
    try { return JSON.parse(localStorage.getItem(LS_PRACTICE)) || []; }
    catch (e) { return []; }
  }
  function savePractice(p) { localStorage.setItem(LS_PRACTICE, JSON.stringify(p)); }

  var LS_PRACTICE_SUGGESTIONS = "gtm_practice_suggestions_v1";
  function loadPracticeSuggestions() {
    try { return JSON.parse(localStorage.getItem(LS_PRACTICE_SUGGESTIONS)) || []; }
    catch (e) { return []; }
  }
  function savePracticeSuggestions(s) { localStorage.setItem(LS_PRACTICE_SUGGESTIONS, JSON.stringify(s)); }

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
  var screens = ["landing", "home", "courses", "course-form", "round-setup", "hole", "finish", "export", "practice", "practice-form"];

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
    // Écran racine (landing) et écrans « hub » (rounds, practice) : pas de bouton retour, ils
    // sont à un saut de l'accueil. L'icône maison ne sert qu'à revenir à l'accueil depuis ces
    // deux hubs — inutile sur l'accueil lui-même ou sur les sous-écrans (qui ont déjà « Retour »).
    var isHub = (name === "home" || name === "practice");
    document.getElementById("btn-back").style.visibility = (name === "landing" || isHub) ? "hidden" : "visible";
    document.getElementById("btn-home").style.visibility = isHub ? "visible" : "hidden";
    if (!opts.skipHistory) history.push(name);
    window.scrollTo(0, 0);
  }

  document.getElementById("btn-back").addEventListener("click", function () {
    history.pop(); // écran courant
    var prev = history.pop() || "landing";
    showScreen(prev);
  });

  document.getElementById("btn-home").addEventListener("click", function () {
    showScreen("landing", { skipHistory: true });
    history = ["landing"];
  });

  document.getElementById("btn-go-rounds").addEventListener("click", function () {
    renderHome(); showScreen("home");
  });
  document.getElementById("btn-go-practice").addEventListener("click", function () {
    renderPracticeHome(); showScreen("practice");
  });

  // Petites particules dorées ambiantes sur l'écran d'accueil (version allégée et continue du
  // scintillement du splash — pas de séquence d'entrée/sortie, juste une boucle discrète).
  (function initLandingSparkles() {
    var host = document.getElementById("landing-sparkles");
    if (!host) return;
    var N = 8;
    for (var i = 0; i < N; i++) {
      var s = document.createElement("span");
      s.className = "spark";
      s.style.left = (8 + Math.random() * 84) + "%";
      s.style.setProperty("--dur", (3 + Math.random() * 2).toFixed(2) + "s");
      s.style.setProperty("--delay", (Math.random() * 3).toFixed(2) + "s");
      s.style.setProperty("--rise", (120 + Math.random() * 60) + "px");
      var sz = (3.5 + Math.random() * 3).toFixed(1);
      s.style.width = sz + "px"; s.style.height = sz + "px";
      host.appendChild(s);
    }
  })();

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
    var input = document.getElementById("server-address");
    var raw = input ? input.value.trim() : "";
    if (raw) {
      saveServerAddress(raw);
    } else {
      raw = loadServerAddress();
    }
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
  // PRACTICE — liste & formulaire
  // ------------------------------------------------------------------
  function renderPracticeHome() {
    var sessions = loadPractice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    var groups = { ready: [], exported: [] };
    sessions.forEach(function (s) { (groups[s.status] || groups.ready).push(s); });

    function renderList(el, list, emptyIcon, emptyText) {
      if (!list.length) {
        el.innerHTML = '<div class="empty"><span class="flag">' + emptyIcon + '</span>' + emptyText + '</div>';
        return;
      }
      el.innerHTML = "";
      list.forEach(function (s) {
        var nEx = (s.exercises || []).length;
        var div = document.createElement("div");
        div.className = "list-item";
        div.innerHTML =
          '<div class="li-main">' +
            '<div class="li-title">' + escapeHtml(s.focus || "Séance de practice") + '</div>' +
            '<div class="li-sub">' + s.date + (s.duration_min ? ' · ' + s.duration_min + ' min' : '') +
              ' · ' + nEx + ' exercice' + (nEx > 1 ? 's' : '') + '</div>' +
          '</div>' +
          '<button type="button" class="li-del" data-id="' + s.id + '" title="Supprimer">🗑</button>' +
          '<span class="li-chev">›</span>';
        div.querySelector(".li-main").addEventListener("click", function () {
          openPracticeForm(s.id); showScreen("practice-form");
        });
        div.querySelector(".li-chev").addEventListener("click", function () {
          openPracticeForm(s.id); showScreen("practice-form");
        });
        div.querySelector(".li-del").addEventListener("click", function (e) {
          e.stopPropagation();
          if (!window.confirm("Supprimer définitivement cette séance (" + s.date +
              ") ? Cette action est irréversible.")) return;
          var all = loadPractice().filter(function (x) { return x.id !== s.id; });
          savePractice(all);
          renderPracticeHome();
        });
        el.appendChild(div);
      });
    }
    renderList(document.getElementById("list-practice-ready"), groups.ready, "🏌️", "Aucune séance enregistrée.");
    renderList(document.getElementById("list-practice-exported"), groups.exported, "✅", "—");
    renderPracticeSuggestions();
  }

  function renderPracticeSuggestions() {
    var el = document.getElementById("list-suggestions");
    var suggestions = loadPracticeSuggestions();
    if (!suggestions.length) {
      el.innerHTML = '<div class="empty"><span class="flag">💡</span>Aucune recommandation chargée pour l\'instant.</div>';
      return;
    }
    el.innerHTML = "";
    suggestions.forEach(function (s) {
      var div = document.createElement("div");
      div.className = "list-item";
      div.style.display = "block";
      div.innerHTML =
        '<div class="li-main">' +
          '<div class="li-title">' + escapeHtml(s.title || "") +
            ' <span style="font-weight:400;font-size:11.5px;color:var(--ink-soft)">(' +
            (s.source === "focus" ? "Focus" : (s.source === "feelings" ? "Ressenti" : "Analyse")) + ')</span></div>' +
          '<div class="li-sub">' + escapeHtml(s.diagnostic || "") + '</div>' +
          '<div class="li-sub" style="margin-top:4px">' + escapeHtml(s.advice || "") + '</div>' +
        '</div>' +
        '<div class="btn-row" style="margin-top:8px">' +
          '<button type="button" class="btn btn-sm btn-primary sugg-start">+ Séance sur cette zone</button>' +
        '</div>';
      div.querySelector(".sugg-start").addEventListener("click", function () {
        openPracticeForm(null, s.practice_zone);
        showScreen("practice-form");
      });
      el.appendChild(div);
    });
  }

  function applySuggestions(suggestions, statusEl, successPrefix) {
    if (!Array.isArray(suggestions)) {
      statusEl.textContent = "Fichier illisible : ce n'est pas une liste de recommandations valide.";
      return;
    }
    savePracticeSuggestions(suggestions);
    renderPracticeSuggestions();
    statusEl.textContent = successPrefix + suggestions.length + " recommandation(s) chargée(s).";
  }

  document.getElementById("btn-sync-suggestions").addEventListener("click", function () {
    var statusEl = document.getElementById("suggestions-status");
    var base = serverBaseUrl();
    if (!base) {
      statusEl.textContent = "Renseigne l'adresse du PC dans Mes parcours d'abord.";
      return;
    }
    statusEl.textContent = "Synchronisation…";
    fetch(base + "/api/practice-suggestions.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (suggestions) {
      applySuggestions(suggestions || [], statusEl, "");
    }).catch(function () {
      statusEl.textContent = "Synchronisation réseau impossible — vérifie l'adresse (dans Mes " +
        "parcours), que tu es sur le même Wi-Fi, et que le PC a un certificat HTTPS valide. " +
        "Sinon, utilise « Pas de réseau/HTTPS ? Importer sans connexion » ci-dessous.";
    });
  });

  document.getElementById("btn-import-suggestions-file").addEventListener("click", function () {
    document.getElementById("suggestions-file-input").click();
  });
  document.getElementById("suggestions-file-input").addEventListener("change", function (e) {
    var statusEl = document.getElementById("suggestions-status");
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        applySuggestions(JSON.parse(reader.result), statusEl, "Fichier importé : ");
      } catch (err) {
        statusEl.textContent = "Fichier illisible (JSON invalide).";
      }
    };
    reader.onerror = function () { statusEl.textContent = "Impossible de lire ce fichier."; };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("btn-import-suggestions-paste").addEventListener("click", function () {
    var statusEl = document.getElementById("suggestions-status");
    var raw = document.getElementById("suggestions-paste-text").value.trim();
    if (!raw) { statusEl.textContent = "Colle d'abord le JSON depuis l'ordinateur."; return; }
    try {
      applySuggestions(JSON.parse(raw), statusEl, "JSON collé importé : ");
    } catch (err) {
      statusEl.textContent = "JSON illisible — vérifie que tu as bien copié tout le contenu.";
    }
  });

  var currentPracticeId = null;

  function addExerciseRow(ex) {
    ex = ex || {};
    var wrap = document.getElementById("pf-exercises");
    var zoneOpts = ZONES.map(function (z) {
      return '<option value="' + z + '"' + (ex.zone === z ? " selected" : "") + '>' + ZONE_LABELS[z] + '</option>';
    }).join("");
    var ratingOpts = '<option value="">–</option>' + [1, 2, 3, 4, 5].map(function (r) {
      return '<option value="' + r + '"' + (ex.rating === r ? " selected" : "") + '>' + r + '</option>';
    }).join("");
    var div = document.createElement("div");
    div.className = "card ex-card";
    div.innerHTML =
      '<div class="btn-row" style="justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<strong>Exercice</strong>' +
        '<button type="button" class="li-del ex-remove" title="Supprimer cet exercice">🗑</button>' +
      '</div>' +
      '<label class="field"><span class="lab">Zone</span><select class="ex-zone">' + zoneOpts + '</select></label>' +
      '<label class="field"><span class="lab">Nom de l\'exercice</span>' +
        '<input type="text" class="ex-name" value="' + escapeHtml(ex.name || "") + '" placeholder="Ex. Ladder Drill"></label>' +
      '<div class="grid-2">' +
        '<label class="field"><span class="lab">Tentatives</span>' +
          '<input type="number" inputmode="numeric" class="ex-attempts" value="' + (ex.attempts != null ? ex.attempts : "") + '"></label>' +
        '<label class="field"><span class="lab">Réussites</span>' +
          '<input type="number" inputmode="numeric" class="ex-successes" value="' + (ex.successes != null ? ex.successes : "") + '"></label>' +
      '</div>' +
      '<div class="grid-2">' +
        '<label class="field"><span class="lab">Distance</span>' +
          '<input type="text" class="ex-distance" value="' + escapeHtml(ex.distance || "") + '" placeholder="ex. 60-80m"></label>' +
        '<label class="field"><span class="lab">Note /5</span><select class="ex-rating">' + ratingOpts + '</select></label>' +
      '</div>' +
      '<label class="field"><span class="lab">Notes</span>' +
        '<input type="text" class="ex-notes" value="' + escapeHtml(ex.notes || "") + '"></label>';
    div.querySelector(".ex-remove").addEventListener("click", function () { div.remove(); });
    wrap.appendChild(div);
  }

  function openPracticeForm(id, presetZone) {
    currentPracticeId = id || null;
    var s = id ? loadPractice().find(function (x) { return x.id === id; }) : null;
    document.getElementById("practice-form-title").textContent = s ? "Modifier la séance" : "Nouvelle séance";
    document.getElementById("pf-date").value = (s && s.date) || todayISO();
    document.getElementById("pf-duration").value = (s && s.duration_min != null) ? s.duration_min : "";
    document.getElementById("pf-focus").value = (s && s.focus) || "";
    document.getElementById("pf-notes").value = (s && s.notes) || "";
    var wrap = document.getElementById("pf-exercises");
    wrap.innerHTML = "";
    if (s && s.exercises && s.exercises.length) {
      s.exercises.forEach(function (ex) { addExerciseRow(ex); });
    } else if (presetZone) {
      addExerciseRow({ zone: presetZone });
    } else {
      addExerciseRow();
    }
  }

  document.getElementById("btn-new-practice").addEventListener("click", function () {
    openPracticeForm(null); showScreen("practice-form");
  });
  document.getElementById("btn-add-exercise").addEventListener("click", function () { addExerciseRow(); });
  document.getElementById("btn-practice-cancel").addEventListener("click", function () {
    showScreen("practice", { skipHistory: true });
  });

  document.getElementById("btn-save-practice").addEventListener("click", function () {
    var date = document.getElementById("pf-date").value || todayISO();
    var duration = document.getElementById("pf-duration").value;
    var focus = document.getElementById("pf-focus").value.trim();
    var notes = document.getElementById("pf-notes").value.trim();
    var exercises = [];
    document.querySelectorAll("#pf-exercises .ex-card").forEach(function (card) {
      var zone = card.querySelector(".ex-zone").value;
      var name = card.querySelector(".ex-name").value.trim();
      var attempts = card.querySelector(".ex-attempts").value;
      var successes = card.querySelector(".ex-successes").value;
      var distance = card.querySelector(".ex-distance").value.trim();
      var rating = card.querySelector(".ex-rating").value;
      var exnotes = card.querySelector(".ex-notes").value.trim();
      // Ignore une ligne totalement vide (exercice ajouté puis pas rempli).
      if (!name && !attempts && !successes && !distance && !rating && !exnotes) return;
      exercises.push({
        zone: zone, name: name || null,
        attempts: attempts !== "" ? parseInt(attempts, 10) : null,
        successes: successes !== "" ? parseInt(successes, 10) : null,
        distance: distance || null,
        rating: rating !== "" ? parseInt(rating, 10) : null,
        notes: exnotes || null,
      });
    });
    if (!exercises.length) {
      toast("Ajoute au moins un exercice avant d'enregistrer.");
      return;
    }
    var all = loadPractice();
    if (currentPracticeId) {
      var idx = all.findIndex(function (x) { return x.id === currentPracticeId; });
      if (idx !== -1) {
        all[idx].date = date;
        all[idx].duration_min = duration !== "" ? parseInt(duration, 10) : null;
        all[idx].focus = focus || null;
        all[idx].notes = notes || null;
        all[idx].exercises = exercises;
        // Le statut existant est conservé : modifier une séance déjà exportée ne la fait pas
        // redescendre dans « à exporter » (comme pour les cartes de golf côté rounds).
      }
    } else {
      all.push({
        id: uid("pr"), date: date,
        duration_min: duration !== "" ? parseInt(duration, 10) : null,
        focus: focus || null, notes: notes || null, exercises: exercises, status: "ready",
      });
    }
    savePractice(all);
    toast("Séance de practice enregistrée.");
    currentPracticeId = null;
    showScreen("practice", { skipHistory: true });
    history = ["landing", "practice"];
    renderPracticeHome();
  });

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
    teeshape: ["opt-teeshape", null],
    pindepth: ["opt-pindepth", null],
    pinside: ["opt-pinside", null],
  };

  function bindOptRow(elId) {
    document.getElementById(elId).querySelectorAll(".opt-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var siblings = btn.parentElement.querySelectorAll(".opt-btn");
        var isActive = btn.classList.contains("selected");
        siblings.forEach(function (b) {
          b.classList.remove("selected", "active-hit", "active-miss", "active-yes", "active-no", "active-ok", "active-na", "active-sel");
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
          else btn.classList.add("active-sel");
        }
        saveCurrentHole();
      });
    });
  }
  Object.keys(optGroups).forEach(function (k) { bindOptRow(optGroups[k][0]); });

  function setOptRow(elId, value) {
    var btns = document.getElementById(elId).querySelectorAll(".opt-btn");
    btns.forEach(function (b) {
      b.classList.remove("selected", "active-hit", "active-miss", "active-yes", "active-no", "active-ok", "active-na", "active-sel");
      if (b.dataset.v === String(value)) {
        b.classList.add("selected");
        var v = b.dataset.v;
        if (v === "hit") b.classList.add("active-hit");
        else if (v === "miss") b.classList.add("active-miss");
        else if (v === "1") b.classList.add("active-yes");
        else if (v === "0") b.classList.add("active-no");
        else if (v === "ok") b.classList.add("active-ok");
        else if (v === "att") b.classList.add("active-na");
        else b.classList.add("active-sel");
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
    setOptRow("opt-teeshape", h.tee_shot_shape || "");
    setOptRow("opt-pindepth", h.pin_depth || "");
    setOptRow("opt-pinside", h.pin_side || "");

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
      h.tee_shot_shape = getOptRow("opt-teeshape") || null;
      h.pin_depth = getOptRow("opt-pindepth") || null;
      h.pin_side = getOptRow("opt-pinside") || null;
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
  var pendingExportPractice = [];

  function exportRounds() {
    var rounds = loadRounds().filter(function (r) { return r.status === "ready"; });
    var practice = loadPractice().filter(function (p) { return p.status === "ready"; });
    if (!rounds.length && !practice.length) {
      toast("Rien à exporter pour l'instant (termine une carte ou enregistre une séance de practice).");
      return;
    }
    pendingExportRounds = rounds;
    pendingExportPractice = practice;
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
              tee_shot_club: h.tee_shot_club, tee_shot_shape: h.tee_shot_shape,
              pin_depth: h.pin_depth, pin_side: h.pin_side, shots_json: shotsJson,
              measured_yardage_m: measuredYardage,
              strategy_note: (h.strategy_note && h.strategy_note.trim()) ? h.strategy_note.trim() : null,
            };
          }),
        };
      }),
      practice_sessions: practice.map(function (p) {
        return {
          date: p.date, duration_min: p.duration_min, focus: p.focus, notes: p.notes,
          exercises: (p.exercises || []).map(function (ex) {
            return {
              zone: ex.zone, name: ex.name, attempts: ex.attempts, successes: ex.successes,
              distance: ex.distance, rating: ex.rating, notes: ex.notes,
            };
          }),
        };
      }),
    };
    var json = JSON.stringify(payload, null, 2);
    var introParts = [];
    if (rounds.length) introParts.push(rounds.length + " carte(s)");
    if (practice.length) introParts.push(practice.length + " séance(s) de practice");
    document.getElementById("export-intro").textContent = introParts.join(" et ") + " prête(s) à exporter.";
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
    if (!pendingExportRounds.length && !pendingExportPractice.length) { showScreen("home"); return; }
    var roundIds = pendingExportRounds.map(function (r) { return r.id; });
    var allRounds = loadRounds();
    allRounds.forEach(function (r) { if (roundIds.indexOf(r.id) !== -1) r.status = "exported"; });
    saveRounds(allRounds);

    var practiceIds = pendingExportPractice.map(function (p) { return p.id; });
    var allPractice = loadPractice();
    allPractice.forEach(function (p) { if (practiceIds.indexOf(p.id) !== -1) p.status = "exported"; });
    savePractice(allPractice);

    var n = pendingExportRounds.length + pendingExportPractice.length;
    toast(n + " élément(s) marqué(s) comme exporté(s).");
    pendingExportRounds = [];
    pendingExportPractice = [];
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
