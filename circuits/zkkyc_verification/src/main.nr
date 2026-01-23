use sha256::digest;

fn compute_sha256(data: [u8; 32]) -> [u8; 32] {
    digest(data)
}

fn concat_and_hash_2x32(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
    let mut combined: [u8; 64] = [0; 64];
    for i in 0..32 {
        combined[i] = a[i];
        combined[i + 32] = b[i];
    }
    digest(combined)
}

fn concat_and_hash_3x32(a: [u8; 32], b: [u8; 32], c: [u8; 32]) -> [u8; 32] {
    let mut combined: [u8; 96] = [0; 96];
    for i in 0..32 {
        combined[i] = a[i];
        combined[i + 32] = b[i];
        combined[i + 64] = c[i];
    }
    digest(combined)
}

fn u32_to_bytes(value: u32) -> [u8; 4] {
    let mut bytes: [u8; 4] = [0; 4];
    bytes[0] = (value & 0xff) as u8;
    bytes[1] = ((value >> 8) & 0xff) as u8;
    bytes[2] = ((value >> 16) & 0xff) as u8;
    bytes[3] = ((value >> 24) & 0xff) as u8;
    bytes
}

fn bytes31_to_field(bytes: [u8; 32]) -> Field {
    let mut result: Field = 0;
    for i in 1..32 {
        result = result * 256 + bytes[i] as Field;
    }
    result
}

fn main(
    public_inputs_hash: pub Field,
    identity_commitment: [u8; 32],
    age_threshold: u32,
    current_timestamp: u32,
    document_hash: [u8; 32],
    birth_date_unix: u32,
    document_salt: [u8; 32],
    nationality_code: [u8; 32],
) {
    let mut hash_preimage: [u8; 72] = [0; 72];
    for i in 0..32 {
        hash_preimage[i] = identity_commitment[i];
    }
    let age_bytes = u32_to_bytes(age_threshold);
    for i in 0..4 {
        hash_preimage[i + 32] = age_bytes[i];
    }
    let timestamp_bytes = u32_to_bytes(current_timestamp);
    for i in 0..4 {
        hash_preimage[i + 36] = timestamp_bytes[i];
    }
    for i in 0..32 {
        hash_preimage[i + 40] = nationality_code[i];
    }
    let computed_hash = digest(hash_preimage);
    let computed_hash_field = bytes31_to_field(computed_hash);
    assert(computed_hash_field == public_inputs_hash);

    let computed_commitment = concat_and_hash_3x32(document_hash, document_salt, nationality_code);
    for i in 0..32 {
        assert(computed_commitment[i] == identity_commitment[i]);
    }

    let age_seconds = current_timestamp - birth_date_unix;
    let age_years = age_seconds / 31536000;
    assert(age_years >= age_threshold);

    let computed_document_hash = concat_and_hash_2x32(
        u32_to_padded_bytes(birth_date_unix),
        document_salt
    );
    for i in 0..32 {
        assert(computed_document_hash[i] == document_hash[i]);
    }
}

fn u32_to_padded_bytes(value: u32) -> [u8; 32] {
    let mut bytes: [u8; 32] = [0; 32];
    bytes[0] = (value & 0xff) as u8;
    bytes[1] = ((value >> 8) & 0xff) as u8;
    bytes[2] = ((value >> 16) & 0xff) as u8;
    bytes[3] = ((value >> 24) & 0xff) as u8;
    bytes
}

