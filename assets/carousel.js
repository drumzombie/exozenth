(function () {
    const iframe = document.getElementById("intercept-video");
    const carousel = iframe ? iframe.closest(".hero-carousel") : null;
    const presets = Array.from(document.querySelectorAll(".intercept-preset:not(:disabled)"));
    const pausePlay = document.querySelector("[data-control='pause-play']");
    const archiveLink = document.getElementById("intercept-archive-link");
    if (!iframe || !presets.length) return;
    let isPlaying = false;
    let activeIndex = Math.max(0, presets.findIndex(function (preset) {
      return preset.classList.contains("is-active");
    }));
    let player = null;
    let audioContext = null;
    let hasEnded = false;

    function updatePlayButton() {
      if (!pausePlay) return;
      if (carousel) {
        carousel.classList.toggle("is-playing", isPlaying);
        carousel.classList.toggle("is-paused", !isPlaying);
        carousel.classList.toggle("is-ended", hasEnded);
      }
      pausePlay.classList.toggle("is-playing", isPlaying);
      pausePlay.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
      pausePlay.title = isPlaying ? "Pause video" : "Play video";
    }

    function embedUrl(videoId, autoplay) {
      const params = new URLSearchParams({
        autoplay: autoplay ? "1" : "0",
        mute: "1",
        rel: "0",
        playsinline: "1",
        enablejsapi: "1",
        origin: window.location.origin
      });
      return "https://www.youtube-nocookie.com/embed/" + videoId + "?" + params.toString();
    }



    function commandPlayer(func) {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: "command",
        func: func,
        args: []
      }), "https://www.youtube-nocookie.com");
    }

    function playControlChirp() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      audioContext = audioContext || new AudioContext();

      const play = function () {
        const now = audioContext.currentTime;
        const master = audioContext.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.1, now + 0.006);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
        master.connect(audioContext.destination);

        const carrier = audioContext.createOscillator();
        const carrierGain = audioContext.createGain();
        carrier.type = "sine";
        carrier.frequency.setValueAtTime(1320, now);
        carrier.frequency.exponentialRampToValueAtTime(2200, now + 0.045);
        carrierGain.gain.setValueAtTime(0.8, now);
        carrierGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);
        carrier.connect(carrierGain);
        carrierGain.connect(master);
        carrier.start(now);
        carrier.stop(now + 0.12);

        const overtone = audioContext.createOscillator();
        const overtoneGain = audioContext.createGain();
        overtone.type = "sine";
        overtone.frequency.setValueAtTime(2640, now + 0.018);
        overtone.frequency.exponentialRampToValueAtTime(3520, now + 0.075);
        overtoneGain.gain.setValueAtTime(0.0001, now);
        overtoneGain.gain.exponentialRampToValueAtTime(0.22, now + 0.022);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        overtone.connect(overtoneGain);
        overtoneGain.connect(master);
        overtone.start(now + 0.014);
        overtone.stop(now + 0.095);

        const noiseLength = Math.floor(audioContext.sampleRate * 0.035);
        const noiseBuffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseLength; i += 1) {
          noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
        }
        const noise = audioContext.createBufferSource();
        const noiseFilter = audioContext.createBiquadFilter();
        const noiseGain = audioContext.createGain();
        noise.buffer = noiseBuffer;
        noiseFilter.type = "bandpass";
        noiseFilter.frequency.setValueAtTime(5200, now);
        noiseFilter.Q.setValueAtTime(7, now);
        noiseGain.gain.setValueAtTime(0.08, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(master);
        noise.start(now);
        noise.stop(now + 0.04);
      };

      if (audioContext.state === "suspended") {
        audioContext.resume().then(play).catch(function () {});
      } else {
        play();
      }
    }

    function updateActiveUi(index) {
      const button = presets[index];
      if (!button || !button.dataset.videoId) return;

      iframe.title = "EXO ZENTH - " + (button.dataset.videoTitle || "Intercept " + button.textContent.trim());
      if (archiveLink) {
        archiveLink.href = button.dataset.decryptUrl || "/signal_archive#t" + String(index + 1).padStart(2, "0");
      }

      presets.forEach(function (preset, presetIndex) {
        const active = presetIndex === index;
        preset.classList.toggle("is-active", active);
        preset.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function setActive(index, autoplay) {
      const button = presets[index];
      if (!button || !button.dataset.videoId || !window.exoZenthConsent.hasConsent()) return;

      activeIndex = index;
      isPlaying = autoplay;
      hasEnded = false;
      updateActiveUi(index);

      if (player && typeof player.loadVideoById === "function" && typeof player.cueVideoById === "function") {
        if (autoplay) {
          player.mute();
          player.loadVideoById(button.dataset.videoId);
        } else {
          player.cueVideoById(button.dataset.videoId);
        }
      } else {
        iframe.src = embedUrl(button.dataset.videoId, autoplay);
      }

      updatePlayButton();
    }

    function onPlayerStateChange(event) {
      if (!window.YT || !window.YT.PlayerState) return;

      if (event.data === window.YT.PlayerState.ENDED) {
        isPlaying = false;
        hasEnded = true;
        updatePlayButton();
        return;
      }

      if (event.data === window.YT.PlayerState.PLAYING) {
        isPlaying = true;
        hasEnded = false;
        updatePlayButton();
        return;
      }

      if (
        event.data === window.YT.PlayerState.PAUSED ||
        event.data === window.YT.PlayerState.CUED
      ) {
        isPlaying = false;
        if (event.data === window.YT.PlayerState.CUED) hasEnded = false;
        updatePlayButton();
      }
    }

    function initYouTubePlayer() {
      if (player || !window.YT || !window.YT.Player) return;
      player = new window.YT.Player(iframe, {
        events: {
          onReady: function (event) {
            event.target.mute();
            if (window.exoZenthConsent.hasConsent()) event.target.playVideo();
          },
          onStateChange: onPlayerStateChange
        }
      });
    }

    function loadYouTubeApi() {
      if (window.YT && window.YT.Player) {
        initYouTubePlayer();
        return;
      }

      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previousReady === "function") previousReady();
        initYouTubePlayer();
      };

      if (!document.querySelector("script[src='https://www.youtube.com/iframe_api']")) {
        window.exoZenthConsent.loadScript("https://www.youtube.com/iframe_api");
      }
    }

    presets.forEach(function (button, index) {
      button.addEventListener("click", function () {
        if (!window.exoZenthConsent.hasConsent()) { window.exoZenthConsent.openSettings(); return; }
        playControlChirp();
        setActive(index, true);
      });
    });

    if (pausePlay) {
      pausePlay.addEventListener("click", function () {
        if (!window.exoZenthConsent.hasConsent()) { window.exoZenthConsent.openSettings(); return; }
        playControlChirp();
        if (player && typeof player.pauseVideo === "function" && typeof player.playVideo === "function") {
          if (isPlaying) {
            player.pauseVideo();
          } else {
            hasEnded = false;
            player.mute();
            player.playVideo();
          }
        } else {
          if (!isPlaying) commandPlayer("mute");
          commandPlayer(isPlaying ? "pauseVideo" : "playVideo");
          if (!isPlaying) hasEnded = false;
        }
        isPlaying = !isPlaying;
        updatePlayButton();
      });
      updatePlayButton();
    }

    updateActiveUi(activeIndex);
    let started = false;
    function consentChanged() {
      if (!window.exoZenthConsent.hasConsent() || started) return;
      started = true;
      iframe.hidden = false;
      iframe.src = embedUrl(iframe.dataset.videoId || presets[activeIndex].dataset.videoId, true);
      loadYouTubeApi();
    }
    window.addEventListener("exozenth:consent", consentChanged);
    consentChanged();
  })();
