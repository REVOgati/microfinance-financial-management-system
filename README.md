# Direct Capitol Management System

A custom, lightweight, serverless Core Banking and Microfinance ERP built entirely on **Google Apps Script (GAS)** and **Google Sheets**.

This system manages Customers, Loans, Repayments, Savings, and Capital Reserves through a secure, custom-built HTML Web App interface that directly reads and writes to a Google Sheets database. No paid servers, no databases, no external dependencies — everything runs on Google's infrastructure.

## System Architecture

*   **Frontend:** HTML, CSS, Vanilla JavaScript served via GAS `HtmlService`.
*   **Backend:** Google Apps Script (`.gs` files).
*   **Database:** Google Sheets (6 sheets: `customers`, `loans`, `repayments`, `savings`, `transactions`, `operations`).
*   **Hosting:** Google Cloud (Serverless Web App — zero infrastructure cost).

---

## Prerequisites

*   A Google Account.
*   A Google Drive file (PNG/JPG) to use as the company logo.
*   Basic familiarity with Google Sheets and Google Apps Script.

---

## Setup & Deployment Guide

Follow these steps exactly to get a live instance running.

### Step 1 — Create the Google Spreadsheet

1.  Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2.  Copy the **Spreadsheet ID** from the URL:
    `https://docs.google.com/spreadsheets/d/**<SPREADSHEET_ID>**/edit`
3.  Inside the spreadsheet, create the following **6 sheets** (tabs) with these exact names and headers in **Row 1**:

**`customers`** — 15 columns:
```
customer_id | first_name | last_name | full_name | phone | email | national_id | kra_pin | date_registered | customer_status | total_loans_taken | total_loans_outstanding | total_savings_balance | risk_level | notes
```

**`loans`** — 13 columns:
```
loan_id | national_id | principal_amount | interest_rate | loan_period | expected_end_date | payment_frequency | loan_status | issue_date | periodic_repayment | total_expected_repayment | total_paid | remaining_balance
```

**`repayments`** — 7 columns:
```
repayment_id | loan_id | national_id | amount_paid | payment_date | payment_method | notes
```

**`savings`** — 6 columns:
```
savings_id | national_id | transaction_type | amount | date | notes
```

**`transactions`** — 8 columns:
```
transaction_id | timestamp | national_id | type | reference_id | amount | payment_method | transaction_cost
```

**`operations`** — This sheet requires manual data entry (see below):

| Row | Col A | Col B | Col C |
|-----|-------|-------|-------|
| 1 | `sub_reserve` | `balance` | `last_updated` *(headers)* |
| 2 | `Cash` | *(opening balance)* | |
| 3 | `KCB Bank` | *(opening balance)* | |
| 4 | `I & M Bank` | *(opening balance)* | |
| 5 | `Mpesa` | *(opening balance)* | |
| 6 | `TOTAL RESERVE` | `=SUM(B2:B5)` | *(leave blank)* |
| 7 | *(blank)* | | |
| 8 | `top_up_id` | `date` | `sub_reserve` *(top-up log headers, continue to cols D–E: `amount`, `notes`)* |

> **Important:** Enter your actual opening balances (in Ksh) for each sub-reserve in Column B rows 2–5 before running the initializer.

### Step 2 — Upload the Logo to Google Drive

1.  Upload your company logo image to Google Drive.
2.  Copy the **File ID** from the shareable link:
    `https://drive.google.com/file/d/**<FILE_ID>**/view`
3.  Make sure the file's sharing is set to **"Anyone with the link can view"**.

### Step 3 — Configure `Main.gs`

Open `Main.gs` and update the two constants at the very top:

```javascript
const SPREADSHEET_ID   = "YOUR_SPREADSHEET_ID_HERE";
const DRIVE_LOGO_FILE_ID = "YOUR_DRIVE_FILE_ID_HERE";
```

### Step 4 — Create the Google Apps Script Project

