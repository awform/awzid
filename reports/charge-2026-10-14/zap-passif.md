# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 1 |
| Medium | 1 |
| Low | 2 |
| Informational | 3 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Low | Warning |  | ZAP warnings logged - see the zap.log file for details | 32    |
| Info | Informational | http://127.0.0.1 | Percentage of responses with status code 2xx | 87 % |
| Info | Informational | http://127.0.0.1 | Percentage of responses with status code 3xx | 2 % |
| Info | Exceeded Low | http://127.0.0.1 | Percentage of responses with status code 4xx | 10 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type application/json | 25 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type application/manifest+json | 4 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type font/woff2 | 3 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type image/png | 2 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type image/svg+xml | 1 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type text/css | 20 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type text/html | 2 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type text/javascript | 42 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type text/plain | 1 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with method GET | 99 % |
| Info | Informational | http://127.0.0.1 | Count of total endpoints | 282    |
| Info | Informational | http://127.0.0.1 | Percentage of slow responses | 1 % |







## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| PII Disclosure | High | 3 |
| Content Security Policy (CSP) Header Not Set | Medium | 1 |
| Cross-Origin-Resource-Policy Header Missing or Invalid | Low | Systemic |
| Timestamp Disclosure - Unix | Low | Systemic |
| Information Disclosure - Information in Browser localStorage | Informational | 6 |
| Modern Web Application | Informational | Systemic |
| Storable and Cacheable Content | Informational | Systemic |




## Alert Detail



### [ PII Disclosure ](https://www.zaproxy.org/docs/alerts/10062/)



##### High (High)

### Description

The response contains Personally Identifiable Information, such as CC number, SSN and similar sensitive data.

* URL: http://127.0.0.1/api/v1/packs
  * Node Name: `http://127.0.0.1/api/v1/packs`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `579858948056074`
  * Other Info: `Credit Card Type detected: Maestro`
* URL: http://127.0.0.1/api/v1/packs
  * Node Name: `http://127.0.0.1/api/v1/packs`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `2289582696264675`
  * Other Info: `Credit Card Type detected: Mastercard
Bank Identification Number: 228958
Brand: MASTERCARD
Category: 
Issuer: `
* URL: http://127.0.0.1/api/v1/packs/ad9
  * Node Name: `http://127.0.0.1/api/v1/packs/ad9`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `2289582696264675`
  * Other Info: `Credit Card Type detected: Mastercard
Bank Identification Number: 228958
Brand: MASTERCARD
Category: 
Issuer: `


Instances: 3

### Solution

Check the response for the potential presence of personally identifiable information (PII), ensure nothing sensitive is leaked by the application.

### Reference



#### CWE Id: [ 359 ](https://cwe.mitre.org/data/definitions/359.html)


#### WASC Id: 13

#### Source ID: 3

### [ Content Security Policy (CSP) Header Not Set ](https://www.zaproxy.org/docs/alerts/10038/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks, including Cross Site Scripting (XSS) and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: http://127.0.0.1/documents/fiche-consentement-ecole.html
  * Node Name: `http://127.0.0.1/documents/fiche-consentement-ecole.html`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 1

### Solution

