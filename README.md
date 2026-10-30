# Wind Forecast Intelligence

Production-grade full-stack analytics platform built for a UK electricity utility to evaluate national wind power generation forecasts (`WINDFOR`) against metered actual generation (`FUELHH`) for day-ahead wholesale electricity procurement across **January 1 to January 31, 2026**.

---

## 1. Business Problem & Product Overview

A UK electricity utility procures power in the wholesale day-ahead auction. Because wind generation is weather-driven and highly variable, the trading desk must estimate how much wind output will be available on the next delivery day before submitting auction bids at gate closure.

**Wind Forecast Intelligence** enables energy traders, quantitative analysts, and risk teams to:
1. **Reconstruct Decision-Time Forecasts**: Select the exact historical forecast publication that was available at or before the day-ahead purchasing decision cutoff (excluding subsequent intraday revisions).
2. **Compare Forecasts vs. Actuals**: Evaluate selected day-ahead wind forecasts against metered settlement-period actual wind generation.
3. **Quantify Procurement Error**: Compute Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), Mean Forecast Error (Bias), 90th-percentile error, and maximum single-period error in Megawatts (MW).
4. **Identify Systematic Bias**: Detect whether the forecast systematically overforecasts (`forecast > actual`, exposing the utility to day-ahead volume shortfalls and imbalance buy prices) or underforecasts (`forecast < actual`).
5. **Audit Publication Revisions**: Inspect the full chronological trajectory of forecast revisions (`publishTime`) for any delivery period in January 2026.

---

## 2. Features & Views

- **Overview**: Executive KPI cards (MAE, RMSE, Bias, Matched Delivery Periods & Completeness), directional overforecasting vs. underforecasting breakdown, interactive Forecast vs. Actual generation time-series chart, Daily MAE & Bias trend chart, and signed Error Distribution histogram.
- **Forecast Explorer**: Interactive single-day or date-range half-hourly settlement table (`SP1`–`SP48`), sortable by delivery period, forecast, actual, signed error, and absolute error, with peak error highlighting, search filtering, one-click CSV export, and direct links to inspect any period's publication history.
- **Accuracy Analysis**: Detailed statistical metrics with formula tooltips, sample accounting (`n` matched pairs, unmatched `:30` actuals, excluded post-cutoff revisions), daily error evolution, and tables of the largest overforecasting and underforecasting delivery periods.
- **Publication History**: Chronological revision explorer for any January 2026 delivery period showing `publishTime`, `generation` (MW), revision delta (`Δ MW`), lead time, cutoff offset, and eligibility status (`Selected at Cutoff`, `Eligible · Superseded`, `Excluded · Post-Cutoff`).
- **Data Quality**: Live Elexon BMRS API status, verified dataset schemas, duplicate and malformed record counts, resolution mismatch documentation, daily completeness audit table, and explicit upstream cache refresh controls.

---

## 3. Architecture & Data Flow

```text
+-------------------------------------------------------------------+
| React + TypeScript + Tailwind CSS + Recharts Dashboard            |
| (Overview | Forecast Explorer | Accuracy | History | Data Quality)|
+---------------------------------+---------------------------------+
                                  | REST JSON (/api/*)
                                  v
+-------------------------------------------------------------------+
| Python 3.11+ FastAPI Backend (backend/app/main.py)                |
|  - ElexonClient (HTTPX AsyncClient + retries + disk/memory cache) |
|  - DataProcessor (UTC/Europe-London DST normalization & dedup)    |
|  - ForecastSelector (Day-ahead decision cutoff filter)            |
|  - MetricsService (Pandas & NumPy MAE, RMSE, Bias, distributions) |
+---------------------------------+---------------------------------+
                                  | HTTPS (Async HTTPX)
                                  v
+-------------------------------------------------------------------+
| Official Elexon Insights Solution (BMRS) Open API v1              |
|  - GET /datasets/FUELHH/stream (Actual Generation, fuelType=WIND) |
|  - GET /datasets/WINDFOR/stream (Wind Generation Forecasts)       |
+-------------------------------------------------------------------+
```

---

## 4. Official Elexon Data Sources & Verified Schemas

