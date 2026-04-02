/**
 * MeowPrinter Frontend - Interactive Preview
 * Note: The original Preact + Signals code has been adapted to standard React 
 * for compatibility with this interactive preview environment. The architecture 
 * and logic remain identical.
 */

import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Device {
  name: string;
  address: string;
}

interface PrintSettings {
  processMode: 'picture' | 'pattern' | 'text';
  brightness: number; // 0-256
  energy: number; // 0-256
  quality: number; // 28-40
  rotate: boolean;
  transparentAsWhite: boolean;
  scanTime: number; // 1-10
  dryRun: boolean;
}

// ============================================================================
// GLOBAL STATE (Adapted from Signals)
// ============================================================================

const globalState = {
  devices: [] as Device[],
  isScanning: false,
  selectedDeviceAddress: null as string | null,
  isConnected: false,
  settings: {
    processMode: 'picture',
    brightness: 128,
    energy: 128,
    quality: 32,
    rotate: false,
    transparentAsWhite: true,
    scanTime: 5,
    dryRun: false,
  } as PrintSettings,
  theme: 'light' as 'light' | 'dark',
  lang: 'en-US',
  activeTab: 'print' as 'print' | 'settings' | 'about',
  sourceImage: null as HTMLImageElement | null,
  sourcePdf: null as File | null,
  sourceBadge: null as File | null,
};

const listeners = new Set<() => void>();

function updateState(updates: Partial<typeof globalState>) {
  Object.assign(globalState, updates);
  listeners.forEach(fn => fn());
}

function useAppState() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick(t => t + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return globalState;
}

// ============================================================================
// I18N HOOK
// ============================================================================

const translations: Record<string, Record<string, string>> = {
  'en-US': {
    'app.title': 'MeowPrinter',
    'tab.print': 'Print',
    'tab.settings': 'Settings',
    'tab.about': 'About',
    'device.scan': 'Scan for Printers',
    'device.scanning': 'Scanning...',
    'device.select': 'Select a device...',
    'device.connect': 'Connect',
    'device.connected': 'Connected',
    'settings.mode': 'Dithering Algorithm',
    'settings.mode.picture': 'Picture (Floyd-Steinberg)',
    'settings.mode.pattern': 'Pattern (Halftone)',
    'settings.mode.text': 'Text (Direct Threshold)',
    'settings.brightness': 'Brightness',
    'settings.energy': 'Thermal Strength',
    'settings.quality': 'Print Quality',
    'settings.rotate': 'Rotate Image 90°',
    'settings.transparent': 'Transparent as White',
    'settings.scantime': 'Scan Time (seconds)',
    'settings.dryrun': 'Dry Run (No physical print)',
    'settings.theme': 'Dark Theme',
    'settings.language': 'Language',
    'action.picture': 'Insert Picture',
    'action.text': 'Insert Text',
    'action.pdf': 'Insert PDF',
    'action.badge': 'Print Badge',
    'action.reset': 'Reset Canvas',
    'action.print': 'Print Now',
    'canvas.empty.desktop': 'Drag & drop an image here or use the buttons above',
    'canvas.empty.mobile': 'Tap a button above to add media',
    'modal.text.title': 'Insert Text',
    'modal.text.placeholder': 'Type your text here...',
    'modal.btn.insert': 'Insert to Canvas',
    'modal.btn.cancel': 'Cancel',
  }
};

function useI18n() {
  const { lang } = useAppState();
  const t = useCallback((key: string): string => {
    const dict = translations[lang] || translations['en-US'];
    return dict[key] || key;
  }, [lang]);
  return { t };
}

// ============================================================================
// API CLIENT
// ============================================================================

const api = {
  async scan(): Promise<Device[]> {
    try {
      return new Promise(res => setTimeout(() => res([{ name: 'CatPrinter_A1', address: 'PD01,11:22:33:44' }]), 1500));
    } catch (e) {
      console.error(e);
      return [];
    }
  },
  async connect(address: string): Promise<boolean> {
    try {
      return new Promise(res => setTimeout(() => res(true), 500));
    } catch (e) {
      return false;
    }
  },
  async print(pbmData: Uint8Array): Promise<void> {
    try {
      console.log(`Sending ${pbmData.length} bytes of PBM to printer...`);
      alert("Print job sent successfully! (Mocked)");
    } catch (e) {
      console.error("Print failed", e);
    }
  },
  async printPdf(file: File): Promise<void> {
    try {
      console.log(`Sending PDF ${file.name} to printer...`);
      alert("PDF print job sent successfully! (Mocked)");
    } catch (e) {
      console.error("Print PDF failed", e);
    }
  },
  async printBadge(file: File): Promise<void> {
    try {
      console.log(`Sending Badge ${file.name} to printer...`);
      alert("Badge print job sent successfully! (Mocked)");
    } catch (e) {
      console.error("Print Badge failed", e);
    }
  }
};

