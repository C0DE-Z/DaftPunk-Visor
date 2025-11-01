'use strict';

const NUM_COLS = 32;
const NUM_ROWS = 8;
const NUM_PIXELS = NUM_COLS * NUM_ROWS;
const CUSTOM_MODE_BASE = 19;
const PRESET_KEY = 'visorMatrixPresets.v2';
const LEGACY_PRESET_KEY = 'visorMatrixPresets.v1';
const PRESET_STORAGE_FORMAT = 'hardware-layout-v1';
const LOG_LIMIT = 8000;
const SESSION_UNLOCK_KEY = 'visorPortalUnlocked.v1';
const REMOTE_UNLOCK_WINDOW_MS = 20000;

const WEBUSB_VENDOR_FILTERS = [
  { vendorId: 0x239A }, // Adafruit
  { vendorId: 0x2E8A }, // Raspberry Pi (RP2040)
  { vendorId: 0x2341 }, // Arduino
  { vendorId: 0x1209 }, // PID.codes community VID
  { vendorId: 0x1B4F }, // SparkFun
  { vendorId: 0x16D0 }, // MCUdude / generic maker VID
  { classCode: 0xff, subclassCode: 0x00, protocolCode: 0x00 }, // Any vendor-specific interface with WebUSB descriptor
];
const remoteOnly = (() => {
  try{
    const params = new URLSearchParams(window.location.search);
    return params.get('remoteOnly') === '1' || params.get('remoteOnly') === 'true';
  }catch(err){
    return false;
  }
})();
const supportsWebUSB = typeof navigator !== 'undefined' && 'usb' in navigator;
const supportsWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

const ACCESS_PASSWORD = '1113';
const API_BASE = 'http://localhost:3000/api/visor';
const API_STATUS_ENDPOINT = `${API_BASE}/status`;
const API_UNLOCK_ENDPOINT = `${API_BASE}/unlock`;
const API_COMMAND_ENDPOINT = `${API_BASE}/commands`;
const API_COMMAND_NEXT_ENDPOINT = `${API_COMMAND_ENDPOINT}/next`;
const API_COMMAND_ACK_ENDPOINT = `${API_COMMAND_ENDPOINT}/ack`;

const connectButton = document.getElementById('connect');
const pingButton = document.getElementById('ping');
const modeButtons = document.getElementById('mode-buttons');
const textForm = document.getElementById('text-form');
const textInput = document.getElementById('text-input');
const brightnessSlider = document.getElementById('brightness');
const brightnessValue = document.getElementById('brightness-value');
const logEl = document.getElementById('log');
const pixelGrid = document.getElementById('pixel-grid');
const colorPicker = document.getElementById('color-picker');
const frameSlotSelect = document.getElementById('frame-slot');
const sendFrameBtn = document.getElementById('send-frame');
const previewFrameBtn = document.getElementById('preview-frame');
const clearGridBtn = document.getElementById('clear-grid');
const fillGridBtn = document.getElementById('fill-grid');
const presetNameInput = document.getElementById('preset-name');
const savePresetBtn = document.getElementById('save-preset');
const loadPresetBtn = document.getElementById('load-preset');
const deletePresetBtn = document.getElementById('delete-preset');
const presetSelect = document.getElementById('preset-select');
const toggleEraserBtn = document.getElementById('toggle-eraser');
const sampleColorBtn = document.getElementById('sample-color');
const authOverlay = document.getElementById('auth-overlay');
const passwordForm = document.getElementById('password-form');
const passwordInput = document.getElementById('password-input');
const passwordError = document.getElementById('password-error');
const connectionStatus = document.getElementById('connection-status');
const apiStatus = document.getElementById('api-status');
const previewCanvas = document.getElementById('pattern-preview');
const previewCtx = previewCanvas ? previewCanvas.getContext('2d') : null;
const previewPlayBtn = document.getElementById('preview-play');
const previewPauseBtn = document.getElementById('preview-pause');
const previewLabel = document.getElementById('preview-label');
const textSpeedSlider = document.getElementById('text-speed');
const textSpeedValue = document.getElementById('text-speed-value');
const textTransitionSelect = document.getElementById('text-transition');
const textColorPicker = document.getElementById('text-color');
const swoopLeftPicker = document.getElementById('swoop-left');
const swoopRightPicker = document.getElementById('swoop-right');
const lyricForm = document.getElementById('lyric-form');
const lyricInput = document.getElementById('lyric-input');
const lyricResetBtn = document.getElementById('lyric-reset');
const clearSlotBtn = document.getElementById('clear-slot');
const currentTextDisplay = document.getElementById('current-text-display');

const bigCharWidth = 5;
const bigSpacing = 1;
const SMALL_CHAR_WIDTH = 4;
const SMALL_CHAR_HEIGHT = 5;
const SMALL_SPACING = 1;
const SCROLL_CHAR_SPACING = 1;
const PREVIEW_FRAME_INTERVAL = 30;
const PANEL_SERPENTINE = true;
const PANEL_COLUMN_MAJOR = true;
const PANEL_ROTATION = 0;

const { gridToHardwareMap, hardwareToGridMap } = buildHardwareIndexMaps();

const DEFAULT_LYRIC_SCRIPT = 'AROUND THE WORLD';
let lyricScript = DEFAULT_LYRIC_SCRIPT;
let currentText = 'GLOVE U';
let selectedTextTransition = '0';
let textTransitionPreviewStart = 0;
let mirroredSwoopLeftHex = '#00B4FF';
let mirroredSwoopRightHex = '#FFB400';
let textColorHex = '#FFB428';

const font5x7 = [
  [0x00,0x00,0x00,0x00,0x00], // 32 ' '
  [0x00,0x00,0x5F,0x00,0x00], // 33 '!'
  [0x00,0x07,0x00,0x07,0x00], // 34 '"'
  [0x14,0x7F,0x14,0x7F,0x14], // 35 '#'
  [0x24,0x2A,0x7F,0x2A,0x12], // 36 '$'
  [0x23,0x13,0x08,0x64,0x62], // 37 '%'
  [0x36,0x49,0x55,0x22,0x50], // 38 '&'
  [0x00,0x05,0x03,0x00,0x00], // 39 '\''
  [0x00,0x1C,0x22,0x41,0x00], // 40 '('
  [0x00,0x41,0x22,0x1C,0x00], // 41 ')'
  [0x14,0x08,0x3E,0x08,0x14], // 42 '*'
  [0x08,0x08,0x3E,0x08,0x08], // 43 '+'
  [0x00,0x50,0x30,0x00,0x00], // 44 ','
  [0x08,0x08,0x08,0x08,0x08], // 45 '-'
  [0x00,0x60,0x60,0x00,0x00], // 46 '.'
  [0x20,0x10,0x08,0x04,0x02], // 47 '/'
  [0x3E,0x51,0x49,0x45,0x3E], // 48 '0'
  [0x00,0x42,0x7F,0x40,0x00], // 49 '1'
  [0x42,0x61,0x51,0x49,0x46], // 50 '2'
  [0x21,0x41,0x45,0x4B,0x31], // 51 '3'
  [0x18,0x14,0x12,0x7F,0x10], // 52 '4'
  [0x27,0x45,0x45,0x45,0x39], // 53 '5'
  [0x3C,0x4A,0x49,0x49,0x30], // 54 '6'
  [0x01,0x71,0x09,0x05,0x03], // 55 '7'
  [0x36,0x49,0x49,0x49,0x36], // 56 '8'
  [0x06,0x49,0x49,0x29,0x1E], // 57 '9'
  [0x00,0x36,0x36,0x00,0x00], // 58 ':'
  [0x00,0x56,0x36,0x00,0x00], // 59 ';'
  [0x08,0x14,0x22,0x41,0x00], // 60 '<'
  [0x14,0x14,0x14,0x14,0x14], // 61 '='
  [0x00,0x41,0x22,0x14,0x08], // 62 '>'
  [0x02,0x01,0x51,0x09,0x06], // 63 '?'
  [0x32,0x49,0x79,0x41,0x3E], // 64 '@'
  [0x7E,0x11,0x11,0x11,0x7E], // 65 'A'
  [0x7F,0x49,0x49,0x49,0x36], // 66 'B'
  [0x3E,0x41,0x41,0x41,0x22], // 67 'C'
  [0x7F,0x41,0x41,0x22,0x1C], // 68 'D'
  [0x7F,0x49,0x49,0x49,0x41], // 69 'E'
  [0x7F,0x09,0x09,0x09,0x01], // 70 'F'
  [0x3E,0x41,0x49,0x49,0x7A], // 71 'G'
  [0x7F,0x08,0x08,0x08,0x7F], // 72 'H'
  [0x00,0x41,0x7F,0x41,0x00], // 73 'I'
  [0x20,0x40,0x41,0x3F,0x01], // 74 'J'
  [0x7F,0x08,0x14,0x22,0x41], // 75 'K'
  [0x7F,0x40,0x40,0x40,0x40], // 76 'L'
  [0x7F,0x02,0x0C,0x02,0x7F], // 77 'M'
  [0x7F,0x04,0x08,0x10,0x7F], // 78 'N'
  [0x3E,0x41,0x41,0x41,0x3E], // 79 'O'
  [0x7F,0x09,0x09,0x09,0x06], // 80 'P'
  [0x3E,0x41,0x51,0x21,0x5E], // 81 'Q'
  [0x7F,0x09,0x19,0x29,0x46], // 82 'R'
  [0x46,0x49,0x49,0x49,0x31], // 83 'S'
  [0x01,0x01,0x7F,0x01,0x01], // 84 'T'
  [0x3F,0x40,0x40,0x40,0x3F], // 85 'U'
  [0x1F,0x20,0x40,0x20,0x1F], // 86 'V'
  [0x3F,0x40,0x38,0x40,0x3F], // 87 'W'
  [0x63,0x14,0x08,0x14,0x63], // 88 'X'
  [0x07,0x08,0x70,0x08,0x07], // 89 'Y'
  [0x61,0x51,0x49,0x45,0x43], // 90 'Z'
  [0x00,0x7F,0x41,0x41,0x00], // 91 '['
  [0x02,0x04,0x08,0x10,0x20], // 92 '\\'
  [0x00,0x41,0x41,0x7F,0x00], // 93 ']'
  [0x04,0x02,0x01,0x02,0x04], // 94 '^'
  [0x40,0x40,0x40,0x40,0x40], // 95 '_'
  [0x00,0x01,0x02,0x04,0x00], // 96 '`'
  [0x20,0x54,0x54,0x54,0x78], // 97 'a'
  [0x7F,0x48,0x44,0x44,0x38], // 98 'b'
  [0x38,0x44,0x44,0x44,0x20], // 99 'c'
  [0x38,0x44,0x44,0x48,0x7F], //100 'd'
  [0x38,0x54,0x54,0x54,0x18], //101 'e'
  [0x08,0x7E,0x09,0x01,0x02], //102 'f'
  [0x0C,0x52,0x52,0x3E,0x02], //103 'g'
  [0x7F,0x08,0x04,0x04,0x78], //104 'h'
  [0x00,0x44,0x7D,0x40,0x00], //105 'i'
  [0x20,0x40,0x44,0x3D,0x00], //106 'j'
  [0x7F,0x10,0x28,0x44,0x00], //107 'k'
  [0x00,0x41,0x7F,0x40,0x00], //108 'l'
  [0x7C,0x04,0x18,0x04,0x78], //109 'm'
  [0x7C,0x08,0x04,0x04,0x78], //110 'n'
  [0x38,0x44,0x44,0x44,0x38], //111 'o'
  [0x7C,0x14,0x14,0x14,0x08], //112 'p'
  [0x08,0x14,0x14,0x18,0x7C], //113 'q'
  [0x7C,0x08,0x04,0x04,0x08], //114 'r'
  [0x48,0x54,0x54,0x54,0x20], //115 's'
  [0x04,0x3F,0x44,0x40,0x20], //116 't'
  [0x3C,0x40,0x40,0x20,0x7C], //117 'u'
  [0x1C,0x20,0x40,0x20,0x1C], //118 'v'
  [0x3C,0x40,0x30,0x40,0x3C], //119 'w'
  [0x44,0x28,0x10,0x28,0x44], //120 'x'
  [0x0C,0x50,0x50,0x50,0x3C], //121 'y'
  [0x44,0x64,0x54,0x4C,0x44], //122 'z'
  [0x00,0x08,0x36,0x41,0x00], //123 '{'
  [0x00,0x00,0x7F,0x00,0x00], //124 '|'
  [0x00,0x41,0x36,0x08,0x00], //125 '}'
  [0x02,0x01,0x02,0x04,0x02]  //126 '~'
];

