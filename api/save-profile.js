import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plate, owner_pin, ...carData } = req.body;
  if (!plate) {
    return res.status(400).json({ error: '車牌不得為空' });
  }

  const bucketName = process.env.AWS_S3_BUCKET;
  const key = `profiles/${plate}.json`;

  try {
    // 1. 檢查 S3 是否已經存在該車牌的檔案
    let existingProfile = null;
    try {
      const getCommand = new GetObjectCommand({ Bucket: bucketName, Key: key });
      const response = await s3.send(getCommand);
      const bodyString = await response.Body.transformToString();
      existingProfile = JSON.parse(bodyString);
    } catch (e) {
      // 檔案不存在代表全新註冊
    }

    // 2. 權限防護校驗
    if (existingProfile && existingProfile.owner_pin) {
      // 若已設定過密碼，必須進行比對
      if (!owner_pin || owner_pin !== existingProfile.owner_pin) {
        return res.status(403).json({ error: '密碼錯誤！此車牌已被其他車主綁定，無法覆蓋編輯。' });
      }
    }

    // 3. 組裝要寫入的新資料（保留既有相簿與密碼）
    const finalPayload = {
      plate,
      owner_pin: owner_pin || (existingProfile ? existingProfile.owner_pin : ''),
      ...carData,
      albums: carData.albums && carData.albums.length > 0 ? carData.albums : (existingProfile ? existingProfile.albums || [] : [])
    };

    // 4. 寫入 S3 雲端金庫
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(finalPayload, null, 2),
      ContentType: 'application/json',
    });

    await s3.send(putCommand);
    return res.status(200).json({ success: true, message: '資料已安全寫入雲端' });

  } catch (error) {
    console.error('S3 Save Error:', error);
    return res.status(500).json({ error: `S3 寫入失敗: ${error.message}` });
  }
}
