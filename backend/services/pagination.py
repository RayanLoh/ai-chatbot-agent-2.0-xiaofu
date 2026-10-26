"""Compatibility paging while SQL 007 is rolling out."""


def message_page(messages, limit, before=None):
    finish = min(len(messages), len(messages) if before is None else before)
    start = max(0, finish - limit)
    return {'messages': messages[start:finish], 'has_more': start > 0,
            'next_before': start if start > 0 else None, 'total': len(messages)}
