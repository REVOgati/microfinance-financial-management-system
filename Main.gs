const SPREADSHEET_ID = "Your Spreadsheet ID here";
const DRIVE_LOGO_FILE_ID = "Your Google Drive Image File ID here";

// Open the spreadsheet
function getSS() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// ===== Web App Entry Point =====
function doGet(e) {
  const template = HtmlService.createTemplateFromFile("Index");
  template.logoUrl = "https://lh3.googleusercontent.com/d/" + DRIVE_LOGO_FILE_ID;
  template.sheetsUrl = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit";
  
  return template.evaluate()
    .setTitle("Direct Capitol Management System")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setWidth(900)
    .setHeight(700);
}

// ===== Return HTML content of a form (pure HTML) =====
function getFormHtml(formName) {
  return HtmlService.createHtmlOutputFromFile(formName).getContent();
}

// ================= Auto-ID Generator =================
// LockService ensures only one execution increments the counter at a time,
// preventing duplicate IDs when multiple users submit simultaneously.
function getNextSeqId(prefix, propertyKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // Wait up to 10 seconds for the lock
  try {
    const props = PropertiesService.getScriptProperties();
    let count = parseInt(props.getProperty(propertyKey) || "0", 10);
    count++;
    props.setProperty(propertyKey, count.toString());
    return prefix + count.toString().padStart(4, '0');
  } finally {
    lock.releaseLock(); // Always release, even if an error occurs
  }
}

// ================= Utility =================
// setValues preserves exact data types (strings stay strings, numbers stay numbers).
// LockService is intentionally NOT used here — it belongs only in getNextSeqId
// where ID uniqueness must be guaranteed. Adding a lock here caused lock contention
// within a single saveRepayment execution (lock acquired 4 times: twice by
// getNextSeqId and twice by writeRow), which resulted in sheet updates to
// "loans" succeeding but "customers" failing silently when the lock timed out.
function writeRow(sheetName, rowData) {
  const sheet = getSS().getSheetByName(sheetName);
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);
}

// ================= Transactions Logger =================
function logTransaction(national_id, type, referenceID, amount, paymentMethod, transactionCost) {
  const row = [
    getNextSeqId("TXN-KE-", "TXN_SEQ"),
    new Date(),
    national_id,
    type,
    referenceID,
    amount,
    paymentMethod || "",
    transactionCost || 0
  ];
  writeRow("transactions", row);
}

// ================= Operations Sheet Initializer =================
// Run ONCE from the GAS Editor (Run > initOperationsSheet) after manually creating
// the 'operations' sheet and populating it with sub-reserve rows and header rows.
// Protects cell B6 (TOTAL RESERVE formula =SUM(B2:B5)) from manual edits.
function initOperationsSheet() {
  const ss = getSS();
  const sheet = ss.getSheetByName("operations");
  if (!sheet) throw new Error("'operations' sheet not found. Create it first.");

  // Remove any pre-existing range protections on this sheet before adding a fresh one.
  const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  existing.forEach(p => p.remove());

  const protection = sheet.getRange("B6").protect();
  protection.setDescription("TOTAL RESERVE — formula-driven, do not edit manually");
  protection.setWarningOnly(false);

  // Restrict editors to the spreadsheet owner only.
  const ownerEmail = ss.getOwner().getEmail();
  protection.addEditor(ownerEmail);
  protection.removeEditors(
    protection.getEditors().filter(e => e.getEmail() !== ownerEmail)
  );

  Logger.log("initOperationsSheet: cell B6 is now protected.");
}

// ================= Transaction Cost Engine =================
// Pure functions — no sheet access, no side effects.
// Adjust the tier thresholds and amounts below to match your actual tariff schedule.

