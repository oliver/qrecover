# QRecover: QR Code Debugger

This is a primitive QR code debugger, to recover data from corrupted or incomplete codes.

Limitations:
- only codes of size 25x25 pixels (ie. "Version 2") are supported
- only very few data modes are supported
- input image must be 25 by 25 pixels, containing only the QR code without any spacing arounds


## License

This software is licensed under GPL v3.

This software also contains code from:
- [erc-js](https://github.com/louismullie/erc-js) by Louis-Antoine Mullie, which is licensed under GPL v3.
- class.js by John Resig (http://ejohn.org/), which is licensed under MIT License.
