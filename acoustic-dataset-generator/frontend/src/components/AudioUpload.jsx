/**
 * AudioUpload – Özel ses dosyası yükleme ve seçim paneli.
 * Props:
 *   selectedFile: string | null   – seçili dosya adı
 *   onSelect: (filename) => void  – dosya seçildiğinde
 */
import React, { useState, useEffect, useRef } from "react";

const API = "/api";
const ALLOWED = ".wav,.mp3,.flac,.ogg,.m4a";

export default function AudioUpload({ selectedFile, onSelect, kind = "source" }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const uploadKind = (kind === "ambient") ? "ambient" : "source";

  // Sunucudaki dosya listesini çek
  async function fetchFiles() {
    try {
      const res = await fetch(`${API}/uploads?kind=${encodeURIComponent(uploadKind)}`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      setFiles([]);
    }
  }

  useEffect(() => {
    fetchFiles();
  }, []);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API}/upload-audio/${encodeURIComponent(uploadKind)}`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Yükleme başarısız");
      }

      const data = await res.json();
      await fetchFiles();
      onSelect(data.filename);     // yeni dosyayı otomatik seç
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(filename, e) {
    e.stopPropagation();
    try {
      await fetch(`${API}/uploads/${encodeURIComponent(filename)}?kind=${encodeURIComponent(uploadKind)}`, {
        method: "DELETE",
      });
      if (selectedFile === filename) onSelect(null);
      await fetchFiles();
    } catch {
      /* ignore */
    }
  }

  function formatBytes(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Orijinal dosya adını göster (prefix'i at)
  function displayName(fname) {
    const parts = fname.split("_");
    if (parts.length > 1) return parts.slice(1).join("_");
    return fname;
  }

  return (
    <div className="audio-upload">
      <div className="audio-upload-header">
        <span className="audio-upload-title">🎵 {uploadKind === "ambient" ? "Ambient Noise" : "Custom Audio"}</span>
        <button
          className="btn-upload"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          title="Ses dosyası yükle"
        >
          {uploading ? "⏳" : "+ Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED}
          style={{ display: "none" }}
          onChange={handleUpload}
        />
      </div>

      {error && <div className="audio-upload-error">{error}</div>}

      {files.length === 0 ? (
        <div className="audio-upload-empty">
          Henüz dosya yok.
          <br />
          <span style={{ opacity: 0.5 }}>WAV, MP3, FLAC, OGG, M4A</span>
        </div>
      ) : (
        <ul className="audio-file-list">
          {files.map((f) => {
            const isSelected = selectedFile === f.filename;
            return (
              <li
                key={f.filename}
                className={`audio-file-item ${isSelected ? "selected" : ""}`}
                onClick={() => onSelect(isSelected ? null : f.filename)}
                title={f.filename}
              >
                <span className="audio-file-icon">{isSelected ? "▶" : "◎"}</span>
                <span className="audio-file-name">{displayName(f.filename)}</span>
                <span className="audio-file-size">{formatBytes(f.size_bytes)}</span>
                <button
                  className="audio-file-delete"
                  onClick={(e) => handleDelete(f.filename, e)}
                  title="Sil"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
