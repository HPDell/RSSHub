import { Route, ViewType } from '@/types';
import got from '@/utils/got';
import { ofetch } from 'ofetch';
import cache from './cache';
import utils from './utils';
import logger from '@/utils/logger';
import { Context } from 'hono';

async function handler(ctx: Context) {
    const uid = ctx.req.param('uid');
    const embed = !ctx.req.param('embed');
    const cookie = await cache.getCookie();
    const wbiVerifyString = await cache.getWbiVerifyString();
    const dmImgList = utils.getDmImgList();
    const dmImgInter = utils.getDmImgInter();
    const renderData = await cache.getRenderData(uid);
    const [name, face] = await cache.getUsernameAndFaceFromUID(uid);

    const params = utils.addWbiVerifyInfo(
        utils.addRenderData(utils.addDmVerifyInfoWithInter(`mid=${uid}&ps=30&tid=0&pn=1&keyword=&order=pubdate&platform=web&web_location=1550101&order_avoided=true`, dmImgList, dmImgInter), renderData),
        wbiVerifyString
    );
    const response = await got(`https://api.bilibili.com/x/space/wbi/arc/search?${params}`, {
        headers: {
            Referer: `https://space.bilibili.com/${uid}/video?tid=0&pn=1&keyword=&order=pubdate`,
            Cookie: cookie,
        },
    });
    const data = response.data;
    if (data.code) {
        logger.error(JSON.stringify(data.data));
        throw new Error(`Got error code ${data.code} while fetching: ${data.message}`);
    }

    let itemList = [];
    if (data.data && data.data.list && data.data.list.vlist) {
        itemList = await Promise.all(
            data.data.list.vlist.map(async (item) => {
                const rssItem = {
                    title: item.title,
                    description: utils.renderUGCDescription(embed, item.pic, item.description, item.aid, undefined, item.bvid),
                    pubDate: new Date(item.created * 1000).toUTCString(),
                    link: item.created > utils.bvidTime && item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : `https://www.bilibili.com/video/av${item.aid}`,
                    author: name,
                    comments: item.comment,
                };
                const bvData = await ofetch('https://api.bilibili.com/x/web-interface/view', {
                    query: {
                        bvid: item.bvid,
                    },
                });
                if (bvData.data && bvData.data.cid) {
                    const cid = bvData.data.cid;
                    const playUrl = await ofetch('https://api.bilibili.com/x/player/wbi/playurl', {
                        query: {
                            bvid: item.bvid,
                            cid,
                            fnval: 16,
                            qn: 32,
                            fourk: 0,
                        },
                        headers: {
                            Referer: `https://www.bilibili.com/video/${item.bvid}/`,
                            Cookie: cookie,
                        },
                    });
                    if (playUrl.data && playUrl.data.dash && playUrl.data.dash.audio && playUrl.data.dash.audio.length) {
                        const audio = playUrl.data.dash.audio[0];
                        const url = encodeURIComponent(audio.baseUrl);
                        if (url) {
                            const hostUrl = new URL(ctx.req.url);
                            return {
                                ...rssItem,
                                itunes_item_image: item.pic,
                                itunes_duration: bvData.data.timelength,
                                enclosure_url: `https://${hostUrl.host}/proxy/bilibili?url=${url}`,
                                enclosure_type: audio.mimeType,
                            };
                        }
                    }
                }
                return rssItem;
            })
        );
    }

    return {
        title: `${name} - Bilibili`,
        link: `https://space.bilibili.com/${uid}`,
        description: `${name} 的 Bilibili 投稿`,
        image: face,
        logo: face,
        icon: face,
        itunes_author: name,
        item: itemList,
    };
}

export const route: Route = {
    path: '/user/video-podcast/:uid/:embed?',
    categories: ['social-media'],
    view: ViewType.Audios,
    example: '/bilibili/user/video-podcast/2267573',
    parameters: { uid: '用户 id, 可在 UP 主主页中找到' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: true,
        supportScihub: false,
    },
    radar: [
        {
            source: ['space.bilibili.com/:uid/video'],
            target: '/user/video-podcast/:uid',
        },
    ],
    name: 'UP 主投稿（播客模式）',
    maintainers: ['hpdell'],
    description: '获取的播放 URL 有效期只有 2 小时，需要开启播客 APP 的自动下载功能。',
    handler,
};