### Actual Wind Generation (`FUELHH/stream`)
- **Endpoint**: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream`
- **Query Parameters**: `settlementDateFrom=2026-01-01&settlementDateTo=2026-01-31&fuelType=WIND`
- **Verified Response Schema**:
  ```json
  {
    "dataset": "FUELHH",
    "publishTime": "2026-01-01T00:30:00Z",
    "startTime": "2026-01-01T00:00:00Z",
    "settlementDate": "2026-01-01",
    "settlementPeriod": 1,
    "fuelType": "WIND",
    "generation": 13756
  }
  ```
- **Granularity & Units**: Half-hourly settlement periods (`:00` and `:30` UTC; 48 periods/day in winter = **1,488 records** in January 2026), reported in **MW**.

### Wind Generation Forecast (`WINDFOR/stream`)
- **Endpoint**: `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream`
- **Query Parameters**: `publishDateTimeFrom=2025-12-28T00:00:00Z&publishDateTimeTo=2026-02-01T00:00:00Z`
- **Verified Response Schema**:
  ```json
  {
    "dataset": "WINDFOR",
    "publishTime": "2026-01-14T09:30:00Z",
    "startTime": "2026-01-15T12:00:00Z",
    "generation": 11178
  }
  ```
- **Granularity & Publication Cadence**:
  - `WINDFOR` publishes 8 forecast runs per day (typically at `02:30`, `04:30`, `07:30`, `09:30`, `11:30`, `15:30`, `18:30`, and `22:30` UTC).
  - Each run forecasts hourly delivery timestamps (`:00` minutes only; 24 delivery periods/day = **744 hourly delivery periods** across January 2026, with **~24 historical forecast revisions** per delivery period, totaling **18,080+ January 2026 forecast records**).

---

## 5. Data Schema, Timestamp Conventions & Resolution Alignment

- **Canonical Storage & Matching**: All `startTime` and `publishTime` timestamps are parsed into timezone-aware UTC (`YYYY-MM-DDTHH:MM:SSZ`) and paired with UK local time (`Europe/London`) to accurately handle GMT/BST daylight-saving transitions (46 half-hour periods on spring forward day, 50 on autumn fallback day, 48 on standard winter days).
- **Exact Delivery-Period Matching (Zero Synthetic Interpolation)**:
  - Because `FUELHH` reports at 30-minute resolution (`:00` and `:30`) while `WINDFOR` reports at 60-minute resolution (`:00` only), records are matched strictly on exact `startTime` without fabricating or interpolating `:30` forecasts.
  - Across January 1–31, 2026, all **744 hourly (`:00`) periods** form valid matched forecast-actual pairs (`100%` hourly completeness), while the **744 half-hourly (`:30`) actual records** are preserved in the Forecast Explorer and explicitly accounted for as unmatched half-hourly actuals in the Data Quality report.

---

## 6. Forecast-Selection Logic & Decision Cutoff Assumptions

For each delivery period with UK settlement date $D$:
1. Compute the decision cutoff timestamp in `Europe/London` local time:
   $$\text{cutoff\_utc} = \text{combine}(D - \text{cutoff\_days\_before}, \text{cutoff\_time})_{\text{Europe/London}} \rightarrow \text{UTC}$$
2. Identify all retrieved `WINDFOR` publications for that `startTime` and sort chronologically by `publishTime`.
3. Filter to **eligible publications** where $\text{publishTime} \le \text{cutoff\_utc}$.
4. Select the **most recent eligible publication** ($\max(\text{publishTime})$) and record its `publishTime` and age at cutoff ($\text{cutoff\_utc} - \text{publishTime}$).
5. **Exclude all post-cutoff revisions** ($\text{publishTime} > \text{cutoff\_utc}$) from procurement accuracy metrics while retaining them in the Publication History view for comparison.

**Default Cutoff Assumption**: `11:00` UK local time on `D-1` (1 day before the delivery settlement date), aligned with the GB day-ahead wholesale electricity auction gate closure window (EPEX SPOT / N2EX 11:00 GMT). Users can adjust both the cutoff time (`06:00`, `09:30`, `11:00`, `15:30`, `18:00`, `22:30`) and horizon (`D-1`, `D-2`, `D-0`) in the UI or via environment variables.

---

## 7. Metric Definitions

Calculated strictly over valid matched `(forecast, actual)` pairs ($n$):

- **Signed Forecast Error**:
  $$\text{error}_i = \text{forecast}_i - \text{actual}_i \quad (\text{MW})$$
  Positive values ($+\text{MW}$) indicate **overforecasting**; negative values ($-\text{MW}$) indicate **underforecasting**.
- **Mean Absolute Error (MAE)**:
  $$\text{MAE} = \frac{1}{n}\sum_{i=1}^{n} |\text{forecast}_i - \text{actual}_i| \quad (\text{MW})$$
- **Root Mean Squared Error (RMSE)**:
  $$\text{RMSE} = \sqrt{\frac{1}{n}\sum_{i=1}^{n} (\text{forecast}_i - \text{actual}_i)^2} \quad (\text{MW})$$
- **Mean Forecast Error (Bias)**:
  $$\text{Bias} = \frac{1}{n}\sum_{i=1}^{n} (\text{forecast}_i - \text{actual}_i) \quad (\text{MW})$$

*(Percentage error is intentionally omitted as a primary metric because wind generation can approach zero MW.)*

---

## 8. Known Limitations & Data-Quality Considerations

1. **Resolution Difference (`FUELHH` 30m vs. `WINDFOR` 60m)**: Elexon `WINDFOR` only publishes forecasts at top-of-hour (`:00`) timestamps. Half-hourly (`:30`) actuals are preserved in the explorer table and reported as unmatched half-hourly actuals rather than synthetically interpolated.
2. **BM-Metered vs. National Wind Scope**: In live January 2026 Elexon data, `WINDFOR` exhibits a positive mean bias (`+1,839.9 MW` at the `11:00 D-1` cutoff) relative to `FUELHH` WIND because `WINDFOR` estimates total national wind generation capability whereas `FUELHH` reflects Balancing Mechanism (BM) metered wind output after transmission constraints and curtailment.
3. **Caching & Persistence Tradeoffs**: The MVP uses a file-backed JSON cache (`/tmp/wind_forecast_cache`) combined with in-memory state. This requires zero external database setup, survives process restarts in local/Docker environments, and preserves the last valid dataset if an upstream Elexon refresh fails. On ephemeral serverless filesystems, `/tmp` persists for the warm container lifecycle.

---

## 9. Repository Directory Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes.py            # FastAPI REST endpoints (/api/*)
│   │   ├── schemas/
│   │   │   └── models.py            # Typed Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── elexon_client.py     # Async HTTPX Elexon client + disk/memory cache
│   │   │   ├── data_processor.py    # UTC/UK DST normalization & deduplication
│   │   │   ├── forecast_selector.py # Day-ahead decision cutoff selection service
│   │   │   ├── metrics.py           # Pandas/NumPy MAE, RMSE, Bias & histograms
│   │   │   └── analytics_engine.py  # End-to-end orchestration
│   │   ├── config.py                # Environment settings
│   │   └── main.py                  # FastAPI application entrypoint
│   ├── tests/
│   │   └── test_analytics.py        # Pytest unit & endpoint test suite
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                        # Standalone Vite + React + TypeScript setup
│   ├── src/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── components/                      # Modular React dashboard views & controls
├── lib/                             # TypeScript types, API client & pure utilities
├── app/                             # Next.js runtime host & FastAPI proxy (/api/*)
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 10. Local Setup & Running Tests

### 1. Start the Python FastAPI Backend
```bash
cd backend
python3 -m venv ../.venv
source ../.venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start the Frontend
```bash
# Using the root web server (automatically proxies /api/* to FastAPI on port 8000):
npm install
npm run dev

# Or using the standalone Vite frontend:
cd frontend
npm install
npm run dev
```

