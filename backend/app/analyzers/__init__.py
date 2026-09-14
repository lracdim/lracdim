from .accessibility import AccessibilityAnalyzer
from .base import AnalyzerResult, Finding, PageContext
from .content import ContentAnalyzer
from .links import LinkAnalyzer
from .performance import PerformanceAnalyzer
from .security import SecurityAnalyzer
from .seo import SEOAnalyzer
from .technical import TechnicalAnalyzer

ANALYZERS = [
    TechnicalAnalyzer,
    SEOAnalyzer,
    PerformanceAnalyzer,
    AccessibilityAnalyzer,
    SecurityAnalyzer,
    LinkAnalyzer,
    ContentAnalyzer,
]

__all__ = ["ANALYZERS", "AnalyzerResult", "Finding", "PageContext"]
