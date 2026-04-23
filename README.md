# spinal-organ-cnp-report

Generates weekly temperature report Excel files from BMS multicapteur data in a SpinalCom digital twin.

## What it does

- Connects to a SpinalCom Hub and reads multicapteur BMS endpoints grouped by **floor** (01–07) and **zone** (A, B, C, D)
- For each day (Monday–Friday), queries endpoint timeseries at **8:00 AM** (morning) and **1:30 PM** (evening)
- Computes **max**, **min**, and **average** temperature per floor/zone for each period
- Fills an Excel template with the computed values (color-coded: orange if < 18°C, green otherwise)
- Outputs one `.xlsx` file per day: `Relevé T° DD-MM-YY.xlsx`

## Scheduling

In production mode, a cron job runs **every Friday at 7:00 PM** and generates reports for the entire week (Monday–Friday).

## Environment variables

Create a `.env` file with:

```env
# SpinalCom Hub connection
SPINALHUB_PROTOCOL=http
SPINALHUB_IP=localhost
SPINALHUB_PORT=7777
USER_ID=admin
USER_PASSWORD=admin
DIGITALTWIN_PATH=/__users__/admin/Digital twin

# Graph traversal
CONTEXT_NAME=
CATEGORY_NAME=
GROUP_NAME=

# Multicapteur attribute parsing
CAT_ATTR_NAME=
ATTR_NAME=

# BMS endpoint resolution
CP_PROFILE_NAME=
BMS_ENDPOINT_NAME=

# Excel
EXCEL_FILE_NAME=template.xlsx
EXCEL_FILE_SHEET_NAME=Sheet1

# Email (optional)
SMTP_HOST=
SMTP_EMAIL=
SMTP_PASS=
MAIL_FROM=
MAIL_TO=
```

## Build & run

```bash
npm run build
```

**Production** (waits for Friday 7pm cron):

```bash
npm start
```

**Test mode** — generate a single day report immediately:

```bash
# Yesterday
node dist/src/index.js --run-now

# Specific date
node dist/src/index.js --run-now 2026-04-15
```