const bigGlyphCache = new Map();
const smallGlyphCache = new Map();

let textSpeedPercent = textSpeedSlider ? Number(textSpeedSlider.value) || 50 : 50;
let textSpeedDebounce = null;
let previewFrameAccumulator = 0;
let lyricWordIntervalMs = 1500;
let scrollDelayMs = 120;
let scrollPauseMs = 260;
let previewElapsedMs = 0;
const marqueePreviewState = {
  sourceText: '',
  charCount: 0,
  totalScrollWidth: 0,
  offset: 0,
  lastStepMs: 0
};

function normalizedCharCode(char){
  if(!char) return 32;
  const code = char.charCodeAt(0);
  if(code >= 97 && code <= 122) return code - 32;
  if(code < 32 || code > 126) return 32;
  return code;
}

function getBigGlyphRows(char){
  const code = normalizedCharCode(char);
  if(bigGlyphCache.has(code)) return bigGlyphCache.get(code);
  const idx = code - 32;
  const columns = font5x7[idx];
  const rows = new Array(7);
  for(let row=0; row<7; row++){
    let bits = '';
    for(let col=0; col<5; col++){
      bits += ((columns[col] >> row) & 1) ? '1' : '0';
    }
    rows[row] = bits;
  }
  bigGlyphCache.set(code, rows);
  return rows;
}

function getSmallGlyphRows(char){
  const code = normalizedCharCode(char);
  if(smallGlyphCache.has(code)) return smallGlyphCache.get(code);
  const idx = code - 32;
  const colScale = 5 / SMALL_CHAR_WIDTH;
  const rowScale = 7 / SMALL_CHAR_HEIGHT;
  const rows = new Array(SMALL_CHAR_HEIGHT);

  for(let sr=0; sr<SMALL_CHAR_HEIGHT; sr++){
    const rowStart = Math.max(0, Math.floor(sr * rowScale));
    let rowEnd = Math.ceil((sr + 1) * rowScale) - 1;
    if(rowEnd < rowStart) rowEnd = rowStart;
    if(rowEnd > 6) rowEnd = 6;
    let rowBits = '';
    for(let sc=0; sc<SMALL_CHAR_WIDTH; sc++){
      const colStart = Math.max(0, Math.floor(sc * colScale));
      let colEnd = Math.ceil((sc + 1) * colScale) - 1;
      if(colEnd < colStart) colEnd = colStart;
      if(colEnd > 4) colEnd = 4;
      let lit = false;
      for(let oc = colStart; oc <= colEnd && !lit; oc++){
        const colData = font5x7[idx][oc];
        for(let orow = rowStart; orow <= rowEnd; orow++){
          if(colData & (1 << orow)){
            lit = true;
            break;
          }
        }
      }
      rowBits += lit ? '1' : '0';
    }
    rows[sr] = rowBits;
  }

  smallGlyphCache.set(code, rows);
  return rows;
}

function buildHardwareIndexMaps(){
  const gridToHardware = new Array(NUM_PIXELS).fill(-1);
  const hardwareToGrid = new Array(NUM_PIXELS).fill(-1);
  for(let y=0; y<NUM_ROWS; y++){
    for(let x=0; x<NUM_COLS; x++){
      const gridIndex = y * NUM_COLS + x;
      const hardwareIndex = xyToHardwareIndex(x, y);
      if(hardwareIndex >= 0 && hardwareIndex < NUM_PIXELS){
        gridToHardware[gridIndex] = hardwareIndex;
        hardwareToGrid[hardwareIndex] = gridIndex;
      }
    }
  }
  return { gridToHardwareMap: gridToHardware, hardwareToGridMap: hardwareToGrid };
}

function xyToHardwareIndex(x, y){
  if(x < 0 || x >= NUM_COLS || y < 0 || y >= NUM_ROWS) return -1;
  let tx = x;
  let ty = y;
  if(PANEL_ROTATION === 2){
    tx = NUM_COLS - 1 - x;
    ty = NUM_ROWS - 1 - y;
  }
  if(PANEL_COLUMN_MAJOR){
    let column = tx;
    let row = ty;
    if(PANEL_SERPENTINE && (column % 2 === 1)) row = NUM_ROWS - 1 - row;
    return column * NUM_ROWS + row;
  }
  let row = ty;
  let column = tx;
  if(PANEL_SERPENTINE && (row % 2 === 1)) column = NUM_COLS - 1 - column;
  return row * NUM_COLS + column;
}