### 3. Run Automated Tests
```bash
# Backend Pytest suite (cutoff selection, metrics, DST edge cases, cache fallback, schemas):
PYTHONPATH=backend .venv/bin/pytest backend/tests/test_analytics.py -v

# Frontend TypeScript unit tests (formatting, filtering, validation, CSV builder):
npx --yes tsx --test lib/wind-utils.test.ts
```

---

## 11. Docker Setup

Run both the Python FastAPI backend (`:8000`) and the frontend (`:5173`) with Docker Compose:

```bash
cp .env.example .env
docker compose up --build
```

- Frontend Dashboard: `http://localhost:5173`
- FastAPI Backend & Swagger Docs: `http://localhost:8000/docs`

---

## 12. Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `ELEXON_BASE_URL` | `https://data.elexon.co.uk/bmrs/api/v1` | Official Elexon BMRS API v1 root URL |
| `ELEXON_TIMEOUT_SECONDS` | `25` | HTTP timeout for Elexon requests |
| `DEFAULT_CUTOFF_TIME` | `11:00` | Default day-ahead decision cutoff (`HH:MM` UK local) |
| `DEFAULT_CUTOFF_DAYS_BEFORE` | `1` | Default cutoff day offset (`1` = `D-1`) |
| `CACHE_DIR` | `/tmp/wind_forecast_cache` | Directory for cached Elexon JSON payloads |
| `CACHE_TTL_SECONDS` | `3600` | Cache time-to-live in seconds |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Allowed CORS origins for FastAPI |
| `VITE_API_BASE_URL` | `http://localhost:8000/api` | API base URL for Vite frontend builds |

---

## 13. Deployment Instructions

### Deploying the Backend (Render / Railway / Fly.io / Cloud Run)
1. Point the hosting service to the `/backend` directory using `backend/Dockerfile`.
2. Set environment variables (`ELEXON_BASE_URL`, `DEFAULT_CUTOFF_TIME=11:00`, `DEFAULT_CUTOFF_DAYS_BEFORE=1`, and `CORS_ORIGINS=https://<your-vercel-domain>.vercel.app`).
3. Verify health check at `https://<your-backend-host>/api/health`.

### Deploying the Frontend to Vercel
1. Import the repository into Vercel and set the Root Directory to `frontend` (for Vite) or `/` (for Next.js).
2. Configure `VITE_API_BASE_URL=https://<your-backend-host>/api` (or `BACKEND_URL=https://<your-backend-host>`).
3. Deploy and verify live communication with the Python FastAPI backend.

- **Deployed Frontend URL Placeholder**: `https://wind-forecast-intelligence.vercel.app` *(manual deployment step required outside local container)*
- **Deployed Backend URL Placeholder**: `https://wind-forecast-intelligence-api.onrender.com`

---

## 14. AI Tools Disclosure

In accordance with assignment guidelines, AI-assisted software engineering tools were used during development to assist with boilerplate generation, Elexon BMRS endpoint schema inspection, TypeScript/Pydantic type modeling, and automated unit test scaffolding. All mathematical formulas, cutoff selection rules, and real January 2026 Elexon dataset behaviors were verified against live API responses and automated tests.
