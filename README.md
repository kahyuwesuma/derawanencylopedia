# Derawan Encyclopedia — Dynamic Gallery System

## Arsitektur

```
Derawan-Encyclopedia/
├── server.js          ← Express API backend (baru)
├── package.json       ← dependencies
├── gallery.html       ← halaman galeri dinamis (baru)
├── index.html         ← halaman utama (tidak berubah)
└── assets/
    ├── 01_DIVE SITES MARATUA/
    │   ├── 01_Channel/
    │   │   └── Chevron barracuda_channel_maratua_09_08_26_armindo.jpg
    │   └── ...
    ├── 02_DIVE SITES KAKABAN/
    └── ...
```

---

## Setup & Jalankan

### 1. Install dependencies
```bash
npm install
```

### 2. Jalankan server
```bash
# Production
npm start

# Development (auto-restart saat ada perubahan kode)
npm run dev
```

### 3. Buka di browser
- **Galeri:** http://localhost:3001/gallery.html
- **API:**    http://localhost:3001/api/gallery
- **Meta:**   http://localhost:3001/api/gallery/meta

---

## Konvensi Nama File

### Format
```
[species]_[detail opsional]_[site]_[region]_[DD]_[MM]_[YY]_[photographer].[ext]
```

### Contoh
```
Chevron barracuda_channel_maratua_09_08_26_armindo.jpg
→ species:      Chevron barracuda
→ location:     Channel · Maratua
→ date:         09-08-2026
→ photographer: Armindo

Green turtle_turtle parade_maratua_15_03_25_azman.jpeg
→ species:      Green turtle
→ location:     Turtle parade · Maratua
→ date:         15-03-2025
→ photographer: Azman
```

### Ekstensi yang didukung
- **Gambar:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- **Video:**  `.mp4`, `.mov`, `.avi`

---

## API Reference

### `GET /api/gallery`
Mengembalikan semua file, dengan optional filter:
```
?region=Maratua        filter by region (case-insensitive)
?site=Channel          filter by dive site
?type=image|video      filter by file type
?search=barracuda      full-text search
```

**Response:**
```json
[
  {
    "region": "DIVE SITES MARATUA",
    "site": "Channel",
    "files": [
      {
        "filename": "Chevron barracuda_channel_maratua_09_08_26_armindo.jpg",
        "url": "/assets/01_DIVE SITES MARATUA/01_Channel/Chevron barracuda...",
        "type": "image",
        "metadata": {
          "species": "Chevron barracuda",
          "location": "Channel · Dive Sites Maratua",
          "date": "09-08-2026",
          "photographer": "Armindo"
        }
      }
    ]
  }
]
```

### `GET /api/gallery/meta`
Statistik & daftar region/site untuk filter UI.

### `POST /api/gallery/refresh`
Force invalidate cache (berguna untuk webhook CI/CD).

---

## Auto-Update

File watcher (Chokidar) berjalan di background. Setiap kali file baru ditambahkan atau dihapus dari folder `assets/`, cache otomatis di-invalidate. Request berikutnya ke `/api/gallery` akan memuat data terbaru.

Frontend juga melakukan **polling setiap 60 detik** untuk mendeteksi perubahan.

---

## Watermark

Dua lapis watermark, keduanya **non-destructive** (file asli tidak diubah):

1. **CSS Overlay** — tampil saat hover pada kartu galeri
   - Format: `Species • Site • Region • © Photographer`
   - Gradient dark di bagian bawah gambar
   
2. **Canvas Watermark** — tampil di lightbox
   - Digambar di atas elemen `<canvas>` terpisah
   - Format 2 baris: species + lokasi/fotografer/tanggal
   - Branding situs di kanan bawah

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Galeri kosong / "Backend not reachable" | Pastikan `npm start` sudah jalan di terminal |
| Gambar tidak muncul | Cek path file di `/api/gallery` — pastikan folder `assets/` ada |
| File baru tidak muncul | Tunggu max 60 detik atau POST ke `/api/gallery/refresh` |
| CORS error di browser | `cors` sudah dikonfigurasi — pastikan mengakses via `localhost:3001` |