function cleanHexPayload(input){
  if(typeof input !== 'string') return '';
  return input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

function normalizeLyricScript(value){
  if(typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function rowMajorHexToHardware(hexData){
  const cleaned = cleanHexPayload(hexData);
  if(cleaned.length !== NUM_PIXELS * 6) return null;
  const buffer = new Array(NUM_PIXELS).fill('000000');
  for(let gridIndex=0; gridIndex<NUM_PIXELS; gridIndex++){
    const hardwareIndex = gridToHardwareMap[gridIndex];
    if(hardwareIndex < 0) continue;
    const start = gridIndex * 6;
    buffer[hardwareIndex] = cleaned.slice(start, start + 6);
  }
  return buffer.join('');
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function applyTextSpeedLocal(value){
  const clamped = clamp(Math.round(value), 1, 100);
  textSpeedPercent = clamped;
  if(textSpeedSlider && Number(textSpeedSlider.value) !== clamped){
    textSpeedSlider.value = String(clamped);
  }
  if(textSpeedValue){
    textSpeedValue.textContent = `${clamped}%`;
  }
  const slowDelay = 220;
  const fastDelay = 28;
  scrollDelayMs = slowDelay - ((slowDelay - fastDelay) * (clamped - 1) + 49) / 99;
  if(scrollDelayMs < 15) scrollDelayMs = 15;

  const slowPause = 520;
  const fastPause = 140;
  scrollPauseMs = slowPause - ((slowPause - fastPause) * (clamped - 1) + 49) / 99;
  if(scrollPauseMs < scrollDelayMs + 60) scrollPauseMs = scrollDelayMs + 60;
  marqueePreviewState.lastStepMs = previewElapsedMs;

  const slowLyric = 2100;
  const fastLyric = 650;
  lyricWordIntervalMs = slowLyric - ((slowLyric - fastLyric) * (clamped - 1) + 49) / 99;
  if(lyricWordIntervalMs < 300) lyricWordIntervalMs = 300;
  previewFrameAccumulator = 0;
  if(previewMode === 4 || previewMode === 25){
    computePreview(previewMode, previewFrameCounter);
    drawPreview();
  }
}

function scheduleTextSpeedCommand(value){
  clearTimeout(textSpeedDebounce);
  textSpeedDebounce = setTimeout(() => {
    sendCommand(`TEXTSPEED ${clamp(Math.round(value), 1, 100)}`);
  }, 220);
}

let port = null;
let writer = null;
let reader = null;
let usbDevice = null;
let usbInterfaceNumber = null;
let usbEndpointIn = null;
let usbEndpointOut = null;
let transportType = 'none';
let usbDisconnectListenerAttached = false;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let isConnected = false;
let brightnessDebounce = 0;

const gridColors = new Array(NUM_PIXELS).fill('#000000');
const pixelCells = new Array(NUM_PIXELS);
let brushColor = colorPicker ? colorPicker.value.toUpperCase() : '#FF3366';
let eraserMode = false;
let sampleMode = false;
let drawing = false;
let activePointerId = null;
let previewMode = null;
let previewPlaying = true;
let previewFrameCounter = 0;
let previewLastTimestamp = 0;
const previewPixels = new Array(NUM_PIXELS).fill('#000000');
let remoteQueue = [];
let remoteBusy = false;
let unlocked = false;
let backendHelmetUnlocked = null;
let remoteAccessActive = false;
let remoteAccessExpiresAt = 0;
let commandPollingActive = false;
let commandPollTimer = null;
let commandFetchInFlight = false;
let lastCommandFailureAt = 0;

const storageAvailable = (() => {
  try{
    const key = '__visor_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  }catch(err){
    return false;
  }
})();

const sessionUnlocked = (() => {
  try{
    return sessionStorage.getItem(SESSION_UNLOCK_KEY) === '1';
  }catch(err){
    return false;
  }
})();

let presets = {};

function transportReady(){
  if(transportType === 'webserial'){
    return Boolean(port && writer);
  }
  if(transportType === 'webusb'){
    return Boolean(usbDevice && usbEndpointOut != null);
  }
  return false;
}

async function writeToTransport(bytes){
  if(transportType === 'webserial'){
    if(!writer) throw new Error('Not connected');
    await writer.write(bytes);
    return;
  }
  if(transportType === 'webusb'){
    if(!usbDevice || usbEndpointOut == null) throw new Error('Not connected');
    await usbDevice.transferOut(usbEndpointOut, bytes);
    return;
  }
  throw new Error('Not connected');
}

function appendLog(message){
  if(!message) return;
  const lines = message.replace(/\r/g,'').split(/\n/);
  lines.forEach(line => {
    if(!line) return;
    logEl.textContent += line + '\n';
    if(line === 'REMOTE_UNLOCK_ACTIVE' || line === 'REMOTE_UNLOCK_EXTENDED'){
      markRemoteAccess(REMOTE_UNLOCK_WINDOW_MS);
      updateApiStatus('Remote command window active for 20 seconds.', true);
      syncBackendLockState(true);
      enqueueRemote({ type: 'telemetry', name: line });
      processBackendCommands();
    } else if(line === 'REMOTE_LOCKED'){
      clearRemoteAccess();
      updateApiStatus('Remote commands blocked. Press the hardware unlock button.', false);
      syncBackendLockState(false);
      enqueueRemote({ type: 'telemetry', name: line });
    } else if(line === 'LOCKED'){
      clearRemoteAccess();
    } else if(line.startsWith('PONG ')){
      handlePingLine(line);
    }
  });
  if(logEl.textContent.length > LOG_LIMIT){
    logEl.textContent = logEl.textContent.slice(-LOG_LIMIT);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

async function sendCommand(command){
  const trimmed = command.trim();
  if(!trimmed) return;
  const payload = trimmed + '\n';
  try{
    if(transportReady()){
      await writeToTransport(encoder.encode(payload));
    } else if(remoteOnly){
      appendLog(`[remote] ${trimmed}`);
    } else {
      appendLog('Not connected');
      return;
    }
    if(unlocked){
      const parts = trimmed.split(/\s+/);
      const commandName = parts[0] ? parts[0].toUpperCase() : '';
      if(commandName === 'LYRIC'){
        const nextLyric = trimmed.slice(commandName.length).trim();
        if(nextLyric){
          lyricScript = nextLyric;
          if(lyricInput) lyricInput.value = lyricScript;
          if(previewMode === 25){
            computePreview(previewMode, previewFrameCounter);
            drawPreview();
          }
        }
      }
      if(commandName === 'TEXT'){
        const nextText = trimmed.slice(commandName.length).trim();
        if(nextText) {
          currentText = nextText;
          textTransitionPreviewStart = performance.now();
          resetMarqueePreview();
          if(previewMode === 4){
            computePreview(previewMode, previewFrameCounter);
            drawPreview();
          }
        }
      }
      if(commandName === 'TEXTSPEED'){
        const nextSpeed = parseInt(parts[1], 10);
        if(!Number.isNaN(nextSpeed)){
          applyTextSpeedLocal(nextSpeed);
          marqueePreviewState.lastStepMs = previewElapsedMs;
        }
      }
      if(commandName === 'TEXTFX'){
        const nextMode = parts[1] || '0';
        selectedTextTransition = nextMode;
        if(textTransitionSelect) textTransitionSelect.value = nextMode;
        textTransitionPreviewStart = performance.now();
        if(previewMode === 4){
          computePreview(previewMode, previewFrameCounter);
          drawPreview();
        }
      }
      if(commandName === 'SWOOPCOLOR'){
        const left = normalizeHexColor(parts[1] || '');
        const right = normalizeHexColor(parts[2] || '');
        if(left){
          mirroredSwoopLeftHex = left;
          if(swoopLeftPicker) swoopLeftPicker.value = left;
        }
        if(right){
          mirroredSwoopRightHex = right;
          if(swoopRightPicker) swoopRightPicker.value = right;
        }
        if(previewMode === 3){
          computePreview(previewMode, previewFrameCounter);
          drawPreview();
        }
      }
      if(commandName === 'TEXTCOLOR'){
        const nextColor = parts[1] ? normalizeHexColor(parts[1]) : null;
        if(nextColor){
          applyTextColorLocal(nextColor);
        }
      }

      let remotePayload = null;
      if(commandName === 'FRAME'){
        const slot = parts[1] || '0';
        const hexPayload = parts.length >= 3 ? parts.slice(2).join('') : '';
        const cleaned = cleanHexPayload(hexPayload);
        remotePayload = {
          type: 'frame-upload',
          name: 'FRAME',
          slot,
          dataLength: cleaned.length,
          dataPreview: cleaned.length > 160 ? `${cleaned.slice(0, 160)}… (${cleaned.length} chars)` : cleaned,
          data: cleaned
        };
      } else if(commandName === 'CLEARFRAME'){
        const slot = parts[1] || '0';
        remotePayload = { type: 'frame-clear', name: 'CLEARFRAME', slot };
      } else if(commandName === 'SWOOPCOLOR'){
        remotePayload = { type:'command', name:'SWOOPCOLOR', data: parts.slice(1,3).join(' ') };
      } else if(commandName === 'PATTERN'){
        remotePayload = { type:'command', name:'PATTERN', data:parts.slice(1).join(' ') };
      } else if(['MODE','TEXT','BRIGHT','LYRIC','SHOWFRAME','TEXTSPEED','TEXTFX'].includes(commandName)){
        remotePayload = { type:'command', name:commandName, data:parts.slice(1).join(' ') };
      }

      if(remotePayload){
        enqueueRemote(remotePayload);
      }
    }
  }catch(err){
    appendLog('Send failed: ' + err.message);
  }
}

async function readSerialLoop(){
  while(port && port.readable){
    reader = port.readable.getReader();
    try{
      while(true){
        const {value, done} = await reader.read();
        if(done) break;
        if(value){
          appendLog(decoder.decode(value));
        }
      }
    }catch(err){
      appendLog('Read error: ' + err.message);
      break;
    }finally{
      if(reader){
        reader.releaseLock();
        reader = null;
      }
    }
  }
}

async function readUsbLoop(){
  if(!usbDevice || usbEndpointIn == null) return;
  try{
    while(usbDevice && transportType === 'webusb'){
      const result = await usbDevice.transferIn(usbEndpointIn, 256);
      if(result.status !== 'ok' || !result.data){
        if(result.status === 'stall' && usbDevice){
          try{
            await usbDevice.clearHalt('in', usbEndpointIn);
          }catch(err){
            appendLog('USB clearHalt failed: ' + err.message);
            break;
          }
        }
        continue;
      }
      const view = result.data;
      const chunk = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
      if(chunk.length){
        appendLog(decoder.decode(chunk));
      }
    }
  }catch(err){
    appendLog('Read error: ' + err.message);
  }
}

async function connect(){
  if(remoteOnly){
    appendLog('Remote-only mode – USB connection disabled.');
    return;
  }
  if(isConnected){
    await disconnect();
    return;
  }
  if(supportsWebUSB){
    const connected = await connectWebUSB();
    if(connected) return;
  }
  if(supportsWebSerial){
    await connectWebSerial();
    return;
  }
  appendLog('This browser does not support WebUSB or Web Serial.');
}

async function connectWebSerial(){
  if(!supportsWebSerial) return false;
  try{
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();
    transportType = 'webserial';
    isConnected = true;
    connectButton.textContent = 'Disconnect';
    connectButton.classList.remove('primary');
    appendLog('Connected to visor over Web Serial.');
    if(unlocked){
      enqueueRemote({ type:'connection', status:'connected', transport: 'webserial' });
    }
    readSerialLoop();
    port.addEventListener('disconnect', handleSerialDisconnect);
    return true;
  }catch(err){
    appendLog('Web Serial connection failed: ' + err.message);
    await disconnectWebSerial();
    return false;
  }
}

async function connectWebUSB(){
  try{
    usbDevice = await navigator.usb.requestDevice({ filters: WEBUSB_VENDOR_FILTERS });
  }catch(err){
    if(err && err.name === 'NotFoundError'){
      return false;
    }
    appendLog('WebUSB connection failed: ' + err.message);
    return false;
  }
  try{
    await usbDevice.open();
    if(usbDevice.configuration === null){
      await usbDevice.selectConfiguration(1);
    }
    const iface = usbDevice.configuration.interfaces.find(({ alternates }) =>
      alternates && alternates.some(entry => entry.interfaceClass === 0xff));
    if(!iface){
      throw new Error('WebUSB interface unavailable.');
    }
    const alternate = iface.alternates.find(entry => entry.interfaceClass === 0xff) || iface.alternates[0];
    await usbDevice.claimInterface(iface.interfaceNumber);
    await usbDevice.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting);
    const endpoints = alternate.endpoints || [];
    const inEndpoint = endpoints.find(endpoint => endpoint.direction === 'in');
    const outEndpoint = endpoints.find(endpoint => endpoint.direction === 'out');
    if(!inEndpoint || !outEndpoint){
      throw new Error('Missing WebUSB endpoints.');
    }
    usbInterfaceNumber = iface.interfaceNumber;
    usbEndpointIn = inEndpoint.endpointNumber;
    usbEndpointOut = outEndpoint.endpointNumber;
    await usbDevice.controlTransferOut({
      requestType: 'class',
      recipient: 'interface',
      request: 0x22,
      value: 0x01,
      index: usbInterfaceNumber
    });
    transportType = 'webusb';
    isConnected = true;
    connectButton.textContent = 'Disconnect';
    connectButton.classList.remove('primary');
    appendLog('Connected to visor over WebUSB.');
    if(unlocked){
      enqueueRemote({ type:'connection', status:'connected', transport: 'webusb' });
    }
    if(!usbDisconnectListenerAttached){
      navigator.usb.addEventListener('disconnect', handleUsbDisconnect);
      usbDisconnectListenerAttached = true;
    }
    readUsbLoop();
    return true;
  }catch(err){
    appendLog('WebUSB connection failed: ' + err.message);
    await disconnectWebUSB();
    return false;
  }
}

async function disconnect(){
  if(transportType === 'webserial'){
    await disconnectWebSerial();
  } else if(transportType === 'webusb'){
    await disconnectWebUSB();
  }
  finalizeDisconnect('Disconnected.');
}

async function disconnectWebSerial(){
  try{
    if(reader){
      await reader.cancel().catch(() => {});
    }
    if(writer){
      writer.releaseLock();
      writer = null;
    }
    if(port){
      port.removeEventListener('disconnect', handleSerialDisconnect);
      await port.close();
    }
  }catch(err){
    appendLog('Disconnect error: ' + err.message);
  }finally{
    port = null;
    reader = null;
    writer = null;
  }
}

async function disconnectWebUSB(){
  try{
    if(usbDevice){
      if(usbDevice.opened){
        if(usbInterfaceNumber != null){
          try{
            await usbDevice.releaseInterface(usbInterfaceNumber);
          }catch(err){
            // ignore release errors
          }
        }
        await usbDevice.close();
      }
    }
  }catch(err){
    appendLog('Disconnect error: ' + err.message);
  }finally{
    usbDevice = null;
    usbInterfaceNumber = null;
    usbEndpointIn = null;
    usbEndpointOut = null;
  }
}

function handleSerialDisconnect(){
  disconnectWebSerial().finally(() => finalizeDisconnect('Web Serial device disconnected.'));
}

function handleUsbDisconnect(event){
  if(!usbDevice || event.device !== usbDevice) return;
  disconnectWebUSB().finally(() => finalizeDisconnect('WebUSB device disconnected.'));
}

function finalizeDisconnect(message){
  transportType = 'none';
  isConnected = false;
  if(remoteOnly){
    connectButton.textContent = 'Remote Mode (USB disabled)';
    connectButton.classList.remove('primary');
  } else {
    connectButton.textContent = 'Connect Visor';
    connectButton.classList.add('primary');
  }
  appendLog(message);
  if(unlocked){
    enqueueRemote({ type:'connection', status:'disconnected' });
  }
  clearRemoteAccess();
}

function normalizeColor(color){
  if(!color) return '#000000';
  if(color[0] === '#'){
    if(color.length === 7) return color.toUpperCase();
    if(color.length === 4){
      return ('#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]).toUpperCase();
    }
  }
  const ctx = normalizeColor._ctx || (normalizeColor._ctx = document.createElement('canvas').getContext('2d'));
  ctx.fillStyle = '#000000';
  ctx.fillStyle = color;
  const computed = ctx.fillStyle;
  return /^#[0-9A-Fa-f]{6}$/.test(computed) ? computed.toUpperCase() : '#000000';
}

function setCellColor(index, color){
  if(index < 0 || index >= NUM_PIXELS) return;
  const cell = pixelCells[index];
  if(!cell) return;
  const normalized = normalizeColor(color);
  gridColors[index] = normalized;
  cell.style.backgroundColor = normalized;
  cell.classList.toggle('off', normalized === '#000000');
}

function buildGrid(){
  if(!pixelGrid) return;
  pixelGrid.innerHTML = '';
  pixelGrid.style.setProperty('--cols', NUM_COLS.toString());
  for(let y=0; y<NUM_ROWS; y++){
    for(let x=0; x<NUM_COLS; x++){
      const index = y * NUM_COLS + x;
      const cell = document.createElement('div');
      cell.className = 'pixel-cell off';
      cell.dataset.index = index.toString();
      pixelCells[index] = cell;
      pixelGrid.appendChild(cell);
      setCellColor(index, gridColors[index]);
    }
  }
}

function setEraserMode(enabled){
  eraserMode = enabled;
  if(toggleEraserBtn){
    toggleEraserBtn.classList.toggle('active', enabled);
    toggleEraserBtn.textContent = enabled ? 'Eraser On' : 'Eraser Off';
  }
  if(enabled){
    setSampleMode(false);
  }
}

function setSampleMode(enabled){
  sampleMode = enabled;
  if(sampleColorBtn){
    sampleColorBtn.classList.toggle('active', enabled);
    sampleColorBtn.textContent = enabled ? 'Eyedrop: Tap Grid' : 'Eyedrop';
  }
  if(enabled){
    setEraserMode(false);
  }
}

function applyBrush(index){
  if(index < 0 || index >= NUM_PIXELS) return;
  if(sampleMode){
    const picked = gridColors[index];
    brushColor = picked;
    if(colorPicker) colorPicker.value = picked.toLowerCase();
    setSampleMode(false);
    setEraserMode(false);
    return;
  }
  const color = eraserMode ? '#000000' : brushColor;
  setCellColor(index, color);
}

function clearGrid(){
  if(!requireUnlock()) return;
  for(let i=0; i<NUM_PIXELS; i++){
    setCellColor(i, '#000000');
  }
}

function fillGrid(){
  if(!requireUnlock()) return;
  for(let i=0; i<NUM_PIXELS; i++){
    setCellColor(i, brushColor);
  }
}

function frameToHex(){
  const buffer = new Array(NUM_PIXELS).fill('000000');
  for(let gridIndex=0; gridIndex<NUM_PIXELS; gridIndex++){
    const hardwareIndex = gridToHardwareMap[gridIndex];
    if(hardwareIndex < 0) continue;
    const color = (gridColors[gridIndex] || '#000000').replace('#', '');
    buffer[hardwareIndex] = color;
  }
  return buffer.join('').toUpperCase();
}

function applyFrame(hexData){
  const cleaned = cleanHexPayload(hexData);
  if(cleaned.length !== NUM_PIXELS * 6) return false;
  for(let ledIndex=0; ledIndex<NUM_PIXELS; ledIndex++){
    const start = ledIndex * 6;
    const segment = '#' + cleaned.slice(start, start + 6);
    const gridIndex = hardwareToGridMap[ledIndex];
    if(gridIndex < 0) continue;
    setCellColor(gridIndex, segment);
  }
  return true;
}

function loadPresets(){
  if(!storageAvailable) return {};
  try{
    const raw = localStorage.getItem(PRESET_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed === 'object'){
        if(parsed.__format === PRESET_STORAGE_FORMAT && parsed.entries && typeof parsed.entries === 'object'){
          return parsed.entries;
        }
        if(!parsed.__format){
          // legacy storage in the new slot without metadata; assume already hardware ordered
          return parsed;
        }
      }
    }
  }catch(err){
    appendLog('Preset load failed: ' + err.message);
  }

  // attempt legacy migration
  try{
    const legacyRaw = localStorage.getItem(LEGACY_PRESET_KEY);
    if(!legacyRaw) return {};
    const legacyParsed = JSON.parse(legacyRaw);
    if(legacyParsed && typeof legacyParsed === 'object'){
      const migrated = {};
      Object.entries(legacyParsed).forEach(([name, payload]) => {
        if(typeof payload !== 'string') return;
        const converted = rowMajorHexToHardware(payload);
        if(converted) migrated[name] = converted;
      });
      persistPresets(migrated);
      localStorage.removeItem(LEGACY_PRESET_KEY);
      appendLog('Migrated legacy presets to the updated visor layout.');
      return migrated;
    }
  }catch(err){
    appendLog('Legacy preset migration failed: ' + err.message);
  }
  return {};
}

function persistPresets(source = presets){
  if(!storageAvailable) return;
  try{
    const payload = {
      __format: PRESET_STORAGE_FORMAT,
      entries: source
    };
    localStorage.setItem(PRESET_KEY, JSON.stringify(payload));
  }catch(err){
    appendLog('Preset save failed: ' + err.message);
  }
}

function refreshPresetSelect(){
  if(!presetSelect) return;
  const currentValue = presetSelect.value;
  presetSelect.innerHTML = '<option value="">Load preset…</option>';
  const names = Object.keys(presets).sort((a,b)=>a.localeCompare(b));
  names.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    presetSelect.appendChild(option);
  });
  if(names.includes(currentValue)){
    presetSelect.value = currentValue;
  }
}

function savePreset(){
  if(!presetNameInput || !presetSelect) return;
  const name = presetNameInput.value.trim();
  if(!name){
    appendLog('Enter a preset name first.');
    return;
  }
  presets[name] = frameToHex();
  persistPresets();
  refreshPresetSelect();
  presetSelect.value = name;
  appendLog('Saved preset "' + name + '".');
}

function loadPreset(){
  if(!presetSelect || !presetNameInput) return;
  const name = presetSelect.value;
  if(!name){
    appendLog('Choose a preset to load.');
    return;
  }
  const data = presets[name];
  if(!applyFrame(data)){
    appendLog('Preset data invalid.');
    return;
  }
  presetNameInput.value = name;
  appendLog('Loaded preset "' + name + '" into editor.');
}

function deletePreset(){
  if(!presetSelect) return;
  const name = presetSelect.value;
  if(!name){
    appendLog('Select a preset to delete.');
    return;
  }
  delete presets[name];
  persistPresets();
  refreshPresetSelect();
  appendLog('Deleted preset "' + name + '".');
}

async function sendFrameToVisor(){
  if(!requireUnlock()) return;
  const hardwareAvailable = transportReady();
  if(!hardwareAvailable && !remoteOnly){
    appendLog('Connect to the visor before sending.');
    return;
  }
  const slot = frameSlotSelect ? (parseInt(frameSlotSelect.value, 10) || 0) : 0;
  const payload = frameToHex();
  await sendCommand('FRAME ' + slot + ' ' + payload);
  await sendCommand('MODE ' + (CUSTOM_MODE_BASE + slot));
  if(remoteOnly && !hardwareAvailable){
    appendLog('Queued frame upload for remote visor.');
  } else {
    appendLog('Sent frame to slot ' + (slot + 1) + ' and activated it.');
  }
}

async function previewFrameSlot(){
  if(!requireUnlock()) return;
  const hardwareAvailable = transportReady();
  if(!hardwareAvailable && !remoteOnly){
    appendLog('Connect to the visor before previewing.');
    return;
  }
  const slot = frameSlotSelect ? (parseInt(frameSlotSelect.value, 10) || 0) : 0;
  await sendCommand('SHOWFRAME ' + slot);
}

async function clearFrameSlotOnVisor(){
  if(!requireUnlock()) return;
  const hardwareAvailable = transportReady();
  if(!hardwareAvailable && !remoteOnly){
    appendLog('Connect to the visor before clearing a slot.');
    return;
  }
  const slot = frameSlotSelect ? (parseInt(frameSlotSelect.value, 10) || 0) : 0;
  await sendCommand('CLEARFRAME ' + slot);
  if(remoteOnly && !hardwareAvailable){
    appendLog('Queued clear command for slot ' + (slot + 1) + '.');
  } else {
    appendLog('Cleared slot ' + (slot + 1) + ' on the visor.');
  }
}

async function submitLyricScript(event){
  event.preventDefault();
  if(!requireUnlock()) return;
  if(!lyricInput){
    appendLog('Lyric input unavailable.');
    return;
  }
  const normalized = normalizeLyricScript(lyricInput.value);
  if(!normalized){
    appendLog('Enter lyric words before sending.');
    return;
  }
  lyricScript = normalized;
  lyricInput.value = lyricScript;
  const hardwareAvailable = transportReady();
  if(!hardwareAvailable && !remoteOnly){
    appendLog('Connect to the visor before sending lyrics.');
    if(previewMode === 25){
      computePreview(previewMode, previewFrameCounter);
      drawPreview();
    }
    return;
  }
  await sendCommand('LYRIC ' + lyricScript);
  appendLog(remoteOnly && !hardwareAvailable ? 'Queued lyric script update for remote visor.' : 'Lyric script updated.');
  if(previewMode === 25){
    computePreview(previewMode, previewFrameCounter);
    drawPreview();
  }
}

async function resetLyricScriptToDefault(){
  if(!requireUnlock()) return;
  lyricScript = DEFAULT_LYRIC_SCRIPT;
  if(lyricInput) lyricInput.value = lyricScript;
  const hardwareAvailable = transportReady();
  if(!hardwareAvailable && !remoteOnly){
    appendLog('Connect to the visor before resetting lyrics.');
    if(previewMode === 25){
      computePreview(previewMode, previewFrameCounter);
      drawPreview();
    }
    return;
  }
  await sendCommand('LYRIC ' + lyricScript);
  appendLog(remoteOnly && !hardwareAvailable ? 'Queued lyric reset for remote visor.' : 'Lyric script reset to default.');
  if(previewMode === 25){
    computePreview(previewMode, previewFrameCounter);
    drawPreview();
  }
}

function handlePointerDown(event){
  if(!requireUnlock()) return;
  const cell = event.target.closest('.pixel-cell');
  if(!cell) return;
  event.preventDefault();
  drawing = true;
  activePointerId = event.pointerId;
  const index = parseInt(cell.dataset.index, 10);
  applyBrush(index);
}

function handlePointerMove(event){
  if(!drawing || event.pointerId !== activePointerId) return;
  const element = document.elementFromPoint(event.clientX, event.clientY);
  if(!element) return;
  const cell = element.closest('.pixel-cell');
  if(!cell) return;
  const index = parseInt(cell.dataset.index, 10);
  applyBrush(index);
}

function endPointer(event){
  if(event && event.pointerId !== activePointerId) return;
  drawing = false;
  activePointerId = null;
}

function unlockPortal(fromStorage){
  if(unlocked) return;
  unlocked = true;
  if(authOverlay) authOverlay.classList.add('hidden');
  if(document.body) document.body.classList.remove('locked');
  if(passwordError) passwordError.textContent = '';
  try{
    if(!fromStorage){
      sessionStorage.setItem(SESSION_UNLOCK_KEY, '1');
    }
  }catch(err){
    // session storage unavailable, ignore
  }
  updateConnectionStatus();
  const online = navigator.onLine;
  updateApiStatus(online ? 'Awaiting visor command…' : 'Unlocked – offline', online);
  startCommandPolling();
}

function requireUnlock(){
  if(unlocked) return true;
  if(passwordError) passwordError.textContent = 'Unlock required before control.';
  if(authOverlay) authOverlay.classList.remove('hidden');
  if(passwordInput) passwordInput.focus();
  return false;
}

function wheelColor(pos){
  pos = 255 - (pos & 0xFF);
  if(pos < 85){
    return [ (255 - pos * 3) / 3, 0, (pos * 3) / 3 ];
  } else if(pos < 170){
    pos -= 85;
    return [0, (pos * 3) / 3, (255 - pos * 3) / 3];
  }
  pos -= 170;
  return [(pos * 3) / 3, (255 - pos * 3) / 3, 0];
}

function rgbToHex(r, g, b){
  const toHex = value => {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex){
  if(typeof hex !== 'string') return [0, 0, 0];
  const cleaned = hex.trim().replace('#', '');
  if(cleaned.length !== 6) return [0, 0, 0];
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if(Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [0, 0, 0];
  return [r, g, b];
}

function normalizeHexColor(input){
  if(typeof input !== 'string') return null;
  const cleaned = input.trim().replace('#', '').toUpperCase();
  if(cleaned.length !== 6) return null;
  if(/[^0-9A-F]/.test(cleaned)) return null;
  return `#${cleaned}`;
}

function seededRandom(seed){
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function markRemoteAccess(durationMs = REMOTE_UNLOCK_WINDOW_MS){
  remoteAccessActive = true;
  remoteAccessExpiresAt = Date.now() + Math.max(1000, durationMs);
}

function clearRemoteAccess(){
  remoteAccessActive = false;
  remoteAccessExpiresAt = 0;
}

function isRemoteWindowOpen(){
  if(!remoteAccessActive) return false;
  if(remoteAccessExpiresAt && Date.now() > remoteAccessExpiresAt){
    remoteAccessActive = false;
    remoteAccessExpiresAt = 0;
    return false;
  }
  return true;
}

function handlePingLine(line){
  const parts = line.trim().split(/\s+/);
  const statusToken = parts.length >= 3 ? String(parts[2]).toUpperCase() : '';
  if(statusToken === 'UNLOCKED'){
    markRemoteAccess(REMOTE_UNLOCK_WINDOW_MS);
  } else if(statusToken === 'LOCKED'){
    clearRemoteAccess();
  }
  const millisToken = parts.length >= 2 ? parseInt(parts[1], 10) : NaN;
  if(!Number.isNaN(millisToken)){
    updateApiStatus(`Ping response received (uptime ${millisToken} ms)`, true);
  } else {
    updateApiStatus('Ping response received from helmet', true);
  }
  enqueueRemote({ type: 'telemetry', name: 'PING', data: line });
  processBackendCommands();
}

function updateConnectionStatus(){
  if(!connectionStatus) return;
  if(navigator.onLine){
    const conn = navigator.connection;
    const detail = conn && conn.effectiveType ? ` (${conn.effectiveType})` : '';
    connectionStatus.textContent = `Online${detail}`;
    connectionStatus.classList.remove('muted');
  } else {
    connectionStatus.textContent = 'Offline – connect to Wi-Fi for remote sync and full previews.';
    connectionStatus.classList.add('muted');
  }
}

function updateApiStatus(message, ok){
  if(!apiStatus) return;
  apiStatus.textContent = message;
  if(ok){
    apiStatus.classList.remove('muted');
  } else {
    apiStatus.classList.add('muted');
  }
}

function resetMarqueePreview(){
  marqueePreviewState.sourceText = '';
  marqueePreviewState.charCount = 0;
  marqueePreviewState.totalScrollWidth = 0;
  marqueePreviewState.offset = 0;
  marqueePreviewState.lastStepMs = previewElapsedMs;
}

function updateCurrentTextDisplay(){
  if(!currentTextDisplay) return;
  const displayText = (currentText && currentText.trim().length) ? currentText : '—';
  currentTextDisplay.textContent = displayText;
}

function applyTextColorLocal(value){
  const normalized = normalizeHexColor(value);
  if(!normalized) return false;
  textColorHex = normalized;
  if(textColorPicker && textColorPicker.value !== normalized){
    textColorPicker.value = normalized;
  }
  textTransitionPreviewStart = performance.now();
  if(previewMode === 4){
    computePreview(previewMode, previewFrameCounter);
    drawPreview();
  }
  return true;
}

async function syncBackendLockState(unlockedState){
  if(typeof unlockedState !== 'boolean') return;
  if(!navigator.onLine) return;
  if(!API_UNLOCK_ENDPOINT) return;
  if(backendHelmetUnlocked === unlockedState) return;
  try{
    const response = await fetch(API_UNLOCK_ENDPOINT, {
      method: unlockedState ? 'POST' : 'DELETE',
      headers:{ 'Content-Type':'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok){
      throw new Error(payload.error || response.statusText);
    }
    backendHelmetUnlocked = unlockedState;
    if(unlockedState){
      updateApiStatus('Cloud unlock window synced', true);
    } else {
      updateApiStatus('Cloud lock restored', false);
    }
  }catch(err){
    backendHelmetUnlocked = null;
    console.error('Failed to sync backend lock state', err);
  }
}

function enqueueRemote(payload){
  remoteQueue.push(payload);
  if(remoteQueue.length > 24){
    remoteQueue.splice(0, remoteQueue.length - 24);
  }
  if(navigator.onLine){
    processRemoteQueue();
  } else {
    updateApiStatus('API pending – offline', false);
  }
}

function processRemoteQueue(){
  if(remoteBusy || remoteQueue.length === 0) return;
  if(!navigator.onLine){
    updateApiStatus('API paused – offline', false);
    return;
  }
  remoteBusy = true;
  const payload = remoteQueue.shift();
  fetch(API_STATUS_ENDPOINT, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ ...payload, timestamp:Date.now() })
  }).then(async response => {
    let body = {};
    try{
      body = await response.json();
    }catch(err){
      body = {};
    }
    if(!response.ok){
      const apiError = new Error(body.error || response.statusText || 'Request failed');
      apiError.status = response.status;
      throw apiError;
    }
    if(typeof body.locked === 'boolean'){
      backendHelmetUnlocked = !body.locked;
    }
    updateApiStatus('API sync OK', true);
  }).catch(err => {
    const status = err && err.status;
    if(status === 423){
      backendHelmetUnlocked = false;
      updateApiStatus('API locked – press helmet button', false);
    } else {
      const message = err && err.message ? err.message : 'Unknown error';
      updateApiStatus('API error: ' + message, false);
      if(payload.retry === undefined) payload.retry = 0;
      if(payload.retry < 2){
        payload.retry = (payload.retry || 0) + 1;
        remoteQueue.unshift(payload);
      }
    }
  }).finally(()=>{
    remoteBusy = false;
    if(remoteQueue.length) setTimeout(processRemoteQueue, 250);
  });
}

async function fetchBackendCommand(){
  if(!navigator.onLine) return null;
  try{
    const response = await fetch(API_COMMAND_NEXT_ENDPOINT, { method: 'GET', cache: 'no-store' });
    if(!response.ok){
      throw new Error(response.statusText || 'Failed to fetch commands');
    }
    const payload = await response.json().catch(() => ({}));
    if(payload && payload.command){
      return payload.command;
    }
  }catch(err){
    console.error('Command fetch failed', err);
  }
  return null;
}

async function acknowledgeBackendCommand(id, status){
  if(!id) return;
  if(!navigator.onLine) return;
  try{
    await fetch(API_COMMAND_ACK_ENDPOINT, {
      method: 'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ id, status })
    });
  }catch(err){
    console.error('Command acknowledgement failed', err);
  }
}

async function processBackendCommands(){
  if(commandFetchInFlight) return;
  if(!unlocked) return;
  if(!transportReady()) return;
  if(!isRemoteWindowOpen()) return;
  const now = Date.now();
  if(lastCommandFailureAt && now - lastCommandFailureAt < 2000) return;
  commandFetchInFlight = true;
  try{
    const command = await fetchBackendCommand();
    if(!command) return;
    const nameRaw = command.name != null ? String(command.name) : '';
    const commandName = nameRaw.trim();
    if(!commandName){
      await acknowledgeBackendCommand(command.id, 'invalid');
      return;
    }
    const dataRaw = command.data != null ? String(command.data) : '';
    const serialCommand = dataRaw.trim() ? `${commandName} ${dataRaw.trim()}` : commandName;
    try{
      await sendCommand(serialCommand);
      await acknowledgeBackendCommand(command.id, 'delivered');
      appendLog(`Executed backend command: ${serialCommand}`);
    }catch(err){
      appendLog('Backend command failed: ' + err.message);
      lastCommandFailureAt = Date.now();
    }
  }finally{
    commandFetchInFlight = false;
  }
}

function startCommandPolling(){
  if(remoteOnly) return;
  if(commandPollingActive) return;
  commandPollingActive = true;
  const tick = async () => {
    if(!commandPollingActive) return;
    try{
      await processBackendCommands();
    }finally{
      if(commandPollingActive){
        commandPollTimer = setTimeout(tick, 1500);
      }
    }
  };
  tick();
}

function stopCommandPolling(){
  commandPollingActive = false;
  if(commandPollTimer){
    clearTimeout(commandPollTimer);
    commandPollTimer = null;
  }
}

function setPreviewPixel(x, y, color){
  if(x < 0 || x >= NUM_COLS || y < 0 || y >= NUM_ROWS) return;
  previewPixels[y * NUM_COLS + x] = color;
}

function fillPreview(color){
  previewPixels.fill(color);
}

function previewSpeedForMode(mode){
  if(mode === 4){
    return PREVIEW_FRAME_INTERVAL / scrollDelayMs;
  }
  if(mode === 25){
    return 0.5 + (textSpeedPercent / 100) * 1.6;
  }
  return 1;
}

function renderCatPreview(eyesOpen, tipColor){
  const head = '#A36F4E';
  const muzzle = '#D9A07F';
  const earOuter = '#C58A6A';
  const earInner = '#F5B6CA';
  const outline = '#6F4D38';
  const eyeWhite = '#F8F8F8';
  const eyeClosed = '#3A3A40';
  const pupil = '#1E1E1E';
  const nose = '#FF9FB1';
  const whisker = '#FFE4D3';
  const tip = tipColor || '#FAD4E6';

  fillPreview('#000000');

  for(let y=0; y<=2; y++){
    for(let x=8 - y; x<=9 + y; x++) setPreviewPixel(x, y, earOuter);
    for(let x=22 - y; x<=23 + y; x++) setPreviewPixel(x, y, earOuter);
  }
  for(let y=1; y<=2; y++){
    for(let x=8 - (y - 1); x<=9 + (y - 1); x++) setPreviewPixel(x, y, earInner);
    for(let x=22 - (y - 1); x<=23 + (y - 1); x++) setPreviewPixel(x, y, earInner);
  }

  for(let y=2; y<NUM_ROWS; y++){
    let startX = 6;
    let endX = 25;
    if(y === 2){
      startX = 7;
      endX = 24;
    } else if(y >= 6){
      startX = 7;
      endX = 24;
    }
    for(let x=startX; x<=endX; x++){
      let color = head;
      if(y >= 5 && x >= 10 && x <= 21){
        color = muzzle;
      }
      setPreviewPixel(x, y, color);
    }
  }

  setPreviewPixel(6, 3, outline);
  setPreviewPixel(6, 4, outline);
  setPreviewPixel(25, 3, outline);
  setPreviewPixel(25, 4, outline);
  setPreviewPixel(7, 7, outline);
  setPreviewPixel(24, 7, outline);

  if(eyesOpen){
    for(let y=4; y<=5; y++){
      for(let x=11; x<=13; x++) setPreviewPixel(x, y, eyeWhite);
      for(let x=18; x<=20; x++) setPreviewPixel(x, y, eyeWhite);
    }
    setPreviewPixel(12, 4, pupil);
    setPreviewPixel(12, 5, pupil);
    setPreviewPixel(19, 4, pupil);
    setPreviewPixel(19, 5, pupil);
  } else {
    for(let x=11; x<=13; x++) setPreviewPixel(x, 4, eyeClosed);
    for(let x=18; x<=20; x++) setPreviewPixel(x, 4, eyeClosed);
  }

  setPreviewPixel(15, 5, nose);
  setPreviewPixel(16, 5, nose);
  setPreviewPixel(15, 6, nose);
  setPreviewPixel(16, 6, nose);

  for(let x=12; x<=19; x++) setPreviewPixel(x, 7, muzzle);

  setPreviewPixel(8, 5, whisker);
  setPreviewPixel(9, 5, whisker);
  setPreviewPixel(8, 6, whisker);
  setPreviewPixel(9, 6, whisker);
  setPreviewPixel(23, 5, whisker);
  setPreviewPixel(24, 5, whisker);
  setPreviewPixel(23, 6, whisker);
  setPreviewPixel(24, 6, whisker);

  setPreviewPixel(8, 0, tip);
  setPreviewPixel(9, 0, tip);
  setPreviewPixel(22, 0, tip);
  setPreviewPixel(23, 0, tip);
}

function computePreview(mode, frame){
  const f = frame;
  switch(mode){
    case 0: { // smoothRainbow
      for(let y=0; y<NUM_ROWS; y++){
        const rowMod = 0.65 + 0.35 * Math.sin((y * 0.55) + f * 0.2);
        for(let x=0; x<NUM_COLS; x++){
          const hue = (x * 256 / NUM_COLS + f) & 0xFF;
          const rgb = wheelColor(hue);
          setPreviewPixel(x, y, rgbToHex(rgb[0] * rowMod, rgb[1] * rowMod, rgb[2] * rowMod));
        }
      }
      break;
    }
    case 1: { // rainbowSweep
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          const hue = (x * 256 / NUM_COLS + f * 2 + y * 12) & 0xFF;
          const rgb = wheelColor(hue);
          const dim = 0.9 - (y * 0.05);
          setPreviewPixel(x, y, rgbToHex(rgb[0] * dim, rgb[1] * dim, rgb[2] * dim));
        }
      }
      break;
    }
    case 2: { // swoopEffect
      fillPreview('#000010');
      const pos = Math.abs(((f % (NUM_COLS * 2)) - NUM_COLS));
      for(let i=0; i<8; i++){
        const x = pos + i - 8;
        if(x < 0 || x >= NUM_COLS) continue;
        for(let y=0; y<NUM_ROWS; y++){
          const r = 0;
          const g = 50;
          const b = Math.max(0, 255 - y * 30);
          setPreviewPixel(x, y, rgbToHex(r, g, b));
        }
      }
      break;
    }
    case 3: { // mirroredSwoop
      fillPreview('#000010');
      const width = 6;
      const maxPos = Math.max(1, NUM_COLS/2 - width);
      const raw = Math.abs(((f % (maxPos * 2)) - maxPos));
      const leftRgb = hexToRgb(mirroredSwoopLeftHex);
      const rightRgb = hexToRgb(mirroredSwoopRightHex);
      for(let i=0; i<width; i++){
        const leftX = raw + i;
        const rightX = NUM_COLS - 1 - (raw + i);
        for(let y=0; y<NUM_ROWS; y++){
          const factor = Math.max(0, 255 - y * 20) / 255;
          setPreviewPixel(leftX, y, rgbToHex(leftRgb[0] * factor, leftRgb[1] * factor, leftRgb[2] * factor));
          setPreviewPixel(rightX, y, rgbToHex(rightRgb[0] * factor, rightRgb[1] * factor, rightRgb[2] * factor));
        }
      }
      break;
    }
    case 4: { // scrollingText
      fillPreview('#050008');
      const safeText = (currentText && currentText.trim().length) ? currentText : ' ';
      const chars = safeText.split('');
      const charCount = chars.length;
      const glyphWidth = bigCharWidth;
      const glyphHeight = 7;
      const glyphSpacing = bigSpacing;
      const totalWidth = charCount ? (charCount * (glyphWidth + glyphSpacing) - glyphSpacing) : 0;
      const yOffset = Math.max(0, Math.floor((NUM_ROWS - glyphHeight) / 2));

      const nowMs = performance.now();
      const elapsed = textTransitionPreviewStart ? (nowMs - textTransitionPreviewStart) : previewElapsedMs;
      let transitionScale = 1;
      switch(selectedTextTransition){
        case '1': {
          const duration = 1200;
          if(elapsed < duration){
            transitionScale = ((Math.floor(elapsed / 120) % 2) === 0) ? 1 : 0;
          }
          break;
        }
        case '2': {
          const duration = 900;
          if(elapsed < duration){
            transitionScale = Math.max(0.05, Math.min(1, elapsed / duration));
          }
          break;
        }
        case '3': {
          const duration = 2200;
          if(elapsed < duration){
            const phase = elapsed / 160;
            transitionScale = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(phase));
          }
          break;
        }
        default:
          transitionScale = 1;
      }

      const baseRgb = hexToRgb(textColorHex);
      const scaledR = baseRgb[0] * transitionScale;
      const scaledG = baseRgb[1] * transitionScale;
      const scaledB = baseRgb[2] * transitionScale;
      const staticColor = rgbToHex(scaledR, scaledG, scaledB);
      const scrollColor = rgbToHex(scaledR * 0.85, scaledG * 0.85, scaledB * 0.85);

      if(charCount && totalWidth <= NUM_COLS){
        const startX = Math.max(0, Math.floor((NUM_COLS - totalWidth) / 2));
        for(let i=0; i<charCount; i++){
          const glyph = getBigGlyphRows(chars[i]);
          for(let row=0; row<glyph.length; row++){
            const pattern = glyph[row];
            for(let col=0; col<glyphWidth; col++){
              if(pattern[col] === '1'){
                const px = startX + i * (glyphWidth + glyphSpacing) + col;
                const py = yOffset + row;
                setPreviewPixel(px, py, staticColor);
              }
            }
          }
        }
        break;
      }

      const charPeriod = glyphWidth + SCROLL_CHAR_SPACING;
      const totalScrollWidth = charCount * charPeriod;
      if(totalScrollWidth <= 0) break;

      const state = marqueePreviewState;
      if(state.sourceText !== safeText || state.charCount !== charCount){
        state.sourceText = safeText;
        state.charCount = charCount;
        state.totalScrollWidth = totalScrollWidth;
        state.offset = 0;
        state.lastStepMs = previewElapsedMs;
      } else if(state.totalScrollWidth !== totalScrollWidth){
        state.totalScrollWidth = totalScrollWidth;
        if(totalScrollWidth > 0){
          state.offset %= totalScrollWidth;
        } else {
          state.offset = 0;
        }
        state.lastStepMs = previewElapsedMs;
      }

      if(previewElapsedMs < state.lastStepMs){
        state.lastStepMs = previewElapsedMs;
      }

      let offsetPixels = state.offset;
      let lastStepMs = state.lastStepMs;
      let stepDelay = (offsetPixels % charPeriod === 0) ? scrollPauseMs : scrollDelayMs;
      while((previewElapsedMs - lastStepMs) >= stepDelay && totalScrollWidth > 0){
        lastStepMs += stepDelay;
        offsetPixels = (offsetPixels + 1) % totalScrollWidth;
        stepDelay = (offsetPixels % charPeriod === 0) ? scrollPauseMs : scrollDelayMs;
      }
      state.offset = offsetPixels;
      state.lastStepMs = lastStepMs;

      const baseX = NUM_COLS - offsetPixels;
      for(let i=0; i<charCount; i++){
        const glyph = getBigGlyphRows(chars[i]);
        const primaryX = baseX + i * charPeriod;
        const positions = [primaryX, primaryX + totalScrollWidth, primaryX - totalScrollWidth];
        for(let row=0; row<glyph.length; row++){
          const pattern = glyph[row];
          if(pattern.indexOf('1') === -1) continue;
          const py = yOffset + row;
          for(let col=0; col<glyphWidth; col++){
            if(pattern[col] !== '1') continue;
            for(let p=0; p<positions.length; p++){
              const drawX = positions[p] + col;
              if(drawX < 0 || drawX >= NUM_COLS) continue;
              setPreviewPixel(drawX, py, scrollColor);
            }
          }
        }
      }
      break;
    }
    case 5: { // imageMode cycle
      const galleryModes = [0, 8, 10, 13, 14, 16];
      const pick = galleryModes[f % galleryModes.length];
      computePreview(pick, f);
      break;
    }
    case 6: { // colorWipe
      fillPreview('#000000');
      const x = f % NUM_COLS;
      const phase = Math.floor(f / NUM_COLS) % 4;
      let color = [255,0,0];
      if(phase === 1) color = [0,255,0];
      if(phase === 2) color = [0,0,255];
      if(phase === 3) color = [255,255,255];
      for(let y=0; y<NUM_ROWS; y++) setPreviewPixel(x, y, rgbToHex(...color));
      break;
    }
    case 7: { // theaterChase
      fillPreview('#000005');
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          if(((y*NUM_COLS + x + f) % 3) === 0){
            setPreviewPixel(x, y, '#b0b0b0');
          }
        }
      }
      break;
    }
    case 8: { // plasma
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          let v = 0;
          v += Math.sin((x + f) * 0.15);
          v += Math.sin((y + f) * 0.13);
          v += Math.sin((x + y + f) * 0.11);
          const colorIndex = ((v + 3) * 42.5) & 255;
          const rgb = wheelColor(colorIndex);
          setPreviewPixel(x, y, rgbToHex(...rgb));
        }
      }
      break;
    }
    case 9: { // sparkle
      fillPreview('#050505');
      for(let i=0; i<20; i++){
        const seed = (f * 31 + i * 17);
        const x = Math.floor(seededRandom(seed) * NUM_COLS);
        const y = Math.floor(seededRandom(seed + 1) * NUM_ROWS);
        setPreviewPixel(x, y, '#ffffcc');
      }
      break;
    }
    case 10: { // waveGradient
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          const wave = Math.sin((x + f) * 0.22) + Math.cos((y * 0.55) + f * 0.08);
          let level = (wave + 2) * 0.25;
          level = Math.max(0.05, Math.min(1, level));
          const hue = (f * 3 + y * 18) & 0xFF;
          const rgb = wheelColor(hue);
          setPreviewPixel(x, y, rgbToHex(rgb[0] * level, rgb[1] * level, rgb[2] * level));
        }
      }
      break;
    }
    case 11: { // cometStream
      fillPreview('#000006');
      for(let i=0; i<NUM_ROWS; i++){
        const x = (f + i * 3) % NUM_COLS;
        const hue = (f * 2 + i * 10) & 0xFF;
        const rgb = wheelColor(hue);
        for(let trail=0; trail<4; trail++){
          const tx = (x - trail + NUM_COLS) % NUM_COLS;
          const fade = Math.pow(0.7, trail);
          setPreviewPixel(tx, i, rgbToHex(rgb[0]*fade, rgb[1]*fade, rgb[2]*fade));
        }
      }
      break;
    }
    case 12: { // blinkingEyes
      fillPreview('#030012');
      const open = Math.floor(f / 20) % 2 === 0;
      const centers = [8, 23];
      centers.forEach(cx => {
        for(let y=-3; y<=3; y++){
          for(let x=-3; x<=3; x++){
            const dx = cx + x;
            const dy = 4 + y;
            const dist = Math.sqrt(x*x + y*y);
            if(dist <= 3.2){
              setPreviewPixel(dx, dy, '#f6f6ff');
            }
            if(open && dist <= 1.4){
              setPreviewPixel(dx, dy, '#000000');
            }
            if(!open && y > 0){
              setPreviewPixel(dx, dy, '#d08928');
            }
          }
        }
      });
      break;
    }
    case 13: { // daftPunkScanLines
      fillPreview('#2a0005');
      const head = Math.abs(((f * 0.8) % (NUM_COLS * 2)) - NUM_COLS);
      for(let x=0; x<NUM_COLS; x++){
        const dist = Math.abs(x - head);
        const falloff = Math.max(0, 1 - dist / 4);
        for(let y=0; y<NUM_ROWS; y++){
          const rowPulse = 0.55 + 0.45 * Math.sin((f * 0.25) + y * 0.9);
          const brightness = falloff * rowPulse;
          const red = 40 + brightness * 215;
          const green = brightness * 35;
          const blue = brightness * 80;
          setPreviewPixel(x, y, rgbToHex(red, green, blue));
        }
      }
      break;
    }
    case 14: { // daftPunkPulseGrid
      fillPreview('#200000');
      const bandWidth = 4;
      for(let bandStart=0; bandStart<NUM_COLS; bandStart += bandWidth){
        const bandPhase = f * 0.08 + bandStart * 0.45;
        const amplitude = (Math.sin(bandPhase) + 1) * 0.5;
        const barHeight = 1 + amplitude * (NUM_ROWS - 1);
        for(let x=0; x<bandWidth && (bandStart + x) < NUM_COLS; x++){
          for(let y=0; y<NUM_ROWS; y++){
            const distanceFromBottom = NUM_ROWS - 1 - y;
            const fill = barHeight - distanceFromBottom;
            if(fill <= 0) continue;
            let intensity = Math.min(1, fill);
            const spark = 0.5 + 0.5 * Math.sin(f * 0.12 + (bandStart + x) * 0.7 + y * 0.9);
            let brightness = 0.3 + intensity * 0.6 + spark * 0.25;
            brightness = Math.min(1, brightness);
            const red = 255 * brightness;
            const green = 40 * intensity;
            const blue = 20 * (1 - intensity);
            setPreviewPixel(bandStart + x, y, rgbToHex(red, green, blue));
          }
        }
      }
      break;
    }
    case 15: { // cyberPulseMesh
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          const wave = Math.sin((x * 0.45) + f * 0.08) + Math.cos((y * 0.55) + f * 0.06);
          let glow = (wave + 2) * 0.25;
          glow = Math.min(1, Math.max(0, glow));
          let blue = 180 + glow * 60;
          let green = 40 + glow * 100;
          let red = glow * 80;
          if(((x + Math.floor(f / 3)) % 6 === 0) || ((y + Math.floor(f / 4)) % 4 === 0)){
            red = Math.min(255, red + 40);
            green = Math.min(255, green + 60);
            blue = Math.min(255, blue + 30);
          }
          setPreviewPixel(x, y, rgbToHex(red, green, blue));
        }
      }
      break;
    }
    case 16: { // neonCircuitSurge
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          const columnPhase = Math.sin((x * 0.35) + f * 0.08);
          const rowPhase = Math.cos((y * 0.5) + f * 0.05);
          let surge = (columnPhase + rowPhase + 2) * 0.25;
          surge = Math.min(1, Math.max(0.05, surge));
          const conduit = ((x + y + Math.floor(f / 4)) % 5) === 0;
          const accent = conduit ? 1 : surge;
          let red = accent * 120;
          let green = surge * 200 + (conduit ? 40 : 0);
          let blue = surge * 255;
          if(conduit) blue = 255;
          if(((x * y) + f) % 53 === 0){ red = 255; green = 120; blue = 40; }
          setPreviewPixel(x, y, rgbToHex(red, green, blue));
        }
      }
      break;
    }
    case 17: { // glitchRain
      fillPreview('#120010');
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          const fade = Math.pow(0.6, (f - y + x + 64) / 10);
          if(fade < 0.02) continue;
          const red = 60 * fade;
          const blue = 80 * fade;
          setPreviewPixel(x, y, rgbToHex(red, 0, blue));
        }
      }
      for(let s=0; s<5; s++){
        const seed = f * 13 + s * 17;
        const column = Math.floor(seededRandom(seed) * NUM_COLS);
        const length = 2 + Math.floor(seededRandom(seed+1) * NUM_ROWS);
        for(let k=0; k<length; k++){
          const row = (NUM_ROWS - 1 - ((f + k) % NUM_ROWS));
          setPreviewPixel(column, row, '#ff48d0');
        }
      }
      break;
    }
    case 18: { // vectorTunnel
      const centerX = (NUM_COLS - 1) * 0.5;
      const centerY = (NUM_ROWS - 1) * 0.5;
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          const dx = (x - centerX) / NUM_COLS;
          const dy = (y - centerY) / NUM_ROWS;
          let dist = Math.sqrt(dx*dx + dy*dy);
          dist = Math.max(0.001, dist);
          const angle = Math.atan2(dy, dx);
          const ripple = Math.sin(angle * 3.5 + f * 0.16);
          let depth = ((dist * 3.5) - f * 0.04) % 1;
          if(depth < 0) depth += 1;
          const fade = 1 - Math.min(1, dist * 1.45);
          let brightness = fade * (0.45 + 0.55 * (0.5 + 0.5 * ripple));
          const coolBlend = depth * depth;
          const red = Math.min(255, brightness * (80 + coolBlend * 140));
          const green = Math.min(255, brightness * (30 + (1 - coolBlend) * 120));
          const blue = Math.min(255, brightness * 255);
          setPreviewPixel(x, y, rgbToHex(red, green, blue));
        }
      }
      break;
    }
    case 19:
    case 20:
    case 21: {
      const slot = mode - 19;
      for(let i=0; i<NUM_PIXELS; i++){
        previewPixels[i] = gridColors[i] || '#000000';
      }
      break;
    }
    case 22: { // tvStatic
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          const seed = f * 17 + y * 31 + x * 13;
          const grain = 32 + seededRandom(seed) * 220;
          const tint = seededRandom(seed + 1) * 40;
          let r = grain;
          let g = grain;
          let b = grain + tint;
          if(Math.floor(seededRandom(seed + 2) * 100) === 0){
            r = 255; g = 80; b = 80;
          }
          setPreviewPixel(x, y, rgbToHex(r, g, b));
        }
      }
      break;
    }
    case 23: { // tvTestPattern
      const topBars = [
        '#b4b4b4','#b4b400','#00b4b4','#00b400','#b400b4','#b40000','#0000b4'
      ];
      const bottom = ['#282828','#e6e6e6','#282828','#b4b400'];
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          if(y < NUM_ROWS - 2){
            const segment = Math.min(6, Math.floor(x * 7 / NUM_COLS));
            setPreviewPixel(x, y, topBars[segment]);
          }else{
            const segment = Math.min(3, Math.floor((x + (y === NUM_ROWS - 1 ? f % 5 : 0)) * 4 / NUM_COLS));
            setPreviewPixel(x, y, bottom[segment]);
          }
        }
      }
      const scanY = f % NUM_ROWS;
      for(let x=0; x<NUM_COLS; x+=2){
        setPreviewPixel(x, scanY, '#ffffff');
      }
      break;
    }
    case 24: { // crtHud
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          const grid = ((x % 4 === 0) || (y % 2 === 0)) ? 1 : 0.35;
          const sweep = 0.35 + 0.65 * Math.sin(f * 0.12 + x * 0.3 + y * 0.6);
          let brightness = 0.1 + grid * 0.4 + 0.2 * sweep;
          if(((Math.floor(f / 4)) % NUM_ROWS) === y){ brightness += 0.25; }
          brightness = Math.min(1, brightness);
          const green = brightness * 255;
          const blue = brightness * 70;
          setPreviewPixel(x, y, rgbToHex(0, green, blue));
        }
      }
      const recordOn = Math.floor(f / 8) % 2 === 0;
      for(let y=0; y<2; y++){
        for(let x=0; x<3; x++){
          setPreviewPixel(x, y, recordOn ? '#ff4a4a' : '#3a1111');
        }
      }
      for(let x=NUM_COLS-6; x<NUM_COLS-1; x++){
        setPreviewPixel(x, 0, '#1ec3ff');
      }
      break;
    }
    case 25: { // aroundWorldLyric
      fillPreview('#080018');
      for(let y=0; y<NUM_ROWS; y++){
        for(let x=0; x<NUM_COLS; x++){
          const wave = Math.sin((x + f) * 0.16) + Math.cos((y * 0.8) + f * 0.05);
          let level = (wave + 2) * 0.25;
          level = Math.min(1, Math.max(0.05, level));
          const hue = (f * 3 + x * 6 + y * 12) & 0xFF;
          const rgb = wheelColor(hue);
          setPreviewPixel(x, y, rgbToHex(rgb[0]*level, rgb[1]*level, rgb[2]*level));
        }
      }
  const words = lyricScript.split(/\s+/).filter(Boolean);
  const timeMs = previewElapsedMs;
  const lyricIndex = words.length ? Math.floor(timeMs / lyricWordIntervalMs) % words.length : 0;
  const baseWord = words.length ? words[lyricIndex] : 'AROUND';
      const word = baseWord.toUpperCase();
      const letters = word.length;
      const totalWidth = letters ? letters * (bigCharWidth + bigSpacing) - bigSpacing : 0;
      const startX = Math.max(0, Math.floor((NUM_COLS - Math.min(NUM_COLS, totalWidth)) / 2));
      const yOffset = Math.max(0, Math.floor((NUM_ROWS - 7) / 2));
      for(let i=0; i<letters; i++){
        const hue = (f * 4 + i * 40) & 0xFF;
        const rgb = wheelColor(hue);
        const color = rgbToHex(rgb[0], rgb[1], rgb[2]);
        const glyph = getBigGlyphRows(word[i]);
        for(let row=0; row<glyph.length; row++){
          const pattern = glyph[row];
          for(let col=0; col<bigCharWidth; col++){
            if(pattern[col] === '1'){
              const px = startX + i * (bigCharWidth + bigSpacing) + col;
              const py = yOffset + row;
              setPreviewPixel(px, py, color);
            }
          }
        }
      }
      break;
    }
    case 26: { // cat ears idle
      const tipColor = frame % 120 < 60 ? '#FAD4E6' : '#F5B6CA';
      renderCatPreview(true, tipColor);
      break;
    }
    case 27: { // cat ears blink
      const cycle = frame % 160;
      const eyesOpen = !(cycle > 120 && cycle < 140);
      const tipColor = cycle % 80 < 40 ? '#F1CDE0' : '#E8B8D6';
      renderCatPreview(eyesOpen, tipColor);
      if(!eyesOpen){
        for(let x=11; x<=13; x++) setPreviewPixel(x, 5, '#C08BB4');
        for(let x=18; x<=20; x++) setPreviewPixel(x, 5, '#C08BB4');
      }
      break;
    }
    case 28: { // lyric visualizer alias
      computePreview(25, frame);
      break;
    }
    default:
      fillPreview('#000000');
  }
}

