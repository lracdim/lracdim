"""Where CMS content is read from and written to.

LocalAdapter   development. Reads and writes the working tree; the developer
               commits the result. Default.
GitHubAdapter  production skeleton. Writes through the GitHub API on a branch
               and opens a pull request. It never commits to the production
               branch directly and never holds a token in code.

Both speak the same interface, so routes and the dashboard do not care which
one is configured.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from pathlib import Path

import httpx

from ..core.config import settings
from .documents import CONTENT_TYPES, ContentError, Document, check_slug, check_type, parse

log = logging.getLogger("cms")

IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".avif": "image/avif"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_NAME_RE = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")


def repo_root() -> Path:
    """The monorepo root: two levels above the api package."""
    return Path(settings.cms_content_dir).resolve().parent if settings.cms_content_dir else Path(__file__).resolve().parents[3]


def content_dir() -> Path:
    return Path(settings.cms_content_dir).resolve() if settings.cms_content_dir else repo_root() / "content"


def images_dir() -> Path:
    return Path(settings.cms_images_dir).resolve() if settings.cms_images_dir else repo_root() / "public" / "images"


def check_image_name(name: str) -> tuple[str, str]:
    stem, _, ext = name.rpartition(".")
    ext = f".{ext.lower()}"
    if ext not in IMAGE_TYPES:
        raise ContentError(f"Image type must be one of: {', '.join(sorted(IMAGE_TYPES))}.")
    if not IMAGE_NAME_RE.match(stem.lower()):
        raise ContentError("An image name is lowercase letters, numbers, hyphens, and underscores, plus its extension.")
    return f"{stem.lower()}{ext}", IMAGE_TYPES[ext]


class CMSAdapter:
    name = "base"

    def list(self, content_type: str) -> list[Document]:
        raise NotImplementedError

    def get(self, content_type: str, slug: str) -> Document:
        raise NotImplementedError

    def save(self, doc: Document, message: str) -> dict:
        raise NotImplementedError

    def delete(self, content_type: str, slug: str, message: str) -> dict:
        raise NotImplementedError

    def save_image(self, filename: str, content: bytes, message: str) -> dict:
        raise NotImplementedError


class LocalAdapter(CMSAdapter):
    """Writes the working tree. The change is visible on the next local build
    and becomes public when the developer commits and pushes it."""

    name = "local"

    def list(self, content_type: str) -> list[Document]:
        check_type(content_type)
        folder = content_dir() / content_type
        if not folder.exists():
            return []
        docs = []
        for path in sorted(folder.glob("*.md")):
            try:
                docs.append(parse(content_type, path.stem, path.read_text(encoding="utf-8")))
            except ContentError:
                log.warning("skipping unreadable content file %s", path.name)
        return docs

    def get(self, content_type: str, slug: str) -> Document:
        check_type(content_type)
        check_slug(slug)
        path = content_dir() / content_type / f"{slug}.md"
        if not path.exists():
            raise FileNotFoundError(path.name)
        return parse(content_type, slug, path.read_text(encoding="utf-8"))

    def save(self, doc: Document, message: str) -> dict:
        check_type(doc.type)
        check_slug(doc.slug)
        path = content_dir() / doc.type / f"{doc.slug}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        existed = path.exists()
        path.write_text(doc.to_markdown(), encoding="utf-8", newline="\n")
        log.info("cms local save %s (%s)", doc.path, "updated" if existed else "created")
        return {"adapter": self.name, "path": doc.path, "action": "updated" if existed else "created", "committed": False, "message": message}

    def delete(self, content_type: str, slug: str, message: str) -> dict:
        path = content_dir() / check_type(content_type) / f"{check_slug(slug)}.md"
        if not path.exists():
            raise FileNotFoundError(path.name)
        path.unlink()
        return {"adapter": self.name, "path": f"content/{content_type}/{slug}.md", "action": "deleted", "committed": False, "message": message}

    def save_image(self, filename: str, content: bytes, message: str) -> dict:
        name, _ = check_image_name(filename)
        if len(content) > MAX_IMAGE_BYTES:
            raise ContentError("An image is at most 8 MB.")
        target = images_dir() / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return {"adapter": self.name, "path": f"public/images/{name}", "url": f"/images/{name}", "bytes": len(content), "committed": False, "message": message}


class GitHubAdapter(CMSAdapter):
    """Commits through the GitHub contents API on a working branch, then opens
    a pull request. Merging is a human decision, and the merge is what deploys.

    TODO: this is a skeleton. It is wired end to end but has only been
    exercised against the API's own validation, never against a live
    repository, and it has no conflict handling beyond the blob sha check that
    GitHub performs. Review it before pointing it at a real repository.
    """

    name = "github"
    API = "https://api.github.com"

    def __init__(self, http: httpx.Client | None = None) -> None:
        self._http = http

    # -- transport ---------------------------------------------------------

    def _require_config(self) -> tuple[str, str]:
        if not settings.github_repo or not settings.github_token:
            raise ContentError("The GitHub CMS adapter needs GITHUB_REPO and GITHUB_TOKEN.")
        return settings.github_repo, settings.github_branch or "main"

    def _client(self) -> httpx.Client:
        return self._http or httpx.Client(timeout=httpx.Timeout(20, connect=8))

    def _request(self, method: str, path: str, **kw) -> dict:
        repo, _ = self._require_config()
        headers = {"Authorization": f"Bearer {settings.github_token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        r = self._client().request(method, f"{self.API}{path}", headers=headers, **kw)
        log.info("cms github %s %s -> %s", method, path.replace(repo, "<repo>"), r.status_code)
        if r.status_code == 404:
            raise FileNotFoundError(path)
        if r.status_code >= 400:
            raise ContentError(f"GitHub returned {r.status_code} for {method} {path.replace(repo, '<repo>')}.")
        return r.json() if r.content else {}

    # -- reads -------------------------------------------------------------

    def list(self, content_type: str) -> list[Document]:
        repo, branch = self._require_config()
        check_type(content_type)
        try:
            entries = self._request("GET", f"/repos/{repo}/contents/content/{content_type}", params={"ref": branch})
        except FileNotFoundError:
            return []
        docs = []
        for entry in entries if isinstance(entries, list) else []:
            if entry.get("name", "").endswith(".md"):
                docs.append(self.get(content_type, entry["name"][:-3]))
        return docs

    def get(self, content_type: str, slug: str) -> Document:
        repo, branch = self._require_config()
        check_type(content_type)
        check_slug(slug)
        data = self._request("GET", f"/repos/{repo}/contents/content/{content_type}/{slug}.md", params={"ref": branch})
        raw = base64.b64decode(data.get("content", "")).decode("utf-8")
        return parse(content_type, slug, raw, sha=data.get("sha"))

    # -- writes ------------------------------------------------------------

    def _branch_for(self, kind: str, slug: str) -> str:
        return f"cms/{kind}-{slug}-{os.urandom(3).hex()}"

    def _create_branch(self, work_branch: str) -> None:
        repo, base = self._require_config()
        head = self._request("GET", f"/repos/{repo}/git/ref/heads/{base}")
        self._request("POST", f"/repos/{repo}/git/refs", json={"ref": f"refs/heads/{work_branch}", "sha": head["object"]["sha"]})

    def _put_file(self, path: str, content: bytes, message: str, work_branch: str, sha: str | None) -> dict:
        repo, _ = self._require_config()
        payload = {"message": message, "content": base64.b64encode(content).decode(), "branch": work_branch}
        if sha:
            payload["sha"] = sha
        return self._request("PUT", f"/repos/{repo}/contents/{path}", json=payload)

    def _open_pull_request(self, work_branch: str, title: str, body: str) -> dict:
        repo, base = self._require_config()
        pr = self._request("POST", f"/repos/{repo}/pulls", json={"title": title, "head": work_branch, "base": base, "body": body})
        return {"number": pr.get("number"), "url": pr.get("html_url")}

    def save(self, doc: Document, message: str) -> dict:
        """Never writes to the production branch: a branch, a commit, a pull
        request. The merge is what publishes."""
        check_type(doc.type)
        check_slug(doc.slug)
        work_branch = self._branch_for("edit", doc.slug)
        self._create_branch(work_branch)
        sha = doc.sha
        if sha is None:
            try:
                sha = self.get(doc.type, doc.slug).sha
            except FileNotFoundError:
                sha = None
        self._put_file(doc.path, doc.to_markdown().encode("utf-8"), message, work_branch, sha)
        pr = self._open_pull_request(work_branch, message, f"Content change from the studio dashboard.\n\nFile: `{doc.path}`")
        return {"adapter": self.name, "path": doc.path, "action": "updated" if sha else "created", "committed": True, "branch": work_branch, "pull_request": pr, "message": message}

    def delete(self, content_type: str, slug: str, message: str) -> dict:
        repo, _ = self._require_config()
        doc = self.get(check_type(content_type), check_slug(slug))
        work_branch = self._branch_for("delete", slug)
        self._create_branch(work_branch)
        self._request("DELETE", f"/repos/{repo}/contents/{doc.path}", json={"message": message, "sha": doc.sha, "branch": work_branch})
        pr = self._open_pull_request(work_branch, message, f"Remove `{doc.path}`.")
        return {"adapter": self.name, "path": doc.path, "action": "deleted", "committed": True, "branch": work_branch, "pull_request": pr, "message": message}

    def save_image(self, filename: str, content: bytes, message: str) -> dict:
        name, _ = check_image_name(filename)
        if len(content) > MAX_IMAGE_BYTES:
            raise ContentError("An image is at most 8 MB.")
        path = f"public/images/{name}"
        work_branch = self._branch_for("image", name.rsplit(".", 1)[0])
        self._create_branch(work_branch)
        self._put_file(path, content, message, work_branch, None)
        pr = self._open_pull_request(work_branch, message, f"Add `{path}`.")
        # Markdown references the committed path; the site serves /images/<name>.
        return {"adapter": self.name, "path": path, "url": f"/images/{name}", "bytes": len(content), "committed": True, "branch": work_branch, "pull_request": pr, "message": message}


def get_adapter() -> CMSAdapter:
    """One place decides which adapter is live. Default is local, so a
    misconfigured environment never writes to GitHub by accident."""
    if settings.cms_adapter.lower() == "github":
        return GitHubAdapter()
    return LocalAdapter()


__all__ = ["CMSAdapter", "GitHubAdapter", "LocalAdapter", "CONTENT_TYPES", "get_adapter", "content_dir", "images_dir"]