// Safaricom M-Pesa send-money charges (company pays on disbursal):
function getMpesaCost(amount) {
  if (amount <= 100)   return 0;   // 1 – 100: Free
  if (amount <= 500)   return 7;   // 101 – 500
  if (amount <= 1000)  return 13;  // 501 – 1000
  if (amount <= 1500)  return 23;  // 1001 – 1500
  if (amount <= 2500)  return 33;  // 1501 – 2500
  if (amount <= 3500)  return 53;  // 2501 – 3500
  if (amount <= 5000)  return 57;  // 3501 – 5000
  if (amount <= 7500)  return 78;  // 5001 – 7500
  if (amount <= 10000) return 90;  // 7501 – 10000
  if (amount <= 15000) return 100; // 10001 – 15000
  return 108;                      // 15001 – 250000
}

// Cash handling charges:
function getCashCost(amount) {
  if (amount < 50)     return 0;   // Below minimum
  if (amount <= 100)   return 11;  // 50 – 100
  if (amount <= 2500)  return 29;  // 101 – 2500 (101-500 and 501-2500 both = 29)
  if (amount <= 3500)  return 52;  // 2501 – 3500
  if (amount <= 5000)  return 69;  // 3501 – 5000
  if (amount <= 7500)  return 87;  // 5001 – 7500
  if (amount <= 10000) return 115; // 7501 – 10000
  if (amount <= 15000) return 167; // 10001 – 15000
  if (amount <= 20000) return 185; // 15001 – 20000
  if (amount <= 35000) return 197; // 20001 – 35000
  if (amount <= 50000) return 278; // 35001 – 50000
  return 309;                      // 50001 – 250000
}

// KCB Bank transfer charges:
function getKCBCost(amount) {
  if (amount <= 100)   return 0;     // 1 – 100: Free
  if (amount <= 500)   return 11.90; // 101 – 500
  if (amount <= 1000)  return 14.20; // 501 – 1000
  if (amount <= 1500)  return 16.50; // 1001 – 1500
  if (amount <= 2500)  return 26.25; // 1501 – 2500
  if (amount <= 3500)  return 37.75; // 2501 – 3500
  if (amount <= 5000)  return 49.25; // 3501 – 5000
  if (amount <= 7500)  return 62.75; // 5001 – 7500
  if (amount <= 20000) return 74.25; // 7501 – 20000
  return 76.25;                      // 20001 – 150000
}

// I & M Bank — zero transaction cost (waived / bundled in account fees):
function getIMBankCost(amount) {
  return 0;
}

// Dispatcher: returns 0 for incoming transactions; routes outgoing to the correct tariff:
function getTransactionCost(transactionType, amount, paymentMethod) {
  // Company RECEIVES money — no outbound fee charged to reserves.
  if (transactionType === "LOAN_REPAYMENT" || transactionType === "DEPOSIT") return 0;
  // Company SENDS money — apply the method's fee schedule.
  switch (paymentMethod) {
    case "Mpesa":      return getMpesaCost(amount);
    case "Cash":       return getCashCost(amount);
    case "KCB Bank":   return getKCBCost(amount);
    case "I & M Bank": return getIMBankCost(amount);
    default:           return 0;
  }
}

// ================= Operations Sheet Functions =================

// Finds the sub-reserve row in col A (rows 2-5), adds netChange to the balance (col B),
// and stamps col C with the current date-time.
function updateSubReserve(paymentMethod, netChange) {
  const sheet = getSS().getSheetByName("operations");
  if (!sheet) throw new Error("'operations' sheet not found.");

  const data = sheet.getRange(2, 1, 4, 2).getValues(); // rows 2-5, cols A-B
  const rowIndex = data.findIndex(r => r[0] === paymentMethod);
  if (rowIndex < 0) throw new Error("Sub-reserve not found for payment method: " + paymentMethod);

  const sheetRow = 2 + rowIndex;
  const newBalance = (parseFloat(data[rowIndex][1]) || 0) + netChange;
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  sheet.getRange(sheetRow, 2, 1, 2).setValues([[newBalance, timestamp]]);
}