#[test]
fn test_valid_age_verification_adult() {
    let birth_date_unix: u32 = 631152000;
    let current_timestamp: u32 = 1737590400;
    let age_threshold: u32 = 18;
    let document_salt: [u8; 32] = [0x42; 32];
    let nationality_code: [u8; 32] = [0x55, 0x53, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

    let document_hash = concat_and_hash_2x32(
        u32_to_padded_bytes(birth_date_unix),
        document_salt
    );
    let identity_commitment = concat_and_hash_3x32(document_hash, document_salt, nationality_code);

    let mut hash_preimage: [u8; 72] = [0; 72];
    for i in 0..32 {
        hash_preimage[i] = identity_commitment[i];
    }
    let age_bytes = u32_to_bytes(age_threshold);
    for i in 0..4 {
        hash_preimage[i + 32] = age_bytes[i];
    }
    let timestamp_bytes = u32_to_bytes(current_timestamp);
    for i in 0..4 {
        hash_preimage[i + 36] = timestamp_bytes[i];
    }
    for i in 0..32 {
        hash_preimage[i + 40] = nationality_code[i];
    }
    let hash_bytes = digest(hash_preimage);
    let public_inputs_hash = bytes31_to_field(hash_bytes);

    main(
        public_inputs_hash,
        identity_commitment,
        age_threshold,
        current_timestamp,
        document_hash,
        birth_date_unix,
        document_salt,
        nationality_code,
    );
}

#[test]
fn test_age_exactly_at_threshold() {
    let current_timestamp: u32 = 1737590400;
    let birth_date_unix: u32 = current_timestamp - (21 * 31536000);
    let age_threshold: u32 = 21;
    let document_salt: [u8; 32] = [0xAA; 32];
    let nationality_code: [u8; 32] = [0x47, 0x42, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

    let document_hash = concat_and_hash_2x32(
        u32_to_padded_bytes(birth_date_unix),
        document_salt
    );
    let identity_commitment = concat_and_hash_3x32(document_hash, document_salt, nationality_code);

    let mut hash_preimage: [u8; 72] = [0; 72];
    for i in 0..32 {
        hash_preimage[i] = identity_commitment[i];
    }
    let age_bytes = u32_to_bytes(age_threshold);
    for i in 0..4 {
        hash_preimage[i + 32] = age_bytes[i];
    }
    let timestamp_bytes = u32_to_bytes(current_timestamp);
    for i in 0..4 {
        hash_preimage[i + 36] = timestamp_bytes[i];
    }
    for i in 0..32 {
        hash_preimage[i + 40] = nationality_code[i];
    }
    let hash_bytes = digest(hash_preimage);
    let public_inputs_hash = bytes31_to_field(hash_bytes);

    main(
        public_inputs_hash,
        identity_commitment,
        age_threshold,
        current_timestamp,
        document_hash,
        birth_date_unix,
        document_salt,
        nationality_code,
    );
}

#[test(should_fail)]
fn test_underage_fails() {
    let current_timestamp: u32 = 1737590400;
    let birth_date_unix: u32 = current_timestamp - (17 * 31536000);
    let age_threshold: u32 = 18;
    let document_salt: [u8; 32] = [0xBB; 32];
    let nationality_code: [u8; 32] = [0x55, 0x53, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

    let document_hash = concat_and_hash_2x32(
        u32_to_padded_bytes(birth_date_unix),
        document_salt
    );
    let identity_commitment = concat_and_hash_3x32(document_hash, document_salt, nationality_code);

    let mut hash_preimage: [u8; 72] = [0; 72];
    for i in 0..32 {
        hash_preimage[i] = identity_commitment[i];
    }
    let age_bytes = u32_to_bytes(age_threshold);
    for i in 0..4 {
        hash_preimage[i + 32] = age_bytes[i];
    }
    let timestamp_bytes = u32_to_bytes(current_timestamp);
    for i in 0..4 {
        hash_preimage[i + 36] = timestamp_bytes[i];
    }
    for i in 0..32 {
        hash_preimage[i + 40] = nationality_code[i];
    }
    let hash_bytes = digest(hash_preimage);
    let public_inputs_hash = bytes31_to_field(hash_bytes);

    main(
        public_inputs_hash,
        identity_commitment,
        age_threshold,
        current_timestamp,
        document_hash,
        birth_date_unix,
        document_salt,
        nationality_code,
    );
}

#[test(should_fail)]
fn test_wrong_document_hash_fails() {
    let birth_date_unix: u32 = 631152000;
    let current_timestamp: u32 = 1737590400;
    let age_threshold: u32 = 18;
    let document_salt: [u8; 32] = [0x42; 32];
    let nationality_code: [u8; 32] = [0x55, 0x53, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

    let real_document_hash = concat_and_hash_2x32(
        u32_to_padded_bytes(birth_date_unix),
        document_salt
    );
    let identity_commitment = concat_and_hash_3x32(real_document_hash, document_salt, nationality_code);

    let fake_document_hash: [u8; 32] = [0xFF; 32];

    let mut hash_preimage: [u8; 72] = [0; 72];
    for i in 0..32 {
        hash_preimage[i] = identity_commitment[i];
    }
    let age_bytes = u32_to_bytes(age_threshold);
    for i in 0..4 {
        hash_preimage[i + 32] = age_bytes[i];
    }
    let timestamp_bytes = u32_to_bytes(current_timestamp);
    for i in 0..4 {
        hash_preimage[i + 36] = timestamp_bytes[i];
    }
    for i in 0..32 {
        hash_preimage[i + 40] = nationality_code[i];
    }
    let hash_bytes = digest(hash_preimage);
    let public_inputs_hash = bytes31_to_field(hash_bytes);

    main(
        public_inputs_hash,
        identity_commitment,
        age_threshold,
        current_timestamp,
        fake_document_hash,
        birth_date_unix,
        document_salt,
        nationality_code,
    );
}
