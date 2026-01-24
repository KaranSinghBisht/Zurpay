use sha256::digest;

global TREE_DEPTH: u32 = 20;

fn compute_sha256_field(data: [u8; 32]) -> [u8; 32] {
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

fn concat_and_hash_4x32(
    a: [u8; 32],
    b: [u8; 32],
    c: [u8; 32],
    d: [u8; 32],
) -> [u8; 32] {
    let mut combined: [u8; 128] = [0; 128];
    for i in 0..32 {
        combined[i] = a[i];
        combined[i + 32] = b[i];
        combined[i + 64] = c[i];
        combined[i + 96] = d[i];
    }
    digest(combined)
}

fn concat_and_hash_5x32(
    a: [u8; 32],
    b: [u8; 32],
    c: [u8; 32],
    d: [u8; 32],
    e: [u8; 32],
) -> [u8; 32] {
    let mut combined: [u8; 160] = [0; 160];
    for i in 0..32 {
        combined[i] = a[i];
        combined[i + 32] = b[i];
        combined[i + 64] = c[i];
        combined[i + 96] = d[i];
        combined[i + 128] = e[i];
    }
    digest(combined)
}

fn compute_merkle_root(
    leaf: [u8; 32],
    path: [[u8; 32]; TREE_DEPTH],
    path_indices: [bool; TREE_DEPTH],
) -> [u8; 32] {
    let mut current = leaf;
    for i in 0..TREE_DEPTH {
        let sibling = path[i];
        current = if path_indices[i] {
            concat_and_hash_2x32(sibling, current)
        } else {
            concat_and_hash_2x32(current, sibling)
        };
    }
    current
}

fn bytes31_to_field(bytes: [u8; 32]) -> Field {
    let mut result: Field = 0;
    for i in 1..32 {
        result = result * 256 + bytes[i] as Field;
    }
    result
}

// Privacy-preserving claim eligibility circuit (V2)
//
// Key change from V1: payout_pubkey_hash is NOT in the merkle leaf.
// This allows the employee to choose their destination wallet at claim time,
// rather than having it fixed when the payrun is created.
//
// The merkle leaf now contains only:
//   sha256(payrun_id || employee_commitment || salary_commitment || ciphertext_hash)
//
// payout_pubkey_hash is still a public input, verified on-chain against the
// actual receiving account. This prevents front-running while enabling wallet privacy.
fn main(
    public_inputs_hash: pub Field,
    merkle_root: [u8; 32],
    nullifier: [u8; 32],
    payout_pubkey_hash: [u8; 32],
    org_id: [u8; 32],
    salary_commitment: [u8; 32],
    ciphertext_hash: [u8; 32],
    employee_secret: [u8; 32],
    payrun_id: [u8; 32],
    merkle_path: [[u8; 32]; TREE_DEPTH],
    path_indices: [bool; TREE_DEPTH],
) {
    // Verify public inputs hash matches the claimed values
    let computed_hash_bytes = concat_and_hash_5x32(
        merkle_root,
        nullifier,
        payout_pubkey_hash,
        org_id,
        salary_commitment,
    );
    
    let computed_hash_field = bytes31_to_field(computed_hash_bytes);
    assert(computed_hash_field == public_inputs_hash);

    // 1. Compute employee commitment from secret
    let employee_commitment = compute_sha256_field(employee_secret);

    // 2. Compute leaf WITHOUT payout_pubkey_hash (privacy-preserving)
    let leaf = concat_and_hash_4x32(
        payrun_id,
        employee_commitment,
        salary_commitment,
        ciphertext_hash,
    );

    // 3. Verify Merkle proof
    let computed_root = compute_merkle_root(leaf, merkle_path, path_indices);

    for i in 0..32 {
        assert(computed_root[i] == merkle_root[i]);
    }

    // 4. Compute and verify nullifier (prevents double-claim)
    let domain_sep = concat_and_hash_2x32(org_id, payrun_id);
    let computed_nullifier = concat_and_hash_2x32(domain_sep, employee_secret);

    for i in 0..32 {
        assert(computed_nullifier[i] == nullifier[i]);
    }
    
    // Note: payout_pubkey_hash is a public input but NOT verified in circuit.
    // It's verified on-chain: the program checks sha256(claimer_conf_account) == payout_pubkey_hash.
    // This binding happens at claim time, allowing employee wallet freedom.
}

#[test]
fn test_basic_proof() {
    let employee_secret: [u8; 32] = [1; 32];
    let salary_commitment: [u8; 32] = [2; 32];
    let ciphertext_hash: [u8; 32] = [6; 32];
    let payrun_id: [u8; 32] = [3; 32];
    let org_id: [u8; 32] = [5; 32];
    let payout_pubkey_hash: [u8; 32] = [4; 32];

    let employee_commitment = compute_sha256_field(employee_secret);
    
    // New leaf structure: 4 components, no payout_pubkey_hash
    let leaf = concat_and_hash_4x32(
        payrun_id,
        employee_commitment,
        salary_commitment,
        ciphertext_hash,
    );

    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let path_indices: [bool; TREE_DEPTH] = [false; TREE_DEPTH];

    let merkle_root = compute_merkle_root(leaf, merkle_path, path_indices);

    let domain_sep = concat_and_hash_2x32(org_id, payrun_id);
    let nullifier = concat_and_hash_2x32(domain_sep, employee_secret);

    // New public inputs hash: 5 components (removed ciphertext_hash from hash, keep for leaf)
    let public_inputs_hash_bytes = concat_and_hash_5x32(
        merkle_root,
        nullifier,
        payout_pubkey_hash,
        org_id,
        salary_commitment,
    );
    let public_inputs_hash = bytes31_to_field(public_inputs_hash_bytes);

    main(
        public_inputs_hash,
        merkle_root,
        nullifier,
        payout_pubkey_hash,
        org_id,
        salary_commitment,
        ciphertext_hash,
        employee_secret,
        payrun_id,
        merkle_path,
        path_indices,
    );
}
