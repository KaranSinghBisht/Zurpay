use sha256::digest;

fn u64_to_bytes(value: u64) -> [u8; 8] {
    let mut bytes: [u8; 8] = [0; 8];
    bytes[0] = (value & 0xff) as u8;
    bytes[1] = ((value >> 8) & 0xff) as u8;
    bytes[2] = ((value >> 16) & 0xff) as u8;
    bytes[3] = ((value >> 24) & 0xff) as u8;
    bytes[4] = ((value >> 32) & 0xff) as u8;
    bytes[5] = ((value >> 40) & 0xff) as u8;
    bytes[6] = ((value >> 48) & 0xff) as u8;
    bytes[7] = ((value >> 56) & 0xff) as u8;
    bytes
}

fn compute_salary_commitment(salary: u64, salt: [u8; 32]) -> [u8; 32] {
    let salary_bytes = u64_to_bytes(salary);
    let mut preimage: [u8; 40] = [0; 40];
    for i in 0..8 {
        preimage[i] = salary_bytes[i];
    }
    for i in 0..32 {
        preimage[i + 8] = salt[i];
    }
    digest(preimage)
}

fn bytes31_to_field(bytes: [u8; 32]) -> Field {
    let mut result: Field = 0;
    for i in 1..32 {
        result = result * 256 + bytes[i] as Field;
    }
    result
}

/// Salary Range Proof Circuit
/// 
/// Proves: "I earn >= threshold" without revealing exact salary
/// 
/// Public inputs (hashed into single Field for Solana):
///   - salary_commitment: hash(salary || salt) - links to existing payrun
///   - threshold: minimum salary to prove
/// 
/// Private inputs:
///   - salary: actual salary amount
///   - salt: randomness used in salary_commitment
fn main(
    public_inputs_hash: pub Field,
    salary_commitment: [u8; 32],
    threshold: u64,
    salary: u64,
    salt: [u8; 32],
) {
    // 1. Verify public inputs hash matches (salary_commitment || threshold)
    let mut hash_preimage: [u8; 40] = [0; 40];
    for i in 0..32 {
        hash_preimage[i] = salary_commitment[i];
    }
    let threshold_bytes = u64_to_bytes(threshold);
    for i in 0..8 {
        hash_preimage[i + 32] = threshold_bytes[i];
    }
    let computed_hash_bytes = digest(hash_preimage);
    let computed_hash_field = bytes31_to_field(computed_hash_bytes);
    assert(computed_hash_field == public_inputs_hash);

    // 2. Verify salary_commitment = hash(salary || salt)
    let computed_commitment = compute_salary_commitment(salary, salt);
    for i in 0..32 {
        assert(computed_commitment[i] == salary_commitment[i]);
    }

    // 3. Verify salary >= threshold
    assert(salary >= threshold);
}

#[test]
fn test_salary_above_threshold() {
    let salary: u64 = 100000_000000; // $100,000 (6 decimals)
    let threshold: u64 = 50000_000000; // $50,000
    let salt: [u8; 32] = [
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
        0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
        0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20
    ];

    let salary_commitment = compute_salary_commitment(salary, salt);

    // Compute public inputs hash
    let mut hash_preimage: [u8; 40] = [0; 40];
    for i in 0..32 {
        hash_preimage[i] = salary_commitment[i];
    }
    let threshold_bytes = u64_to_bytes(threshold);
    for i in 0..8 {
        hash_preimage[i + 32] = threshold_bytes[i];
    }
    let hash_bytes = digest(hash_preimage);
    let public_inputs_hash = bytes31_to_field(hash_bytes);

    main(public_inputs_hash, salary_commitment, threshold, salary, salt);
}

#[test]
fn test_salary_equals_threshold() {
    let salary: u64 = 75000_000000; // $75,000
    let threshold: u64 = 75000_000000; // $75,000 (exactly at threshold)
    let salt: [u8; 32] = [0xaa; 32];

    let salary_commitment = compute_salary_commitment(salary, salt);

    let mut hash_preimage: [u8; 40] = [0; 40];
    for i in 0..32 {
        hash_preimage[i] = salary_commitment[i];
    }
    let threshold_bytes = u64_to_bytes(threshold);
    for i in 0..8 {
        hash_preimage[i + 32] = threshold_bytes[i];
    }
    let hash_bytes = digest(hash_preimage);
    let public_inputs_hash = bytes31_to_field(hash_bytes);

    main(public_inputs_hash, salary_commitment, threshold, salary, salt);
}

#[test(should_fail)]
fn test_salary_below_threshold_fails() {
    let salary: u64 = 40000_000000; // $40,000 - BELOW threshold
    let threshold: u64 = 50000_000000; // $50,000
    let salt: [u8; 32] = [0xbb; 32];

    let salary_commitment = compute_salary_commitment(salary, salt);

    let mut hash_preimage: [u8; 40] = [0; 40];
    for i in 0..32 {
        hash_preimage[i] = salary_commitment[i];
    }
    let threshold_bytes = u64_to_bytes(threshold);
    for i in 0..8 {
        hash_preimage[i + 32] = threshold_bytes[i];
    }
    let hash_bytes = digest(hash_preimage);
    let public_inputs_hash = bytes31_to_field(hash_bytes);

    // This should fail because salary < threshold
    main(public_inputs_hash, salary_commitment, threshold, salary, salt);
}