// Returns all sub-reserve balances and the total reserve as a plain object.
function getOperationsStatus() {
  const sheet = getSS().getSheetByName("operations");
  if (!sheet) throw new Error("'operations' sheet not found.");

  // Rows 2-5 = sub-reserves, Row 6 = TOTAL RESERVE (formula-driven).
  const data = sheet.getRange(2, 1, 5, 3).getValues();
  const result = {};
  data.forEach(r => {
    result[r[0]] = { balance: parseFloat(r[1]) || 0, lastUpdated: r[2] || "" };
  });
  return result;
}

// Validates the sub-reserve name and amount, credits the reserve, then logs the top-up.
function manualTopUp(data) {
  const validReserves = ["Cash", "KCB Bank", "I & M Bank", "Mpesa"];
  if (!validReserves.includes(data.subReserve)) {
    throw new Error("Invalid sub-reserve: " + data.subReserve);
  }
  const amount = parseFloat(data.amount);
  if (isNaN(amount) || amount <= 0) throw new Error("Amount must be a positive number.");

  updateSubReserve(data.subReserve, amount);

  // Flush the reserve update before getNextSeqId acquires LockService.
  SpreadsheetApp.flush();

  const topUpId = getNextSeqId("TOP-KE-", "TOPUP_SEQ");
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  const logRow = [topUpId, dateStr, data.subReserve, amount, data.notes || ""];

  // Log rows start at row 9 (row 8 is the top-up log header).
  const sheet = getSS().getSheetByName("operations");
  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, logRow.length).setValues([logRow]);

  return "Top-up recorded: " + topUpId;
}

// ================= Customers =================
function saveCustomer(data) {
  const sheet = getSS().getSheetByName("customers");
  const lastRow = sheet.getLastRow();

  if (!data.national_id) throw new Error("National ID is required");
  if (!data.firstName) throw new Error("First name is required");
  if (!data.lastName) throw new Error("Last name is required");

  if (lastRow > 1) {
    // Single read of cols 5-7 (phone, email, national_id) instead of two separate reads.
    const checkData = sheet.getRange(2, 5, lastRow - 1, 3).getValues();
    const phones = checkData.map(r => String(r[0]));
    const ids    = checkData.map(r => String(r[2]));

    if (data.phone && phones.includes(String(data.phone))) throw new Error("Customer with this phone already exists");
    if (ids.includes(String(data.national_id))) throw new Error("Customer with this National ID already exists");
  }

  const firstName = data.firstName;
  const lastName = data.lastName;
  const fullName = firstName + " " + lastName;

  const row = [
    getNextSeqId("CUST-KE-", "CUST_SEQ"), // customer_id
    firstName,                 // first_name
    lastName,                  // last_name
    fullName,                  // full_name
    data.phone,                // phone
    data.email || "",          // email
    data.national_id || "",    // national_id
    data.kra_pin || "",        // kra_pin
    new Date(),                // date_registered
    "ACTIVE",                  // customer_status
    0,                         // total_loans_taken
    0,                         // total_loans_outstanding
    0,                         // total_savings_balance
    "LOW",                     // risk_level
    data.notes || ""           // notes
  ];

  writeRow("customers", row);
  return "Customer saved successfully";
}

