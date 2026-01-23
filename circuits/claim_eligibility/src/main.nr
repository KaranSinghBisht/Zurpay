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

fn concat_and_hash_6x32(
    a: [u8; 32],
    b: [u8; 32],
    c: [u8; 32],
    d: [u8; 32],
    e: [u8; 32],
    f: [u8; 32],
) -> [u8; 32] {
    let mut combined: [u8; 192] = [0; 192];
    for i in 0..32 {
        combined[i] = a[i];
        combined[i + 32] = b[i];
        combined[i + 64] = c[i];
        combined[i + 96] = d[i];
        combined[i + 128] = e[i];
        combined[i + 160] = f[i];
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
    payout_pubkey: [u8; 32],
) {
    let computed_hash_bytes = concat_and_hash_6x32(
        merkle_root,
        nullifier,
        payout_pubkey_hash,
        org_id,
        salary_commitment,
        ciphertext_hash,
    );
    
    let computed_hash_field = bytes31_to_field(computed_hash_bytes);
    assert(computed_hash_field == public_inputs_hash);
    // 1. First compute payout_pubkey_hash (needed for leaf)
    let computed_payout_hash = compute_sha256_field(payout_pubkey);
    for i in 0..32 {
        assert(computed_payout_hash[i] == payout_pubkey_hash[i]);
    }

    // 2. Compute employee commitment
    let employee_commitment = compute_sha256_field(employee_secret);

    // 3. Compute leaf using all components
    let leaf = concat_and_hash_5x32(
        payrun_id,
        employee_commitment,
        salary_commitment,
        ciphertext_hash,
        computed_payout_hash,
    );

    // 4. Verify Merkle proof
    let computed_root = compute_merkle_root(leaf, merkle_path, path_indices);

    for i in 0..32 {
        assert(computed_root[i] == merkle_root[i]);
    }

    // 5. Compute and verify nullifier
    let domain_sep = concat_and_hash_2x32(org_id, payrun_id);
    let computed_nullifier = concat_and_hash_2x32(domain_sep, employee_secret);

    for i in 0..32 {
        assert(computed_nullifier[i] == nullifier[i]);
    }
}

#[test]
fn test_basic_proof() {
    let employee_secret: [u8; 32] = [1; 32];
    let salary_commitment: [u8; 32] = [2; 32];
    let ciphertext_hash: [u8; 32] = [6; 32];
    let payrun_id: [u8; 32] = [3; 32];
    let org_id: [u8; 32] = [5; 32];
    let payout_pubkey: [u8; 32] = [4; 32];

    let employee_commitment = compute_sha256_field(employee_secret);
    let payout_pubkey_hash = compute_sha256_field(payout_pubkey);
    let leaf = concat_and_hash_5x32(
        payrun_id,
        employee_commitment,
        salary_commitment,
        ciphertext_hash,
        payout_pubkey_hash,
    );

    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let path_indices: [bool; TREE_DEPTH] = [false; TREE_DEPTH];

    let merkle_root = compute_merkle_root(leaf, merkle_path, path_indices);

    let domain_sep = concat_and_hash_2x32(org_id, payrun_id);
    let nullifier = concat_and_hash_2x32(domain_sep, employee_secret);

    let payout_pubkey_hash = compute_sha256_field(payout_pubkey);

    // Compute public inputs hash for v4 (as Field)
    let public_inputs_hash_bytes = concat_and_hash_6x32(
        merkle_root,
        nullifier,
        payout_pubkey_hash,
        org_id,
        salary_commitment,
        ciphertext_hash,
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
        payout_pubkey,
    );
}
