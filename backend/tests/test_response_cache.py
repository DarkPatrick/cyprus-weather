import threading
from concurrent.futures import ThreadPoolExecutor
import pytest
from response_cache import ResponseCache


def test_ttl_lru_and_size_budget():
    clock=[0];cache=ResponseCache(ttl=2,max_entries=2,max_bytes=4,clock=lambda:clock[0])
    assert cache.get('a',lambda:b'aa')==(b'aa','MISS')
    assert cache.get('a',lambda:pytest.fail('cache missed'))==(b'aa','HIT')
    cache.get('b',lambda:b'bb');cache.get('a',lambda:b'bad')
    cache.get('c',lambda:b'cc')
    assert 'b' not in cache.entries and cache.bytes==4
    clock[0]=3
    assert cache.get('a',lambda:b'new')[0]==b'new'
    assert cache.bytes==3
    cache.get('huge',lambda:b'12345')
    assert 'huge' not in cache.entries and cache.bytes<=4


def test_parallel_misses_are_coalesced():
    cache=ResponseCache();entered=threading.Event();release=threading.Event();calls=[]
    def load():
        calls.append(1);entered.set();assert release.wait(3);return b'data'
    with ThreadPoolExecutor(max_workers=12) as pool:
        first=pool.submit(cache.get,'same',load);assert entered.wait(3)
        rest=[pool.submit(cache.get,'same',load) for _ in range(11)]
        release.set()
        results=[first.result()]+[job.result() for job in rest]
    assert len(calls)==1 and all(body==b'data' for body,_ in results)


def test_failures_are_not_cached_and_can_retry():
    cache=ResponseCache()
    def fail():raise ValueError('bad source')
    with pytest.raises(ValueError):cache.get('a',fail)
    assert not cache.entries and not cache.inflight
    assert cache.get('a',lambda:b'ok')==(b'ok','MISS')
