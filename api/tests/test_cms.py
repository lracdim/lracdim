from __future__ import annotations

import base64

import pytest

from app.cms import documents
from app.cms.adapters import LocalAdapter, check_image_name
from app.cms.documents import ContentError, Document, parse, serialise

ADMIN = {"X-Admin-Key": "test-admin"}


def test_front_matter_round_trips():
    raw = '---\ntitle: A post\ntags:\n  - one\n  - two\n---\n\nBody text.\n'
    doc = parse("blog", "a-post", raw)
    assert doc.title == "A post" and doc.front_matter["tags"] == ["one", "two"]
    assert doc.body.strip() == "Body text."
    assert parse("blog", "a-post", doc.to_markdown()).front_matter == doc.front_matter


def test_document_without_front_matter_is_all_body():
    doc = parse("pages", "plain", "Just words.\n")
    assert doc.front_matter == {} and doc.body.strip() == "Just words."


def test_bad_front_matter_is_reported_not_swallowed():
    with pytest.raises(ContentError):
        parse("blog", "broken", "---\ntitle: [unclosed\n---\nbody")


def test_draft_front_matter_marks_status():
    assert parse("blog", "d", "---\ntitle: T\ndraft: true\n---\n").status == "draft"
    assert parse("blog", "p", "---\ntitle: T\n---\n").status == "published"


@pytest.mark.parametrize("slug", ["../escape", "Caps", "two words", "trailing-", "", "a--b"])
def test_slugs_that_would_escape_the_content_directory_are_refused(slug):
    with pytest.raises(ContentError):
        documents.check_slug(slug)


@pytest.mark.parametrize("name", ["../evil.png", "shell.php", "no-extension", "Spaces In.png"])
def test_image_names_are_restricted(name):
    with pytest.raises(ContentError):
        check_image_name(name)


def test_local_adapter_writes_reads_and_deletes(tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.config.settings", type(__import__("app.core.config", fromlist=["settings"]).settings)(), raising=False)
    monkeypatch.setenv("CMS_CONTENT_DIR", str(tmp_path / "content"))
    monkeypatch.setattr("app.cms.adapters.content_dir", lambda: tmp_path / "content")
    monkeypatch.setattr("app.cms.adapters.images_dir", lambda: tmp_path / "public" / "images")

    adapter = LocalAdapter()
    doc = Document(type="blog", slug="hello-world", front_matter={"title": "Hello world", "date": "2026-10-15"}, body="First post.")
    result = adapter.save(doc, "Add blog/hello-world")
    assert result["action"] == "created" and result["committed"] is False
    assert (tmp_path / "content" / "blog" / "hello-world.md").exists()

    assert [d.slug for d in adapter.list("blog")] == ["hello-world"]
    assert adapter.get("blog", "hello-world").title == "Hello world"
    assert adapter.save(doc, "Update")["action"] == "updated"

    image = adapter.save_image("Cover-Shot.PNG", b"\x89PNG\r\n\x1a\n", "Add image")
    assert image["url"] == "/images/cover-shot.png"
    assert (tmp_path / "public" / "images" / "cover-shot.png").read_bytes().startswith(b"\x89PNG")

    assert adapter.delete("blog", "hello-world", "Remove")["action"] == "deleted"
    with pytest.raises(FileNotFoundError):
        adapter.get("blog", "hello-world")


def test_cms_routes_require_admin(client):
    assert client.get("/api/cms/blog").status_code == 401
    assert client.get("/api/cms/types", headers=ADMIN).json()["adapter"] == "local"


def test_cms_lists_the_repository_content(client):
    """The real /content directory: the research articles live there now."""
    body = client.get("/api/cms/blog", headers=ADMIN).json()
    assert len(body) >= 9
    assert all(item["path"].startswith("content/blog/") for item in body)
    first = client.get(f"/api/cms/blog/{body[0]['slug']}", headers=ADMIN).json()
    assert first["front_matter"].get("title") and isinstance(first["body"], str)


def test_cms_rejects_unknown_type_and_bad_slug(client):
    assert client.get("/api/cms/secrets", headers=ADMIN).status_code == 422
    bad = client.get("/api/cms/blog/..%2F..%2Fetc", headers=ADMIN)
    assert bad.status_code in (404, 422)


def test_cms_image_upload_rejects_non_base64(client):
    r = client.post("/api/cms/images", json={"filename": "x.png", "content_base64": "not base64!!"}, headers=ADMIN)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_content"


def test_cms_image_upload_rejects_disallowed_type(client):
    payload = {"filename": "payload.php", "content_base64": base64.b64encode(b"<?php").decode()}
    r = client.post("/api/cms/images", json=payload, headers=ADMIN)
    assert r.status_code == 422


def test_serialise_puts_front_matter_first():
    text = serialise({"title": "T", "draft": True}, "Body")
    assert text.startswith("---\ntitle: T\ndraft: true\n---\n\nBody")


def test_get_put_and_delete_coexist_on_one_path(client):
    """Regression: three sync handlers on one path broke the first one's
    response in Litestar 2.24, which is why the CMS handlers are async."""
    assert client.get("/api/cms/blog", headers=ADMIN).status_code == 200
    assert client.get("/api/cms/blog/ai-agents-pilots-versus-production", headers=ADMIN).status_code == 200
    assert client.put("/api/cms/blog/does-not-exist", json={"front_matter": {}, "body": ""}, headers=ADMIN).status_code == 404
    assert client.delete("/api/cms/blog/does-not-exist", headers=ADMIN).status_code == 404
