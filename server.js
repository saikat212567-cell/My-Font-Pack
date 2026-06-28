const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
let launchCount = 0; // Track how many times the browser is launched
app.use(cors());
app.use(express.json({ limit: '15mb' }));

let browserInstance = null;
async function getBrowser() {
    if (!browserInstance) {
        launchCount++;
        console.log(`🔧 Launching Chrome – count=${launchCount}`);
        console.time('browserLaunch');
        console.log("Launching Official Chrome on Google Cloud Run...");
        browserInstance = await puppeteer.launch({
            headless: 'new',
            timeout: 60000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
                // Removed '--single-process' and '--no-zygote'
                // These cause "Target closed" crashes on large/heavy PDFs.
                // Increase Cloud Run memory (1-2GB) instead for stability.
            ]
        });

        // If the browser crashes/disconnects, reset so it relaunches next time
        browserInstance.on('disconnected', () => {
            console.warn('⚠️ Browser disconnected. Resetting instance.');
            browserInstance = null;
        });

        console.timeEnd('browserLaunch');
    }
    return browserInstance;
}



app.post('/generate-pdf', async (req, res) => {
    const data = req.body;
    let page = null;

    const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @font-face { font-family: 'Navi Headline'; src: url('https://cdn.jsdelivr.net/gh/saikat212567-cell/STS-Fonts@main/Navi_Headline_Regular%20(1).woff2') format('woff2'); }
            @font-face { font-family: 'Navi Body'; src: url('https://cdn.jsdelivr.net/gh/saikat212567-cell/STS-Fonts@main/Navi_Body_Regular.woff2') format('woff2'); }
       
            body { font-family: 'Navi Body', sans-serif; margin: 0; padding: 25px; color: #000; font-size: 13px; font-weight: 600; background: #fff; }
            
            /* Modern Header - Margins tightened to save space for Page 1 */
            .header-box { display: flex; justify-content: space-between; align-items: center; background: #1e1e1e; padding: 15px 20px; border-radius: 8px; margin-bottom: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .header-text h1 { font-family: 'Navi Headline', sans-serif; color: #FF9800; margin: 0 0 5px 0; font-size: 26px; text-transform: uppercase; letter-spacing: 1px; }
            .header-text p { margin: 2px 0; color: #ddd; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
            .header-text .highlight-date { color: #FF9800; font-size: 14px; margin-top: 5px; display: flex; align-items: center; gap: 10px; }
            .working-badge { background: #4CAF50; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 11px; letter-spacing: 0.5px; margin-left: 10px; }
            
            .header-qr { text-align: center; background: #fff; padding: 6px; border-radius: 6px; border: 2px solid #333; }
            .header-qr img { width: 90px; height: 90px; }
            .header-qr p { margin: 4px 0 0 0; font-size: 9px; color: #000; font-weight: bold; letter-spacing: 1px;}

            /* Modern Balances Cards */
            .balances-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 15px; }
            .balance-card { flex: 1; background: #f9f9f9; padding: 12px; border-radius: 8px; border: 1px solid #ddd; border-left: 5px solid #4CAF50; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
            .balance-card.cash { border-left-color: #FF9800; }
            .balance-card.bank { border-left-color: #2196F3; }
            .balance-card.float { border-left-color: #9C27B0; }
            .balance-card h4 { margin: 0 0 4px 0; font-size: 10px; color: #444; text-transform: uppercase; letter-spacing: 1px; }
            .balance-card p { margin: 0; font-size: 17px; color: #000; font-weight: bold; }

            /* Beautiful Colored KPI Grid */
            .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; }
            .kpi-box { padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #ccc; background-color: #fcfcfc; }
            
            /* KPI Theming */
            .kpi-box:nth-child(1) { border-color: #4CAF50; background: rgba(76,175,80,0.05); } .kpi-box:nth-child(1) .kpi-title { color: #4CAF50; }
            .kpi-box:nth-child(2) { border-color: #8BC34A; background: rgba(139,195,74,0.05); } .kpi-box:nth-child(2) .kpi-title { color: #8BC34A; }
            .kpi-box:nth-child(3) { border-color: #2196F3; background: rgba(33,150,243,0.05); } .kpi-box:nth-child(3) .kpi-title { color: #2196F3; }
            .kpi-box:nth-child(4) { border-color: #00BCD4; background: rgba(0,188,212,0.05); } .kpi-box:nth-child(4) .kpi-title { color: #00BCD4; }
            .kpi-box:nth-child(5) { border-color: #3F51B5; background: rgba(63,81,181,0.05); } .kpi-box:nth-child(5) .kpi-title { color: #3F51B5; }
            .kpi-box:nth-child(6) { border-color: #FF9800; background: rgba(255,152,0,0.05); } .kpi-box:nth-child(6) .kpi-title { color: #FF9800; }
            .kpi-box:nth-child(7) { border-color: #FF5722; background: rgba(255,87,34,0.05); } .kpi-box:nth-child(7) .kpi-title { color: #FF5722; }
            .kpi-box:nth-child(8) { border-color: #F44336; background: rgba(244,67,54,0.05); } .kpi-box:nth-child(8) .kpi-title { color: #F44336; }
            .kpi-box:nth-child(9) { border-color: #9C27B0; background: rgba(156,39,176,0.05); } .kpi-box:nth-child(9) .kpi-title { color: #9C27B0; }

            .kpi-title { font-size: 10px; font-weight: bold; text-transform: uppercase; }
            .kpi-value { font-size: 13px; color: #000; margin-top: 5px; font-weight: bold; display: flex; justify-content: space-between; padding: 0 5px; }
            .kpi-value span.sym { color: #666; font-weight: normal; }
            
            /* Fill Empty Space with Insights */
            .insights-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;}
            .insight-box { background: #f2f2f2; padding: 12px; border-radius: 8px; border-left: 4px solid #333; }
            .insight-box h3 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #333; }
            .insight-row { display: flex; justify-content: space-between; font-size: 12px; padding: 5px 0; border-bottom: 1px dashed #ccc; }
            .insight-row:last-child { border-bottom: none; }
            .insight-row span:last-child { font-weight: bold; color: #000; }

            /* SMART PAGE BREAKS & TABLE FLOW */
            h2.section-title { 
                font-family: 'Navi Headline', sans-serif; 
                color: #111; font-size: 16px; 
                margin: 25px 0 10px 0; 
                border-bottom: 2px solid #FF9800; padding-bottom: 5px; 
                text-transform: uppercase; 
                page-break-after: avoid; 
            }
            h2.section-title:first-of-type { margin-top: 10px; }

            table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 10px; font-size: 12px; page-break-inside: auto; }
            thead { display: table-header-group; } 
            tr { page-break-inside: avoid; page-break-after: auto; } 
            th { text-align: center; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; padding: 10px; border: 1px solid #aaa; }
            td { border: 1px solid #aaa; padding: 10px; word-wrap: break-word; }
            tr:nth-child(even) { background-color: #f8f8f8; }
            
            /* UPDATED DARK HEADERS */
            .table-neutral th { background: #455A64; border-bottom: 2px solid #263238; color: #fff; }
            .table-sales th { background: #00695C; border-bottom: 2px solid #004D40; color: #fff; }
            .table-cash th { background: #FF9800; border-bottom: 2px solid #E65100; color: #fff; }
            .table-bank th { background: #0D47A1; border-bottom: 2px solid #002171; color: #fff; }
            .table-expense-summary th { background: #37474F; border-bottom: 2px solid #1E272C; color: #fff; }

            .currency .left-sym { float: left; color: #555; font-weight: normal; }
            .currency .right-val { float: right; font-weight: bold; color: #000; }
            .clearfix { clear: both; }
            .text-center { text-align: center; }
            
            .page-break { page-break-before: always; }
            .keep-together { page-break-inside: avoid; page-break-after: avoid; }

            /* Charts Stacked */
            .chart-block { text-align: center; margin-bottom: 30px; }
            .chart-block img { width: 85%; max-width: 600px; display: block; margin: 0 auto 20px auto; border: 1px solid #ccc; border-radius: 8px; padding: 5px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
            
            /* END STATEMENT TEXT WRAP FIX */
            .end-statement { text-align: center; margin-top: 25px; padding-top: 15px; border-top: 2px dashed #999; color: #555; }
            .end-statement h3 { margin: 0 0 5px 0; font-size: 14px; color: #333; white-space: nowrap; }
            .end-statement p { margin: 0; font-size: 11px; white-space: nowrap; }
        </style>
    </head>
    <body>
        <div class="header-box">
            <div class="header-text">
                <h1>SANKAR TEA SHOP</h1>
                <p>${data.isSingleDate ? 'DAILY FINANCIAL STATEMENT' : 'PERIODIC FINANCIAL STATEMENT'}</p>
                <div class="highlight-date">${data.dateRange}</div>
            </div>
            <div class="header-qr">
                <img src="${data.qrCode}" />
                <p>SCAN SUMMARY</p>
            </div>
        </div>

        <div style="margin-bottom: 12px; display: flex; justify-content: flex-start;">
            <span style="background: #4CAF50; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">WORKING DAYS: ${data.stats.workingDays}</span>
        </div>

        <div class="balances-row">
            <div class="balance-card cash"><h4>Closing Cash</h4><p>Rs. ${data.balances.cash}</p></div>
            <div class="balance-card float"><h4>Closing Float</h4><p>Rs. ${data.balances.float}</p></div>
            <div class="balance-card bank"><h4>Closing Bank</h4><p>Rs. ${data.balances.bank}</p></div>
        </div>

        <h2 class="section-title">Performance Summary</h2>
        <div class="kpi-grid">
            <div class="kpi-box"><div class="kpi-title">1. Cash Sale</div><div class="kpi-value"><span class="sym">Rs.</span><span>${data.stats.cashSale}</span></div></div>
            <div class="kpi-box"><div class="kpi-title">2. Cash Profit</div><div class="kpi-value"><span class="sym">Rs.</span><span>${data.stats.cashProfit}</span></div></div>
            <div class="kpi-box"><div class="kpi-title">3. Total Sale</div><div class="kpi-value"><span class="sym">Rs.</span><span>${data.stats.totalSale}</span></div></div>
            <div class="kpi-box"><div class="kpi-title">4. Other Income</div><div class="kpi-value"><span class="sym">Rs.</span><span>${data.stats.otherIncome}</span></div></div>
            <div class="kpi-box"><div class="kpi-title">5. Net Profit</div><div class="kpi-value"><span class="sym">Rs.</span><span>${data.stats.netProfit}</span></div></div>
            <div class="kpi-box"><div class="kpi-title">6. Cash Expenses</div><div class="kpi-value"><span class="sym">Rs.</span><span>${data.stats.cashExp}</span></div></div>
            <div class="kpi-box"><div class="kpi-title">7. Bank Expenses</div><div class="kpi-value"><span class="sym">Rs.</span><span>${data.stats.bankExp}</span></div></div>
            <div class="kpi-box"><div class="kpi-title">8. Total Expenses</div><div class="kpi-value"><span class="sym">Rs.</span><span>${data.stats.totalExpenses}</span></div></div>
            <div class="kpi-box"><div class="kpi-title">9. Active Capital</div><div class="kpi-value"><span class="sym">Rs.</span><span>${data.stats.activeCapital}</span></div></div>
        </div>

        <h2 class="section-title">Account Flow Summary</h2>
        <div class="insights-grid">
            <div class="insight-box" style="border-left-color: #FF9800;">
                <h3 style="color:#FF9800;">Cash Account Flow</h3>
                <div class="insight-row"><span>Opening Cash:</span><span>Rs. ${data.flows.period.cashOpen}</span></div>
                <div class="insight-row"><span>Total Money In:</span><span style="color:#2e7d32;">+ Rs. ${data.flows.period.cashIn}</span></div>
                <div class="insight-row"><span>Total Money Out:</span><span style="color:#c62828;">- Rs. ${data.flows.period.cashOut}</span></div>
                <div class="insight-row"><span>Closing Cash:</span><span>Rs. ${data.flows.period.cashClose}</span></div>
            </div>
            <div class="insight-box" style="border-left-color: #2196F3;">
                <h3 style="color:#2196F3;">Bank Account Flow</h3>
                <div class="insight-row"><span>Opening Bank:</span><span>Rs. ${data.flows.period.bankOpen}</span></div>
                <div class="insight-row"><span>Total Money In:</span><span style="color:#2e7d32;">+ Rs. ${data.flows.period.bankIn}</span></div>
                <div class="insight-row"><span>Total Money Out:</span><span style="color:#c62828;">- Rs. ${data.flows.period.bankOut}</span></div>
                <div class="insight-row"><span>Closing Bank:</span><span>Rs. ${data.flows.period.bankClose}</span></div>
            </div>
        </div>

        <div class="insights-grid" style="grid-template-columns: 1fr;">
            <div class="insight-box" style="border-left-color: #4CAF50; padding: 12px 15px;">
                <h3 style="color:#4CAF50; margin:0 0 5px 0;">Financial Insights</h3>
                <p style="margin:0; font-size:13px; color:#333;">
                    The average daily sale for this period is <strong>Rs. ${data.stats.avgSale}</strong>.
                    The business operated at an overall profit margin of <strong>${data.stats.profitMargin}</strong> over total sales revenue.
                </p>
            </div>
        </div>

        <div class="page-break"></div>
        <h2 class="section-title">Revenue & Profit Visualizations</h2>
        <div class="chart-block">
            <img src="${data.charts.cashGraph}" />
            <img src="${data.charts.totalGraph}" />
        </div>

        <h2 class="section-title">Statistical Analysis</h2>
        <table class="table-neutral">
            <thead><tr><th style="width: 25%;">Metric</th><th style="width: 25%;">Max (Peak)</th><th style="width: 25%;">Min (Low)</th><th style="width: 25%;">Average (Mean)</th></tr></thead>
            <tbody>
                <tr><td class="text-center" style="font-weight:bold;">Cash Sale</td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.csMax}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.csMin}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.csMean}</span><div class="clearfix"></div></td></tr>
                <tr><td class="text-center" style="font-weight:bold;">Cash Profit</td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.cpMax}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.cpMin}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.cpMean}</span><div class="clearfix"></div></td></tr>
                <tr><td class="text-center" style="font-weight:bold;">Total Sale</td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.tsMax}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.tsMin}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.tsMean}</span><div class="clearfix"></div></td></tr>
                <tr><td class="text-center" style="font-weight:bold;">Net Profit</td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.npMax}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.npMin}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${data.analytics.npMean}</span><div class="clearfix"></div></td></tr>
            </tbody>
        </table>

        <div class="page-break"></div>
        <h2 class="section-title">Expense Category Summary</h2>
        
        <div style="text-align: center; margin-bottom: 40px;">
            <img src="${data.charts.pieGraph}" style="width: 100%; max-width: 420px; display: block; margin: 0 auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);" />
        </div>

        <table class="table-expense-summary">
            <thead>
                <tr>
                    <th style="width: 25%; text-align: left;">Category</th>
                    <th style="width: 20%;">Cash Account</th>
                    <th style="width: 20%;">Bank Account</th>
                    <th style="width: 22%;">Total Expenses</th>
                    <th style="width: 13%;">%</th>
                </tr>
            </thead>
            <tbody>
                ${data.expenseSummary.map(row => `
                    <tr>
                        <td style="font-weight: bold; color: #333;">${row.category}</td>
                        <td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.cash.replace('Rs.', '').trim()}</span><div class="clearfix"></div></td>
                        <td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.bank.replace('Rs.', '').trim()}</span><div class="clearfix"></div></td>
                        <td class="currency" style="font-weight: bold; background-color: #fdfdfd;"><span class="left-sym">Rs.</span><span class="right-val">${row.total.replace('Rs.', '').trim()}</span><div class="clearfix"></div></td>
                        <td style="text-align: center; font-weight: bold; color: #E65100;">${row.pct}</td>
                    </tr>
                `).join('')}
                <tr style="background-color: #ECEFF1;">
                    <td style="font-weight: bold; text-align: right; color: #000;">TOTAL:</td>
                    <td class="currency" style="font-weight: bold; color: #000;"><span class="left-sym">Rs.</span><span class="right-val">${data.stats.cashExp.replace('Rs.', '').trim()}</span><div class="clearfix"></div></td>
                    <td class="currency" style="font-weight: bold; color: #000;"><span class="left-sym">Rs.</span><span class="right-val">${data.stats.bankExp.replace('Rs.', '').trim()}</span><div class="clearfix"></div></td>
                    <td class="currency" style="font-weight: bold; color: #000;"><span class="left-sym">Rs.</span><span class="right-val">${data.stats.totalExpenses.replace('Rs.', '').trim()}</span><div class="clearfix"></div></td>
                    <td style="text-align: center; font-weight: bold; color: #000;">100.00</td>
                </tr>
            </tbody>
        </table>

        <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-left: 5px solid #FF9800; border-radius: 8px;">
            <h3 style="margin-top: 0; color: #333; font-size: 14px;">Expense Distribution Insights</h3>
            <p style="margin: 0; color: #555; font-size: 13px; line-height: 1.5;">
                Total business expenditure for this period amounts to <strong>Rs. ${data.stats.totalExpenses.replace('Rs.', '').trim()}</strong>. 
                Cash-based expenses account for <strong>Rs. ${data.stats.cashExp.replace('Rs.', '').trim()}</strong>, while Bank-based expenses total <strong>Rs. ${data.stats.bankExp.replace('Rs.', '').trim()}</strong>. 
                Reviewing the highest expenditure categories above can help identify potential areas for cost optimization.
            </p>
        </div>


        <div class="page-break"></div>
        <h2 class="section-title">Primary Transaction Ledger</h2>
        <table class="table-sales">
            <thead><tr><th style="width: 20%;">Date</th><th style="width: 20%;">Cash Sale</th><th style="width: 20%;">Cash Profit</th><th style="width: 20%;">Total Sale</th><th style="width: 20%;">Net Profit</th></tr></thead>
            <tbody>
                 ${data.ledger.map(row => `
                    <tr><td class="text-center">${row.date}</td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.cashSale}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.cashProfit}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.totalSale}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.netProfit}</span><div class="clearfix"></div></td></tr>
                `).join('')}
            </tbody>
        </table>

        <h2 class="section-title">Cash Flow Statement</h2>
        <table class="table-cash">
            <thead><tr><th style="width: 20%;">Date</th><th style="width: 20%;">Opening Cash</th><th style="width: 20%;">Money In (+)</th><th style="width: 20%;">Money Out (-)</th><th style="width: 20%;">Closing Cash</th></tr></thead>
            <tbody>
                ${data.flows.cashLedger.map(row => `
                    <tr><td class="text-center">${row.date}</td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.open}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym" style="color:#2e7d32;">+ Rs.</span><span class="right-val">${row.in}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym" style="color:#c62828;">- Rs.</span><span class="right-val">${row.out}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val" style="color:#E65100;">${row.close}</span><div class="clearfix"></div></td></tr>
                `).join('')}
            </tbody>
        </table>

        <h2 class="section-title">Bank Flow Statement</h2>
        <table class="table-bank">
            <thead><tr><th style="width: 20%;">Date</th><th style="width: 20%;">Opening Bank</th><th style="width: 20%;">Money In (+)</th><th style="width: 20%;">Money Out (-)</th><th style="width: 20%;">Closing Bank</th></tr></thead>
            <tbody>
                ${data.flows.bankLedger.map(row => `
                    <tr><td class="text-center">${row.date}</td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.open}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym" style="color:#2e7d32;">+ Rs.</span><span class="right-val">${row.in}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym" style="color:#c62828;">- Rs.</span><span class="right-val">${row.out}</span><div class="clearfix"></div></td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val" style="color:#0D47A1;">${row.close}</span><div class="clearfix"></div></td></tr>
                `).join('')}
            </tbody>
        </table>

        <h2 class="section-title">Itemized Expense Ledger</h2>

        <table class="table-expense-cash">
            <thead>
                <tr style="background-color: transparent;">
                    <td colspan="4" class="text-center" style="font-weight:bold; color: #E65100; font-size: 15px; border: none; padding-bottom: 10px; padding-top: 20px;">CASH ACCOUNT EXPENSES</td>
                </tr>
                <tr>
                    <th style="width: 18%; background-color: #E65100 !important; color: #ffffff !important; border: 1px solid #BF360C;">Date</th>
                    <th style="width: 42%; background-color: #E65100 !important; color: #ffffff !important; border: 1px solid #BF360C;">Category</th>
                    <th style="width: 15%; background-color: #E65100 !important; color: #ffffff !important; border: 1px solid #BF360C;">Account</th>
                    <th style="width: 25%; background-color: #E65100 !important; color: #ffffff !important; border: 1px solid #BF360C;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${data.expenses.cash.map(row => `<tr><td class="text-center">${row.date}</td><td style="font-weight:600; padding-left:15px;">${row.particulars}</td><td class="text-center" style="color:#E65100; font-weight:bold;">CASH</td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.amount}</span><div class="clearfix"></div></td></tr>`).join('')}
                <tr style="background-color: #fff3e0;">
                     <td colspan="3" style="text-align:right; font-weight:bold; color: #E65100; padding-right: 20px;">TOTAL CASH EXPENSES:</td>
                    <td class="currency" style="border-top: 2px solid #E65100;"><span class="left-sym">Rs.</span><span class="right-val" style="color: #E65100;">${data.stats.cashExp.replace('Rs.', '').trim()}</span><div class="clearfix"></div></td>
                </tr>
            </tbody>
        </table>

        <table class="table-expense-bank" style="margin-top: 25px;">
            <thead>
             <tr style="background-color: transparent;">
                    <td colspan="4" class="text-center" style="font-weight:bold; color: #0D47A1; font-size: 15px; border: none; padding-bottom: 10px; padding-top: 20px;">BANK ACCOUNT EXPENSES</td>
                </tr>
                <tr>
                    <th style="width: 18%; background-color: #0D47A1 !important; color: #ffffff !important; border: 1px solid #002171;">Date</th>
                    <th style="width: 42%; background-color: #0D47A1 !important; color: #ffffff !important; border: 1px solid #002171;">Category</th>
                    <th style="width: 15%; background-color: #0D47A1 !important; color: #ffffff !important; border: 1px solid #002171;">Account</th>
                    <th style="width: 25%; background-color: #0D47A1 !important; color: #ffffff !important; border: 1px solid #002171;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${data.expenses.bank.map(row => `<tr><td class="text-center">${row.date}</td><td style="font-weight:600; padding-left:15px;">${row.particulars}</td><td class="text-center" style="color:#0D47A1; font-weight:bold;">BANK</td><td class="currency"><span class="left-sym">Rs.</span><span class="right-val">${row.amount}</span><div class="clearfix"></div></td></tr>`).join('')}
                <tr style="background-color: #E3F2FD;">
                 <td colspan="3" style="text-align:right; font-weight:bold; color: #0D47A1; padding-right: 20px;">TOTAL BANK EXPENSES:</td>
                    <td class="currency" style="border-top: 2px solid #0D47A1;"><span class="left-sym">Rs.</span><span class="right-val" style="color: #0D47A1;">${data.stats.bankExp.replace('Rs.', '').trim()}</span><div class="clearfix"></div></td>
                </tr>
            </tbody>
        </table>

        <div style="page-break-inside: avoid;">
            <div style="background-color: #1e1e1e; color: #fff; padding: 15px 20px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-top: 30px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                <div style="font-weight:bold; color: #FF9800; font-size: 15px; text-transform: uppercase;">COMBINED GRAND TOTAL EXPENSES:</div>
                <div style="font-weight:bold; font-size: 18px;"><span style="color:#aaa; font-weight:normal;">Rs. </span>${data.stats.totalExpenses.replace('Rs.', '').trim()}</div>
            </div>

            <div class="end-statement">
                <h3>--- END OF STATEMENT ---</h3>
                <p>Closing Data Processed As Of: ${data.endDateProcessed}</p>
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        console.log("Generating High Quality PDF on Cloud Run...");
        const browser = await getBrowser();
        page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000); // 30s navigation timeout
        page.setDefaultTimeout(30000); // 30s operation timeout

        // ===================================================================
        // KEY FIX #1: Replaced 'networkidle2' + 'timeout: 0' (infinite wait)
        // with 'domcontentloaded' + a real timeout. This was the main cause
        // of the slowdown/hang — Puppeteer was waiting FOREVER for the CDN
        // fonts/chart images network to go idle.
        // ===================================================================
        console.time('setContent');
        await page.setContent(htmlTemplate, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // KEY FIX #2: Deterministically wait for fonts to be ready.
        // Won't hang forever — capped by Promise.race below.
        await page.evaluate(async () => {
            try {
                await Promise.race([
                    document.fonts.ready,
                    new Promise(resolve => setTimeout(resolve, 8000)) // hard cap
                ]);
            } catch (e) { /* ignore font errors, render anyway */ }
        });

        // KEY FIX #3: Wait for images (QR + charts) to load, but never hang
        // on a broken/slow image. Capped at 10s total.
        await page.evaluate(async () => {
            const waitImg = (img) => new Promise(resolve => {
                if (img.complete) return resolve();
                img.onload = resolve;
                img.onerror = resolve; // don't block on broken images
            });
            await Promise.race([
                Promise.all(Array.from(document.images).map(waitImg)),
                new Promise(resolve => setTimeout(resolve, 10000)) // hard cap
            ]);
        });
        console.timeEnd('setContent');

        console.time('pdfRender');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '25mm', left: '10mm', right: '10mm' },
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: '<div style="width: 100%; text-align: center; font-size: 15px; font-weight: bold; color: #333; font-family: Helvetica, Arial, sans-serif; padding-bottom: 10px;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
            timeout: 60000
        });
        console.timeEnd('pdfRender');

        await page.close();
        page = null;

        if (data.action === 'DOWNLOAD') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=STS_Report.pdf');
            return res.send(pdfBuffer);
        } else if (data.action === 'EMAIL') {
            return res.json({ status: 'success', base64: pdfBuffer.toString('base64') });
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid action specified.' });
        }
    } catch (err) {
        console.error("PDF Gen Error:", err);
        if (page) await page.close().catch(() => null);
        // Reset browser on fatal session errors so the next request relaunches it
        if (err.message.includes('Session closed') || err.message.includes('Target closed') || err.message.includes('Protocol error') || err.message.includes('Timeout')) {
            browserInstance = null;
        }
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/ping', (req, res) => {
    res.status(200).send('Google Cloud Run PDF Engine is Active!');
});

// Cloud Run-এর জন্য পোর্ট 8080 এবং Host 0.0.0.0 বাধ্যতামূলক
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`STS PDF Engine running on port ${PORT}`);
    try {
        console.log("Warming up Puppeteer browser...");
        await getBrowser();
        console.log("Puppeteer is ready!");
    } catch (e) {
        console.error("Failed to pre-warm browser:", e);
    }
});
