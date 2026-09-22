"""
Make HTTPS downloads work on installs whose Python has no system CA bundle.

torchvision fetches pretrained weights over HTTPS with urllib. On macOS a
python.org build ships without linking the system trust store, so that download
fails with CERTIFICATE_VERIFY_FAILED and training cannot start. certifi is
already a transitive dependency (httpx), so point urllib at its bundle.

Import this before anything that downloads weights.
"""
from __future__ import annotations

import os
import ssl


def configure_tls() -> None:
    try:
        import certifi
    except ImportError:
        # Nothing to do: if the platform already trusts the CAs, downloads work.
        return

    bundle = certifi.where()
    os.environ.setdefault("SSL_CERT_FILE", bundle)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", bundle)

    try:
        ssl._create_default_https_context = lambda *args, **kwargs: ssl.create_default_context(
            cafile=bundle
        )
    except Exception:
        # Verification stays at the interpreter default; never disable it.
        pass


configure_tls()
