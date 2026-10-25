const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// 啟動 S3 客戶端 (自動吃 Vercel 剛設定好的環境變數)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
 
module.exports = async function handler(req, res) {
  // 1. 開啟 CORS 通行證，讓你的前端網頁可以呼叫這支 API
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // 處理瀏覽器的 OPTIONS 預檢請求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. 阻擋非 POST 的惡意請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
  const data = req.body;
const licensePlate = data.plate;

    if (!licensePlate) {
      return res.status(400).json({ error: '拒絕存取：車牌號碼為必填欄位' });
    }

    // 3. 打包資料準備寫入 S3
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: `profiles/${licensePlate}.json`, // 檔案會統一存在 profiles/ 資料夾下
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    };

    // 4. 執行雲端寫入指令
    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // 5. 寫入成功，回報前端
    return res.status(200).json({ message: '車籍資料建檔成功', plate: licensePlate });
    
  } catch (error) {
    console.error("S3 Upload Error:", error);
    return res.status(500).json({ error: '伺服器連線異常，無法儲存資料' });
  }
}