// ================= Loans =================
function saveLoan(data) {
  const customerSheet = getSS().getSheetByName("customers");
  // Read 13 cols upfront — used for both existence check and later customer update,
  // eliminating a second getRange call that previously re-read the same sheet.
  const customerData = customerSheet.getRange(2, 1, customerSheet.getLastRow() - 1, 13).getValues();
  const custIndex = customerData.findIndex(r => r[6] == data.national_id);
  if (custIndex < 0) throw new Error("Customer not found");

  const periodMonths = parseInt(data.period);
  const principal = parseFloat(data.principal);
  const rate = parseFloat(data.rate); // rate in percentage

  // [principal_amount + (principal_amount * (interest_rate/100) * loan_period)]
  const totalRepayment = principal + (principal * (rate / 100) * periodMonths);
  // [total_expected_repayment/loan_period]
  const periodicRepayment = totalRepayment / periodMonths;
  
  // --- Date Processing ---
  // Extract expected end date from the input field (DD/MM/YYYY)
  let endDateParts = (data.expectedEndDate || "").toString().split("/");
  let expectedEndDateInput;
  if(endDateParts.length === 3) {
      // Parse DD/MM/YYYY to Date object: new Date(year, monthIndex, day)
      expectedEndDateInput = new Date(endDateParts[2], endDateParts[1] - 1, endDateParts[0]);
  } else {
      // Fallback
      expectedEndDateInput = new Date(data.expectedEndDate);
  }
  
  const today = new Date(); // Issue date is today
  
  const timeZone = Session.getScriptTimeZone();
  const formattedExpectedEndDate = Utilities.formatDate(expectedEndDateInput, timeZone, "dd/MM/yyyy");
  const formattedIssueDate = Utilities.formatDate(today, timeZone, "dd/MM/yyyy");

  const row = [
    getNextSeqId("LN-KE-", "LOAN_SEQ"), // A: loan_id
    data.national_id,            // B: national_id
    principal,                   // C: principal_amount
    rate,                        // D: interest_rate %
    periodMonths,                // E: loan_period
    formattedExpectedEndDate,    // F: expected_end_date
    data.frequency || "Monthly", // G: payment_frequency
    "ACTIVE",                    // H: loan_status
    formattedIssueDate,          // I: issue_date
    periodicRepayment,           // J: periodic_repayment
    totalRepayment,              // K: total_expected_repayment
    0,                           // L: Total_Paid
    totalRepayment               // M: Remaining_Balance
  ];

  writeRow("loans", row);

  // Update customer's total loans (reuses customerData and custIndex from above)
  if (custIndex >= 0) {
    const totalLoansTaken = customerData[custIndex][10] + 1;
    const totalOutstanding = customerData[custIndex][11] + totalRepayment;
    customerSheet.getRange(2 + custIndex, 11).setValue(totalLoansTaken);
    customerSheet.getRange(2 + custIndex, 12).setValue(totalOutstanding);
  }

  const paymentMethod = data.paymentMethod || "Cash";
  const transactionCost = getTransactionCost("LOAN_ISSUE", principal, paymentMethod);
  updateSubReserve(paymentMethod, -(principal + transactionCost));

  // Flush all buffered sheet writes before logTransaction triggers a
  // PropertiesService + LockService interaction, which would discard the buffer.
  SpreadsheetApp.flush();

  logTransaction(data.national_id, "LOAN_ISSUE", row[0], principal, paymentMethod, transactionCost);
  return "Loan issued successfully";
}

// ================= Repayments =================
function saveRepayment(data) {
  const loanSheet = getSS().getSheetByName("loans");
  const customerSheet = getSS().getSheetByName("customers");

  // Get national ID from loan
  const loanData = loanSheet.getRange(2, 1, loanSheet.getLastRow() - 1, 13).getValues();
  const loanIndex = loanData.findIndex(r => String(r[0]).trim() === String(data.loanID).trim());
  if (loanIndex < 0) throw new Error("Loan not found");

  const national_id = loanData[loanIndex][1];
  const amountPaid = parseFloat(data.amount);

  const row = [
    getNextSeqId("RP-KE-", "REP_SEQ"), // repayment_id
    data.loanID,            // loan_id
    national_id,            // national_id
    amountPaid,             // amount_paid
    new Date(),             // payment_date
    data.method || "Cash",  // payment_method
    data.notes || ""        // notes
  ];
  writeRow("repayments", row);

  // Update loan repayment fields natively (Col L & M)
  const currentTotalPaid = loanData[loanIndex][11] || 0;   // Index 11 is Col L (Total_Paid)
  const expectedTotal = loanData[loanIndex][10] || 0;      // Index 10 is Col K (total_expected_repayment)
  
  const newTotalPaid = currentTotalPaid + amountPaid;
  const newRemainingBalance = expectedTotal - newTotalPaid;

  // Batch cols L and M into a single API call instead of two separate setValue calls.
  loanSheet.getRange(2 + loanIndex, 12, 1, 2).setValues([[newTotalPaid, newRemainingBalance > 0 ? newRemainingBalance : 0]]); // Update Col L & M

  if (newRemainingBalance <= 0) {
    loanSheet.getRange(2 + loanIndex, 8).setValue("FULLY PAID"); // Update Col H (loan_status)
  }

  // Update customer outstanding loans
  const custData = customerSheet.getRange(2, 1, customerSheet.getLastRow() - 1, 13).getValues();
  const custIndex = custData.findIndex(r => r[6] == national_id);
  if (custIndex >= 0) {
    const newOutstanding = custData[custIndex][11] - amountPaid;
    customerSheet.getRange(2 + custIndex, 12).setValue(newOutstanding > 0 ? newOutstanding : 0);
  }

  const paymentMethod = data.method || "Cash";
  updateSubReserve(paymentMethod, amountPaid); // Receiving repayment increases the reserve.

  // Flush all buffered sheet writes before logTransaction triggers a
  // PropertiesService + LockService interaction, which would discard the buffer.
  SpreadsheetApp.flush();

  logTransaction(national_id, "LOAN_REPAYMENT", data.loanID, amountPaid, paymentMethod, 0);
  return "Repayment recorded";
}

