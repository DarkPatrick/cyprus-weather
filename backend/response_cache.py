"""Bounded response cache with one producer per key and shared in-flight results."""
from collections import OrderedDict
from concurrent.futures import Future
from threading import Lock
from time import monotonic

class ResponseCache:
    def __init__(self, ttl=120, max_entries=1024, max_bytes=64*1024*1024, clock=monotonic):
        self.ttl=ttl; self.max_entries=max_entries; self.max_bytes=max_bytes; self.clock=clock
        self.entries=OrderedDict(); self.inflight={}; self.bytes=0; self.lock=Lock()

    def get(self, key, load):
        with self.lock:
            now=self.clock()
            for expired in [k for k,(until,_) in self.entries.items() if until<=now]:
                self.bytes-=len(self.entries.pop(expired)[1])
            entry=self.entries.get(key)
            if entry:
                self.entries.move_to_end(key)
                return entry[1], 'HIT'
            future=self.inflight.get(key)
            owner=future is None
            if owner:
                future=Future(); self.inflight[key]=future
        if not owner:
            return future.result(), 'COALESCED'
        try:
            body=load()
        except BaseException as error:
            future.set_exception(error)
            with self.lock:self.inflight.pop(key,None)
            raise
        with self.lock:
            if len(body)<=self.max_bytes:
                while self.entries and (len(self.entries)>=self.max_entries or self.bytes+len(body)>self.max_bytes):
                    _,(_,old)=self.entries.popitem(last=False); self.bytes-=len(old)
                self.entries[key]=(self.clock()+self.ttl,body); self.bytes+=len(body)
            # Resolve before dropping the in-flight reference, including oversized values.
            future.set_result(body); self.inflight.pop(key,None)
        return body, 'MISS'
