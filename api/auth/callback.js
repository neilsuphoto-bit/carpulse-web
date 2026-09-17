export default async function handler(req, res) {
    const { code, state } = req.query;
    if (!code) {
        return res.status(400).send('授權失敗：缺少必要的授權碼 (Authorization Code)');
    }

    // 解析 state 裡帶過來的車牌號碼 (格式為 random_PLATE)
    const stateParts = state ? state.split('_') : [];
    const plate = stateParts.length > 1 ? stateParts[1].toUpperCase() : '';

    if (!plate) {
        return res.status(400).send('驗證錯誤：無法識別對應的車牌號碼');
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/auth/callback`;

    try {
        // 1. 用 Authorization Code 向 LINE 交換 Access Token
        const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                client_id: process.env.LINE_CHANNEL_ID,
                client_secret: process.env.LINE_CHANNEL_SECRET
            })
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            throw new Error('無法從 LINE 取得 Access Token，可能金鑰設定有誤');
        }

        // 2. 用 Access Token 取得車主的 LINE UID
        const profileRes = await fetch('https://api.line.me/v2/profile', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const profileData = await profileRes.json();
        const lineUID = profileData.userId;

        // 3. 連線 Airtable 檢查該車牌是否已經被鎖定
        const airtableToken = process.env.AIRTABLE_TOKEN;
        const baseId = process.env.AIRTABLE_BASE_ID;
        const airtableUrl = `https://api.airtable.com/v0/${baseId}/Vault_Keys?filterByFormula=({Plate}='${plate}')`;

        const checkRes = await fetch(airtableUrl, {
            headers: { 'Authorization': `Bearer ${airtableToken}` }
        });
        const checkData = await checkRes.json();

        let accessKey = '';

        if (checkData.records && checkData.records.length > 0) {
            // 已經有紀錄：檢查是不是本人
            const record = checkData.records[0];
            if (record.fields.LineUID === lineUID) {
                accessKey = record.fields.AccessKey;
            } else {
                return res.status(403).send(`
                    <html><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
                    <body class="bg-[#090a0f] text-white flex items-center justify-center h-screen">
                        <div class="bg-gray-900 border border-red-500/30 p-8 rounded-2xl max-w-md text-center">
                            <h2 class="text-xl font-bold text-red-400 mb-2">🔒 此車庫已被鎖定</h2>
                            <p class="text-sm text-gray-400 mb-6">車牌 ${plate} 已由其他 LINE 帳號綁定保護，非車主本人無法解鎖。</p>
                            <a href="/" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-xl text-xs font-semibold">返回首頁</a>
                        </div>
                    </body></html>
                `);
            }
        } else {
            // 還沒被鎖定：隨機生成 6 位數專屬金鑰，並寫入 Airtable
            accessKey = Math.random().toString(36).substring(2, 8).toUpperCase();

            await fetch(`https://api.airtable.com/v0/${baseId}/Vault_Keys`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${airtableToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fields: {
                        Plate: plate,
                        LineUID: lineUID,
                        AccessKey: accessKey
                    }
                })
            });
        }

        // 4. 驗證成功，產生包含 Key 的專屬解鎖網頁給車主
        const vaultUrl = `${protocol}://${host}/?plate=${plate}&key=${accessKey}`;
        
        return res.send(`
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CARPULSE - 私密金庫解鎖成功</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            </head>
            <body class="bg-[#090a0f] text-gray-100 flex items-center justify-center min-h-screen p-4">
                <div class="max-w-md w-full bg-[#13151f] border border-gray-800 rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
                    <div class="w-12 h-12 bg-green-500/10 border border-green-500/30 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h2 class="text-xl font-extrabold text-white mb-1">私密金庫解鎖成功</h2>
                    <p class="text-xs text-gray-400 mb-6 font-mono">車牌：${plate}</p>

                    <div class="bg-white p-4 rounded-xl inline-block mb-4 shadow-inner" id="qrcode"></div>
                    
                    <p class="text-[11px] text-gray-400 mb-6 leading-relaxed">
                        這是您的專屬金鑰 QR Code。<br>請截圖保存，日後掃描或透過此連結即可直接進入車庫。
                    </p>

                    <a href="${vaultUrl}" class="w-full block bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition shadow-lg shadow-blue-600/30 mb-3">
                        立即進入專屬車庫
                    </a>
                    <a href="/" class="text-xs text-gray-500 hover:text-gray-300 transition">返回首頁</a>
                </div>

                <script>
                    new QRCode(document.getElementById("qrcode"), {
                        text: "${vaultUrl}",
                        width: 180,
                        height: 180,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                </script>
            </body>
            </html>
        `);

    } catch (err) {
        console.error(err);
        return res.status(500).send(`伺服器驗證發生錯誤：${err.message}`);
    }
}
