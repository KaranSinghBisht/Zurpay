use sha256::digest;

global TREE_DEPTH: u32 = 20;

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
    org_id: [u8; 32],
    merkle_root: [u8; 32],
    employee_secret: [u8; 32],
    merkle_path: [[u8; 32]; TREE_DEPTH],
    path_indices: [bool; TREE_DEPTH],
) {
    let hash_preimage_bytes = concat_and_hash_2x32(org_id, merkle_root);
    let computed_hash_field = bytes31_to_field(hash_preimage_bytes);
    assert(computed_hash_field == public_inputs_hash);

    let employee_commitment = compute_sha256(employee_secret);

    let computed_root = compute_merkle_root(employee_commitment, merkle_path, path_indices);

    for i in 0..32 {
        assert(computed_root[i] == merkle_root[i]);
    }
}

#[test]
fn test_valid_employment_proof() {
    let org_id: [u8; 32] = [0xAA; 32];
    let employee_secret: [u8; 32] = [0x01; 32];

    let employee_commitment = compute_sha256(employee_secret);

    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let path_indices: [bool; TREE_DEPTH] = [false; TREE_DEPTH];

    let merkle_root = compute_merkle_root(employee_commitment, merkle_path, path_indices);

    let hash_preimage_bytes = concat_and_hash_2x32(org_id, merkle_root);
    let public_inputs_hash = bytes31_to_field(hash_preimage_bytes);

    main(
        public_inputs_hash,
        org_id,
        merkle_root,
        employee_secret,
        merkle_path,
        path_indices,
    );
}

#[test]
fn test_different_employee_same_org() {
    let org_id: [u8; 32] = [0xBB; 32];
    let employee_secret: [u8; 32] = [0x42; 32];

    let employee_commitment = compute_sha256(employee_secret);

    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0xFF; 32]; TREE_DEPTH];
    let path_indices: [bool; TREE_DEPTH] = [true; TREE_DEPTH];

    let merkle_root = compute_merkle_root(employee_commitment, merkle_path, path_indices);

    let hash_preimage_bytes = concat_and_hash_2x32(org_id, merkle_root);
    let public_inputs_hash = bytes31_to_field(hash_preimage_bytes);

    main(
        public_inputs_hash,
        org_id,
        merkle_root,
        employee_secret,
        merkle_path,
        path_indices,
    );
}

#[test(should_fail)]
fn test_wrong_employee_secret_fails() {
    let org_id: [u8; 32] = [0xAA; 32];
    let real_employee_secret: [u8; 32] = [0x01; 32];
    let fake_employee_secret: [u8; 32] = [0x02; 32];

    let real_commitment = compute_sha256(real_employee_secret);

    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let path_indices: [bool; TREE_DEPTH] = [false; TREE_DEPTH];

    let merkle_root = compute_merkle_root(real_commitment, merkle_path, path_indices);

    let hash_preimage_bytes = concat_and_hash_2x32(org_id, merkle_root);
    let public_inputs_hash = bytes31_to_field(hash_preimage_bytes);

    main(
        public_inputs_hash,
        org_id,
        merkle_root,
        fake_employee_secret,
        merkle_path,
        path_indices,
    );
}

#[test(should_fail)]
fn test_wrong_merkle_path_fails() {
    let org_id: [u8; 32] = [0xAA; 32];
    let employee_secret: [u8; 32] = [0x01; 32];

    let employee_commitment = compute_sha256(employee_secret);

    let correct_merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let correct_path_indices: [bool; TREE_DEPTH] = [false; TREE_DEPTH];

    let merkle_root = compute_merkle_root(employee_commitment, correct_merkle_path, correct_path_indices);

    let hash_preimage_bytes = concat_and_hash_2x32(org_id, merkle_root);
    let public_inputs_hash = bytes31_to_field(hash_preimage_bytes);

    let wrong_merkle_path: [[u8; 32]; TREE_DEPTH] = [[0xFF; 32]; TREE_DEPTH];
    let wrong_path_indices: [bool; TREE_DEPTH] = [true; TREE_DEPTH];

    main(
        public_inputs_hash,
        org_id,
        merkle_root,
        employee_secret,
        wrong_merkle_path,
        wrong_path_indices,
    );
}
