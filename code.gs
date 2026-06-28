function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // --- [HIGH FIX]: Shared-secret check ---
    var GAS_SHARED_SECRET = "66d75115c85d6d3a1eb735ef75f7aafe3fb3dd7fe31f3d0c06c6cc93595e2a7b13329b1e3961ee25957df3360d217b17";
    if (data.secret !== GAS_SHARED_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Unauthorized"})).setMimeType(ContentService.MimeType.JSON);
    }

    var action = data.action;
    // Cloudflare থেকে email প্যারামিটারটা আসবে, তাই সেটা চেক করছি
    var emails = data.emails || data.email; 

    // ========================================================
    // 🚨 NEW: SEND SECURITY ALERTS & OTP (From Cloudflare)
    // ========================================================
    if (action === "SEND_ALERT_EMAIL") {
      GmailApp.sendEmail(emails, data.subject, data.message, {
        name: "STS SECURITY ALERT"
      });
      return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
    }

    // ========================================================
    // 1. SEND OTP FOR VERIFICATION (Your Old Design)
    // ========================================================
    if (action === "SEND_OTP_ONLY") {
      var spacedOtp = String(data.otp).split('').join(' ');
      var htmlTemplate = "<div style='font-family: Arial, sans-serif; padding: 25px; background-color: #202124; color: #ffffff; max-width: 450px; border-radius: 12px; border: 1px solid #3c4043;'>" +
        "<h2 style='color: #FCE8B2; margin-top: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;'>SANKAR TEA SHOP</h2>" +
        "<p style='font-size: 14px; color: #e8eaed; margin-bottom: 25px; font-weight: 400;'>Your email verification code is:</p>" +
        "<h1 style='letter-spacing: 0.5px; color: #81C995; font-size: 32px; margin-bottom: 25px; font-weight: 600;'>" + spacedOtp + "</h1>" +
        "<p style='font-size: 12px; color: #9aa0a6; margin-bottom: 0;'>This code expires in 10 minutes.</p>" +
      "</div>";

      GmailApp.sendEmail(emails, "STS Console - Verification Code", "Your OTP is: " + data.otp, {
        name: "SANKAR TEA SHOP",
        htmlBody: htmlTemplate
      });
      return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
    }

    // ========================================================
    // 2. SEND ON-DEMAND FULL PDF
    // ========================================================
    if (action === "SEND_ON_DEMAND_STATEMENT") {
      var raw = Utilities.base64Decode(data.pdfData);
      var pdfBlob = Utilities.newBlob(raw, 'application/pdf', 'STS_Report_' + data.date + '.pdf');

      var subject = "STS Financial Statement: " + data.date;
      var htmlBody = "<div style='font-family: Arial, sans-serif; padding: 25px; background-color: #202124; color: #ffffff; max-width: 450px; border-radius: 12px; border: 1px solid #3c4043;'><h2 style='color:#FCE8B2; margin-top: 0; font-size: 18px; font-weight: 600;'>SANKAR TEA SHOP</h2><p style='font-size: 14px; color: #e8eaed;'>Your requested financial statement has been successfully generated.</p><p style='font-size: 14px; color: #e8eaed;'><b>Please find the full PDF report attached to this email.</b></p></div>";

      GmailApp.sendEmail(emails, subject, "Please find your PDF report attached.", {
        name: "SANKAR TEA SHOP",
        htmlBody: htmlBody,
        attachments: [pdfBlob]
      });
      return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
    }

    // ========================================================
    // 3. SEND AUTOMATED CRON SUMMARY
    // ========================================================
    if (action === "SEND_CRON_SUMMARY") {
      var transactions = data.data || [];
      var cashExp = 0, bankExp = 0, closingCash = "Not Entered", closingBank = "Not Entered";

      for (var i = 0; i < transactions.length; i++) {
         var r = transactions[i];
         var amt = parseFloat(r.amount) || 0;
         
         if (r.account === "CASH") {
            if (r.particulars === "CLOSING CASH") closingCash = "Rs. " + amt.toFixed(2);
            else if (r.particulars !== "CLOSING FLOAT" && r.particulars !== "RESERVE IN" && r.particulars !== "OTHER INCOME" && r.particulars !== "BANK TRANSFER") cashExp += amt;
         }
         
         if (r.account === "BANK") {
            if (r.particulars === "CLOSING BANK BALANCE") closingBank = "Rs. " + amt.toFixed(2);
            else if (r.particulars !== "BANK TO CASH TRANSFER" && r.particulars !== "OTHER INCOME" && r.particulars !== "CAPITAL RETURNED" && r.particulars !== "CAPITAL INVESTMENT") bankExp += amt;
         }
      }

      var subject = "STS Automated Summary - " + data.date;
      var htmlBody = "<div style='font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #ddd; border-radius: 8px;'>" +
                     "<h2 style='color: #FF9800; border-bottom: 2px solid #eee; padding-bottom: 10px;'>Sankar Tea Shop Daily Summary</h2>" +
                     "<p><b>Date:</b> " + data.date + "</p>" +
                     "<div style='background: #f9f9f9; padding: 15px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #4CAF50;'>" +
                       "<h3 style='margin-top:0; font-size: 15px;'>Account Balances</h3>" +
                       "<p><b>Closing Cash:</b> " + closingCash + "</p>" +
                       "<p><b>Closing Bank:</b> " + closingBank + "</p>" +
                     "</div>" +
                     "<div style='background: #f9f9f9; padding: 15px; border-radius: 6px; border-left: 4px solid #F44336;'>" +
                       "<h3 style='margin-top:0; font-size: 15px;'>Operating Expenses</h3>" +
                       "<p><b>Cash Expenses:</b> Rs. " + cashExp.toFixed(2) + "</p>" +
                       "<p><b>Bank Expenses:</b> Rs. " + bankExp.toFixed(2) + "</p>" +
                     "</div>" +
                     "<p style='font-size: 12px; color: #888; margin-top: 20px; text-align: center;'>Log in to the STS Console to view full PDF statements and visual analytics.</p>" +
                     "</div>";

      GmailApp.sendEmail(emails, subject, "Your daily summary.", {
        name: "SANKAR TEA SHOP",
        htmlBody: htmlBody
      });
      return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
    }

    // ========================================================
    // 4. DAILY BACKUP SYNC TO GOOGLE SHEETS
    // ========================================================
    if (action === "DAILY_BACKUP_SYNC") {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("STSJ");
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Sheet STSJ not found"})).setMimeType(ContentService.MimeType.JSON);

      var targetDateIso = data.date; 

      var dataRange = sheet.getDataRange();
      var values = dataRange.getValues();
      for (var j = values.length - 1; j >= 2; j--) { 
        var rowDateStr = "";
        if (values[j][0] instanceof Date) {
           var d = values[j][0];
           var y = d.getFullYear();
           var m = String(d.getMonth() + 1).padStart(2, '0');
           var day = String(d.getDate()).padStart(2, '0');
           rowDateStr = y + "-" + m + "-" + day;
        } else {
           rowDateStr = String(values[j][0]).trim();
        }

        if (rowDateStr === targetDateIso || rowDateStr.indexOf(targetDateIso) > -1) {
          sheet.deleteRow(j + 1);
        }
      }

      function fmtAmt(val) {
          if (val === "" || val === null || val === undefined) return "";
          return "Rs " + parseFloat(val).toFixed(2);
      }

      var rowsToAppend = [];
      var txs = data.transactions || [];
      var denoms = data.denominations || [];
      var dData = denoms.length > 0 ? denoms[0] : {};

      for (var k = 0; k < txs.length; k++) {
        var t = txs[k];
        var isCashBase = (t.account === "CASH" && t.particulars === "CLOSING CASH");

        rowsToAppend.push([
          targetDateIso, t.account || "", t.particulars || "", fmtAmt(t.amount), "", 
          isCashBase ? targetDateIso : "", isCashBase ? (dData.note10 || "") : "", 
          isCashBase ? (dData.note20 || "") : "", isCashBase ? (dData.note50 || "") : "", 
          isCashBase ? (dData.note100 || "") : "", isCashBase ? (dData.note200 || "") : "", 
          isCashBase ? (dData.note500 || "") : "", isCashBase ? (dData.coin1 || "") : "", 
          isCashBase ? (dData.coin2 || "") : "", isCashBase ? (dData.coin5 || "") : "", 
          isCashBase ? (dData.coin10 || "") : "", isCashBase ? (dData.coin20 || "") : "", 
          isCashBase ? fmtAmt(dData.total_amount) : "" 
        ]);
      }

      if (rowsToAppend.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, 18).setValues(rowsToAppend);
      }

      return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Unknown Action"})).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