// ================= Savings =================
function saveSavings(data) {
  const customerSheet = getSS().getSheetByName("customers");
  
  // Find customer to check balance
  const custData = customerSheet.getRange(2, 1, customerSheet.getLastRow() - 1, 13).getValues();
  const custIndex = custData.findIndex(r => r[6] == data.national_id);
  
  if (custIndex < 0) throw new Error("Customer not found.");

  let currentBalance = parseFloat(custData[custIndex][12]) || 0; // Col M (Index 12)
  const transactionAmount = parseFloat(data.amount);

  if (data.type === "WITHDRAWAL") {
    if (transactionAmount > currentBalance) {
      throw new Error(`Insufficient funds. Your current savings balance is Ksh ${currentBalance.toFixed(2)}.`);
    }
    currentBalance -= transactionAmount;
  } else {
    // It's a DEPOSIT
    currentBalance += transactionAmount;
  }

  const today = new Date();
  const timeZone = Session.getScriptTimeZone();
  const formattedDate = Utilities.formatDate(today, timeZone, "dd/MM/yyyy");

  const row = [
    getNextSeqId("SV-KE-", "SAVINGS_SEQ"), // A: savings_id
    data.national_id,                      // B: national_id
    data.type || "DEPOSIT",                // C: transaction_type
    transactionAmount,                     // D: amount
    formattedDate,                         // E: date
    data.notes || ""                       // F: notes
  ];
  writeRow("savings", row);

  // Update customer's total_savings_balance
  customerSheet.getRange(2 + custIndex, 13).setValue(currentBalance);

  const paymentMethod = data.paymentMethod || "Cash";
  const transactionCost = getTransactionCost(data.type || "DEPOSIT", transactionAmount, paymentMethod);
  const netChange = (data.type === "WITHDRAWAL")
    ? -(transactionAmount + transactionCost)
    : transactionAmount;
  updateSubReserve(paymentMethod, netChange);

  // Flush all buffered sheet writes before logTransaction triggers a
  // PropertiesService + LockService interaction, which would discard the buffer.
  SpreadsheetApp.flush();

  logTransaction(data.national_id, data.type || "DEPOSIT", row[0], transactionAmount, paymentMethod, transactionCost);
  return "Transaction recorded. New Balance: Ksh " + currentBalance.toFixed(2);
}

// ================= Helpers for Dropdowns =================
function getCustomerList() {
  const sheet = getSS().getSheetByName("customers");
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues(); // up to column G (National ID)
  return data.map(r => ({id: r[6], name: r[3]})); // Use National ID as ID
}

