export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { plate, isPublic, userUid } = req.body;

    if (!plate || isPublic === undefined || !userUid) {
        return res.status(400).json({ success: false, error: '參數不完整' });
    }

    const airtableToken = process.env.AIRTABLE_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableTable = 'Vault_Keys';

    try {
        // 1. 尋找該車牌記錄以核對車主身分
        const queryUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTable}?filterByFormula={PLATE}='${plate.toUpperCase()}'`;
        const queryRes = await fetch(queryUrl, {
            headers: { 'Authorization': `Bearer ${airtableToken}` }
        });
        const queryData = await queryRes.json();
        const records = queryData.records || [];

        if (records.length === 0) {
            return res.status(404).json({ success: false, error: '找不到此車牌紀錄' });
        }

        const record = records[0];
        const ownerUid = record.fields.OwnerUID;

        // 2. 鐵律防線：檢查操作者是否為真正的車主
        if (ownerUid !== userUid) {
            return res.status(403).json({ success: false, error: '權限不足：您不是此車庫的登記車主，無法修改狀態' });
        }

        // 3. 更新 Airtable 中的 IsPublic 狀態
        const updateRes = await fetch(`https://api.airtable.com/v0/${airtableBaseId}/${airtableTable}/${record.id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${airtableToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    "IsPublic": isPublic ? "true" : "false"
                }
            })
        });

        if (!updateRes.ok) {
            throw new Error('Airtable 更新失敗');
        }

        return res.status(200).json({ success: true, isPublic: isPublic ? "true" : "false" });

    } catch (err) {
        console.error("UPDATE PUBLIC ERROR:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
