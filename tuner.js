// Простая реализация тюнера на Web Audio API
// При запуске запрашиваем доступ к микрофону, затем берем анализатор и находим частоту основного пика
(async () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const noteElem = document.getElementById('note');
  const freqElem = document.getElementById('frequency');
  const centElem = document.getElementById('cent');
  const canvas = document.getElementById('wave');
  const ctxCanvas = canvas.getContext('2d');

  let audioCtx, analyser, dataArray, bufferLength, source, rafId;
  let isRunning = false;

  // Ноты по частотам (A4 = 440Hz)
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  // Частоты для одной октавы в формате C4..B4 и выше можно расширить
  function freqToNoteName(freq) {
    if (!freq || freq <= 0) return { note: "---", det: 0, midi: null };
    // находиться относительно A4 = 440
    const A4 = 440;
    const midi = 69 + 12 * Math.log2(freq / A4);
    const noteIndex = Math.round(midi) % 12;
    const octave = Math.floor(Math.round(midi) / 12) - 1;
    const note = noteNames[(noteIndex + 12) % 12] + octave;
    // cents deviation
    const cent = Math.round((midi - Math.round(midi)) * 100);
    return { note, det: cent, midi: midi };
  }

  function drawWave() {
    if (!analyser) return;
    const width = canvas.width;
    const height = canvas.height;
    const data = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(data);
    ctxCanvas.fillStyle = '#0a0f1a';
    ctxCanvas.fillRect(0, 0, width, height);
    ctxCanvas.lineWidth = 2;
    ctxCanvas.strokeStyle = '#7c5cff';
    ctxCanvas.beginPath();
    const sliceWidth = width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = data[i] / 128.0;
      const y = (v * height) / 2;
      if (i === 0) ctxCanvas.moveTo(x, y);
      else ctxCanvas.lineTo(x, y);
      x += sliceWidth;
    }
    ctxCanvas.lineTo(width, height / 2);
    ctxCanvas.stroke();
  }

  async function start() {
    if (isRunning) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      bufferLength = analyser.fftSize;
      dataArray = new Uint8Array(bufferLength);

      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      isRunning = true;

      startBtn.disabled = true;
      stopBtn.disabled = false;
      loop();
    } catch (err) {
      console.error(err);
      alert('Не удалось получить доступ к микрофону. Разрешите доступ и попробуйте снова.');
    }
  }

  function stop() {
    if (!isRunning) return;
    isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (source && source.mediaStream) {
      source.mediaStream.getTracks().forEach(t => t.stop());
    }
    if (audioCtx) {
      audioCtx.close();
    }
  }

  function autoCorrelate(buf, sampleRate) {
    // Эффективный авто корреляционный подход
    // Просто примитивная версия для основного пика
    let SIZE = buf.length;
    let MAX_SAMPLES = Math.floor(SIZE / 2);
    let best_offset = -1;
    let best_correlation = 0;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
      const val = (buf[i] - 128) / 128;
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return null;

    for (let offset = 1; offset < MAX_SAMPLES; offset++) {
      let correlation = 0;
      for (let i = 0; i < MAX_SAMPLES; i++) {
        correlation += ((buf[i] - 128) / 128) * ((buf[i + offset] - 128) / 128);
      }
      if (correlation > best_correlation) {
        best_correlation = correlation;
        best_offset = offset;
      }
    }
    if (best_offset === -1) return null;
    // частота = sampleRate / открытая корреляция
    return sampleRate / best_offset;
  }

  function loop() {
    if (!isRunning) return;
    analyser.getByteTimeDomainData(dataArray);
    // Преобразование в Float32
    const floatData = new Float32Array(dataArray.length);
    for (let i = 0; i < dataArray.length; i++) {
      floatData[i] = (dataArray[i] - 128) / 128.0;
    }

    const rawFreq = autoCorrelate(floatData, audioCtx.sampleRate);
    if (rawFreq) {
      const { note, det } = freqToNoteName(rawFreq);
      noteElem.textContent = note;
      freqElem.textContent = `Hz: ${rawFreq.toFixed(2)}`;
      centElem.textContent = `Cent: ${det >= 0 ? '+' : ''}${det}`;
    } else {
      noteElem.textContent = '—';
      freqElem.textContent = 'Hz: —';
      centElem.textContent = 'Cent: —';
    }

    drawWave();
    rafId = requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);

  // Помощь: обновление размеров канваса на изменение размера окна
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctxCanvas.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
})();