// ============================================================================
// IMAGE PROCESSING UTILS
// ============================================================================

function getGrayscaleData(ctx: CanvasRenderingContext2D, width: number, height: number, transparentAsWhite: boolean): Uint8ClampedArray {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const gray = new Uint8ClampedArray(width * height);
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    let lum = r * 0.299 + g * 0.587 + b * 0.114;
    
    if (transparentAsWhite && a < 255) {
      lum = lum * (a / 255) + 255 * (1 - a / 255);
    }
    
    gray[i / 4] = lum;
  }
  return gray;
}

function directThreshold(gray: Uint8ClampedArray, width: number, height: number, threshold: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i] >= threshold ? 255 : 0;
  }
  return out;
}

function halftone(gray: Uint8ClampedArray, width: number, height: number, threshold: number): Uint8ClampedArray {
  const bayer = [
    [ 0, 8, 2, 10 ],
    [ 12, 4, 14, 6 ],
    [ 3, 11, 1, 9 ],
    [ 15, 7, 13, 5 ]
  ];
  const out = new Uint8ClampedArray(gray.length);
  const thresholdAdjust = threshold - 128;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bayerValue = (bayer[y % 4][x % 4] * 16) - 128;
      const val = gray[y * width + x] + bayerValue - thresholdAdjust;
      out[y * width + x] = val >= 128 ? 255 : 0;
    }
  }
  return out;
}

function floydSteinberg(gray: Uint8ClampedArray, width: number, height: number, threshold: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray);
  const getIdx = (x: number, y: number) => y * width + x;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = getIdx(x, y);
      const oldPixel = out[idx];
      const newPixel = oldPixel >= threshold ? 255 : 0;
      out[idx] = newPixel;
      
      const quantError = oldPixel - newPixel;
      
      if (x + 1 < width) out[getIdx(x + 1, y)] += quantError * (7 / 16);
      if (x - 1 >= 0 && y + 1 < height) out[getIdx(x - 1, y + 1)] += quantError * (3 / 16);
      if (y + 1 < height) out[getIdx(x, y + 1)] += quantError * (5 / 16);
      if (x + 1 < width && y + 1 < height) out[getIdx(x + 1, y + 1)] += quantError * (1 / 16);
    }
  }
  
  for (let i = 0; i < out.length; i++) {
    out[i] = out[i] > 127 ? 255 : 0;
  }
  return out;
}

