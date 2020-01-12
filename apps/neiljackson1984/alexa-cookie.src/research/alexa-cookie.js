/* jshint -W097 */
/* jshint -W030 */
/* jshint strict: false */
/* jslint node: true */
/* jslint esversion: 6 */
"use strict";

/**
 * partly based on Amazon Alexa Remote Control (PLAIN shell)
 * http://blog.loetzimmer.de/2017/10/amazon-alexa-hort-auf-die-shell-echo.html AND on
 * https://github.com/thorsten-gehrig/alexa-remote-control
 * and much enhanced ...
 */

const https = require('https');
const querystring = require('querystring');
const url = require('url');
const os = require('os');
const cookieTools = require('cookie');
const amazonProxy = require('./lib/proxy.js');

const defaultAmazonPage = 'amazon.de';
const defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:99.0) Gecko/20100101 Firefox/99.0';
const defaultUserAgentLinux = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36';
//const defaultUserAgentMacOs = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36';
const defaultAcceptLanguage = 'de-DE';

const csrfOptions = [
    '/api/language',
    '/spa/index.html',
    '/api/devices-v2/device?cached=false',
    '/templates/oobe/d-device-pick.handlebars',
    '/api/strings'
];

function AlexaCookie() {
    if (!(this instanceof AlexaCookie)) return new AlexaCookie();

    let proxyServer;
    let _options;

    let Cookie = '';

    const addCookies = (Cookie, headers) => {
        if (!headers || !headers['set-cookie']) return Cookie;
        const cookies = cookieTools.parse(Cookie);
        for (let cookie of headers['set-cookie']) {
            cookie = cookie.match(/^([^=]+)=([^;]+);.*/);
            if (cookie && cookie.length === 3) {
                if (cookie[1] === 'ap-fid' && cookie[2] === '""') continue;
                if (cookies[cookie[1]] && cookies[cookie[1]] !== cookie[2]) {
                    _options.logger && _options.logger('Alexa-Cookie: Update Cookie ' + cookie[1] + ' = ' + cookie[2]);
                } else if (!cookies[cookie[1]]) {
                    _options.logger && _options.logger('Alexa-Cookie: Add Cookie ' + cookie[1] + ' = ' + cookie[2]);
                }
                cookies[cookie[1]] = cookie[2];
            }
        }
        Cookie = '';
        for (let name in cookies) {
            if (!cookies.hasOwnProperty(name)) continue;
            Cookie += name + '=' + cookies[name] + '; ';
        }
        Cookie = Cookie.replace(/[; ]*$/, '');
        return Cookie;
    };

    const request = (options, info, callback) => {
        _options.logger && _options.logger('Alexa-Cookie: Sending Request with ' + JSON.stringify(options));
        if (typeof info === 'function') {
            callback = info;
            info = {
                requests: []
            };
        }

        let removeContentLength;
        if (options.headers && options.headers['Content-Length']) {
            if (!options.body) delete options.headers['Content-Length'];
        } else if (options.body) {
            if (!options.headers) options.headers = {};
            options.headers['Content-Length'] = options.body.length;
            removeContentLength = true;
        }

        let req = https.request(options, (res) => {
            let body = "";
            info.requests.push({options: options, response: res});

            if (options.followRedirects !== false && res.statusCode >= 300 && res.statusCode < 400) {
                _options.logger && _options.logger('Alexa-Cookie: Response (' + res.statusCode + ')' + (res.headers.location ? ' - Redirect to ' + res.headers.location : ''));
                //options.url = res.headers.location;
                let u = url.parse(res.headers.location);
                if (u.host) options.host = u.host;
                options.path = u.path;
                options.method = 'GET';
                options.body = '';
                options.headers.Cookie = Cookie = addCookies(Cookie, res.headers);

                res.connection.end();
                return request(options, info, callback);
            } else {
                _options.logger && _options.logger('Alexa-Cookie: Response (' + res.statusCode + ')');
                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end',  () => {
                    if (removeContentLength) delete options.headers['Content-Length'];
                    res.connection.end();
                    callback && callback(0, res, body, info);
                });
            }
        });

        req.on('error', (e) => {
            if (typeof callback === 'function' && callback.length >= 2) {
                return callback(e, null, null, info);
            }
        });
        if (options && options.body) {
            req.write(options.body);
        }
        req.end();
    };

    const getFields = body => {
        body = body.replace(/[\n\r]/g, ' ');
        let re = /^.*?("hidden"\s*name=".*$)/;
        let ar = re.exec(body);
        if (!ar || ar.length < 2) return {};
        let h;
        re = /.*?name="([^"]+)"[\s^\s]*value="([^"]+).*?"/g;
        let data = {};
        while ((h = re.exec(ar[1])) !== null) {
            if (h[1] !== 'rememberMe') {
                data[h[1]] = h[2];
            }
        }
        return data;
    };

    const initConfig = () => {
        _options.amazonPage = _options.amazonPage || defaultAmazonPage;
        if (_options.formerRegistrationData && _options.formerRegistrationData.amazonPage) _options.amazonPage = _options.formerRegistrationData.amazonPage;

        _options.logger && _options.logger('Alexa-Cookie: Use as Login-Amazon-URL: ' + _options.amazonPage);

        if (!_options.userAgent) {
            let platform = os.platform();
            if (platform === 'win32') {
                _options.userAgent = defaultUserAgent;
            }
            /*else if (platform === 'darwin') {
                _options.userAgent = defaultUserAgentMacOs;
            }*/
            else {
                _options.userAgent = defaultUserAgentLinux;
            }
        }
        _options.logger && _options.logger('Alexa-Cookie: Use as User-Agent: ' + _options.userAgent);

        _options.acceptLanguage = _options.acceptLanguage || defaultAcceptLanguage;
        _options.logger && _options.logger('Alexa-Cookie: Use as Accept-Language: ' + _options.acceptLanguage);

        if (_options.setupProxy && !_options.proxyOwnIp) {
            _options.logger && _options.logger('Alexa-Cookie: Own-IP Setting missing for Proxy. Disabling!');
            _options.setupProxy = false;
        }
        if (_options.setupProxy) {
            _options.setupProxy = true;
            _options.proxyPort = _options.proxyPort || 0;
            _options.proxyListenBind = _options.proxyListenBind || '0.0.0.0';
            _options.logger && _options.logger('Alexa-Cookie: Proxy-Mode enabled if needed: ' + _options.proxyOwnIp + ':' + _options.proxyPort + ' to listen on ' + _options.proxyListenBind);
        } else {
            _options.setupProxy = false;
            _options.logger && _options.logger('Alexa-Cookie: Proxy mode disabled');
        }
        _options.proxyLogLevel = _options.proxyLogLevel || 'warn';
        _options.amazonPageProxyLanguage = _options.amazonPageProxyLanguage || 'de_DE';

        if (_options.formerRegistrationData) _options.proxyOnly = true;
    };

    const getCSRFFromCookies = (cookie, _options, callback) => {
        // get CSRF
        const csrfUrls = csrfOptions;

        function csrfTry() {
            const path = csrfUrls.shift();
            let options = {
                'host': 'alexa.' + _options.amazonPage,
                'path': path,
                'method': 'GET',
                'headers': {
                    'DNT': '1',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36',
                    'Connection': 'keep-alive',
                    'Referer': 'https://alexa.' + _options.amazonPage + '/spa/index.html',
                    'Cookie': cookie,
                    'Accept': '*/*',
                    'Origin': 'https://alexa.' + _options.amazonPage
                }
            };

            _options.logger && _options.logger('Alexa-Cookie: Step 4: get CSRF via ' + path);
            request(options, (error, response) => {
                cookie = addCookies(cookie, response ? response.headers : null);
                let ar = /csrf=([^;]+)/.exec(cookie);
                let csrf = ar ? ar[1] : undefined;
                _options.logger && _options.logger('Alexa-Cookie: Result: csrf=' + csrf + ', Cookie=' + cookie);
                if (!csrf && csrfUrls.length) {
                    csrfTry();
                    return;
                }
                callback && callback(null, {
                    cookie: cookie,
                    csrf: csrf
                });
            });
        }

        csrfTry();
    };


    const handleTokenRegistration = (_options, loginData, callback) => {
        _options.logger && _options.logger('Handle token registration Start: ' + JSON.stringify(loginData));

        let deviceSerial;
        if (!_options.formerRegistrationData || !_options.formerRegistrationData.deviceSerial) {
            const deviceSerialBuffer = Buffer.alloc(16);
            for (let i = 0; i < 16; i++) {
                deviceSerialBuffer.writeUInt8(Math.floor(Math.random() * 255), i);
            }
            deviceSerial = deviceSerialBuffer.toString('hex');
        } else {
            _options.logger && _options.logger('Proxy Init: reuse deviceSerial from former data');
            deviceSerial = _options.formerRegistrationData.deviceSerial;
        }
        loginData.deviceSerial = deviceSerial;

        const cookies = cookieTools.parse(loginData.loginCookie);
        Cookie = loginData.loginCookie;

        /*
            Register App
         */

        const registerData = {
            "requested_extensions": [
                "device_info",
                "customer_info"
            ],
            "cookies": {
                "website_cookies": [
                    /*{
                        "Value": cookies["session-id-time"],
                        "Name": "session-id-time"
                    }*/
                ],
                "domain": ".amazon.com"
            },
            "registration_data": {
                "domain": "Device",
                "app_version": "2.2.223830.0",
                "device_type": "A2IVLV5VM2W81",
                "device_name": "%FIRST_NAME%\u0027s%DUPE_STRATEGY_1ST%ioBroker Alexa2",
                "os_version": "11.4.1",
                "device_serial": deviceSerial,
                "device_model": "iPhone",
                "app_name": "ioBroker Alexa2",
                "software_version": "1"
            },
            "auth_data": {
                "access_token": loginData.accessToken
            },
            "user_context_map": {
                "frc": cookies.frc
            },
            "requested_token_type": [
                "bearer",
                "mac_dms",
                "website_cookies"
            ]
        };
        for (let key in cookies) {
            if (!cookies.hasOwnProperty(key)) continue;
            registerData.cookies.website_cookies.push({
                "Value": cookies[key],
                "Name": key
            });
        }

        let options = {
            host: 'api.amazon.com',
            path: '/auth/register',
            method: 'POST',
            headers: {
                'User-Agent': 'AmazonWebView/Amazon Alexa/2.2.223830.0/iOS/11.4.1/iPhone',
                'Accept-Language': _options.acceptLanguage,
                'Accept-Charset': 'utf-8',
                'Connection': 'keep-alive',
                'Content-Type': 'application/json',
                'Cookie': loginData.loginCookie,
                'Accept': '*/*',
                'x-amzn-identity-auth-domain': 'api.amazon.com'
            },
            body: JSON.stringify(registerData)
        };
        _options.logger && _options.logger('Alexa-Cookie: Register App');
        _options.logger && _options.logger(JSON.stringify(options));
        request(options, (error, response, body) => {
            if (error) {
                callback && callback(error, null);
                return;
            }
            try {
                if (typeof body !== 'object') body = JSON.parse(body);
            } catch (err) {
                _options.logger && _options.logger('Register App Response: ' + JSON.stringify(body));
                callback && callback(err, null);
                return;
            }
            _options.logger && _options.logger('Register App Response: ' + JSON.stringify(body));

            if (!body.response || !body.response.success || !body.response.success.tokens || !body.response.success.tokens.bearer) {
                callback && callback(new Error('No tokens in Register response'), null);
                return;
            }
            Cookie = addCookies(Cookie, response.headers);
            loginData.refreshToken = body.response.success.tokens.bearer.refresh_token;
            loginData.tokenDate = Date.now();


            /*
                Get Amazon Marketplace Country
            */

            let options = {
                host: 'alexa.amazon.com',
                path: '/api/users/me?platform=ios&version=2.2.223830.0',
                method: 'GET',
                headers: {
                    'User-Agent': 'AmazonWebView/Amazon Alexa/2.2.223830.0/iOS/11.4.1/iPhone',
                    'Accept-Language': _options.acceptLanguage,
                    'Accept-Charset': 'utf-8',
                    'Connection': 'keep-alive',
                    'Accept': 'application/json',
                    'Cookie': Cookie
                }
            };
            _options.logger && _options.logger('Alexa-Cookie: Get User data');
            _options.logger && _options.logger(JSON.stringify(options));
            request(options, (error, response, body) => {
                if (!error) {
                    try {
                        if (typeof body !== 'object') body = JSON.parse(body);
                    } catch (err) {
                        _options.logger && _options.logger('Get User data Response: ' + JSON.stringify(body));
                        callback && callback(err, null);
                        return;
                    }
                    _options.logger && _options.logger('Get User data Response: ' + JSON.stringify(body));

                    Cookie = addCookies(Cookie, response.headers);

                    if (body.marketPlaceDomainName) {
                        const pos = body.marketPlaceDomainName.indexOf('.');
                        if (pos !== -1) _options.amazonPage = body.marketPlaceDomainName.substr(pos + 1);
                    }
                    loginData.amazonPage = _options.amazonPage;
                } else if (error && !_options.amazonPage) {
                    callback && callback(error, null);
                    return;
                } else if (error && !_options.formerRegistrationData.amazonPage && _options.amazonPage) {
                    _options.logger && _options.logger('Continue with externally set amazonPage: ' + _options.amazonPage);
                } else if (error) {
                    _options.logger && _options.logger('Ignore error while getting user data and amazonPage because previously set amazonPage is available');
                }

                loginData.loginCookie = Cookie;

                getLocalCookies(loginData.amazonPage, loginData.refreshToken, (err, localCookie) => {
                    if (err) {
                        callback && callback(err, null);
                    }

                    loginData.localCookie = localCookie;
                    getCSRFFromCookies(loginData.localCookie, _options, (err, resData) => {
                        if (err) {
                            callback && callback(new Error('Error getting csrf for ' + loginData.amazonPage), null);
                            return;
                        }
                        loginData.localCookie = resData.cookie;
                        loginData.csrf = resData.csrf;
                        delete loginData.accessToken;
                        _options.logger && _options.logger('Final Registraton Result: ' + JSON.stringify(loginData));
                        callback && callback(null, loginData);
                    });
                });
            });
        });
    };

    const getLocalCookies = (amazonPage, refreshToken, callback) => {
        Cookie = ''; // Reset because we are switching domains
        /*
            Token Exchange to Amazon Country Page
        */

        const exchangeParams = {
            'di.os.name': 'iOS',
            'app_version': '2.2.223830.0',
            'domain': '.' + amazonPage,
            'source_token': refreshToken,
            'requested_token_type': 'auth_cookies',
            'source_token_type': 'refresh_token',
            'di.hw.version': 'iPhone',
            'di.sdk.version': '6.10.0',
            'cookies': Buffer.from('{„cookies“:{".' + amazonPage + '":[]}}').toString('base64'),
            'app_name': 'Amazon Alexa',
            'di.os.version': '11.4.1'
        };
        let options = {
            host: 'www.' + amazonPage,
            path: '/ap/exchangetoken',
            method: 'POST',
            headers: {
                'User-Agent': 'AmazonWebView/Amazon Alexa/2.2.223830.0/iOS/11.4.1/iPhone',
                'Accept-Language': _options.acceptLanguage,
                'Accept-Charset': 'utf-8',
                'Connection': 'keep-alive',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': '*/*'
            },
            body: querystring.stringify(exchangeParams, null, null, {
                encodeURIComponent: encodeURIComponent
            })
        };
        _options.logger && _options.logger('Alexa-Cookie: Exchange tokens for ' + amazonPage);
        _options.logger && _options.logger(JSON.stringify(options));

        request(options, (error, response, body) => {
            if (error) {
                callback && callback(error, null);
                return;
            }
            try {
                if (typeof body !== 'object') body = JSON.parse(body);
            } catch (err) {
                _options.logger && _options.logger('Exchange Token Response: ' + JSON.stringify(body));
                callback && callback(err, null);
                return;
            }
            _options.logger && _options.logger('Exchange Token Response: ' + JSON.stringify(body));

            if (!body.response || !body.response.tokens || !body.response.tokens.cookies) {
                callback && callback(new Error('No cookies in Exchange response'), null);
                return;
            }
            if (!body.response.tokens.cookies['.' + amazonPage]) {
                callback && callback(new Error('No cookies for ' + amazonPage + ' in Exchange response'), null);
                return;
            }

            Cookie = addCookies(Cookie, response.headers);
            const cookies = cookieTools.parse(Cookie);
            body.response.tokens.cookies['.' + amazonPage].forEach((cookie) => {
                if (cookies[cookie.Name] && cookies[cookie.Name] !== cookie.Value) {
                    _options.logger && _options.logger('Alexa-Cookie: Update Cookie ' + cookie.Name + ' = ' + cookie.Value);
                } else if (!cookies[cookie.Name]) {
                    _options.logger && _options.logger('Alexa-Cookie: Add Cookie ' + cookie.Name + ' = ' + cookie.Value);
                }
                cookies[cookie.Name] = cookie.Value;

            });
            let localCookie = '';
            for (let name in cookies) {
                if (!cookies.hasOwnProperty(name)) continue;
                localCookie += name + '=' + cookies[name] + '; ';
            }
            localCookie = localCookie.replace(/[; ]*$/, '');

            callback && callback(null, localCookie);
        });
    };


    // it seems that the following three functions comprise the entirety of the public interface (at least 
    // these are the only three functions that gabriele's AlexaCookie.js invokes directly. -Neil)

    // this.generateAlexaCookie = (email, password, __options, callback) => {
    this.generateAlexaCookie =    (arg0,  arg1,     arg2,      arg3    ) => {
        var email, password, __options, callback;
        
        //to beign with, we assume that the caller put the email in arg0, the password in arg1, the __options in arg2, and the callback in arg3
        if (arg0 !== undefined && typeof arg0 !== 'string') {  //if the user put something in the arg0 slot, but that thing is not a string
            //then the caller must not have put the email in the first slot, and furthermore, the caller must not have specified an email at all
            email = null; 
            
            // we will shift the arguments in their slots so as to allow our original assumption to still be valid:
            //right-shift the argumnets:
            arg3 = arg2;
            arg2 = arg1;
            arg1 = arg0;
        }
        if (arg1 !== undefined && typeof arg1 !== 'string') { 
            //then the caller must not have specified a password
            password = null;
            
            // we will shift the arguments in their slots so as to allow our original assumption to still be valid:
            arg3 = arg2;
            arg2 = arg1;
        }
        if (typeof arg2 === 'function') {
            //in this case the caller must not have specied options
            __options = {};
            
            //shift our arguments in the slots so as to allow our original assumption to still be valid:
            arg3 = arg2;
        }
        callback = arg3;
        //HOW CONTORTED! - Neil
        _options == __options;


        if (!email || !password) {
            __options.proxyOnly = true;
        }

        initConfig();

        if (!_options.proxyOnly) {
            // get first cookie and write redirection target into referer
            let options = {
                host: 'alexa.' + _options.amazonPage,
                path: '',
                method: 'GET',
                headers: {
                    'DNT': '1',
                    'Upgrade-Insecure-Requests': '1',
                    'User-Agent': _options.userAgent,
                    'Accept-Language': _options.acceptLanguage,
                    'Connection': 'keep-alive',
                    'Accept': '*/*'
                }
            };
            _options.logger && _options.logger('Alexa-Cookie: Step 1: get first cookie and authentication redirect');
            request(options, (error, response, body, info) => {
                if (error) {
                    callback && callback(error, null);
                    return;
                }

                let lastRequestOptions = info.requests[info.requests.length - 1].options;
                // login empty to generate session
                Cookie = addCookies(Cookie, response.headers);
                let options = {
                    host: 'www.' + _options.amazonPage,
                    path: '/ap/signin',
                    method: 'POST',
                    headers: {
                        'DNT': '1',
                        'Upgrade-Insecure-Requests': '1',
                        'User-Agent': _options.userAgent,
                        'Accept-Language': _options.acceptLanguage,
                        'Connection': 'keep-alive',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': 'https://' + lastRequestOptions.host + lastRequestOptions.path,
                        'Cookie': Cookie,
                        'Accept': '*/*'
                    },
                    gzip: true,
                    body: querystring.stringify(getFields(body))
                };
                _options.logger && _options.logger('Alexa-Cookie: Step 2: login empty to generate session');
                request(options, (error, response, body) => {
                    if (error) {
                        callback && callback(error, null);
                        return;
                    }

                    // login with filled out form
                    //  !!! referer now contains session in URL
                    options.host = 'www.' + _options.amazonPage;
                    options.path = '/ap/signin';
                    options.method = 'POST';
                    options.headers.Cookie = Cookie = addCookies(Cookie, response.headers);
                    let ar = options.headers.Cookie.match(/session-id=([^;]+)/);
                    options.headers.Referer = `https://www.${_options.amazonPage}/ap/signin/${ar[1]}`;
                    options.body = getFields(body);
                    options.body.email = email || '';
                    options.body.password = password || '';
                    options.body = querystring.stringify(options.body, null, null, {encodeURIComponent: encodeURIComponent});

                    _options.logger && _options.logger('Alexa-Cookie: Step 3: login with filled form, referer contains session id');
                    request(options, (error, response, body, info) => {
                        if (error) {
                            callback && callback(error, null);
                            return;
                        }

                        let lastRequestOptions = info.requests[info.requests.length - 1].options;

                        // check whether the login has been successful or exit otherwise
                        if (!lastRequestOptions.host.startsWith('alexa') || !lastRequestOptions.path.endsWith('.html')) {
                            let errMessage = 'Login unsuccessfull. Please check credentials.';
                            const amazonMessage = body.match(/auth-warning-message-box[\S\s]*"a-alert-heading">([^<]*)[\S\s]*<li><[^>]*>\s*([^<\n]*)\s*</);
                            if (amazonMessage && amazonMessage[1] && amazonMessage[2]) {
                                errMessage = `Amazon-Login-Error: ${amazonMessage[1]}: ${amazonMessage[2]}`;
                            }
                            if (_options.setupProxy) {
                                if (proxyServer) {
                                    errMessage += ` You can try to get the cookie manually by opening http://${_options.proxyOwnIp}:${_options.proxyPort}/ with your browser.`;
                                } else {
                                    amazonProxy.initAmazonProxy(_options, prepareResult,
                                        (server) => {
                                            if (!server) {
                                                return callback && callback(new Error('Proxy could not be initialized'), null);
                                            }
                                            proxyServer = server;
                                            if (!_options.proxyPort || _options.proxyPort === 0) {
                                                _options.proxyPort = proxyServer.address().port;
                                            }
                                            errMessage += ` You can try to get the cookie manually by opening http://${_options.proxyOwnIp}:${_options.proxyPort}/ with your browser.`;
                                            callback && callback(new Error(errMessage), null);
                                        }
                                    );
                                    return;
                                }
                            }
                            callback && callback(new Error(errMessage), null);
                            return;
                        }

                        return getCSRFFromCookies(Cookie, _options, callback);
                    });
                });
            });
        } else {
            amazonProxy.initAmazonProxy(_options, prepareResult, (server) => {
                proxyServer = server;
                if (!_options.proxyPort || _options.proxyPort === 0) {
                    _options.proxyPort = proxyServer.address().port;
                }
                const errMessage = `You can try to get the cookie manually by opening http://${_options.proxyOwnIp}:${_options.proxyPort}/ with your browser.`;
                callback && callback(new Error(errMessage), null);
            });
        }

        function prepareResult(err, data) {
            if (err || !data.accessToken) {
                callback && callback(err, data.loginCookie);
                return;
            }
            handleTokenRegistration(_options, data, callback);
        }
    };


    this.refreshAlexaCookie = (__options, callback) => {
        if (!__options || !__options.formerRegistrationData || !__options.formerRegistrationData.loginCookie || !__options.formerRegistrationData.refreshToken) {
            callback && callback(new Error('No former registration data provided for Cookie Refresh'), null);
            return;
        }

        if (typeof __options === 'function') {
            callback = __options;
            __options = {};
        }

        _options = __options;

        __options.proxyOnly = true;

        initConfig();

        const refreshData = {
            "app_name": "ioBroker Alexa2",
            "app_version": "2.2.223830.0",
            "di.sdk.version": "6.10.0",
            "source_token": _options.formerRegistrationData.refreshToken,
            "package_name": "com.amazon.echo",
            "di.hw.version": "iPhone",
            "platform": "iOS",
            "requested_token_type": "access_token",
            "source_token_type": "refresh_token",
            "di.os.name": "iOS",
            "di.os.version": "11.4.1",
            "current_version": "6.10.0"
        };

        let options = {
            host: 'api.amazon.com',
            path: '/auth/token',
            method: 'POST',
            headers: {
                'User-Agent': 'AmazonWebView/Amazon Alexa/2.2.223830.0/iOS/11.4.1/iPhone',
                'Accept-Language': _options.acceptLanguage,
                'Accept-Charset': 'utf-8',
                'Connection': 'keep-alive',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': _options.formerRegistrationData.loginCookie,
                'Accept': 'application/json',
                'x-amzn-identity-auth-domain': 'api.amazon.com'
            },
            body: querystring.stringify(refreshData)
        };
        Cookie = _options.formerRegistrationData.loginCookie;
        _options.logger && _options.logger('Alexa-Cookie: Refresh Token');
        _options.logger && _options.logger(JSON.stringify(options));
        request(options, (error, response, body) => {
            if (error) {
                callback && callback(error, null);
                return;
            }
            try {
                if (typeof body !== 'object') body = JSON.parse(body);
            } catch (err) {
                _options.logger && _options.logger('Refresh Token Response: ' + JSON.stringify(body));
                callback && callback(err, null);
                return;
            }
            _options.logger && _options.logger('Refresh Token Response: ' + JSON.stringify(body));

            _options.formerRegistrationData.loginCookie = addCookies(_options.formerRegistrationData.loginCookie, response.headers);

            if (!body.access_token) {
                callback && callback(new Error('No new access token in Refresh Token response'), null);
                return;
            }
            _options.formerRegistrationData.loginCookie = addCookies(Cookie, response.headers);
            _options.formerRegistrationData.accessToken = body.access_token;

            getLocalCookies('amazon.com', _options.formerRegistrationData.refreshToken, (err, comCookie) => {
                if (err) {
                    callback && callback(err, null);
                }

                // Restore frc and map-md
                const initCookies = cookieTools.parse(_options.formerRegistrationData.loginCookie);
                let newCookie = 'frc=' + initCookies.frc + '; ';
                newCookie += 'map-md=' + initCookies['map-md'] + '; ';
                newCookie += comCookie;

                _options.formerRegistrationData.loginCookie = newCookie;
                handleTokenRegistration(_options, _options.formerRegistrationData, callback);
            });
        });
    };

    this.stopProxyServer = (callback) => {
        if (proxyServer) {
            proxyServer.close(() => {
                callback && callback();
            });
        }
        proxyServer = null;
    };
}

module.exports = AlexaCookie();
