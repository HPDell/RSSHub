import { Handler } from 'hono';
import { URL } from 'url';

const handler: Handler = async function (ctx) {
    let url = ctx.req.query('url');

    if (!url) {
        return ctx.text('Missing "url" query parameter.', 400);
    }
    url = decodeURIComponent(url);

    try {
        // 添加自定义头部
        const response = await fetch(url, {
            headers: {
                Referer: 'https://www.bilibili.com', // 替换为需要的 Referer
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36', // 替换为需要的 User-Agent
            },
        });

        if (!response.ok) {
            return ctx.text(`Failed to fetch the file: ${response.statusText}`, 500);
        }

        // 设置响应头以便浏览器触发下载
        const filename = new URL(url).pathname?.split('/').pop() || 'downloaded_file';
        ctx.header('Content-Disposition', `attachment; filename="${filename}"`);
        ctx.header('Content-Type', response.headers.get('content-type') || 'application/octet-stream');

        return ctx.body(response.body);
    } catch (error) {
        return ctx.text(`Error: ${error.message}`, 500);
    }
};

export default handler;
