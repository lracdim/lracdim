---
title: "Building a safe website crawler: the SSRF policy behind Vector"
description: "A public tool that fetches user-supplied URLs is an attack surface. This is the policy every outbound request in LRACDIMENSION passes, and the tests that pin it."
topic: Engineering
category: Security
technologies: [Python, httpx, dnspython]
date: 2026-09-14
order: 0.5
---

## Problem

Vector, Signal, and five Forge tools all fetch a URL the visitor typed. Without a policy, `requests.get(user_url)` becomes a way to make the server read its own cloud metadata endpoint, an internal admin panel, or a database on a private address.

## Question

What is the smallest policy that closes the known routes and can be applied in one place for every dimension?

## Approach

One module, `ssrf.validate`, that every fetch calls first, and again on every redirect hop.

1. **Scheme.** Only http and https. `javascript:`, `file:`, `ftp:`, `gopher:` and anything else are rejected before parsing continues.
2. **Credentials.** A URL with a user or password is rejected.
3. **Host names.** `localhost`, `metadata.google.internal`, and internal suffixes such as `.local`, `.internal`, `.corp` are rejected. A bare label with no dot is rejected.
4. **Address literals.** IPv4 and IPv6 literals are checked against loopback, private, link-local, multicast, reserved, unspecified, and site-local ranges, plus the cloud metadata addresses. IPv4-mapped IPv6 is unwrapped and checked as IPv4.
5. **DNS.** The host is resolved and every returned address is checked. One private address among public ones rejects the request. This closes DNS rebinding through split answers.
6. **Redirects.** The fetcher follows redirects manually. Each `Location` goes back through the same validation before it is requested.
7. **Limits.** A response size ceiling, a connect and read timeout, a maximum redirect count, a bounded number of links checked per examination, and a small concurrency cap.

## Implementation

The fetcher is the only code that opens a socket to a third party. Analyzers receive an already-fetched document and a `head_or_get` helper that routes through the same fetcher. Monitoring checks and Forge server tools call the same functions. The API validates the URL at request time too, so a rejected address never becomes a queued job.

Rate limiting sits in front: a fixed-window counter per client and per bucket, in-process by default and shared through Redis when several API instances run.

## Results

The test suite pins each rule with examples: `file:///etc/passwd`, `javascript:alert(1)`, `http://127.0.0.1/`, `http://10.0.0.5/`, `http://169.254.169.254/latest/meta-data/`, `http://[::1]/`, `http://[fd00::1]/`, a host that resolves to both a public and a private address, and an IPv4-mapped loopback. A public host with mixed IPv4 and IPv6 answers passes.

## Trade-offs

- DNS is resolved at validation and again by the HTTP client. A resolver that changes its answer between the two calls is a residual risk; pinning the connection to the validated address is the next hardening step.
- Blocking internal suffixes by name is a heuristic. The address checks are the real control.
- Redirect re-validation adds a round trip per hop. It is cheap next to what it prevents.

## Conclusion

The policy is about fifty lines and a page of tests. The value is not its size but its position: one door that every outbound request has to walk through.