1.  Go to [script.google.com](https://script.google.com) → **New project**.
2.  Delete the default `Code.gs` content.
3.  Copy the contents of `Main.gs` into the default script file (rename it `Main` if desired).
4.  Create the following additional HTML files via **File → New → HTML file** and paste the corresponding file content into each:
    *   `Index`
    *   `CustomerForm`
    *   `LoanForm`
    *   `RepaymentForm`
    *   `SavingsForm`
    *   `OperationsForm`

> **Note:** In Apps Script the file names must match exactly what is passed to `HtmlService.createTemplateFromFile()` and `HtmlService.createHtmlOutputFromFile()`. The `.html` extension is omitted in those calls — the editor adds it automatically.

### Step 5 — Run the One-Time Sheet Initializer

This step protects the `TOTAL RESERVE` formula cell (B6 on `operations`) from accidental manual edits.

1.  In the Apps Script editor, select the function `initOperationsSheet` from the function dropdown.
2.  Click **Run**.
3.  Authorize the script when prompted (it needs Sheets and Drive access).
4.  Confirm in the `operations` sheet that cell B6 now shows a lock icon.

> Run this **only once**. Re-running it is safe (it removes existing protections before adding a fresh one), but unnecessary.

### Step 6 — Deploy as a Web App

1.  In the Apps Script editor, click **Deploy → New deployment**.
2.  Click the gear icon ⚙ next to "Select type" → choose **Web app**.
3.  Fill in the deployment settings:
    *   **Description:** e.g. `v1`
    *   **Execute as:** `Me` *(uses your Google account credentials to access Sheets)*
    *   **Who has access:** `Anyone` *(or restrict to your organization)*
4.  Click **Deploy** and copy the generated **Web App URL**.
5.  Paste the URL into your browser — the dashboard should load with your logo.

> Every time you edit `Main.gs` or any HTML file, you must **redeploy** (Deploy → Manage deployments → edit the existing deployment and bump the version) for changes to take effect at the live URL.

## File Structure

*   **`Main.gs`**: The core controller. Contains the `doGet(e)` function to serve the web app, handles templating (injecting the Google Drive Logo), all CRUD operations (`saveCustomer`, `saveLoan`, `saveRepayment`, `saveSavings`), the Transaction Cost Engine, Operations sheet functions, and every helper/utility used by the app.
*   **`Index.html`**: The main Single Page Application (SPA) dashboard. Contains the UI layout, navigation logic, mobile-responsive CSS, the central logo `<?= logoUrl ?>` scriptlet, and all `google.script.run` call handlers for every form.
*   **`CustomerForm.html`**: HTML partial for the customer registration form.
*   **`LoanForm.html`**: HTML partial for issuing new loans, including a dual date-picker (text + calendar) for the expected end date and a payment method selector.
*   **`RepaymentForm.html`**: HTML partial for the two-step repayment flow (search by National ID → select from active-loan dropdown).
*   **`SavingsForm.html`**: HTML partial for savings deposits and withdrawals, including a payment method selector.
*   **`OperationsForm.html`**: HTML partial for the Operations panel, with two tabs: Manual Top-Up and View Status.

## Core Features & Logic

### 1. Auto-ID Generation
Handled via GAS `PropertiesService` with `LockService` to guarantee uniqueness under concurrent submissions. The system generates sequential, zero-padded IDs for all entity types:

| Entity | Prefix | Property Key |
|---|---|---|
| Customer | `CUST-KE-XXXX` | `CUST_SEQ` |
| Loan | `LN-KE-XXXX` | `LOAN_SEQ` |
| Repayment | `RP-KE-XXXX` | `REP_SEQ` |
| Savings | `SV-KE-XXXX` | `SAVINGS_SEQ` |
| Transaction | `TXN-KE-XXXX` | `TXN_SEQ` |
| Top-Up | `TOP-KE-XXXX` | `TOPUP_SEQ` |

### 2. Relational Data Management
*   **Loans:** Linked to customers via `national_id`. Auto-calculates `total_expected_repayment` and `periodic_repayment` using the formula: `principal + (principal × rate% × period)`. Captures payment method, issue date, and expected end date.
*   **Repayments (Two-Step UX):** Staff first search by National ID to retrieve only that customer's active (unpaid) loans in a dropdown showing Loan ID, Issue Date, and Remaining Balance. Submitting a payment batches the update to Columns L (Total Paid) and M (Remaining Balance) in a single API call.
    *   *Status Trigger:* When Remaining Balance reaches `0`, `loan_status` (Col H) is automatically set to `FULLY PAID`.
*   **Customer Aggregates:** `total_loans_taken` and `total_loans_outstanding` on the `customers` sheet are updated automatically on every loan issue and repayment. `total_savings_balance` is updated on every deposit or withdrawal.

### 3. Transaction Logging
Every financial action is appended to the `transactions` sheet. The log includes **8 columns**:

| Column | Field |
|---|---|
| A | `transaction_id` (`TXN-KE-XXXX`) |
| B | `timestamp` |
| C | `national_id` |
| D | `type` (`LOAN_ISSUE`, `LOAN_REPAYMENT`, `DEPOSIT`, `WITHDRAWAL`) |
| E | `reference_id` (Loan ID or Savings ID) |
| F | `amount` |
| G | `payment_method` |
| H | `transaction_cost` (Ksh) |

### 4. Transaction Cost Engine
A set of pure functions that compute the outbound fee charged by each payment channel on disbursal. Incoming transactions (repayments, deposits) are always cost-free.

| Function | Channel | Notes |
|---|---|---|
| `getMpesaCost(amount)` | Safaricom M-Pesa | Tiered, 11 bands up to 250,000 |
| `getCashCost(amount)` | Cash | Tiered, 12 bands up to 250,000 |
| `getKCBCost(amount)` | KCB Bank | Tiered, 10 bands up to 150,000 |
| `getIMBankCost(amount)` | I & M Bank | Always 0 (waived/bundled) |
| `getTransactionCost(type, amount, method)` | Dispatcher | Routes to the correct tariff function |

Costs are recorded in the `transactions` log and automatically deducted from the relevant sub-reserve on every outbound payment.

### 5. Operations & Capital Reserve Management
A dedicated `operations` sheet tracks the company's capital across all payment channels in real time.

**Sheet Structure:**

| Row | Content |
|---|---|
| Row 1 | Header |
| Rows 2–5 | Sub-reserves: Cash, KCB Bank, I & M Bank, Mpesa (Col A = name, Col B = balance, Col C = last updated) |
| Row 6 | **TOTAL RESERVE** — formula `=SUM(B2:B5)`, **protected** from manual edits |
| Row 8 | Top-up log header |
| Row 9+ | Top-up log entries (`TOP-KE-XXXX`, date, sub-reserve, amount, notes) |

**GAS Functions:**

*   `initOperationsSheet()` — Run once after creating the sheet. Protects cell B6 (TOTAL RESERVE) so only the spreadsheet owner can edit it.
*   `updateSubReserve(paymentMethod, netChange)` — Called automatically on every financial transaction. Adds `netChange` to the correct sub-reserve row and stamps the timestamp.
*   `getOperationsStatus()` — Returns all sub-reserves (rows 2–6) as a plain object with `balance` and `lastUpdated` fields.
*   `manualTopUp(data)` — Validates the sub-reserve name and amount, credits the balance, and appends a `TOP-KE-XXXX` entry to the top-up log.

**Reserve flow by transaction type:**

| Transaction | Effect on Sub-Reserve |
|---|---|
| Loan Issue | Debited by `principal + transaction_cost` |
| Loan Repayment | Credited by `amount_paid` |
| Savings Deposit | Credited by `amount` |
| Savings Withdrawal | Debited by `amount + transaction_cost` |
| Manual Top-Up | Credited by top-up `amount` |

### 6. Mobile-Responsive Dashboard
The dashboard uses CSS Flexbox. A media query at `≤600px` stacks navigation buttons vertically (full-width, 85% of viewport) for tablet and phone compatibility.

---

## Development Notes

*   **Rate Limits:** Designed for low-to-medium concurrency. `LockService` in `getNextSeqId` prevents duplicate IDs, but `writeRow` intentionally does not use a lock to avoid lock contention within a single request that involves multiple sheet writes (e.g., `saveRepayment` writes to `repayments`, `loans`, `customers`, `operations`, and `transactions`).
*   **`SpreadsheetApp.flush()`:** Explicitly called before every `logTransaction()` invocation. This forces all buffered sheet writes to be committed before `logTransaction` triggers `LockService` (via `getNextSeqId`), which would otherwise discard the write buffer.
*   **Resetting Sequences:** To reset Auto-ID counters during testing, run the corresponding reset function from the GAS editor. All reset functions acquire `LockService.getScriptLock()` to avoid colliding with an in-flight ID generation.

| Reset Function | Resets |
|---|---|
| `resetCustomerCounter()` | `CUST_SEQ` |
| `resetLoanCounter()` | `LOAN_SEQ` |
| `resetRepaymentCounter()` | `REP_SEQ` |
| `resetSavingsCounter()` | `SAVINGS_SEQ` |
| `resetTransactionCounter()` | `TXN_SEQ` |
| `resetTopUpCounter()` | `TOPUP_SEQ` |

*   **Test Functions:** `testAddLoan()` and `testGetLoansByNationalId()` are available in `Main.gs` and can be run directly from the GAS Editor for manual QA. They dynamically read the first available record from the sheet to avoid hardcoded test data.