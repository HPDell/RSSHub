const got = require('@/utils/got');
const date = require('@/utils/date');
const cheerio = require('cheerio');

// 参考 whu/cs 和 whu/nes 路由编写

const baseUrl = 'http://rsgis.whu.edu.cn';
const categoryMap = {
    index: {
        name: '首页',
        path: '',
    },
    xyxw: {
        name: '学院新闻',
        path: 'xyxw1',
        sub: {
            xyyw: {
                name: '学院要闻',
                path: 'xyyw2',
            },
            hzjl: {
                name: '合作交流',
                path: 'hzjl',
            },
            mtjj: {
                name: '媒体聚焦',
                path: 'mtjj',
            },
            xgyw: {
                name: '学工要闻',
                path: 'xgyw',
            },
        },
    },
    kxyj: {
        name: '科学研究',
        path: 'kxyj',
        sub: {
            xsbg: {
                name: '学术报告',
                path: 'xsbg',
            },
            xsjl: {
                name: '学术交流',
                path: 'xsjl',
            },
            kycg: {
                name: '学术成果',
                path: 'kycg',
            },
            sbxx: {
                name: '申报信息',
                path: 'sbxx',
            },
        },
    },
    tzgg: {
        name: '通知公告',
        path: 'tzgg1',
        sub: {
            xytz: {
                name: '学院通知',
                path: 'xytz',
            },
            jxdt: {
                name: '教学动态',
                path: 'jxdt',
            },
            xsdt: {
                name: '学术动态',
                path: 'xsdt',
            },
            rcyj: {
                name: '人才引进',
                path: 'rcyj',
            },
        },
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

async function getDetail(ctx, item) {
    if (item.external) {
        return `<a href="${item.link}">阅读原文</a>`;
    }
    const desc = await ctx.cache.tryGet(`whu:rsgis:${item.link}`, async () => {
        const response = await got.get(item.link);
        const $ = cheerio.load(response.data);
        const title = $('div.content div.content_title h1').first().text();
        const content = $('div.content div.v_news_content').first();
        return {
            title,
            description: content.html(),
        };
    });
    return desc;
}

/**
 * Process index type.
 *
 * @param {any} ctx Context
 */
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
    const fullList = await Promise.all(
        [xyxwList, tzggList, xsdtList, xsjzList, jxdtList, xgdtList]
            .reduce((a, b) => a.concat(b))
            .map(async (item) => ({
                ...item,
                ...(await getDetail(ctx, item)),
            }))
    );
    return fullList;
}

/**
 * Process non-index types.
 *
 * @param {any} ctx Context
 * @param {string} type Level 1 type
 * @param {string} sub Level 2 type
 */
async function handlePostList(ctx, type, sub) {
    const urlList = [];
    const category = categoryMap[type];
    if (sub === 'all') {
        const subMap = category.sub;
        for (const key in subMap) {
            if (Object.hasOwnProperty.call(subMap, key)) {
                const subType = subMap[key];
                urlList.push({
                    url: `${baseUrl}/${category.path}/${subType.path}.htm`,
                    base: `${baseUrl}/${category.path}`,
                });
            }
        }
    } else if (sub in category.sub) {
        urlList.push({
            url: `${baseUrl}/${category.path}/${category.sub[sub].path}.htm`,
            base: `${baseUrl}/${category.path}`,
        });
    } else {
        throw 'No such sub type.';
    }
    const urlPosts = await Promise.all(
        urlList.map(async (url) => {
            const response = await got.get(url.url);
            const $ = cheerio.load(response.data);
            return $('div.neiinner > div.nav_right > div.right_inner > div.list > ul > li')
                .toArray()
                .map((item) => parseListLinkDateItem($(item), url.base));
        })
    );
    const fullList = await Promise.all(
        urlPosts
            .reduce((a, b) => a.concat(b), [])
            .map(async (item) => ({
                ...item,
                ...(await getDetail(ctx, item)),
            }))
    );
    return fullList;
}

module.exports = async (ctx) => {
    const { type = 'index', sub = 'all' } = ctx.params;
    let itemList = [];
    switch (type) {
        case 'index':
            itemList = await handleIndex(ctx);
            break;
        case 'xyxw':
        case 'kxyj':
        case 'tzgg':
            itemList = await handlePostList(ctx, type, sub);
            break;
        default:
            throw 'No such type';
    }

    ctx.state.data = {
        title: `${categoryMap[type].name} - 武汉大学遥感信息工程学院`,
        link: baseUrl,
        description: `${categoryMap[type].name} - 武汉大学遥感信息工程学院`,
        item: itemList,
    };
};