Ensure that your web server, application server, load balancer, etc. is configured to set the Content-Security-Policy header.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
* [ https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html ](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://w3c.github.io/webappsec-csp/ ](https://w3c.github.io/webappsec-csp/)
* [ https://web.dev/articles/csp ](https://web.dev/articles/csp)
* [ https://caniuse.com/#feat=contentsecuritypolicy ](https://caniuse.com/#feat=contentsecuritypolicy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Cross-Origin-Resource-Policy Header Missing or Invalid ](https://www.zaproxy.org/docs/alerts/90004/)



##### Low (Medium)

### Description

Cross-Origin-Resource-Policy header is an opt-in header designed to counter side-channels attacks like Spectre. Resource should be specifically set as shareable amongst different origins.

* URL: http://127.0.0.1/_app/immutable/assets/0.BIsRSA_x.css
  * Node Name: `http://127.0.0.1/_app/immutable/assets/0.BIsRSA_x.css`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/_app/immutable/assets/AvisDialog.fkwJSoUk.css
  * Node Name: `http://127.0.0.1/_app/immutable/assets/AvisDialog.fkwJSoUk.css`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/_app/immutable/assets/BandeauBeta.CNHfxiDI.css
  * Node Name: `http://127.0.0.1/_app/immutable/assets/BandeauBeta.CNHfxiDI.css`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/_app/immutable/assets/EspaceNiveau.QR3US5Ys.css
  * Node Name: `http://127.0.0.1/_app/immutable/assets/EspaceNiveau.QR3US5Ys.css`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/robots.txt
  * Node Name: `http://127.0.0.1/robots.txt`
  * Method: `GET`
  * Parameter: `Cross-Origin-Resource-Policy`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``

Instances: Systemic


### Solution

Ensure that the application/web server sets the Cross-Origin-Resource-Policy header appropriately, and that it sets the Cross-Origin-Resource-Policy header to 'same-origin' for all web pages.
'same-site' is considered as less secured and should be avoided.
If resources must be shared, set the header to 'cross-origin'.
If possible, ensure that the end user uses a standards-compliant and modern web browser that supports the Cross-Origin-Resource-Policy header (https://caniuse.com/mdn-http_headers_cross-origin-resource-policy).

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 14

#### Source ID: 3

### [ Timestamp Disclosure - Unix ](https://www.zaproxy.org/docs/alerts/10096/)



##### Low (Low)

### Description

A timestamp was disclosed by the application/web server. - Unix

* URL: http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js
  * Node Name: `http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1508970993`
  * Other Info: `1508970993, which evaluates to: 2017-10-25 22:36:33.`
* URL: http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js
  * Node Name: `http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1555081692`
  * Other Info: `1555081692, which evaluates to: 2019-04-12 15:08:12.`
* URL: http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js
  * Node Name: `http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1899447441`
  * Other Info: `1899447441, which evaluates to: 2030-03-11 08:17:21.`
* URL: http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js
  * Node Name: `http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1925078388`
  * Other Info: `1925078388, which evaluates to: 2031-01-01 23:59:48.`
* URL: http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js
  * Node Name: `http://127.0.0.1/_app/immutable/chunks/BYEvA6JU.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1996064986`
  * Other Info: `1996064986, which evaluates to: 2033-04-02 14:29:46.`

Instances: Systemic


### Solution

Manually confirm that the timestamp data is not sensitive, and that the data cannot be aggregated to disclose exploitable patterns.

### Reference


* [ https://cwe.mitre.org/data/definitions/200.html ](https://cwe.mitre.org/data/definitions/200.html)


#### CWE Id: [ 497 ](https://cwe.mitre.org/data/definitions/497.html)


#### WASC Id: 13

#### Source ID: 3

### [ Information Disclosure - Information in Browser localStorage ](https://www.zaproxy.org/docs/alerts/120000/)



##### Informational (High)

### Description

Information was stored in browser localStorage.
This is not unusual or necessarily unsafe - this informational alert has been raised to help you get a better understanding of what this app is doing. For more details see the Client tabs - this information was set directly in the browser and will therefore not necessarily appear in this form in any HTTP(S) messages.

* URL: http://127.0.0.1/
  * Node Name: `http://127.0.0.1/`
  * Method: `GET`
  * Parameter: `awzid.bandeau-beta`
  * Attack: ``
  * Evidence: ``
  * Other Info: `The following data (key=value) was set: awzid.bandeau-beta=1
Note that this alert will only be raised once for each URL + key.`
* URL: http://127.0.0.1/
  * Node Name: `http://127.0.0.1/`
  * Method: `GET`
  * Parameter: `awzid.fonctions`
  * Attack: ``
  * Evidence: ``
  * Other Info: `The following data (key=value) was set: awzid.fonctions={"compte":{"at":1791974243555,"fonctions":{"animations":true,"recitateurs_en_ligne":true,"mushaf_exact":true,"tuteur":true,"vivre_islam":true,"vivre_defi":true,"certificats":true,"mode_serein":true,"avis":true,"conversation":false,"signaler":true,"beta_contenu_differe_visible":true},"canal":"production"}}
Note that this alert will only be raised once for each URL + key.`
* URL: http://127.0.0.1/
  * Node Name: `http://127.0.0.1/`
  * Method: `GET`
  * Parameter: `awzid.mode`
  * Attack: ``
  * Evidence: ``
  * Other Info: `The following data (key=value) was set: awzid.mode=sombre
Note that this alert will only be raised once for each URL + key.`
* URL: http://127.0.0.1/
  * Node Name: `http://127.0.0.1/`
  * Method: `GET`
  * Parameter: `awzid.themes.v2`
  * Attack: ``
  * Evidence: ``
  * Other Info: `The following data (key=value) was set: awzid.themes.v2=1
Note that this alert will only be raised once for each URL + key.`
* URL: http://127.0.0.1/niveaux/ado3
  * Node Name: `http://127.0.0.1/niveaux/ado3`
  * Method: `GET`
  * Parameter: `awzid.fonctions`
  * Attack: ``
  * Evidence: ``
  * Other Info: `The following data (key=value) was set: awzid.fonctions={"compte":{"at":1791974256062,"fonctions":{"animations":true,"recitateurs_en_ligne":true,"mushaf_exact":true,"tuteur":true,"vivre_islam":true,"vivre_defi":true,"certificats":true,"mode_serein":true,"avis":true,"conversation":false,"signaler":true,"beta_contenu_differe_visible":true},"canal":"production"}}
Note that this alert will only be raised once for each URL + key.`
* URL: http://127.0.0.1/niveaux/ado3
  * Node Name: `http://127.0.0.1/niveaux/ado3`
  * Method: `GET`
  * Parameter: `awzid.themes.v2`
  * Attack: ``
  * Evidence: ``
  * Other Info: `The following data (key=value) was set: awzid.themes.v2=1
Note that this alert will only be raised once for each URL + key.`


Instances: 6

### Solution

This is an informational alert and no action is necessary. 

### Reference



#### CWE Id: [ 359 ](https://cwe.mitre.org/data/definitions/359.html)


#### WASC Id: 13

#### Source ID: 3

### [ Modern Web Application ](https://www.zaproxy.org/docs/alerts/10109/)



##### Informational (Medium)

### Description

The application appears to be a modern web application. If you need to explore it automatically then the Client Spider may well be more effective than the standard one.

* URL: http://127.0.0.1
  * Node Name: `http://127.0.0.1`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script nonce="We2Pm1Fh++MwYVtNUOLvIw==">
				{
					__sveltekit_wcsxuf = {
						base: ""
					};

					const element = document.currentScript.parentElement;

					Promise.all([
						import("/_app/immutable/entry/start.-32QjQOu.js"),
						import("/_app/immutable/entry/app.Dmc370uX.js")
					]).then(([kit, app]) => {
						kit.start(app, element);
					});

					if ('serviceWorker' in navigator) {
						const script_url = '/service-worker.js';
						const policy = globalThis?.window?.trustedTypes?.createPolicy(
							'sveltekit-trusted-url',
							{ createScriptURL(url) { return url; } }
						);
						const sanitised = policy?.createScriptURL(script_url) ?? script_url;
						addEventListener('load', function () {
							navigator.serviceWorker.register(sanitised);
						});
					}
				}
			</script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: http://127.0.0.1/
  * Node Name: `http://127.0.0.1/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script nonce="bfCy8/bckYr/btDcvaxF0Q==">
				{
					__sveltekit_wcsxuf = {
						base: ""
					};

					const element = document.currentScript.parentElement;

					Promise.all([
						import("/_app/immutable/entry/start.-32QjQOu.js"),
						import("/_app/immutable/entry/app.Dmc370uX.js")
					]).then(([kit, app]) => {
						kit.start(app, element);
					});

					if ('serviceWorker' in navigator) {
						const script_url = '/service-worker.js';
						const policy = globalThis?.window?.trustedTypes?.createPolicy(
							'sveltekit-trusted-url',
							{ createScriptURL(url) { return url; } }
						);
						const sanitised = policy?.createScriptURL(script_url) ?? script_url;
						addEventListener('load', function () {
							navigator.serviceWorker.register(sanitised);
						});
					}
				}
			</script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: http://127.0.0.1/
  * Node Name: `http://127.0.0.1/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script nonce="r8UibyMG+m3+JgkHCY/4uA==">
				{
					__sveltekit_wcsxuf = {
						base: ""
					};

					const element = document.currentScript.parentElement;

					Promise.all([
						import("/_app/immutable/entry/start.-32QjQOu.js"),
						import("/_app/immutable/entry/app.Dmc370uX.js")
					]).then(([kit, app]) => {
						kit.start(app, element);
					});

					if ('serviceWorker' in navigator) {
						const script_url = '/service-worker.js';
						const policy = globalThis?.window?.trustedTypes?.createPolicy(
							'sveltekit-trusted-url',
							{ createScriptURL(url) { return url; } }
						);
						const sanitised = policy?.createScriptURL(script_url) ?? script_url;
						addEventListener('load', function () {
							navigator.serviceWorker.register(sanitised);
						});
					}
				}
			</script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`

Instances: Systemic


### Solution

This is an informational alert and so no changes are required.

### Reference




#### Source ID: 3

### [ Storable and Cacheable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are storable by caching components such as proxy servers, and may be retrieved directly from the cache, rather than from the origin server by the caching servers, in response to similar requests from other users. If the response data is sensitive, personal or user-specific, this may result in sensitive information being leaked. In some cases, this may even result in a user gaining complete control of the session of another user, depending on the configuration of the caching components in use in their environment. This is primarily an issue where "shared" caching servers such as "proxy" caches are configured on the local network. This configuration is typically found in corporate or educational environments, for instance.

* URL: http://127.0.0.1/_app/immutable/assets/0.BIsRSA_x.css
  * Node Name: `http://127.0.0.1/_app/immutable/assets/0.BIsRSA_x.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: http://127.0.0.1/_app/immutable/assets/BandeauBeta.CNHfxiDI.css
  * Node Name: `http://127.0.0.1/_app/immutable/assets/BandeauBeta.CNHfxiDI.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: http://127.0.0.1/_app/immutable/assets/EspaceNiveau.QR3US5Ys.css
  * Node Name: `http://127.0.0.1/_app/immutable/assets/EspaceNiveau.QR3US5Ys.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: http://127.0.0.1/robots.txt
  * Node Name: `http://127.0.0.1/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `In the absence of an explicitly specified caching lifetime directive in the response, a liberal lifetime heuristic of 1 year was assumed. This is permitted by rfc7234.`
* URL: http://127.0.0.1/sitemap.xml
  * Node Name: `http://127.0.0.1/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `In the absence of an explicitly specified caching lifetime directive in the response, a liberal lifetime heuristic of 1 year was assumed. This is permitted by rfc7234.`

Instances: Systemic


### Solution

Validate that the response does not contain sensitive, personal or user-specific information. If it does, consider the use of the following HTTP response headers, to limit, or prevent the content being stored and retrieved from the cache by another user:
Cache-Control: no-cache, no-store, must-revalidate, private
Pragma: no-cache
Expires: 0
This configuration directs both HTTP 1.0 and HTTP 1.1 compliant caching servers to not store the response, and to not retrieve the response (without validation) from the cache, in response to a similar request.

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3


