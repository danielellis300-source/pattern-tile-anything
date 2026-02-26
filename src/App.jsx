import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const exportSizes = [512, 1024, 2048, 4096];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const isValidHex = (value) => /^#([0-9a-fA-F]{6})$/.test(value);

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });

const useResizeObserver = (ref) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const element = ref.current;
    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
};

const TILE_BASE_SIZE = 1600;

const applySmoothing = (ctx) => {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
};

const createTileCanvas = ({ image, size, rotation, motifPixelSize, motifBg }) => {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext("2d");
  applySmoothing(ctx);
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = isValidHex(motifBg) ? motifBg : "#0b0b0b";
  ctx.fillRect(0, 0, size, size);

  if (image) {
    const rad = (rotation * Math.PI) / 180;
    const maxDim = Math.max(image.width, image.height);
    const fitScale = motifPixelSize / maxDim;
    const scaledWidth = image.width * fitScale;
    const scaledHeight = image.height * fitScale;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(rad);
    ctx.drawImage(
      image,
      -scaledWidth / 2,
      -scaledHeight / 2,
      scaledWidth,
      scaledHeight
    );
    ctx.restore();
  }

  return tile;
};

const drawPattern = ({ ctx, tile, width, height, offset }) => {
  const tileSize = tile.width;
  const startX = -tileSize + offset.x;
  const startY = -tileSize + offset.y;
  const cols = Math.ceil(width / tileSize) + 2;
  const rows = Math.ceil(height / tileSize) + 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const baseX = startX + col * tileSize;
      const baseY = startY + row * tileSize;
      ctx.drawImage(tile, baseX, baseY, tileSize, tileSize);
    }
  }
};

