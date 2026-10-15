import pytest

from app.core.ssrf import UnsafeURL, normalize, validate


def resolver_factory(addresses):
    return lambda host, port: addresses


def test_normalize_adds_https_and_path():
    assert normalize("example.com") == "https://example.com/"
    assert normalize("http://Example.com/a?b=1#frag") == "http://example.com/a?b=1"


@pytest.mark.parametrize("raw", ["ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "gopher://x.com"])
def test_rejects_non_http_schemes(raw):
    with pytest.raises(UnsafeURL):
        normalize(raw)


def test_rejects_credentials():
    with pytest.raises(UnsafeURL):
        normalize("https://user:pw@example.com/")


@pytest.mark.parametrize("raw", ["localhost", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://172.16.4.4/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[fd00::1]/", "http://metadata.google.internal/", "http://intranet.corp/", "http://0.0.0.0/"])
def test_rejects_private_and_metadata(raw):
    with pytest.raises(UnsafeURL):
        validate(raw, resolver=resolver_factory(["93.184.216.34"]))


def test_rejects_dns_that_resolves_private():
    with pytest.raises(UnsafeURL):
        validate("https://evil.example.com/", resolver=resolver_factory(["93.184.216.34", "10.1.1.1"]))


def test_rejects_ipv4_mapped_ipv6():
    with pytest.raises(UnsafeURL):
        validate("https://evil.example.com/", resolver=resolver_factory(["::ffff:127.0.0.1"]))


def test_accepts_public_host():
    t = validate("https://example.com/path", resolver=resolver_factory(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]))
    assert t.host == "example.com" and t.port == 443 and t.url == "https://example.com/path"


def test_rejects_unresolvable():
    with pytest.raises(UnsafeURL):
        validate("https://does-not-exist.example.com/", resolver=resolver_factory([]))