function canvasToPbm(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("No canvas context");
  
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height).data;

  const header = new TextEncoder().encode(`P4\n${width} ${height}\n`);
  const rowBytes = Math.ceil(width / 8);
  const body = new Uint8Array(rowBytes * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isBlack = imgData[i] < 128;
      
      if (isBlack) {
        const byteIdx = y * rowBytes + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8);
        body[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  const pbm = new Uint8Array(header.length + body.length);
  pbm.set(header);
  pbm.set(body, header.length);
  return pbm;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function DevicePanel() {
  const { t } = useI18n();
  const { devices, isScanning, selectedDeviceAddress, isConnected } = useAppState();

  const handleScan = async () => {
    updateState({ isScanning: true });
    const found = await api.scan();
    const updates: any = { devices: found, isScanning: false };
    if (found.length > 0 && !selectedDeviceAddress) {
      updates.selectedDeviceAddress = found[0].address;
    }
    updateState(updates);
  };

  const handleConnect = async () => {
    if (!selectedDeviceAddress) return;
    const success = await api.connect(selectedDeviceAddress);
    updateState({ isConnected: success });
  };

  return (
    <div className="panel card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <select 
        className="select-input"
        value={selectedDeviceAddress || ''}
        onChange={e => updateState({ selectedDeviceAddress: e.target.value })}
      >
        <option value="" disabled>{t('device.select')}</option>
        {devices.map(d => (
          <option key={d.address} value={d.address}>{d.name} ({d.address})</option>
        ))}
      </select>
      <div className="flex-row">
        <button 
          className="btn-secondary" 
          onClick={handleScan} 
          disabled={isScanning}
          style={{ flex: 1, padding: '10px 8px' }}
        >
          {isScanning ? t('device.scanning') : t('device.scan')}
        </button>
        <button 
          className="btn-primary" 
          onClick={handleConnect} 
          disabled={!selectedDeviceAddress || isConnected}
          style={{ flex: 1, padding: '10px 8px' }}
        >
          {isConnected ? t('device.connected') : t('device.connect')}
        </button>
      </div>
    </div>
  );
}

function PrintSettingsPanel() {
  const { t } = useI18n();
  const { settings } = useAppState();

  const update = (key: keyof PrintSettings, val: any) => {
    updateState({ settings: { ...settings, [key]: val } });
  };

  return (
    <div className="panel card scroll-y">
      <div className="form-group">
        <label>{t('settings.mode')}</label>
        <div className="radio-group">
          {(['picture', 'pattern', 'text'] as const).map(mode => (
            <label key={mode} className={`radio-pill ${settings.processMode === mode ? 'active' : ''}`}>
              <input 
                type="radio" 
                name="processMode" 
                value={mode} 
                checked={settings.processMode === mode}
                onChange={() => update('processMode', mode)}
              />
              {t(`settings.mode.${mode}`)}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <div className="flex-between">
          <label>{t('settings.brightness')}</label>
          <span className="val-badge">{settings.brightness}</span>
        </div>
        <input 
          type="range" min="0" max="256" 
          value={settings.brightness} 
          onChange={e => update('brightness', parseInt(e.target.value))}
        />
      </div>

      <div className="form-group">
        <div className="flex-between">
          <label>{t('settings.energy')}</label>
          <span className="val-badge">{settings.energy}</span>
        </div>
        <input 
          type="range" min="0" max="256" step="32"
          value={settings.energy} 
          onChange={e => update('energy', parseInt(e.target.value))}
        />
      </div>

      <div className="form-group">
        <div className="flex-between">
          <label>{t('settings.quality')}</label>
          <span className="val-badge">{settings.quality}</span>
        </div>
        <input 
          type="range" min="28" max="40" step="4"
          value={settings.quality} 
          onChange={e => update('quality', parseInt(e.target.value))}
        />
      </div>

      <div className="form-group row-checkbox">
        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={settings.rotate} 
            onChange={e => update('rotate', e.target.checked)} 
          />
          <span className="checkmark"></span>
          {t('settings.rotate')}
        </label>
      </div>

      <div className="form-group row-checkbox">
        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={settings.transparentAsWhite} 
            onChange={e => update('transparentAsWhite', e.target.checked)} 
          />
          <span className="checkmark"></span>
          {t('settings.transparent')}
        </label>
      </div>
    </div>
  );
}

function SettingsTab() {
  const { t } = useI18n();
  const { settings, lang, theme } = useAppState();

  const update = (key: keyof PrintSettings, val: any) => {
    updateState({ settings: { ...settings, [key]: val } });
  };

  return (
    <div className="panel card scroll-y">
      <div className="form-group">
        <label>{t('settings.scantime')}</label>
        <input 
          type="number" 
          className="text-input"
          min="1" max="10" 
          value={settings.scanTime} 
          onChange={e => update('scanTime', parseInt(e.target.value))}
        />
      </div>
      
      <div className="form-group row-checkbox">
        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={settings.dryRun} 
            onChange={e => update('dryRun', e.target.checked)} 
          />
          <span className="checkmark"></span>
          {t('settings.dryrun')}
        </label>
      </div>

      <hr className="divider" />

      <div className="form-group">
        <label>{t('settings.language')}</label>
        <select 
          className="select-input"
          value={lang}
          onChange={e => updateState({ lang: e.target.value })}
        >
          <option value="en-US">English</option>
          <option value="es-ES">Español</option>
        </select>
      </div>

      <div className="form-group row-checkbox">
        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={theme === 'dark'} 
            onChange={e => updateState({ theme: e.target.checked ? 'dark' : 'light' })} 
          />
          <span className="checkmark"></span>
          {t('settings.theme')}
        </label>
      </div>
    </div>
  );
}

function CanvasArea() {
  const { t } = useI18n();
  const { sourceImage, sourcePdf, sourceBadge, settings } = useAppState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const badgeInputRef = useRef<HTMLInputElement>(null);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [textContent, setTextContent] = useState("");

  const handleInsertText = () => {
    if (!textContent.trim()) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const width = 384; // Fixed thermal printer width
    const fontSize = 32;
    ctx.font = `${fontSize}px sans-serif`;

    // Process text for word-wrapping
    const paragraphs = textContent.split('\n');
    const lines: string[] = [];
    paragraphs.forEach(p => {
      if (p.trim() === '') { lines.push(''); return; }
      const words = p.split(' ');
      let line = '';
      for(let w of words) {
        const testLine = line + w + ' ';
        if (ctx.measureText(testLine).width > width - 40 && line !== '') {
          lines.push(line);
          line = w + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line);
    });

    const lineHeight = fontSize * 1.2;
    canvas.width = width;
    canvas.height = Math.max(lines.length * lineHeight + 40, 100);

    // Redraw context after resizing
    const ctx2 = canvas.getContext('2d')!;
    ctx2.fillStyle = 'white';
    ctx2.fillRect(0, 0, canvas.width, canvas.height);
    ctx2.fillStyle = 'black';
    ctx2.font = `${fontSize}px sans-serif`;
    ctx2.textBaseline = 'top';

    lines.forEach((l, i) => {
      ctx2.fillText(l.trim(), 20, 20 + (i * lineHeight));
    });

    const img = new Image();
    img.onload = () => {
      // Feed the text-image directly into the main app state
      updateState({ sourceImage: img, sourcePdf: null, sourceBadge: null });
      // Suggest switching to "Text (Direct Threshold)" mode for crisp printing
      if (settings.processMode !== 'text') {
        updateState({ settings: { ...settings, processMode: 'text' } });
      }
      setIsTextModalOpen(false);
      setTextContent("");
    };
    img.src = canvas.toDataURL('image/png');
  };

  useEffect(() => {
    if (!canvasRef.current || !sourceImage) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const TARGET_WIDTH = 384;
    
    let imgW = sourceImage.width;
    let imgH = sourceImage.height;
    
    if (settings.rotate) {
      imgW = sourceImage.height;
      imgH = sourceImage.width;
    }

    const scale = TARGET_WIDTH / imgW;
    const targetHeight = Math.floor(imgH * scale);
    
    canvas.width = TARGET_WIDTH;
    canvas.height = targetHeight;

    const off = document.createElement('canvas');
    off.width = TARGET_WIDTH;
    off.height = targetHeight;
    const offCtx = off.getContext('2d')!;
    
    if (settings.transparentAsWhite) {
      offCtx.fillStyle = 'white';
      offCtx.fillRect(0, 0, TARGET_WIDTH, targetHeight);
    }
    
    if (settings.rotate) {
      offCtx.translate(TARGET_WIDTH/2, targetHeight/2);
      offCtx.rotate(Math.PI / 2);
      offCtx.drawImage(sourceImage, -targetHeight/2, -TARGET_WIDTH/2, targetHeight, TARGET_WIDTH);
    } else {
      offCtx.drawImage(sourceImage, 0, 0, TARGET_WIDTH, targetHeight);
    }

    const grayData = getGrayscaleData(offCtx, TARGET_WIDTH, targetHeight, settings.transparentAsWhite);
    let outData: Uint8ClampedArray;

    switch(settings.processMode) {
      case 'text':
        outData = directThreshold(grayData, TARGET_WIDTH, targetHeight, settings.brightness);
        break;
      case 'pattern':
        outData = halftone(grayData, TARGET_WIDTH, targetHeight, settings.brightness);
        break;
      case 'picture':
      default:
        outData = floydSteinberg(grayData, TARGET_WIDTH, targetHeight, settings.brightness);
        break;
    }

    const imgDataOut = new ImageData(TARGET_WIDTH, targetHeight);
    for (let i = 0; i < outData.length; i++) {
      const val = outData[i];
      imgDataOut.data[i*4] = val;
      imgDataOut.data[i*4+1] = val;
      imgDataOut.data[i*4+2] = val;
      imgDataOut.data[i*4+3] = 255;
    }
    ctx.putImageData(imgDataOut, 0, 0);

  }, [sourceImage, settings.processMode, settings.brightness, settings.rotate, settings.transparentAsWhite]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      updateState({ sourceImage: img, sourcePdf: null, sourceBadge: null });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handlePdfFile = (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Please select a valid PDF file.');
      return;
    }
    updateState({ sourceImage: null, sourcePdf: file, sourceBadge: null });
  };

  const handleBadgeFile = (file: File) => {
    updateState({ sourceImage: null, sourcePdf: null, sourceBadge: file });
  };

  const triggerUpload = () => fileInputRef.current?.click();
  const triggerPdfUpload = () => pdfInputRef.current?.click();
  const triggerBadgeUpload = () => badgeInputRef.current?.click();

  const handlePrint = async () => {
    if (sourcePdf) {
      await api.printPdf(sourcePdf);
      return;
    }
    if (sourceBadge) {
      await api.printBadge(sourceBadge);
      return;
    }
    if (!canvasRef.current || !sourceImage) return;
    const pbm = canvasToPbm(canvasRef.current);
    await api.print(pbm);
  };

  return (
    <div className="workspace">
      <div className="toolbar">
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept="image/*" 
          onChange={e => {
            if (e.target.files?.[0]) handleFile(e.target.files[0]);
            e.target.value = '';
          }} 
        />
        <input 
          type="file" 
          ref={pdfInputRef} 
          style={{ display: 'none' }} 
          accept="application/pdf" 
          onChange={e => {
            if (e.target.files?.[0]) handlePdfFile(e.target.files[0]);
            e.target.value = '';
          }} 
        />
        <input 
          type="file" 
          ref={badgeInputRef} 
          style={{ display: 'none' }} 
          accept="application/pdf,image/*" 
          onChange={e => {
            if (e.target.files?.[0]) handleBadgeFile(e.target.files[0]);
            e.target.value = '';
          }} 
        />
        <button className="btn-action" onClick={triggerUpload}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          {t('action.picture')}
        </button>
        <button className="btn-action" onClick={() => setIsTextModalOpen(true)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
          {t('action.text')}
        </button>
        <button className="btn-action" onClick={triggerPdfUpload}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          {t('action.pdf')}
        </button>
        <button className="btn-action" onClick={triggerBadgeUpload}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
          {t('action.badge')}
        </button>
      </div>

      <div 
        className="canvas-container"
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          if (e.dataTransfer.files?.[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type === 'application/pdf') handlePdfFile(file);
            else if (file.type.startsWith('image/')) handleFile(file);
          }
        }}
      >
        {!sourceImage && !sourcePdf && !sourceBadge && (
          <div className="canvas-placeholder">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <p className="text-center">
              <span className="desktop-only">{t('canvas.empty.desktop')}</span>
              <span className="mobile-only">{t('canvas.empty.mobile')}</span>
            </p>
          </div>
        )}
        {sourcePdf && (
          <div className="canvas-placeholder">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            <p style={{ color: 'var(--text)', marginTop: '8px' }}>PDF Selected: <strong>{sourcePdf.name}</strong></p>
          </div>
        )}
        {sourceBadge && (
          <div className="canvas-placeholder">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
            <p style={{ color: 'var(--text)', marginTop: '8px' }}>Badge Selected: <strong>{sourceBadge.name}</strong></p>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: sourceImage ? 'block' : 'none' }}></canvas>
      </div>

      <div className="bottom-bar">
        <button className="btn-secondary" onClick={() => updateState({ sourceImage: null, sourcePdf: null, sourceBadge: null })}>
          {t('action.reset')}
        </button>
        <button className="btn-primary large" onClick={handlePrint} disabled={!sourceImage && !sourcePdf && !sourceBadge}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          {t('action.print')}
        </button>
      </div>

      {isTextModalOpen && (
        <div className="modal-overlay" onClick={() => setIsTextModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              {t('modal.text.title')}
              <button className="btn-icon" onClick={() => setIsTextModalOpen(false)}>✕</button>
            </div>

            <textarea 
              className="text-input" 
              style={{ minHeight: '150px', resize: 'vertical' }}
              value={textContent}
              onChange={e => setTextContent(e.target.value)}
              placeholder={t('modal.text.placeholder')}
            ></textarea>

            <div className="flex-row mt-sm" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setIsTextModalOpen(false)}>
                {t('modal.btn.cancel')}
              </button>
              <button className="btn-primary" onClick={handleInsertText} style={{ width: 'auto' }} disabled={!textContent.trim()}>
                {t('modal.btn.insert')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT & CSS INJECTION
// ============================================================================

const CSS_STYLES = `
:root {
  --bg: #fdfdfd;
  --surface: #ffffff;
  --surface-alt: #f0f0f4;
  --border: #e8e8ed;
  --text: #1a1a24;
  --text-muted: #6e6e80;
  --accent: #2fb9bf;
  --accent-hover: #26989d;
  --radius: 12px;
  --shadow: 0 8px 30px rgba(0,0,0,0.04);
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

[data-theme="dark"] {
  --bg: #141418;
  --surface: #1e1e24;
  --surface-alt: #2a2a32;
  --border: #32323c;
  --text: #ffffff;
  --text-muted: #9e9ea8;
  --accent: #2fb9bf;
  --accent-hover: #3ad3d9;
  --shadow: 0 8px 30px rgba(0,0,0,0.2);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font); background: var(--bg); color: var(--text); overflow: hidden; transition: background 0.2s, color 0.2s; }

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: var(--bg);
  color: var(--text);
  transition: background 0.2s, color 0.2s;
}

/* Sidebar */
.sidebar {
  width: 340px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: background 0.2s, border-color 0.2s;
  z-index: 10;
}

.sidebar-header {
  padding: 24px;
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}

.sidebar-header svg { color: var(--accent); }

.sidebar-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* UI Elements */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow);
}

.form-group {
  margin-bottom: 20px;
}
.form-group:last-child {
  margin-bottom: 0;
}

.flex-row { display: flex; gap: 8px; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.mt-sm { margin-top: 12px; }

label { font-size: 13px; font-weight: 500; color: var(--text-muted); margin-bottom: 8px; display: block; }

.select-input, .text-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition: border 0.2s;
}
.select-input:focus, .text-input:focus { border-color: var(--accent); }

button {
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

button:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary { background: var(--accent); color: white; padding: 10px 16px; width: 100%; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary.large { padding: 14px 24px; font-size: 16px; }

.btn-secondary { background: var(--surface-alt); color: var(--text); padding: 10px 16px; border: 1px solid var(--border); }
.btn-secondary:hover:not(:disabled) { border-color: var(--text-muted); }

/* Radio Pills */
.radio-group { display: flex; flex-direction: column; gap: 8px; }
.radio-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 14px;
  color: var(--text);
  margin: 0;
}
.radio-pill input { display: none; }
.radio-pill.active { background: var(--accent); color: white; border-color: var(--accent); }

/* Sliders */
input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  background: var(--surface-alt);
  border-radius: 3px;
  outline: none;
  margin-top: 8px;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  transition: transform 0.1s;
}
input[type="range"]::-webkit-slider-thumb:active { transform: scale(1.1); }

.val-badge { background: var(--surface-alt); color: var(--text); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }

/* Custom Checkbox */
.row-checkbox { display: flex; align-items: center; margin-top: 16px; }
.checkbox-label { display: flex; align-items: center; gap: 10px; cursor: pointer; color: var(--text); font-size: 14px; font-weight: 500; margin: 0;}
.checkbox-label input { display: none; }
.checkmark { width: 20px; height: 20px; border: 2px solid var(--border); border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: 0.2s;}
.checkbox-label input:checked ~ .checkmark { background: var(--accent); border-color: var(--accent); }
.checkbox-label input:checked ~ .checkmark::after { content: ""; width: 5px; height: 10px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); margin-bottom: 2px;}

/* Nav Tabs */
.nav-tabs {
  display: flex;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.nav-tab {
  flex: 1; padding: 16px 0; background: none; border: none; border-top: 2px solid transparent; border-radius: 0;
  color: var(--text-muted); font-size: 14px; font-weight: 500;
}
.nav-tab.active { color: var(--accent); border-top-color: var(--accent); background: var(--surface-alt); }
.nav-tab:hover:not(.active) { color: var(--text); }

/* Workspace & Canvas */
.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.toolbar {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 12px;
  background: var(--surface);
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
  z-index: 5;
}

.btn-action {
  background: var(--surface-alt);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
}
.btn-action:hover { background: var(--border); }

.canvas-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  overflow: hidden;
  position: relative;
  min-height: 0;
}

canvas {
  background: white;
  box-shadow: var(--shadow);
  border-radius: 4px;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.canvas-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted);
  border: 2px dashed var(--border);
  padding: 60px;
  border-radius: var(--radius);
  box-sizing: border-box;
  max-width: 100%;
  max-height: 100%;
}

.bottom-bar {
  padding: 20px 24px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.divider { border: none; border-top: 1px solid var(--border); margin: 24px 0; }

.desktop-only { display: inline; }
.mobile-only { display: none; }
.text-center { text-align: center; line-height: 1.5; padding: 0 16px; }

/* Modals */
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(2px); }
.modal-content { background: var(--surface); padding: 24px; border-radius: var(--radius); width: 480px; max-width: 90vw; box-shadow: 0 10px 40px rgba(0,0,0,0.2); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 16px; }
.modal-header { font-size: 18px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; color: var(--text); }
.btn-icon { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text-muted); padding: 4px; display: flex; align-items: center; justify-content: center; }
.btn-icon:hover { color: var(--text); }

@media (max-width: 768px) {
  .app-layout { flex-direction: column; }
  
  .sidebar { 
    display: contents; 
  }
  
  .sidebar-header { 
    order: 1; 
    background: var(--surface); 
    padding: 16px; 
  }
  
  .workspace { 
    order: 2; 
    height: 48vh; 
    flex: none; 
    border-bottom: 1px solid var(--border); 
  }
  
  .sidebar-content { 
    order: 3; 
    background: var(--surface); 
    padding: 16px 12px; 
  }
  
  .nav-tabs { 
    order: 4; 
    background: var(--surface);
    border-top: 1px solid var(--border); 
    padding-bottom: max(env(safe-area-inset-bottom), 8px); 
  }
  
  .desktop-only { display: none; }
  .mobile-only { display: inline; }
  
  .toolbar { 
    display: grid; 
    grid-template-columns: 1fr 1fr; 
    gap: 8px; 
    padding: 12px; 
    overflow-x: hidden; 
  }
  .btn-action { justify-content: center; padding: 10px 8px; font-size: 13px; }
  
  .bottom-bar { padding: 12px; }
  .card { padding: 16px 12px; }
  
  .canvas-container { padding: 12px; }
  .canvas-placeholder { padding: 16px; gap: 8px; width: 100%; height: 100%; }
  .canvas-placeholder svg { width: 32px; height: 32px; flex-shrink: 0; }
}
`;

export default function App() {
  const { t } = useI18n();
  const { theme, activeTab } = useAppState();

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = CSS_STYLES;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return (
    <div className="app-layout" data-theme={theme}>
      <aside className="sidebar">
        <header className="sidebar-header">
          <img 
            src="meowprinter_logo.jpg" 
            alt="MeowPrinter Logo" 
            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const nextSvg = e.currentTarget.nextElementSibling as HTMLElement;
              if (nextSvg) nextSvg.style.display = 'block';
            }}
          />
          <svg style={{ display: 'none' }} viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2"></path>
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          {t('app.title')}
        </header>
        
        <main className="sidebar-content">
          {activeTab === 'print' && (
            <Fragment>
              <DevicePanel />
              <PrintSettingsPanel />
            </Fragment>
          )}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'about' && (
            <div className="panel card">
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '14px' }}>
                <strong>MeowPrinter Frontend</strong><br />
                Open-source BLE thermal printer control panel.
                <br /><br />
                Designed with standard React Hooks (adapted from Signals).<br />
                Processing 1-bit P4 PBM locally.
              </p>
            </div>
          )}
        </main>

        <nav className="nav-tabs">
          <button className={`nav-tab ${activeTab === 'print' ? 'active' : ''}`} onClick={() => updateState({ activeTab: 'print' })}>{t('tab.print')}</button>
          <button className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => updateState({ activeTab: 'settings' })}>{t('tab.settings')}</button>
          <button className={`nav-tab ${activeTab === 'about' ? 'active' : ''}`} onClick={() => updateState({ activeTab: 'about' })}>{t('tab.about')}</button>
        </nav>
      </aside>

      <CanvasArea />
    </div>
  );
}