function drawPreview(){
  if(!previewCtx || !previewCanvas) return;
  const cellWidth = previewCanvas.width / NUM_COLS;
  const cellHeight = previewCanvas.height / NUM_ROWS;
  for(let y=0; y<NUM_ROWS; y++){
    for(let x=0; x<NUM_COLS; x++){
      previewCtx.fillStyle = previewPixels[y * NUM_COLS + x];
      previewCtx.fillRect(x * cellWidth, y * cellHeight, cellWidth + 0.5, cellHeight + 0.5);
    }
  }
}

function animatePreview(timestamp){
  if(!previewLastTimestamp) previewLastTimestamp = timestamp;
  const delta = timestamp - previewLastTimestamp;
  const frameInterval = PREVIEW_FRAME_INTERVAL;
  if(delta > frameInterval){
    previewLastTimestamp = timestamp;
    if(previewMode !== null){
      if(previewPlaying){
        previewElapsedMs += delta;
        const speed = previewSpeedForMode(previewMode);
  const normalized = delta / frameInterval;
        previewFrameAccumulator += Math.max(0.01, speed) * normalized;
        const steps = Math.floor(previewFrameAccumulator);
        if(steps > 0){
          previewFrameAccumulator -= steps;
          previewFrameCounter += steps;
        }
      }
      if(!previewPlaying){
        previewLastTimestamp = timestamp;
      }
      computePreview(previewMode, previewFrameCounter);
    }
  }
  drawPreview();
  requestAnimationFrame(animatePreview);
}

