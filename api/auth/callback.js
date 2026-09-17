export default async function handler(req, res) {
    const { code, state } = req.query;
    
    if (!code) {
        return res.status(400).send('缺少 LINE 授權驗證碼 (Code)');
    }

    // 解析帶在 state 裡面的車牌 (格式為 random_plate)
    const stateParts = state ? state.split('_') : [];
    const plate = stateParts.length > 1 ? stateParts.slice(1).join('_').trim().toUpperCase() : '';
    const cleanPlate = plate.split('/')[0].trim();

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
        const lineAvatar = profile.pictureUrl || '';

        const airtableToken = process.env.AIRTABLE_PAT;
        const airtableBaseId = process.env.AIRTABLE_BASE_ID;
        const airtableTable = 'Vault_Keys';

if (airtableToken && airtableBaseId) {
            // 1. 先查詢該車牌是否已經有記錄
            const queryRes = await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableTable}?filterByFormula={PLATE}='${cleanPlate}'`, {
                headers: { 'Authorization': `Bearer ${airtableToken}` }
            });
            const queryData = await queryRes.json();
            const records = queryData.records || [];

            if (records.length === 0) {
                // 狀況 A：完全沒有這張車牌的記錄 ➔ 直接建立，並將此人設為 OwnerUID
                await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableTable}`, {
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
            } else {
                // 狀況 B：已經有記錄，檢查 OwnerUID
                const record = records[0];
                const ownerUid = record.fields.OwnerUID;

                if (!ownerUid) {
                    // 如果 OwnerUID 是空的 ➔ 自動幫他補上成為車主
                    await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableTable}/${record.id}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${airtableToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            fields: {
                                "OwnerUID": lineUid,
                                "LineUID": lineUid,
                                "AccessKey": lineDisplayName
                            }
                        })
                    });
                } else if (ownerUid !== lineUid) {
                    // 狀況 C：已有車主，但登入的人不是車主 ➔ 擋下！
                    return res.redirect(`/?plate=${encodeURIComponent(cleanPlate)}&auth=error&msg=${encodeURIComponent('ACCESS DENIED: 此車庫已由其他 LINE 帳號綁定，非車主本人無法解密。')}`);
                }
            }
        }

        res.writeHead(302, { 
            Location: `/?plate=${encodeURIComponent(cleanPlate)}&auth=success&uid=${encodeURIComponent(lineUid)}&name=${encodeURIComponent(lineDisplayName)}` 
        });
        res.end();

    } catch (err) {
        console.error("LINE Auth Error:", err);
        res.status(500).send(`授權過程發生錯誤: ${err.message}`);
    }
}
