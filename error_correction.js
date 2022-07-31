//
// Functions for error correction calculations.
//

function check_format_ec(format_and_ec) {
    const gen = 0b10100110111
    for (var i = 4; i >= 0; i--) {
        if (format_and_ec & (1 << (i+10))) {
            format_and_ec ^= gen << i;
        }
    }
    return format_and_ec;
}

function hamming_weight (input) {
    var num_bits_set = 0;
    while (input != 0) {
        num_bits_set += (input & 1);
        input >>= 1;
    }
    return num_bits_set;
}

function get_corrections (input_format_code) {
    var all_codes = new Array();
    for (var i = 0; i < 32; i++) {
        const format_code = (i << 10) | check_format_ec(i << 10);
        const distance = hamming_weight(input_format_code ^ format_code);
        all_codes.push({"code": format_code, "distance": distance});
    }
    return all_codes;
}
