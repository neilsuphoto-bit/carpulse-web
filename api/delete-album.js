import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plate, owner_pin, albumIndex } = req.body;

  if (!plate || !owner_pin || albumIndex === undefined) {
    return res.status(400).json({ error: '缺少必要參數' });
  }

  const bucketName = process.env.AWS_S3_BUCKET;
  const profileKey = `profiles/${plate}.json`;

  try {
    // 1. 讀取 S3 上的車主資料
    const getCommand = new GetObjectCommand({ Bucket: bucketName, Key: profileKey });
    const response = await s3.send(getCommand);
    const existingProfile = JSON.parse(await response.Body.transformToString());

    // 2. 嚴格校驗密碼
    if (!existingProfile.owner_pin || existingProfile.owner_pin !== owner_pin) {
      return res.status(403).json({ error: '密碼錯誤！您無權刪除此相簿。' });
    }

    // 3. 確保相簿存在並將其從陣列中切除
    if (!existingProfile.albums || !existingProfile.albums[albumIndex]) {
      return res.status(404).json({ error: '找不到指定的相簿' });
    }
    existingProfile.albums.splice(albumIndex, 1);

    // 4. 覆蓋更新回 S3
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: profileKey,
      Body: JSON.stringify(existingProfile, null, 2),
      ContentType: 'application/json',
    });
    await s3.send(putCommand);

    return res.status(200).json({ success: true, message: '相簿已成功刪除' });

  } catch (error) {
    console.error('Delete Album Error:', error);
    return res.status(500).json({ error: `系統處理失敗: ${error.message}` });
  }
}
