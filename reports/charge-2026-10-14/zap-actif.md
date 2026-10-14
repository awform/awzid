# Awzid demo - scan actif

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 2 |
| Medium | 1 |
| Low | 1 |
| Informational | 3 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Medium | Exceeded Low |  | Percentage of memory used | 80    |
| Low | Warning |  | ZAP errors logged - see the zap.log file for details | 1    |
| Low | Warning |  | ZAP warnings logged - see the zap.log file for details | 27    |
| Info | Informational | http://127.0.0.1 | Percentage of responses with status code 2xx | 97 % |
| Info | Informational | http://127.0.0.1 | Percentage of responses with status code 4xx | 2 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type application/json | 42 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type application/manifest+json | 1 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type image/png | 1 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type image/svg+xml | 1 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type text/css | 17 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type text/html | 2 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type text/javascript | 35 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with content type text/plain | 2 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with method GET | 95 % |
| Info | Informational | http://127.0.0.1 | Percentage of endpoints with method POST | 3 % |
| Info | Informational | http://127.0.0.1 | Count of total endpoints | 344    |
| Info | Informational | http://127.0.0.1 | Percentage of slow responses | 1 % |







## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| PII Disclosure | High | 3 |
| Path Traversal | High | 5 |
| Content Security Policy (CSP) Header Not Set | Medium | 1 |
| Timestamp Disclosure - Unix | Low | Systemic |
| Authentication Request Identified | Informational | 1 |
| Modern Web Application | Informational | Systemic |
| User Agent Fuzzer | Informational | Systemic |




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
* URL: http://127.0.0.1/api/v1/lecons-audio/niveaux/re4
  * Node Name: `http://127.0.0.1/api/v1/lecons-audio/niveaux/re4`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `2606081931577690`
  * Other Info: `Credit Card Type detected: Mastercard
Bank Identification Number: 260608
Brand: MASTERCARD
Category: 
Issuer: `
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


Instances: 3

### Solution

Check the response for the potential presence of personally identifiable information (PII), ensure nothing sensitive is leaked by the application.

### Reference



#### CWE Id: [ 359 ](https://cwe.mitre.org/data/definitions/359.html)


#### WASC Id: 13

#### Source ID: 3

### [ Path Traversal ](https://www.zaproxy.org/docs/alerts/6/)



##### High (Low)

### Description

The Path Traversal attack technique allows an attacker access to files, directories, and commands that potentially reside outside the web document root directory. An attacker may manipulate a URL in such a way that the web site will execute or reveal the contents of arbitrary files anywhere on the web server. Any device that exposes an HTTP-based interface is potentially vulnerable to Path Traversal.

Most web sites restrict user access to a specific portion of the file-system, typically called the "web document root" or "CGI root" directory. These directories contain the files intended for user access and the executable necessary to drive web application functionality. To access files or execute commands anywhere on the file-system, Path Traversal attacks will utilize the ability of special-characters sequences.

