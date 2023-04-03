const got = require('@/utils/got');
const date = require('@/utils/date');
const cheerio = require('cheerio');

// 参考 whu/cs 和 whu/nes 路由编写

const baseUrl = 'http://rsgis.whu.edu.cn';
const categoryMap = {
    index: {
        name: '首页',
        path: 'index',
    },
    xyyw: {
        name: '学院要闻',
        path: 'xyxw1/xyyw2',
    },
    hzjl: {
        name: '合作交流',
        path: 'xyxw1/hzjl',
    },
    mtjj: {
        name: '媒体聚焦',
        path: 'xyxw1/mtjj',
    },
    xgyw: {
        name: '学工要闻',
        path: 'xyxw1/xgyw',
    },
    xsbg: {
        name: '学术报告',
        path: 'kxyj/xsbg',
    },
    xsjl: {
        name: '学术交流',
        path: 'kxyj/xsjl',
    },
    kycg: {
        name: '学术成果',
        path: 'kxyj/kycg',
    },
    sbxx: {
        name: '申报信息',
        path: 'kxyj/sbxx',
    },
    xytz: {
        name: '学院通知',
        path: 'tzgg1/xytz',
    },
    jxdt: {
        name: '教学动态',
        path: 'tzgg1/jxdt',
    },
    xsdt: {
        name: '学术动态',
        path: 'tzgg1/xsdt',
    },
    rcyj: {
        name: '人才引进',
        path: 'tzgg1/rcyj',
    },
};

/**
 * Check whether the link is external.
 *
 * @param {string} link Post link
 * @returns {boolean} Whether or not weixin post
 */
function checkExternal(link) {
    const matchWeixin = link.match(/^((http:\/\/)|(https:\/\/))?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}(\/)/);
    return matchWeixin && matchWeixin.length > 0 ? true : false;
}

/**
 * Get information from a list of paired link and date.
 *
 * @param {cheerio.Cheerio<cheerio.AnyNode>} element
 * @returns A list of RSS meta node.
 */
function parseListLinkDateItem(element, currentUrl) {
    const linkElement = element.find('a').first();
    const title = linkElement.text();
    const href = linkElement.attr('href');
    const external = checkExternal(href);
    const link = external ? href : `${currentUrl}/${href}`;
    const pubDate = element.find('div.date1').first().text();
    return {
        title,
        link,
        pubDate: date(pubDate, 8),
        description: title,
        external,
    };
}

async function getDescription(ctx, item) {
    if (item.external) {
        return item.link;
    }
    await ctx.cache.tryGet('', async () => {
        const response = await got.get(item.link);
        const $ = cheerio.load(response.data);
        const content = $('div.content div.v_news_content');
        return content.html();
    });
}

async function handleIndex(ctx) {
    const url = `${baseUrl}/index.htm`;
    const response = await got.get(url);
    const $ = cheerio.load(response.data);
    // 学院新闻
    const xyxwList = $('div.main1 > div.newspaper:nth-child(1) > div.newspaper_list > ul > li')
        .toArray()
        .map((item) => parseListLinkDateItem($(item), baseUrl));
    // 通知公告
    const tzggList = $('div.main1 > div.newspaper:nth-child(2) > div.newspaper_list > ul > li')
        .toArray()
        .map((item) => parseListLinkDateItem($(item), baseUrl));
    // 学术动态
    const xsdtList = $('div.main3 div.inner > div.newspaper:nth-child(1) > ul.newspaper_list2 > li:nth-child(1) > ul > li')
        .toArray()
        .map((item) => parseListLinkDateItem($(item), baseUrl));
    // 学术进展
    const xsjzList = $('div.main3 div.inner > div.newspaper:nth-child(1) > ul.newspaper_list2 > li:nth-child(2) > ul > li')
        .toArray()
        .map((item) => parseListLinkDateItem($(item), baseUrl));
    // 教学动态
    const jxdtList = $('div.main3 div.inner > div.newspaper:nth-child(2) > div.newspaper_list2 > ul > li')
        .toArray()
        .map((item) => parseListLinkDateItem($(item), baseUrl));
    // 学工动态
    const xgdtList = $('div.main3 div.inner > div.newspaper:nth-child(3) > div.newspaper_list2 > ul > li')
        .toArray()
        .map((item) => parseListLinkDateItem($(item), baseUrl));
    // 组合所有新闻
    const fullList = [xyxwList, tzggList, xsdtList, xsjzList, jxdtList, xgdtList].reduce((a, b) => a.concat(b));
    await Promise.all(
        fullList.map(async (item) => ({
            ...item,
            description: await getDescription(ctx, item),
        }))
    );
}

module.exports = async (ctx) => {
    const type = ctx.params.type;
    let itemList = [];
    switch (type) {
        case 'index':
            itemList = await handleIndex(ctx);
            break;
        default:
            break;
    }

    ctx.state.data = {
        title: `${categoryMap[type].name} - 武汉大学遥感信息工程学院`,
        link: baseUrl,
        description: `${categoryMap[type].name} - 武汉大学遥感信息工程学院`,
        item: itemList,
    };
};
