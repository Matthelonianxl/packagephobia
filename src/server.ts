import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { mimeType, cacheControl } from './util/backend/lookup';
import { renderPage } from './pages/_document';

import { pages, versionUnknown } from './util/constants';
import { getResultProps } from './page-props/results';
import { getBadgeUrl, getApiResponseSize } from './util/badge';

const { TMPDIR = '/tmp', GA_ID = '', PORT = 3107, NODE_ENV } = process.env;
process.env.HOME = TMPDIR;
const isProd = NODE_ENV === 'production';
console.log('isProduction: ', isProd);
console.log('TMPDIR: ', TMPDIR);
console.log('HOME: ', process.env.HOME);


export default async function handler(req: IncomingMessage, res: ServerResponse) {
    let { httpVersion, method, url } = req;
    console.log(`${httpVersion} ${method} ${url}`);
    let { pathname = '/', query = {} } = parse(url || '', true);
    if (pathname === '/') {
        pathname = pages.index;
    }
    try {
        if (pathname === pages.badge) {
            const { pkgSize, isLatest, cacheResult } = await getResultProps(query, TMPDIR);
            const badgeUrl = getBadgeUrl(pkgSize, isLatest);
            res.statusCode = 302;
            res.setHeader('Location', badgeUrl);
            res.setHeader('Cache-Control', cacheControl(isProd, cacheResult ? 7 : 0));
            res.end();
        } else if (pathname === pages.apiv1 || pathname === pages.apiv2) {
            const { pkgSize, cacheResult } = await getResultProps(query, TMPDIR);
            const { publishSize, installSize, name, version } = pkgSize;
            let result: ApiResponseV1 | ApiResponseV2;
            if (pathname === pages.apiv1) {
                result = { publishSize, installSize };
            } else {
                const publish = getApiResponseSize(publishSize);
                const install = getApiResponseSize(installSize);
                result = { name, version, publish, install };
            }
            res.statusCode = version === versionUnknown ? 404 : 200;
            res.setHeader('Content-Type', mimeType(pathname));
            res.setHeader('Cache-Control', cacheControl(isProd, cacheResult ? 7 : 0));
            res.end(JSON.stringify(result));
        } else {
            const file = join('./static', pathname);
            if (existsSync(file)) {
                res.setHeader('Content-Type', mimeType(pathname));
                res.setHeader('Cache-Control', cacheControl(isProd, 30));
                createReadStream(file).pipe(res);
            } else {
                res.setHeader('Content-Type', mimeType('*.html'));
                res.setHeader('Cache-Control', cacheControl(isProd, 0));
                renderPage(res, pathname, query, TMPDIR, GA_ID);
            }
        }
    } catch (e) {
        console.error(e);
        res.setHeader('Content-Type', mimeType('500.txt'));
        res.setHeader('Cache-Control', cacheControl(isProd, 0));
        res.statusCode = 500;
        res.end('500 Internal Error');
    }
}

if (!isProd) {
    const listen = () => console.log(`Listening on ${PORT}...`);
    createServer(handler).listen(PORT, listen);
}
