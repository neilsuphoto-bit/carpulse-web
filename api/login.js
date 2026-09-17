export default function handler(req, res) {
    const channelId = process.env.LINE_CHANNEL_ID;
    
    // 強制硬編碼與 LINE Developers 後台 100% 吻合的回呼網址
    const redirectUri = 'https://www.carpuse.cc/api/callback';
    
    // 隨機產生 state 參數防止 CSRF 攻擊
    const state = Math.random().toString(36).substring(7);
    
    // 取得前端傳過來的車牌號碼 (用來進行後續綁定)
    const plate = req.query.plate || '';
    
    // 把 plate 夾帶在 state 裡面，等 LINE 回傳時再解開
    const stateWithPlate = `${state}_${plate}`;

    // 組裝 LINE 官方授權登入網址
    const lineLoginUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${stateWithPlate}&scope=profile%20openid`;

    // 重新導向至 LINE 授權頁面
    res.writeHead(302, { Location: lineLoginUrl });
    res.end();
}
