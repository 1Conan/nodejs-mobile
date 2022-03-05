# Security release process

The security release process covers the steps required to plan/implement a
security release. This document is copied into the description of the Next
Security Release and used to track progress on the release. It contains _**TEXT
LIKE THIS**_ which will be replaced during the release process with the
information described.

## Planning

* [ ] Open an [issue](https://github.com/nodejs-private/node-private) titled
  `Next Security Release`, and put this checklist in the description.

* [ ] Get agreement on the list of vulnerabilities to be addressed:
  * _**H1 REPORT LINK**_: _**DESCRIPTION**_ (_**CVE or H1 CVE request link**_)
    * v10.x, v12.x: _**LINK to PR URL**_
  * ...

* [ ] PR release announcements in [private](https://github.com/nodejs-private/nodejs.org-private):
  * (Use previous PRs as templates. Don't forget to update the site banner and
    the date in the slug so that it will move to the top of the blog list.)
  * [ ] pre-release: _**LINK TO PR**_
  * [ ] post-release: _**LINK TO PR**_
    * List vulnerabilities in order of descending severity
    * Ask the HackerOne reporter if they would like to be credited on the
      security release blog page:
      ```text
      Thank you to <name> for reporting this vulnerability.
      ```

* [ ] Get agreement on the planned date for the release: _**RELEASE DATE**_

* [ ] Get release team volunteers for all affected lines:
  * v12.x: _**NAME of RELEASER(S)**_
  * ... other lines, if multiple releasers

## Announcement (one week in advance of the planned release)

* [ ] Verify that GitHub Actions are working as normal: <https://www.githubstatus.com/>.

* [ ] Check that all vulnerabilities are ready for release integration:
  * PRs against all affected release lines or cherry-pick clean
  * Approved
  * Pass `make test`
  * Have CVEs
    * Make sure that dependent libraries have CVEs for their issues. We should
      only create CVEs for vulnerabilities in Node.js itself. This is to avoid
      having duplicate CVEs for the same vulnerability.
  * Described in the pre/post announcements

* [ ] Pre-release announcement to nodejs.org blog: _**LINK TO BLOG**_
  (Re-PR the pre-approved branch from nodejs-private/nodejs.org-private to
  nodejs/nodejs.org)

* [ ] Pre-release announcement [email][]: _**LINK TO EMAIL**_
  * Subject: `Node.js security updates for all active release lines, Month Year`
  * Body:
  ```text
  The Node.js project will release new versions of all supported release lines on or shortly after Day of week, Month Day of Month, Year
  For more information see: https://nodejs.org/en/blog/vulnerability/month-year-security-releases/
  ```
  (Get access from existing manager: Matteo Collina, Rodd Vagg, Michael Dawson,
  Bryan English, Vladimir de Turckheim)

* [ ] CC `oss-security@lists.openwall.com` on pre-release

The google groups UI does not support adding a CC, until we figure
out a better way, forward the email you receive to
`oss-security@lists.openwall.com` as a CC.

* [ ] Create a new issue in [nodejs/tweet][]
  ```text
  Security release pre-alert:

  We will release new versions of <add versions> release lines on or shortly
  after Day Month Date, Year in order to address:

  - # high severity issues
  - # moderate severity issues

  https://nodejs.org/en/blog/vulnerability/month-year-security-releases/
  ```

* [ ] Request releaser(s) to start integrating the PRs to be released.

* [ ] Notify [docker-node][] of upcoming security release date: _**LINK**_
  ```text
  Heads up of Node.js security releases Day Month Year

  As per the Node.js security release process this is the FYI that there is going to be a security release Day Month Year
  ```

* [ ] Notify build-wg of upcoming security release date by opening an issue
  in [nodejs/build][] to request WG members are available to fix any CI issues.
  ```text
  Heads up of Node.js security releases Day Month Year

  As per security release process this is a heads up that there will be security releases Day Month Year and we'll need people from build to lock/unlock ci and to support and build issues we see.
  ```

## Release day

* [ ] [Lock CI](https://github.com/nodejs/build/blob/HEAD/doc/jenkins-guide.md#before-the-release)

* [ ] The releaser(s) run the release process to completion.

* [ ] [Unlock CI](https://github.com/nodejs/build/blob/HEAD/doc/jenkins-guide.md#after-the-release)

* [ ] Post-release announcement to Nodejs.org blog: _**LINK TO BLOG POST**_
  * (Re-PR the pre-approved branch from nodejs-private/nodejs.org-private to
    nodejs/nodejs.org)

* [ ] Post-release announcement in reply [email][]: _**LINK TO EMAIL**_
  * CC: `oss-security@lists.openwall.com`
  * Subject: `Node.js security updates for all active release lines, Month Year`
  * Body:
  ```text
  The Node.js project has now released new versions of all supported release lines.
  For more information see: https://nodejs.org/en/blog/vulnerability/month-year-security-releases/
  ```

* [ ] Create a new issue in [nodejs/tweet][]
  ```text
  Security release:

  New security releases are now available for versions <add versions> of Node.js.

  https://nodejs.org/en/blog/vulnerability/month-year-security-releases/
  ```

* [ ] Comment in [docker-node][] issue that release is ready for integration.
  The docker-node team will build and release docker image updates.

* [ ] For every H1 report resolved:
  * Close as Resolved
  * Request Disclosure
  * Request publication of [H1 CVE requests][]
    * (Check that the "Version Fixed" field in the CVE is correct, and provide
      links to the release blogs in the "Public Reference" section)

* [ ] PR machine-readable JSON descriptions of the vulnerabilities to the
  [core](https://github.com/nodejs/security-wg/tree/HEAD/vuln/core)
  vulnerability DB. _**LINK TO PR**_
  * For each vulnerability add a `#.json` file, one can copy an existing
    [json](https://github.com/nodejs/security-wg/blob/0d82062d917cb9ddab88f910559469b2b13812bf/vuln/core/78.json)
    file, and increment the latest created file number and use that as the name
    of the new file to be added. For example, `79.json`.

* [ ] Close this issue

* [ ] Make sure the PRs for the vulnerabilities are closed.

[H1 CVE requests]: https://hackerone.com/nodejs/cve_requests
[docker-node]: https://github.com/nodejs/docker-node/issues
[email]: https://groups.google.com/forum/#!forum/nodejs-sec
[nodejs/build]: https://github.com/nodejs/build/issues
[nodejs/tweet]: https://github.com/nodejs/tweet/issues
