#!/usr/bin/env python3
"""Record a real CLI run as an asciicast v2 file using a pseudo-terminal."""
import codecs
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import struct
import subprocess
import sys
import termios
import time


def main():
    dest = Path(sys.argv[1] if len(sys.argv) > 1 else 'verification/demo.cast')
    dest.parent.mkdir(parents=True, exist_ok=True)
    command = ['node', 'scripts/demo.mjs', str(dest.with_suffix('.json'))]
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 28, 100, 0, 0))
    started = time.monotonic()
    decoder = codecs.getincrementaldecoder('utf-8')('replace')
    transcript = []
    child = None
    with dest.open('w') as stream:
        def event(text):
            transcript.append(text)
            stream.write(json.dumps([round(time.monotonic() - started, 6), 'o', text]) + '\n')
            stream.flush()
        stream.write(json.dumps({'version': 2, 'width': 100, 'height': 28,
            'timestamp': int(time.time()), 'title': 'ssrf-lab: measured direct-suite comparison',
            'env': {'TERM': 'xterm', 'SHELL': '/bin/bash'}}) + '\n')
        event('$ ' + ' '.join(command) + '\r\n')
        try:
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=slave,
                stderr=slave, start_new_session=True, env={**os.environ, 'NO_COLOR': '1'})
            os.close(slave)
            slave = -1
            while True:
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                event(decoder.decode(chunk))
            tail = decoder.decode(b'', final=True)
            if tail:
                event(tail)
            status = child.wait(timeout=60)
            event(f'\r\n[process exited {status}]\r\n')
            dest.with_suffix('.txt').write_text(''.join(transcript))
            return status
        finally:
            if child is not None and child.poll() is None:
                child.kill()
                child.wait()
            os.close(master)
            if slave >= 0:
                os.close(slave)


if __name__ == '__main__':
    raise SystemExit(main())