function App() {
  const [image, setImage] = useState(null);
  const [motifScale, setMotifScale] = useState(0.35);
  const [motifSpacing, setMotifSpacing] = useState(1.1);
  const [rotation, setRotation] = useState(0);
  const [motifBg, setMotifBg] = useState("#0b0b0b");
  const [exportSize, setExportSize] = useState(1024);
  const [exportFormat, setExportFormat] = useState("png");
  const [exportBg, setExportBg] = useState("#FFFFFF");

  const fileInputId = "pattern-image-input";
  const tileCanvasRef = useRef(null);
  const tileWrapRef = useRef(null);

  const tileWrapSize = useResizeObserver(tileWrapRef);

  const motifTileSize = useMemo(
    () => clamp(Math.round(TILE_BASE_SIZE / motifSpacing), 40, 2048),
    [motifSpacing]
  );
  const motifPixelSize = useMemo(
    () => clamp(TILE_BASE_SIZE * motifScale, 40, TILE_BASE_SIZE * 1.2),
    [motifScale]
  );

  const tileCanvas = useMemo(() => {
    if (!image) return null;
    return createTileCanvas({
      image,
      size: motifTileSize,
      rotation,
      motifPixelSize,
      motifBg,
    });
  }, [image, motifTileSize, rotation, motifPixelSize, motifBg]);

  useEffect(() => {
    const canvas = tileCanvasRef.current;
    if (!canvas) return;

    const size = Math.min(520, Math.max(280, tileWrapSize.width || 320));
    const drawSize = tileCanvas ? Math.max(size, tileCanvas.width * 2) : size;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = drawSize * dpr;
    canvas.height = drawSize * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applySmoothing(ctx);
    ctx.clearRect(0, 0, drawSize, drawSize);

    if (!tileCanvas) return;

    ctx.fillStyle = isValidHex(motifBg) ? motifBg : "#0b0b0b";
    ctx.fillRect(0, 0, drawSize, drawSize);

    drawPattern({
      ctx,
      tile: tileCanvas,
      width: drawSize,
      height: drawSize,
      offset: { x: tileCanvas.width / 2, y: tileCanvas.height / 2 },
    });
  }, [tileCanvas, tileWrapSize, motifBg]);

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const img = await loadImageFromFile(file);
      setImage(img);
    } catch (error) {
      console.error(error);
    }
  };

  const handleInputChange = (event) => {
    handleFile(event.target.files?.[0]);
    // Allow choosing the same file again on mobile/desktop.
    event.target.value = "";
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    handleFile(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleReset = () => {
    setMotifScale(0.35);
    setMotifSpacing(1.1);
    setRotation(0);
    setMotifBg("#0b0b0b");
  };

  const handleClearImage = () => {
    setImage(null);
  };

  const handleDownload = () => {
    if (!image) return;
    const size = exportSize;
    const output = document.createElement("canvas");
    output.width = size;
    output.height = size;
    const ctx = output.getContext("2d");
    applySmoothing(ctx);

    if (exportFormat === "jpg") {
      ctx.fillStyle = isValidHex(exportBg) ? exportBg : "#ffffff";
      ctx.fillRect(0, 0, size, size);
    }

    const tile = createTileCanvas({
      image,
      size,
      rotation,
      motifPixelSize,
      motifBg,
    });

    drawPattern({
      ctx,
      tile,
      width: size,
      height: size,
      offset: { x: tile.width / 2, y: tile.height / 2 },
    });

    const mime = exportFormat === "jpg" ? "image/jpeg" : `image/${exportFormat}`;
    const link = document.createElement("a");
    link.download = `pattern-tile-${size}.${exportFormat}`;
    link.href = output.toDataURL(mime, 0.95);
    link.click();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark" />
          Pattern Tile Anything
        </div>
        <nav className="nav" />
        <button className="btn btn-primary" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>
          Export
        </button>
      </header>

      <main className="main">
        <section className="hero" id="editor">
          <div className="hero-copy">
            <p className="eyebrow">Tile Pattern Tool</p>
            <h1>Upload one element. Get a great repeat.</h1>
            <p className="subhead">
              Perfect for apparel, wallpaper, and products. Keep it simple: scale, spacing, and color.
            </p>
            <div className="hero-actions">
              <label className="btn btn-primary" htmlFor={fileInputId}>
                Upload image
              </label>
            </div>
            <div className="stats">
              <div>
                <strong>Fast</strong>
                <span>Live preview</span>
              </div>
              <div>
                <strong>Simple</strong>
                <span>Focused controls</span>
              </div>
              <div>
                <strong>Free</strong>
                <span>No login</span>
              </div>
            </div>
          </div>
        </section>

        <section className="editor">
          <aside className="panel controls">
            <h2>Controls</h2>
            <div className="control-group">
              <label>Upload</label>
              <div
                className="dropzone"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <span>Drop image here</span>
                <label className="btn btn-ghost" htmlFor={fileInputId}>
                  Upload
                </label>
              </div>
              <input
                id={fileInputId}
                type="file"
                accept="image/*"
                className="file-input"
                onChange={handleInputChange}
              />
            </div>
            <div className="control-group">
              <label>Scale</label>
              <div className="control-inline">
                <input
                  type="range"
                  min="10"
                  max="80"
                  value={Math.round(motifScale * 100)}
                  onChange={(event) => setMotifScale(Number(event.target.value) / 100)}
                />
                <span className="value-chip">{motifScale.toFixed(2)}</span>
              </div>
            </div>
            <div className="control-group">
              <label>Spacing</label>
              <div className="control-inline">
                <input
                  type="range"
                  min="50"
                  max="1000"
                  value={Math.round(motifSpacing * 100)}
                  onChange={(event) => setMotifSpacing(Number(event.target.value) / 100)}
                />
                <span className="value-chip">{motifSpacing.toFixed(2)}</span>
              </div>
            </div>
            <div className="control-group">
              <label>Rotation</label>
              <div className="control-inline">
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={Math.round(rotation)}
                  onChange={(event) => setRotation(Number(event.target.value))}
                />
                <span className="value-chip">{rotation}°</span>
              </div>
            </div>
            <div className="control-group">
              <label>Background color</label>
              <div className="select-row">
                <input
                  type="text"
                  value={motifBg}
                  onChange={(event) => setMotifBg(event.target.value)}
                  placeholder="#000000"
                />
                <div
                  className="color-preview"
                  style={{ background: isValidHex(motifBg) ? motifBg : "#0b0b0b" }}
                />
              </div>
            </div>
          </aside>

          <section className="panel canvas">
            <div className="canvas-header">
              <h2>Tile Preview</h2>
              <div className="canvas-actions">
                <button className="btn btn-ghost" onClick={handleReset}>Reset</button>
                <button className="btn btn-ghost icon-btn icon-danger" onClick={handleClearImage} aria-label="Remove image">
                  🗑
                </button>
              </div>
            </div>
            <div className="tile-canvas" ref={tileWrapRef}>
              <canvas ref={tileCanvasRef} />
              <div className="tile-overlay">Live repeat preview</div>
            </div>
          </section>
        </section>

        <section className="export" id="how">
          <div className="export-card">
            <div>
              <p className="eyebrow">Export</p>
              <h2>Choose a size and download instantly.</h2>
              <p className="subhead">
                PNG for transparency, JPG for print shops, WebP for web.
              </p>
            </div>
            <div className="export-controls">
              <div className="pill-group">
                {exportSizes.map((size) => (
                  <button
                    key={size}
                    className={`pill ${exportSize === size ? "active" : ""}`}
                    onClick={() => setExportSize(size)}
                  >
                    {size}px
                  </button>
                ))}
                <button className={`pill ${!exportSizes.includes(exportSize) ? "active" : ""}`}>
                  Custom
                </button>
              </div>
              <div className="select-row">
                <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="webp">WebP</option>
                </select>
                <input
                  type="number"
                  min="256"
                  max="8192"
                  value={exportSize}
                  onChange={(event) => setExportSize(Number(event.target.value || 1024))}
                />
              </div>
              <div className="select-row">
                <input
                  type="text"
                  value={exportBg}
                  onChange={(event) => setExportBg(event.target.value)}
                  placeholder="#FFFFFF"
                />
                <div className="color-preview" style={{ background: isValidHex(exportBg) ? exportBg : "#ffffff" }} />
              </div>
              <button className="btn btn-primary" onClick={handleDownload}>
                Download tile
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>Pattern Tile Anything (c) 2026</span>
        <div>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Support</a>
        </div>
      </footer>
    </div>
  );
}

export default App;
