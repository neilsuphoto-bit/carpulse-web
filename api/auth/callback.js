export default async function handler(req, res) {
    const { code, state } = req.query;
    
    if (!code) {
        return res.status(400).send('缺少 LINE 授權驗證碼 (Code)');
    }

    const stateParts = state ? state.split('_') : [];
    const cleanPlate = stateParts.length > 1 ? stateParts[1].trim().toUpperCase() : 'BHS0759';

    const channelId = process.env.LINE_CHANNEL_ID;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    const redirectUri = 'https://www.carpuse.cc/api/auth/callback';

    try {
        const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                client_id: channelId,
                client_secret: channelSecret
            })
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            throw new Error('無法取得 LINE Access Token: ' + JSON.stringify(tokenData));
        }

        const profileRes = await fetch('https://api.line.me/v2/profile', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const profile = await profileRes.json();
        
        const lineUid = profile.userId;
        const lineDisplayName = profile.displayName;

        const airtableToken = process.env.AIRTABLE_TOKEN;
        const airtableBaseId = process.env.AIRTABLE_BASE_ID;
        const airtableTable = 'Vault_Keys';

        console.log("=== AIRTABLE DEBUG ===");
        console.log("Token exists:", !!airtableToken);
        console.log("BaseID exists:", !!airtableBaseId);
        console.log("Target Plate:", cleanPlate);

        if (airtableToken && airtableBaseId) {
            const queryUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTable}?filterByFormula={PLATE}='${cleanPlate}'`;
            const queryRes = await fetch(queryUrl, {
                headers: { 'Authorization': `Bearer ${airtableToken}` }
            });
            const queryText = await queryRes.text();
            console.log("Airtable Query Status:", queryRes.status);
            console.log("Airtable Query Response:", queryText);

            const queryData = JSON.parse(queryText);
            const records = queryData.records || [];

            if (records.length === 0) {
                const createRes = await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableTable}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${airtableToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fields: {
                            "PLATE": cleanPlate,
                            "OwnerUID": lineUid,
                            "LineUID": lineUid,
                            "AccessKey": lineDisplayName
                        }
                    })
                });
                const createText = await createRes.text();
                console.log("Airtable Create Status:", createRes.status);
                console.log("Airtable Create Response:", textToLog => createText);
            }
        }

        res.writeHead(302, { 
            Location: `/?plate=${encodeURIComponent(cleanPlate)}&auth=success&uid=${encodeURIComponent(lineUid)}&name=${encodeURIComponent(lineDisplayName)}` 
        });
        res.end();

    } catch (err) {
        console.error("FATAL ERROR:", err);
        res.status(500).send(`伺服器崩潰錯誤: ${err.message}`);
    }
}