function startPreview(mode){
  previewMode = mode;
  previewFrameCounter = 0;
  previewLastTimestamp = 0;
  previewFrameAccumulator = 0;
  previewElapsedMs = 0;
  resetMarqueePreview();
  if(previewLabel){
    const labels = {
      0:'Smooth Rainbow', 1:'Rainbow Sweep', 2:'Swoop Effect', 3:'Mirrored Swoop',
      4:'Scrolling Text', 5:'Gallery Cycle', 6:'Color Wipe', 7:'Theater Chase',
      8:'Plasma', 9:'Sparkle', 10:'Wave Gradient', 11:'Comet Stream',
      12:'Blinking Eyes', 13:'Daft Scan', 14:'Daft Pulse', 15:'Cyber Mesh',
      16:'Neon Surge', 17:'Glitch Rain', 18:'Vector Tunnel', 19:'Custom Slot 1',
      20:'Custom Slot 2', 21:'Custom Slot 3', 22:'TV Static', 23:'TV Test Screen',
      24:'CRT HUD', 25:'Lyric Visualizer'
    };
    previewLabel.textContent = labels[mode] || `Mode ${mode}`;
  }
  if(previewMode !== null){
    computePreview(previewMode, previewFrameCounter);
    drawPreview();
  }
}

connectButton.addEventListener('click', ()=>{
  if(!requireUnlock()) return;
  if(isConnected){
    disconnect();
  }else{
    connect();
  }
});

