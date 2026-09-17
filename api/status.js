export default async function handler(req, res) {
    const { plate } = req.query;
    if (!plate) {
        return res.status(400).json({ error: '缺少車牌參數' });
    }

    const airtableToken = process.env.AIRTABLE_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableTable = 'Vault_Keys';

    try {
        const queryUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTable}?filterByFormula={PLATE}='${plate.toUpperCase()}'`;
        const queryRes = await fetch(queryUrl, {
            headers: { 'Authorization': `Bearer ${airtableToken}` }
        });
        const queryData = await queryRes.json();
        const records = queryData.records || [];

        if (records.length === 0) {
            return res.status(200).json({ exists: true, isPublic: true, hasOwner: false });
        }

        const record = records[0];
        const isPublic = record.fields.IsPublic === 'true';
        const ownerUid = record.fields.OwnerUID || '';

        return res.status(200).json({
            exists: true,
            isPublic: isPublic,
            hasOwner: !!ownerUid
        });
    } catch (err) {
        console.error("STATUS ERROR:", err);
        return res.status(500).json({ error: err.message });
    }
}
