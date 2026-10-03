import re


def safety_check(message: str) -> bool:
    """
    Basic input validation.
    Returns False for empty/invalid messages.
    """

    if not message:
        return False

    message = message.strip()

    if len(message) == 0:
        return False

    return True


def prompt_abuse_check(message: str) -> bool:
    """
    Detect attempts to override the AI's system instructions.
    """

    if not message:
        return False

    text = message.lower().strip()

    suspicious_patterns = [
        r"ignore\s+(all\s+)?(the\s+)?(previous|prior|earlier|above|system)\s+instructions",
        r"forget\s+(all\s+)?(the\s+)?(previous|prior|earlier|above|system)\s+instructions",
        r"disregard\s+(all\s+)?(the\s+)?(previous|prior|earlier|above|system)\s+instructions",
        r"override\s+(the\s+)?system",
        r"reveal\s+(your\s+)?system\s+prompt",
        r"show\s+(me\s+)?your\s+system\s+prompt",
        r"what\s+(were\s+you\s+told|is\s+your\s+system\s+prompt|are\s+your\s+instructions)",
        r"repeat\s+(everything|the\s+text)\s+(above|before)",
        r"you\s+(are\s+now|have\s+become)\s+a?\s*(different|new)\s+(ai|assistant|persona)",
        r"act\s+as\s+if\s+you\s+(have\s+no|had\s+no)\s+(rules|restrictions|guidelines)",
        r"pretend\s+(you\s+)?(have\s+no|had\s+no)\s+(rules|restrictions|filters)",
        r"bhool\s*ja\w*\s+(apne|tumhare)\s+(system\s+)?instructions",
        r"system\s+prompt\s+(batao|dikhao|bata\s+do)",
    ]

    for pattern in suspicious_patterns:
        if re.search(pattern, text):
            return False

    return True