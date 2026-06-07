import hashlib
import secrets

_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"


def _nanoid(size: int = 16) -> str:
    n = len(_ALPHABET)
    return "".join(_ALPHABET[secrets.randbelow(n)] for _ in range(size))


def upload_id() -> str:
    return f"up_{_nanoid()}"


def audit_id() -> str:
    return f"au_{_nanoid()}"


def hash_ip(ip: str, salt: str) -> str:
    h = hashlib.sha256(f"{salt}:{ip}".encode("utf-8")).hexdigest()
    return h[:32]