// getLoanList — currently unused (no caller in Index.html). Kept for future use.
// function getLoanList() {
//   const sheet = getSS().getSheetByName("loans");
//   if (sheet.getLastRow() < 2) return [];
//   const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues(); // loan_id only
//   return data.map(r => ({id: r[0]}));
// }

function getLoansByNationalId(nationalId) {
  const sheet = getSS().getSheetByName("loans");
  if (sheet.getLastRow() < 2) return [];
  
  // Read columns A through M (13 columns)
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
  const userLoans = [];
  
  for (let i = 0; i < data.length; i++) {
    // Column B (national_id) is at index 1, Column M (Remaining_Balance) is at index 12.
    // Only return loans that still have an outstanding balance (unpaid/partially paid).
    if (String(data[i][1]) === String(nationalId) && parseFloat(data[i][12]) > 0) {
      userLoans.push({
        loanId: data[i][0],              // Col A: loan_id (index 0)
        issueDate: data[i][8],           // Col I: issue_date (index 8)
        remainingBalance: data[i][12]    // Col M: Remaining_Balance (index 12)
      });
    }
  }
  
  return userLoans;
}

function testGetLoansByNationalId() {
  const sheet = getSS().getSheetByName("loans");
  if (sheet.getLastRow() < 2) {
    Logger.log("No loans available to test.");
    return;
  }
  
  // Dynamically grab the first available National ID from the loans sheet
  const sampleNatId = sheet.getRange(2, 2).getValue(); // Col B (national_id)
  Logger.log("Testing with National ID: " + sampleNatId);
  
  const result = getLoansByNationalId(sampleNatId); 
  Logger.log(JSON.stringify(result, null, 2));
}

// ================= Test Functions =================
function testAddLoan() {
  // Try retrieving the first valid National ID from your sheet to use in testing
  const sheet = getSS().getSheetByName("customers");
  if (sheet.getLastRow() < 2) {
    Logger.log("No customers available to test loan saving.");
    return;
  }
  
  const sampleNationalID = sheet.getRange(2, 7).getValue(); // Col G
  
  const testData = {
    national_id: sampleNationalID,
    principal: 10000,
    rate: 5,            // 5%
    period: 6,          // 6 months
    expectedEndDate: "15/09/2026", // DD/MM/YYYY — 6 months from a March 2026 start
    frequency: "Monthly",
    paymentMethod: "Cash"  // Required by saveLoan → updateSubReserve
  };
  
  try {
    const result = saveLoan(testData);
    Logger.log("SUCCESS: " + result);
    Logger.log("Check Col J and Col K in the 'loans' sheet.");
  } catch (err) {
    Logger.log("ERROR: " + err.message);
  }
}

// ================= Reset Developer Sequence Counters =================
// IMPORTANT: Run these manually in the GAS Editor only!
// Each function acquires the same script lock used by getNextSeqId to prevent
// a reset from colliding with an in-flight ID generation.

function resetCustomerCounter() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty('CUST_SEQ', '0');
    Logger.log("Customer Sequence reset to 0.");
  } finally {
    lock.releaseLock();
  }
}

function resetLoanCounter() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty('LOAN_SEQ', '0');
    Logger.log("Loan Sequence reset to 0.");
  } finally {
    lock.releaseLock();
  }
}

function resetRepaymentCounter() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty('REP_SEQ', '0');
    Logger.log("Repayment Sequence reset to 0.");
  } finally {
    lock.releaseLock();
  }
}

function resetSavingsCounter() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty('SAVINGS_SEQ', '0');
    Logger.log("Savings Sequence reset to 0.");
  } finally {
    lock.releaseLock();
  }
}

function resetTransactionCounter() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty('TXN_SEQ', '0');
    Logger.log("Transaction Sequence reset to 0.");
  } finally {
    lock.releaseLock();
  }
}

function resetTopUpCounter() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty('TOPUP_SEQ', '0');
    Logger.log("Top-Up Sequence reset to 0.");
  } finally {
    lock.releaseLock();
  }
}
