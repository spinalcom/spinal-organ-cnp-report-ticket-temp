# spinal-organ-cnp-report

Generates temperature and ticket report Excel files from BMS data in a SpinalCom digital twin, then sends them by email.

## What it does

### Temperature reports

- Connects to a SpinalCom Hub and reads multicapteur BMS endpoints grouped by **floor** (01–07) and **zone** (A, B, C, D)
- Queries endpoint timeseries at **8:00 AM** (morning) and **1:30 PM** (evening)
- Computes **max**, **min**, and **average** temperature per floor/zone
- Reads 6 **special rooms** (ICV) from a separate context, matches their BIM objects to known multicapteurs, and computes their average temperature
- Retrieves **outside temperature** and **hygrometry** from building-level METEO endpoints
- Fills an Excel template using tagged variables (`{{TOKEN}}`) discovered from the Template sheet, writes to the Production sheet
- Deletes the Template sheet from the output file
- Outputs one `.xlsx` file per period: `Relevé T° DD-MM-YY Matin.xlsx` / `Relevé T° DD-MM-YY Soir.xlsx`

### Ticket reports

- Traverses the ticket context and counts tickets by **process** and **status** within a configurable date range
- Fills the ticket Excel template using tagged variables, writes to the Production sheet
- Outputs one `.xlsx` file per week: `Tickets CNP DD-MM-YY_DD-MM-YY.xlsx`

### Email

Each report type is sent in a separate email with its own subject and body text, then the generated files can be cleaned up.

## Scheduling

| Report | Schedule | Configurable |
|---|---|---|
| Temperature (morning) | 8:30 AM, Mon–Fri | — |
| Temperature (evening) | 1:30 PM, Mon–Fri | — |
| Tickets | Friday 7:00 PM (default) | `TICKET_CRON` |

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

# Equipment graph traversal (multicapteurs)
CONTEXT_NAME=
CATEGORY_NAME=
GROUP_NAME=

# Special rooms graph traversal (ICV)
SPECIAL_ROOM_CONTEXT_NAME=
SPECIAL_ROOM_CATEGORY_NAME=
SPECIAL_ROOM_GROUP_NAME=

# Multicapteur attribute parsing
CAT_ATTR_NAME=
ATTR_NAME=

# BMS endpoint resolution
CP_PROFILE_NAME=
BMS_ENDPOINT_NAME=

# Excel templates (filenames inside templates/ folder)
EXCEL_FILE_NAME=TemplateCNPTempExtract.xlsx
TICKET_EXCEL_FILE_NAME=TemplateTicketsCNP.xlsx

# Ticket context
TICKET_CONTEXT=

# Scheduling
TICKET_CRON=0 19 * * 5

# Ticket date range (optional — if set, overrides automatic Friday-to-Friday)
# TICKET_DATE_START=2026-04-17T19:00:00

# Feature flags
ENABLE_TEMP_REPORT=true
ENABLE_TICKET_REPORT=true

# Email
SMTP_HOST=
SMTP_EMAIL=
SMTP_PASS=
MAIL_FROM=
MAIL_TO=
TEMP_MAIL_SUBJECT=
TICKET_MAIL_SUBJECT=
```

## Project structure

```
templates/          Excel templates (with Production + Template sheets)
prod/               Generated output files
src/
  index.ts          Main entry point, SpinalMain class, scheduling
  temperatureReport.ts  Floor/zone map, special rooms, temp report generation
  ticketReport.ts   Ticket counting and report generation
  utils.ts          Shared mappings and helpers
```

## Build & run

```bash
npm run build
```

**Production** (scheduled crons):

```bash
npm start
```

**Test modes** — run immediately and exit:

```bash
# All reports
node dist/index.js --run-now

# Temperature only (morning + evening)
node dist/index.js --run-temp

# Tickets only
node dist/index.js --run-tickets
```