if(pingButton){
  pingButton.addEventListener('click', () => {
    if(!requireUnlock()) return;
    if(!transportReady()){
      appendLog(remoteOnly ? 'Ping requires a local USB connection.' : 'Not connected');
      return;
    }
    updateApiStatus('Sending ping…', true);
    sendCommand('PING');
  });
}

modeButtons.addEventListener('click', event => {
  const target = event.target;
  if(target.tagName !== 'BUTTON') return;
  if(!requireUnlock()) return;
  const mode = target.getAttribute('data-mode');
  if(mode !== null){
    const numeric = parseInt(mode, 10);
    if(Number.isFinite(numeric)){
      startPreview(numeric);
      modeButtons.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn === target));
    }
    sendCommand('MODE ' + mode);
  }
});

textForm.addEventListener('submit', event => {
  event.preventDefault();
  if(!requireUnlock()) return;
  const value = textInput.value.trim();
  if(!value){
    appendLog('Enter text first.');
    return;
  }
  currentText = value;
  updateCurrentTextDisplay();
  resetMarqueePreview();
  if(previewMode === 4){
    computePreview(previewMode, previewFrameCounter);
    drawPreview();
  }
  sendCommand('TEXT ' + value);
  textInput.value = '';
});

brightnessSlider.addEventListener('input', () => {
  if(!requireUnlock()) return;
  const value = brightnessSlider.value;
  brightnessValue.textContent = value;
  clearTimeout(brightnessDebounce);
  brightnessDebounce = setTimeout(() => {
    sendCommand('BRIGHT ' + value);
  }, 180);
});

