export default function handler(req, res) {
    const channelId = process.env.LINE_CHANNEL_ID;
    
    // 取得當前網站的網域 (兼容 Vercel 正式環境與本地開發)
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    // 導向回調網址 (對應我們剛剛在 LINE Developers 設定的 Callback URL)
    const redirectUri = `${protocol}://${host}/api/auth/callback`;
    
    // 隨機產生一個 state 參數防止資安攻擊 (CSRF)
    const state = Math.random().toString(36).substring(7);
    
    // 取得前端傳過來的車牌號碼 (如果有的話，用來綁定)
    const plate = req.query.plate || '';
    
    // 把 plate 偷偷夾帶在 state 裡面，等 LINE 回傳時再拿出來
    const stateWithPlate = `${state}_${plate}`;

    // 組裝 LINE 官方授權登入網址
    const lineLoginUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${stateWithPlate}&scope=profile%20openid`;

    // 將使用者重新導向到 LINE 登入頁面
    res.writeHead(302, { Location: lineLoginUrl });
    res.end();
}
