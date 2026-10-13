# 🪘 Raas Dandiya & Garba Night 2026 — Access Scanner & Admin Portal

A high-speed, secure event access control suite and live barcode scanner built for **Raas Dandiya & Garba Night 2026** (Dr. D. Y. Patil Varale Campus).

---

## 🌟 Key Features

### 1. 🎟️ Live Barcode & Pass Scanning
- **Live Optical Camera Scanner**: Scan barcodes directly from phone cameras and laptops with camera flip, torch toggle, and optical HUD crosshairs.
- **Hardware Laser Barcode Gun Buffer**: High-speed auto-focused buffer with instant response on USB/Bluetooth gun scans.
- **Synthesized Web Audio API**: Harmonic chime for admission (`ACCESS GRANTED`), harsh low-frequency security buzzer for duplicate passes (`SECOND ENTRY DENIED`).
- **Strict Anti-Duplicate Protection**: Instantly blocks reuse of passes, displaying original check-in timestamp and volunteer gate station.
- **Cooldown Throttle**: 3-second anti-duplicate delay preventing double-firing.

### 2. 🛡️ Role-Based Access & Master Credentials
- **Administrator Email**: `rccindia@webworksstudios.com`
- **Administrator Password**: `DYPWEBP2026`
- **Gate Volunteers**: Stations `gate1`, `gate2`, `gate3` (Passcode: `dandiya2026`).

### 3. 📊 Real-Time Analytics & College Breakdown
- Live counters of total attendees (1,362), admitted attendees, and pending arrivals.
- Synchronized monitoring cards for all 5 colleges:
  - **DYPIMED** (212 passes)
  - **DYPCOEI** (402 passes)
  - **DYPTC** (505 passes)
  - **DYPSOA** (35 passes)
  - **BOX OFFICE** (208 passes)
- Centralized Gate Audit Log tracking all admissions and fraud prevention attempts.

### 4. 👥 Attendee Verification Directory & Actions
- Instant search by Name, Barcode, Roll Number, Phone, or Division.
- Filter by College and Admission Status.
- Manual check-in override for attendees who forgot their physical pass.
- One-click undo check-in action.
- Official attendance CSV export.
- Pre-reset auto-backup before any system reset.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Locally
```bash
python app.py
```
Access the application at:
- **Local:** `http://127.0.0.1:5000`
- **Mobile Wi-Fi:** `http://<your-lan-ip>:5000`

---

## 📁 Repository Structure
```
dandiyaa/
├── app.py                      # Flask API & Access Server
├── db_loader.py                # Database initializer & loader from Sheet.xlsx
├── database.json               # TinyDB database for 1,362 attendees & users
├── requirements.txt            # Python dependencies
├── vercel.json                 # Vercel Serverless deployment config
├── api/
│   └── index.py                # Vercel entrypoint
├── templates/
│   └── index.html              # Festive Garba luxury UI
├── static/
│   ├── css/style.css           # Glassmorphism festive styling
│   └── js/app.js               # Audio synthesis, camera scanner, API client
├── Pass_designs/               # 5 high-resolution pass templates
├── Sheet.xlsx                  # Master student dataset
└── README.md
```