applyTextSpeedLocal(textSpeedPercent);

if(lyricInput) lyricInput.value = lyricScript;
if(textTransitionSelect) textTransitionSelect.value = selectedTextTransition;
if(textColorPicker) textColorPicker.value = textColorHex;
if(swoopLeftPicker) swoopLeftPicker.value = mirroredSwoopLeftHex;
if(swoopRightPicker) swoopRightPicker.value = mirroredSwoopRightHex;
updateCurrentTextDisplay();

if(textSpeedSlider){
  textSpeedSlider.addEventListener('input', () => {
    if(!requireUnlock()){
      applyTextSpeedLocal(textSpeedPercent);
      return;
    }
    const value = Number(textSpeedSlider.value) || textSpeedPercent;
    applyTextSpeedLocal(value);
    scheduleTextSpeedCommand(value);
  });
}

if(textTransitionSelect){
  textTransitionSelect.addEventListener('change', () => {
    if(!requireUnlock()){
      textTransitionSelect.value = selectedTextTransition;
      return;
    }
    const value = textTransitionSelect.value || '0';
    selectedTextTransition = value;
    textTransitionPreviewStart = performance.now();
    sendCommand('TEXTFX ' + value);
  });
}

if(textColorPicker){
  textColorPicker.addEventListener('change', () => {
    if(!requireUnlock()){
      textColorPicker.value = textColorHex;
      return;
    }
    const normalized = normalizeHexColor(textColorPicker.value);
    if(!normalized){
      appendLog('Invalid color format.');
      textColorPicker.value = textColorHex;
      return;
    }
    if(normalized === textColorHex) return;
    applyTextColorLocal(normalized);
    sendCommand('TEXTCOLOR ' + normalized.slice(1));
  });
}

