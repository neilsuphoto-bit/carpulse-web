import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plate, owner_pin, albumTitle, photos } = req.body;

  // 1. 檢查必要參數
  if (!plate || !owner_pin || !albumTitle || !photos || photos.length === 0) {
    return res.status(400).json({ error: '缺少必要參數 (車牌、密碼、相簿名稱或照片)' });
  }

  const bucketName = process.env.AWS_S3_BUCKET;
  const profileKey = `profiles/${plate}.json`;

  try {
    // 2. 去 S3 抓取該車主現有的 profile.json
    let existingProfile;
    try {
      const getCommand = new GetObjectCommand({ Bucket: bucketName, Key: profileKey });
      const response = await s3.send(getCommand);
      const bodyString = await response.Body.transformToString();
      existingProfile = JSON.parse(bodyString);
    } catch (e) {
      return res.status(404).json({ error: '找不到該車牌的檔案，請先註冊車主名片' });
    }

    // 3. 嚴格校驗車主 PIN 碼 (防覆蓋/防惡意上傳核心)
    if (!existingProfile.owner_pin || existingProfile.owner_pin !== owner_pin) {
      return res.status(403).json({ error: '車主管理密碼錯誤，拒絕上傳！' });
    }

    // 4. 解析 Base64 照片並上傳至 S3 專屬資料夾
    const uploadedPaths = [];
    for (let i = 0; i < photos.length; i++) {
      const base64Data = photos[i];
      // 移除 Base64 的 header (例如 data:image/jpeg;base64,)
      const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), "base64");
      
      // 用時間戳與索引命名，確保檔名不重複
      const filename = `${Date.now()}-${i}.jpg`;
      const s3Key = `${plate}/${filename}`;

      const putImageCmd = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: buffer,
        ContentType: 'image/jpeg',
      });
      await s3.send(putImageCmd);
      
      uploadedPaths.push(filename);
    }

    // 5. 將新相簿追加 (Append) 到既有的 albums 陣列中
    if (!existingProfile.albums) {
      existingProfile.albums = [];
    }
    
    existingProfile.albums.push({
      title: albumTitle,
      cover: uploadedPaths[0], // 第一張當封面
      photos: uploadedPaths,
      isUgc: true
    });

    // 6. 將更新後的 JSON 寫回 S3
    const putProfileCmd = new PutObjectCommand({
      Bucket: bucketName,
      Key: profileKey,
      Body: JSON.stringify(existingProfile, null, 2),
      ContentType: 'application/json',
    });
    await s3.send(putProfileCmd);

    return res.status(200).json({ success: true, message: '相簿上傳並更新成功' });

  } catch (error) {
    console.error('UGC Upload API Error:', error);
    return res.status(500).json({ error: `系統處理失敗: ${error.message}` });
  }
}
