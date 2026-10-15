"""Git-backed CMS: Markdown with front matter under /content, images under
/public/images, committed to this repository. See README.md in this package."""
from .adapters import CONTENT_TYPES, CMSAdapter, GitHubAdapter, LocalAdapter, get_adapter
from .documents import ContentError, Document, parse, serialise

__all__ = ["CONTENT_TYPES", "CMSAdapter", "ContentError", "Document", "GitHubAdapter", "LocalAdapter", "get_adapter", "parse", "serialise"]
