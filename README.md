# QRecover: QR Code Debugger

This is a primitive QR code debugger, to recover data from corrupted or incomplete codes.

Limitations:
- only codes of size 25x25 pixels (ie. "Version 2") are supported
- only very few data modes are supported
- error correction data is not decoded
- input image must be 25 by 25 pixels, containing only the QR code without any spacing arounds