The most basic Path Traversal attack uses the "../" special-character sequence to alter the resource location requested in the URL. Although most popular web servers will prevent this technique from escaping the web document root, alternate encodings of the "../" sequence may help bypass the security filters. These method variations include valid and invalid Unicode-encoding ("..%u2216" or "..%c0%af") of the forward slash character, backslash characters ("..\") on Windows-based servers, URL encoded characters "%2e%2e%2f"), and double URL encoding ("..%255c") of the backslash character.

Even if the web server properly restricts Path Traversal attempts in the URL path, a web application itself may still be vulnerable due to improper handling of user-supplied input. This is a common problem of web applications that use template mechanisms or load static text from files. In variations of the attack, the original URL parameter value is substituted with the file name of one of the web application's dynamic scripts. Consequently, the results can reveal source code because the file is interpreted as text instead of an executable script. These techniques often employ additional special characters such as the dot (".") to reveal the listing of the current working directory, or "%00" NULL characters in order to bypass rudimentary file extension checks.

* URL: http://127.0.0.1/api/v1/attempts
  * Node Name: `http://127.0.0.1/api/v1/attempts ()({events:[{id,profileId,unitId,eventType,response:{item,ok,day},deviceAt}]})`
  * Method: `POST`
  * Parameter: `eventType`
  * Attack: `attempts`
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/api/v1/attempts
  * Node Name: `http://127.0.0.1/api/v1/attempts ()({events:[{profileId,unitId,eventType,response:{checked,total},edition,id,deviceAt,v}..]})`
  * Method: `POST`
  * Parameter: `eventType`
  * Attack: `attempts`
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/api/v1/attempts
  * Node Name: `http://127.0.0.1/api/v1/attempts ()({events:[{profileId,unitId,eventType,response:{checked,total},edition,id,deviceAt,v}]})`
  * Method: `POST`
  * Parameter: `eventType`
  * Attack: `attempts`
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/api/v1/attempts
  * Node Name: `http://127.0.0.1/api/v1/attempts ()({events:[{profileId,unitId,eventType,response:{item,ok,day,details:{fsrs:{stabilite,difficulte},echeance,lecon}},id,deviceAt,v}]})`
  * Method: `POST`
  * Parameter: `eventType`
  * Attack: `attempts`
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/api/v1/attempts
  * Node Name: `http://127.0.0.1/api/v1/attempts ()({events:[{profileId,unitId,eventType,response:{item,ok,day},id,deviceAt,v}]})`
  * Method: `POST`
  * Parameter: `eventType`
  * Attack: `attempts`
  * Evidence: ``
  * Other Info: ``


Instances: 5

### Solution

Assume all input is malicious. Use an "accept known good" input validation strategy, i.e., use an allow list of acceptable inputs that strictly conform to specifications. Reject any input that does not strictly conform to specifications, or transform it into something that does. Do not rely exclusively on looking for malicious or malformed inputs (i.e., do not rely on a deny list). However, deny lists can be useful for detecting potential attacks or determining which inputs are so malformed that they should be rejected outright.

When performing input validation, consider all potentially relevant properties, including length, type of input, the full range of acceptable values, missing or extra inputs, syntax, consistency across related fields, and conformance to business rules. As an example of business rule logic, "boat" may be syntactically valid because it only contains alphanumeric characters, but it is not valid if you are expecting colors such as "red" or "blue."

For filenames, use stringent allow lists that limit the character set to be used. If feasible, only allow a single "." character in the filename to avoid weaknesses, and exclude directory separators such as "/". Use an allow list of allowable file extensions.

Warning: if you attempt to cleanse your data, then do so that the end result is not in the form that can be dangerous. A sanitizing mechanism can remove characters such as '.' and ';' which may be required for some exploits. An attacker can try to fool the sanitizing mechanism into "cleaning" data into a dangerous form. Suppose the attacker injects a '.' inside a filename (e.g. "sensi.tiveFile") and the sanitizing mechanism removes the character resulting in the valid filename, "sensitiveFile". If the input data are now assumed to be safe, then the file may be compromised. 

Inputs should be decoded and canonicalized to the application's current internal representation before being validated. Make sure that your application does not decode the same input twice. Such errors could be used to bypass allow list schemes by introducing dangerous inputs after they have been checked.

Use a built-in path canonicalization function (such as realpath() in C) that produces the canonical version of the pathname, which effectively removes ".." sequences and symbolic links.

Run your code using the lowest privileges that are required to accomplish the necessary tasks. If possible, create isolated accounts with limited privileges that are only used for a single task. That way, a successful attack will not immediately give the attacker access to the rest of the software or its environment. For example, database applications rarely need to run as the database administrator, especially in day-to-day operations.

When the set of acceptable objects, such as filenames or URLs, is limited or known, create a mapping from a set of fixed input values (such as numeric IDs) to the actual filenames or URLs, and reject all other inputs.

Run your code in a "jail" or similar sandbox environment that enforces strict boundaries between the process and the operating system. This may effectively restrict which files can be accessed in a particular directory or which commands can be executed by your software.

OS-level examples include the Unix chroot jail, AppArmor, and SELinux. In general, managed code may provide some protection. For example, java.io.FilePermission in the Java SecurityManager allows you to specify restrictions on file operations.

This may not be a feasible solution, and it only limits the impact to the operating system; the rest of your application may still be subject to compromise.


### Reference


* [ https://owasp.org/www-community/attacks/Path_Traversal ](https://owasp.org/www-community/attacks/Path_Traversal)
* [ https://cwe.mitre.org/data/definitions/22.html ](https://cwe.mitre.org/data/definitions/22.html)


#### CWE Id: [ 22 ](https://cwe.mitre.org/data/definitions/22.html)


#### WASC Id: 33

#### Source ID: 1

### [ Content Security Policy (CSP) Header Not Set ](https://www.zaproxy.org/docs/alerts/10038/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks, including Cross Site Scripting (XSS) and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: http://127.0.0.1/api
  * Node Name: `http://127.0.0.1/api`
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

### [ Authentication Request Identified ](https://www.zaproxy.org/docs/alerts/10111/)



##### Informational (High)

### Description

The given request has been identified as an authentication request. The 'Other Info' field contains a set of key=value lines which identify any relevant fields. If the request is in a context which has an Authentication Method set to "Auto-Detect" then this rule will change the authentication to match the request identified.

* URL: http://127.0.0.1/api/v1/auth/login
  * Node Name: `http://127.0.0.1/api/v1/auth/login ()({email,password})`
  * Method: `POST`
  * Parameter: `email`
  * Attack: ``
  * Evidence: `password`
  * Other Info: `userParam=email
userValue=charge-47@demo.awform.test
passwordParam=password`


Instances: 1

### Solution

This is an informational alert rather than a vulnerability and so there is nothing to fix.

### Reference


* [ https://www.zaproxy.org/docs/desktop/addons/authentication-helper/auth-req-id/ ](https://www.zaproxy.org/docs/desktop/addons/authentication-helper/auth-req-id/)



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
  * Evidence: `<script nonce="1AnQOEwYq+gneGoUfuH4KA==">
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
* URL: http://127.0.0.1
  * Node Name: `http://127.0.0.1`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script nonce="s/hn3FxGyFQkW/irklUVGw==">
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
  * Evidence: `<script nonce="LPk36ACHJBV7q7RLmoqmfw==">
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
  * Evidence: `<script nonce="ancfP3P1BevK3Dx8+LUbrA==">
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
  * Evidence: `<script nonce="ukc0u0Y0OLuJI1f3a5ySDA==">
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

### [ User Agent Fuzzer ](https://www.zaproxy.org/docs/alerts/10104/)



##### Informational (Medium)

### Description

Check for differences in response based on fuzzed User Agent (eg. mobile sites, access as a Search Engine Crawler). Compares the response statuscode and the hashcode of the response body with the original response.

* URL: http://127.0.0.1/
  * Node Name: `http://127.0.0.1/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)`
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/
  * Node Name: `http://127.0.0.1/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)`
  * Evidence: ``
  * Other Info: ``
* URL: http://127.0.0.1/
  * Node Name: `http://127.0.0.1/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``

Instances: Systemic


### Solution



### Reference


* [ https://owasp.org/www-project-web-security-testing-guide/ ](https://owasp.org/www-project-web-security-testing-guide/)



#### Source ID: 1