function sendSwoopColorUpdate(){
  const leftHex = normalizeHexColor(mirroredSwoopLeftHex) || '#00B4FF';
  const rightHex = normalizeHexColor(mirroredSwoopRightHex) || '#FFB400';
  mirroredSwoopLeftHex = leftHex;
  mirroredSwoopRightHex = rightHex;
  if(swoopLeftPicker) swoopLeftPicker.value = leftHex;
  if(swoopRightPicker) swoopRightPicker.value = rightHex;
  const left = leftHex.slice(1);
  const right = rightHex.slice(1);
  sendCommand(`SWOOPCOLOR ${left} ${right}`);
  if(previewMode === 3){
    computePreview(3, previewFrameCounter);
    drawPreview();
  }
}

if(swoopLeftPicker){
  swoopLeftPicker.addEventListener('change', () => {
    if(!requireUnlock()){
      swoopLeftPicker.value = mirroredSwoopLeftHex;
      return;
    }
    const normalized = normalizeHexColor(swoopLeftPicker.value);
    if(!normalized){
      appendLog('Invalid color format.');
      swoopLeftPicker.value = mirroredSwoopLeftHex;
      return;
    }
    mirroredSwoopLeftHex = normalized;
    swoopLeftPicker.value = normalized;
    sendSwoopColorUpdate();
  });
}

if(swoopRightPicker){
  swoopRightPicker.addEventListener('change', () => {
    if(!requireUnlock()){
      swoopRightPicker.value = mirroredSwoopRightHex;
      return;
    }
    const normalized = normalizeHexColor(swoopRightPicker.value);
    if(!normalized){
      appendLog('Invalid color format.');
      swoopRightPicker.value = mirroredSwoopRightHex;
      return;
    }
    mirroredSwoopRightHex = normalized;
    swoopRightPicker.value = normalized;
    sendSwoopColorUpdate();
  });
}

if(!supportsWebUSB && !supportsWebSerial){
  connectButton.disabled = true;
  connectButton.textContent = 'USB APIs unavailable';
  appendLog('This browser does not support WebUSB or Web Serial. Try Chrome or Edge on desktop or Android.');
} else if(remoteOnly){
  connectButton.disabled = true;
  connectButton.textContent = 'Remote Mode (USB disabled)';
  connectButton.classList.remove('primary');
  appendLog('Remote-only cloud control active. USB features disabled on this dashboard.');
}

if(!storageAvailable){
  appendLog('Browser storage unavailable; presets will not persist.');
  [presetNameInput, savePresetBtn, loadPresetBtn, presetSelect, deletePresetBtn].forEach(el => {
    if(el) el.disabled = true;
  });
}

if(colorPicker){
  colorPicker.addEventListener('input', () => {
    if(!requireUnlock()) return;
    brushColor = colorPicker.value.toUpperCase();
    setEraserMode(false);
    setSampleMode(false);
  });
}

if(toggleEraserBtn){
  toggleEraserBtn.addEventListener('click', () => {
    if(!requireUnlock()) return;
    setEraserMode(!eraserMode);
  });
}

if(sampleColorBtn){
  sampleColorBtn.addEventListener('click', () => {
    if(!requireUnlock()) return;
    setSampleMode(!sampleMode);
  });
}

if(clearSlotBtn) clearSlotBtn.addEventListener('click', clearFrameSlotOnVisor);
if(lyricForm) lyricForm.addEventListener('submit', submitLyricScript);
if(lyricResetBtn) lyricResetBtn.addEventListener('click', resetLyricScriptToDefault);

if(clearGridBtn) clearGridBtn.addEventListener('click', clearGrid);
if(fillGridBtn) fillGridBtn.addEventListener('click', fillGrid);
if(sendFrameBtn) sendFrameBtn.addEventListener('click', sendFrameToVisor);
if(previewFrameBtn) previewFrameBtn.addEventListener('click', previewFrameSlot);
if(savePresetBtn) savePresetBtn.addEventListener('click', () => {
  if(!requireUnlock()) return;
  savePreset();
});
if(loadPresetBtn) loadPresetBtn.addEventListener('click', () => {
  if(!requireUnlock()) return;
  loadPreset();
});
if(deletePresetBtn) deletePresetBtn.addEventListener('click', () => {
  if(!requireUnlock()) return;
  deletePreset();
});

if(pixelGrid){
  pixelGrid.addEventListener('pointerdown', handlePointerDown);
  pixelGrid.addEventListener('contextmenu', event => event.preventDefault());
}

window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', () => endPointer({pointerId: activePointerId}));

if(passwordForm){
  passwordForm.addEventListener('submit', event => {
    event.preventDefault();
    const attempt = passwordInput ? passwordInput.value.trim() : '';
    if(attempt === ACCESS_PASSWORD){
      unlockPortal(false);
      if(passwordInput) passwordInput.value = '';
      appendLog('Access unlocked.');
    } else {
      if(passwordError) passwordError.textContent = 'Incorrect password, try again.';
      if(passwordInput) passwordInput.value = '';
    }
  });
}

if(passwordInput){
  passwordInput.addEventListener('input', () => {
    if(passwordError) passwordError.textContent = '';
  });
}

if(previewPlayBtn){
  previewPlayBtn.addEventListener('click', () => {
    previewPlaying = true;
    previewFrameAccumulator = 0;
    previewLastTimestamp = performance.now();
    previewPlayBtn.disabled = true;
    if(previewPauseBtn) previewPauseBtn.disabled = false;
  });
}

if(previewPauseBtn){
  previewPauseBtn.addEventListener('click', () => {
    previewPlaying = false;
    previewPauseBtn.disabled = true;
    if(previewPlayBtn) previewPlayBtn.disabled = false;
    previewLastTimestamp = performance.now();
  });
}

window.addEventListener('online', () => {
  updateConnectionStatus();
  if(unlocked) processRemoteQueue();
});

window.addEventListener('offline', updateConnectionStatus);

presets = loadPresets();
refreshPresetSelect();
buildGrid();

setEraserMode(false);
setSampleMode(false);

if(presetSelect && presetSelect.options.length > 1){
  presetSelect.selectedIndex = 0;
}

if(sessionUnlocked){
  unlockPortal(true);
}else{
  if(document.body) document.body.classList.add('locked');
  if(authOverlay) authOverlay.classList.remove('hidden');
  updateApiStatus('Locked – enter password to enable controls.', false);
}

updateConnectionStatus();

if(previewCanvas && previewCtx){
  startPreview(0);
  previewPlaying = true;
  if(previewPlayBtn) previewPlayBtn.disabled = true;
  if(previewPauseBtn) previewPauseBtn.disabled = false;
  requestAnimationFrame(animatePreview);
}

setInterval(() => {
  updateConnectionStatus();
  if(unlocked && navigator.onLine){
    processRemoteQueue();
  }
}, 15000);

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.warn('Service worker registration failed', err);
    });
  });
}
