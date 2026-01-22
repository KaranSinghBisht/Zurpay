import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { ZurpayPayroll } from '../target/types/zurpay_payroll';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { expect } from 'chai';
import { createHash } from 'crypto';

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function computeEmployeeCommitment(secret: Uint8Array): Uint8Array {
  return sha256(secret);
}

function computeSalaryCommitment(amount: bigint, blinding?: Uint8Array): Uint8Array {
  const amountBytes = new Uint8Array(32);
  let val = amount;
  for (let i = 31; i >= 0; i--) {
    amountBytes[i] = Number(val & 0xffn);
    val >>= 8n;
  }
  if (blinding) {
    return sha256(concat(blinding, amountBytes));
  }
  return sha256(amountBytes);
}

function computeNullifier(orgId: Uint8Array, payrunId: Uint8Array, secret: Uint8Array): Uint8Array {
  const domainSep = sha256(concat(orgId, payrunId));
  return sha256(concat(domainSep, secret));
}

function computeCiphertextHash(encryptedAmount: Uint8Array): Uint8Array {
  return sha256(encryptedAmount);
}

function computeLeafV2(
  payrunId: Uint8Array,
  employeeCommitment: Uint8Array,
  salaryCommitment: Uint8Array,
  ciphertextHash: Uint8Array,
  payoutPubkeyHash: Uint8Array
): Uint8Array {
  return sha256(
    concat(payrunId, employeeCommitment, salaryCommitment, ciphertextHash, payoutPubkeyHash)
  );
}

function hashNodes(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(concat(left, right));
}

const EMPTY_LEAF = sha256(new Uint8Array(32));
const TREE_DEPTH = 20;

function buildMerkleTree(leaves: Uint8Array[]): { root: Uint8Array; layers: Uint8Array[][] } {
  const maxLeaves = 2 ** TREE_DEPTH;
  const paddedLeaves = [...leaves];
  while (paddedLeaves.length < maxLeaves) {
    paddedLeaves.push(EMPTY_LEAF);
  }

  const layers: Uint8Array[][] = [paddedLeaves];
  let currentLayer = paddedLeaves;
  while (currentLayer.length > 1) {
    const nextLayer: Uint8Array[] = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      nextLayer.push(hashNodes(currentLayer[i], currentLayer[i + 1]));
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  return { root: layers[layers.length - 1][0], layers };
}

function getMerkleProof(
  layers: Uint8Array[][],
  leafIndex: number
): { path: Uint8Array[]; indices: boolean[] } {
  const path: Uint8Array[] = [];
  const indices: boolean[] = [];
  let currentIndex = leafIndex;

  for (let i = 0; i < TREE_DEPTH; i++) {
    const isRight = currentIndex % 2 === 1;
    const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
    path.push(layers[i][siblingIndex]);
    indices.push(isRight);
    currentIndex = Math.floor(currentIndex / 2);
  }

  return { path, indices };
}

function serializePublicInputsV2(
  merkleRoot: Uint8Array,
  nullifier: Uint8Array,
  payoutPubkeyHash: Uint8Array,
  orgId: Uint8Array,
  salaryCommitment: Uint8Array,
  ciphertextHash: Uint8Array
): Uint8Array {
  const result = new Uint8Array(192);
  result.set(merkleRoot, 0);
  result.set(nullifier, 32);
  result.set(payoutPubkeyHash, 64);
  result.set(orgId, 96);
  result.set(salaryCommitment, 128);
  result.set(ciphertextHash, 160);
  return result;
}

describe('zurpay_payroll', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ZurpayPayroll as Program<ZurpayPayroll>;

  const admin = Keypair.generate();
  const claimer = Keypair.generate();

  const orgId = new Uint8Array(32).fill(1);
  const payrunId = new Uint8Array(32).fill(2);

  let orgPda: PublicKey;
  let payrunPda: PublicKey;
  let treasuryConfAccount: PublicKey;
  let claimerConfAccount: PublicKey;

  const zkVerifierProgramId = Keypair.generate().publicKey;
  const incoProgramId = Keypair.generate().publicKey;

  const employeeSecret = new Uint8Array(32).fill(3);
  const salary = 1000000n;
  const encryptedAmount = new Uint8Array(32).fill(5);

  let merkleRoot: Uint8Array;
  let nullifierHash: Uint8Array;
  let salaryCommitment: Uint8Array;
  let ciphertextHash: Uint8Array;
  let employeeCommitment: Uint8Array;
  let payoutPubkeyHash: Uint8Array;
  let layers: Uint8Array[][];

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(admin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(claimer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL)
    );

    [orgPda] = PublicKey.findProgramAddressSync([Buffer.from('org'), orgId], program.programId);

    [payrunPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('payrun'), orgId, payrunId],
      program.programId
    );

    treasuryConfAccount = Keypair.generate().publicKey;
    claimerConfAccount = Keypair.generate().publicKey;

    employeeCommitment = computeEmployeeCommitment(employeeSecret);
    salaryCommitment = computeSalaryCommitment(salary, employeeSecret);
    ciphertextHash = computeCiphertextHash(encryptedAmount);
    nullifierHash = computeNullifier(orgId, payrunId, employeeSecret);
    payoutPubkeyHash = sha256(claimerConfAccount.toBytes());

    const leaf = computeLeafV2(
      payrunId,
      employeeCommitment,
      salaryCommitment,
      ciphertextHash,
      payoutPubkeyHash
    );
    const tree = buildMerkleTree([leaf]);
    merkleRoot = tree.root;
    layers = tree.layers;
  });

  describe('init_org', () => {
    it('should initialize organization with program IDs', async () => {
      await program.methods
        .initOrg(Array.from(orgId), treasuryConfAccount, zkVerifierProgramId, incoProgramId)
        .accounts({
          admin: admin.publicKey,
          org: orgPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const org = await program.account.org.fetch(orgPda);
      expect(Buffer.from(org.orgId).toString('hex')).to.equal(Buffer.from(orgId).toString('hex'));
      expect(org.admin.toString()).to.equal(admin.publicKey.toString());
      expect(org.zkVerifierProgramId.toString()).to.equal(zkVerifierProgramId.toString());
      expect(org.incoProgramId.toString()).to.equal(incoProgramId.toString());
    });
  });

  describe('set_payrun', () => {
    it('should reject zero merkle root', async () => {
      const zeroMerkleRoot = new Uint8Array(32).fill(0);
      const futureDeadline = Math.floor(Date.now() / 1000) + 3600;

      try {
        await program.methods
          .setPayrun(
            Array.from(payrunId),
            Array.from(zeroMerkleRoot),
            10,
            new anchor.BN(futureDeadline)
          )
          .accounts({
            admin: admin.publicKey,
            org: orgPda,
            payrun: payrunPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('InvalidMerkleRootZero');
      }
    });

    it('should reject zero total employees', async () => {
      const futureDeadline = Math.floor(Date.now() / 1000) + 3600;

      try {
        await program.methods
          .setPayrun(Array.from(payrunId), Array.from(merkleRoot), 0, new anchor.BN(futureDeadline))
          .accounts({
            admin: admin.publicKey,
            org: orgPda,
            payrun: payrunPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('InvalidTotalEmployees');
      }
    });

    it('should reject past deadline', async () => {
      const pastDeadline = Math.floor(Date.now() / 1000) - 3600;

      try {
        await program.methods
          .setPayrun(Array.from(payrunId), Array.from(merkleRoot), 10, new anchor.BN(pastDeadline))
          .accounts({
            admin: admin.publicKey,
            org: orgPda,
            payrun: payrunPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('InvalidClaimDeadline');
      }
    });

    it('should create payrun with valid params', async () => {
      const futureDeadline = Math.floor(Date.now() / 1000) + 86400;

      await program.methods
        .setPayrun(Array.from(payrunId), Array.from(merkleRoot), 1, new anchor.BN(futureDeadline))
        .accounts({
          admin: admin.publicKey,
          org: orgPda,
          payrun: payrunPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const payrun = await program.account.payrun.fetch(payrunPda);
      expect(payrun.totalEmployees).to.equal(1);
      expect(payrun.claimedCount).to.equal(0);
    });
  });

  describe('cancel_payrun', () => {
    const cancelPayrunId = new Uint8Array(32).fill(10);
    let cancelPayrunPda: PublicKey;

    before(async () => {
      [cancelPayrunPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('payrun'), orgId, cancelPayrunId],
        program.programId
      );

      const futureDeadline = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .setPayrun(
          Array.from(cancelPayrunId),
          Array.from(merkleRoot),
          5,
          new anchor.BN(futureDeadline)
        )
        .accounts({
          admin: admin.publicKey,
          org: orgPda,
          payrun: cancelPayrunPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it('should reject cancel from non-admin', async () => {
      try {
        await program.methods
          .cancelPayrun()
          .accounts({
            admin: claimer.publicKey,
            org: orgPda,
            payrun: cancelPayrunPda,
          })
          .signers([claimer])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('Unauthorized');
      }
    });

    it('should cancel payrun successfully', async () => {
      await program.methods
        .cancelPayrun()
        .accounts({
          admin: admin.publicKey,
          org: orgPda,
          payrun: cancelPayrunPda,
        })
        .signers([admin])
        .rpc();

      const payrun = await program.account.payrun.fetch(cancelPayrunPda);
      expect(payrun.status).to.deep.equal({ cancelled: {} });
    });

    it('should block claims on cancelled payrun', async () => {
      const payoutPubkeyHash = sha256(claimerConfAccount.toBytes());
      const publicInputs = serializePublicInputsV2(
        merkleRoot,
        nullifierHash,
        payoutPubkeyHash,
        orgId,
        salaryCommitment,
        ciphertextHash
      );

      const [nullifierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('null'), orgId, cancelPayrunId, nullifierHash],
        program.programId
      );

      try {
        await program.methods
          .claim(
            Array.from(nullifierHash),
            Array.from(payoutPubkeyHash),
            Array.from(salaryCommitment),
            Array.from(ciphertextHash),
            Buffer.from([]),
            Buffer.from(publicInputs),
            Buffer.from(encryptedAmount)
          )
          .accounts({
            claimer: claimer.publicKey,
            org: orgPda,
            payrun: cancelPayrunPda,
            nullifier: nullifierPda,
            zkVerifierProgram: zkVerifierProgramId,
            incoProgram: incoProgramId,
            treasuryConfAccount: treasuryConfAccount,
            claimerConfAccount: claimerConfAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([claimer])
          .rpc();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('PayrunNotActive');
      }
    });
  });

  describe('claim - ciphertext binding', () => {
    const bindingPayrunId = new Uint8Array(32).fill(20);
    let bindingPayrunPda: PublicKey;
    let bindingMerkleRoot: Uint8Array;
    let bindingNullifierHash: Uint8Array;
    let bindingLayers: Uint8Array[][];

    before(async () => {
      [bindingPayrunPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('payrun'), orgId, bindingPayrunId],
        program.programId
      );

      bindingNullifierHash = computeNullifier(orgId, bindingPayrunId, employeeSecret);
      const leaf = computeLeafV2(
        bindingPayrunId,
        employeeCommitment,
        salaryCommitment,
        ciphertextHash,
        payoutPubkeyHash
      );
      const tree = buildMerkleTree([leaf]);
      bindingMerkleRoot = tree.root;
      bindingLayers = tree.layers;

      const futureDeadline = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .setPayrun(
          Array.from(bindingPayrunId),
          Array.from(bindingMerkleRoot),
          1,
          new anchor.BN(futureDeadline)
        )
        .accounts({
          admin: admin.publicKey,
          org: orgPda,
          payrun: bindingPayrunPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it('should reject mismatched ciphertext hash', async () => {
      const payoutPubkeyHash = sha256(claimerConfAccount.toBytes());

      const wrongEncryptedAmount = new Uint8Array(32).fill(99);

      const publicInputs = serializePublicInputsV2(
        bindingMerkleRoot,
        bindingNullifierHash,
        payoutPubkeyHash,
        orgId,
        salaryCommitment,
        ciphertextHash
      );

      const [nullifierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('null'), orgId, bindingPayrunId, bindingNullifierHash],
        program.programId
      );

      try {
        await program.methods
          .claim(
            Array.from(bindingNullifierHash),
            Array.from(payoutPubkeyHash),
            Array.from(salaryCommitment),
            Array.from(ciphertextHash),
            Buffer.from([]),
            Buffer.from(publicInputs),
            Buffer.from(wrongEncryptedAmount)
          )
          .accounts({
            claimer: claimer.publicKey,
            org: orgPda,
            payrun: bindingPayrunPda,
            nullifier: nullifierPda,
            zkVerifierProgram: zkVerifierProgramId,
            incoProgram: incoProgramId,
            treasuryConfAccount: treasuryConfAccount,
            claimerConfAccount: claimerConfAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([claimer])
          .rpc();
        expect.fail('Should have thrown CiphertextMismatch');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('CiphertextMismatch');
      }
    });
  });

  describe('claim - treasury validation', () => {
    const treasuryPayrunId = new Uint8Array(32).fill(30);
    let treasuryPayrunPda: PublicKey;
    let treasuryMerkleRoot: Uint8Array;
    let treasuryNullifierHash: Uint8Array;

    before(async () => {
      [treasuryPayrunPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('payrun'), orgId, treasuryPayrunId],
        program.programId
      );

      treasuryNullifierHash = computeNullifier(orgId, treasuryPayrunId, employeeSecret);
      const leaf = computeLeafV2(
        treasuryPayrunId,
        employeeCommitment,
        salaryCommitment,
        ciphertextHash,
        payoutPubkeyHash
      );
      const tree = buildMerkleTree([leaf]);
      treasuryMerkleRoot = tree.root;

      const futureDeadline = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .setPayrun(
          Array.from(treasuryPayrunId),
          Array.from(treasuryMerkleRoot),
          1,
          new anchor.BN(futureDeadline)
        )
        .accounts({
          admin: admin.publicKey,
          org: orgPda,
          payrun: treasuryPayrunPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it('should reject wrong treasury account', async () => {
      const wrongTreasury = Keypair.generate().publicKey;
      const payoutPubkeyHash = sha256(claimerConfAccount.toBytes());

      const publicInputs = serializePublicInputsV2(
        treasuryMerkleRoot,
        treasuryNullifierHash,
        payoutPubkeyHash,
        orgId,
        salaryCommitment,
        ciphertextHash
      );

      const [nullifierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('null'), orgId, treasuryPayrunId, treasuryNullifierHash],
        program.programId
      );

      try {
        await program.methods
          .claim(
            Array.from(treasuryNullifierHash),
            Array.from(payoutPubkeyHash),
            Array.from(salaryCommitment),
            Array.from(ciphertextHash),
            Buffer.from([]),
            Buffer.from(publicInputs),
            Buffer.from(encryptedAmount)
          )
          .accounts({
            claimer: claimer.publicKey,
            org: orgPda,
            payrun: treasuryPayrunPda,
            nullifier: nullifierPda,
            zkVerifierProgram: zkVerifierProgramId,
            incoProgram: incoProgramId,
            treasuryConfAccount: wrongTreasury,
            claimerConfAccount: claimerConfAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([claimer])
          .rpc();
        expect.fail('Should have thrown InvalidTreasury');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('InvalidTreasury');
      }
    });
  });

  describe('claim - double claim prevention', () => {
    it('should prevent double claims via nullifier PDA', async () => {
      const nullifierHash1 = new Uint8Array(32).fill(50);

      const [nullifierPda1] = PublicKey.findProgramAddressSync(
        [Buffer.from('null'), orgId, payrunId, nullifierHash1],
        program.programId
      );

      const [nullifierPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from('null'), orgId, payrunId, nullifierHash1],
        program.programId
      );

      expect(nullifierPda1.toString()).to.equal(nullifierPda2.toString());
    });
  });

  describe('claim - deadline enforcement', () => {
    const expiredPayrunId = new Uint8Array(32).fill(40);
    let expiredPayrunPda: PublicKey;
    let expiredMerkleRoot: Uint8Array;
    let expiredNullifierHash: Uint8Array;

    before(async () => {
      [expiredPayrunPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('payrun'), orgId, expiredPayrunId],
        program.programId
      );

      expiredNullifierHash = computeNullifier(orgId, expiredPayrunId, employeeSecret);
      const leaf = computeLeafV2(
        expiredPayrunId,
        employeeCommitment,
        salaryCommitment,
        ciphertextHash,
        payoutPubkeyHash
      );
      const tree = buildMerkleTree([leaf]);
      expiredMerkleRoot = tree.root;

      const nearFutureDeadline = Math.floor(Date.now() / 1000) + 5;
      await program.methods
        .setPayrun(
          Array.from(expiredPayrunId),
          Array.from(expiredMerkleRoot),
          1,
          new anchor.BN(nearFutureDeadline)
        )
        .accounts({
          admin: admin.publicKey,
          org: orgPda,
          payrun: expiredPayrunPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      await new Promise((resolve) => setTimeout(resolve, 6000));
    });

    it('should reject claim after deadline', async () => {
      const payoutPubkeyHash = sha256(claimerConfAccount.toBytes());

      const publicInputs = serializePublicInputsV2(
        expiredMerkleRoot,
        expiredNullifierHash,
        payoutPubkeyHash,
        orgId,
        salaryCommitment,
        ciphertextHash
      );

      const [nullifierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('null'), orgId, expiredPayrunId, expiredNullifierHash],
        program.programId
      );

      try {
        await program.methods
          .claim(
            Array.from(expiredNullifierHash),
            Array.from(payoutPubkeyHash),
            Array.from(salaryCommitment),
            Array.from(ciphertextHash),
            Buffer.from([]),
            Buffer.from(publicInputs),
            Buffer.from(encryptedAmount)
          )
          .accounts({
            claimer: claimer.publicKey,
            org: orgPda,
            payrun: expiredPayrunPda,
            nullifier: nullifierPda,
            zkVerifierProgram: zkVerifierProgramId,
            incoProgram: incoProgramId,
            treasuryConfAccount: treasuryConfAccount,
            claimerConfAccount: claimerConfAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([claimer])
          .rpc();
        expect.fail('Should have thrown PayrunExpired');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('PayrunExpired');
      }
    });
  });

  describe('public inputs version', () => {
    it('should reject v1 public inputs (128 bytes)', async () => {
      const v1PublicInputs = new Uint8Array(128);

      const payoutPubkeyHash = sha256(claimerConfAccount.toBytes());

      const [nullifierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('null'), orgId, payrunId, nullifierHash],
        program.programId
      );

      try {
        await program.methods
          .claim(
            Array.from(nullifierHash),
            Array.from(payoutPubkeyHash),
            Array.from(salaryCommitment),
            Array.from(ciphertextHash),
            Buffer.from([]),
            Buffer.from(v1PublicInputs),
            Buffer.from(encryptedAmount)
          )
          .accounts({
            claimer: claimer.publicKey,
            org: orgPda,
            payrun: payrunPda,
            nullifier: nullifierPda,
            zkVerifierProgram: zkVerifierProgramId,
            incoProgram: incoProgramId,
            treasuryConfAccount: treasuryConfAccount,
            claimerConfAccount: claimerConfAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([claimer])
          .rpc();
        expect.fail('Should have thrown PublicInputsVersionMismatch');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('PublicInputsVersionMismatch');
      }
    });
  });

  describe('claim - program ID validation', () => {
    const progIdPayrunId = new Uint8Array(32).fill(60);
    let progIdPayrunPda: PublicKey;
    let progIdMerkleRoot: Uint8Array;
    let progIdNullifierHash: Uint8Array;

    before(async () => {
      [progIdPayrunPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('payrun'), orgId, progIdPayrunId],
        program.programId
      );

      progIdNullifierHash = computeNullifier(orgId, progIdPayrunId, employeeSecret);
      const leaf = computeLeafV2(
        progIdPayrunId,
        employeeCommitment,
        salaryCommitment,
        ciphertextHash,
        payoutPubkeyHash
      );
      const tree = buildMerkleTree([leaf]);
      progIdMerkleRoot = tree.root;

      const futureDeadline = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .setPayrun(
          Array.from(progIdPayrunId),
          Array.from(progIdMerkleRoot),
          1,
          new anchor.BN(futureDeadline)
        )
        .accounts({
          admin: admin.publicKey,
          org: orgPda,
          payrun: progIdPayrunPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it('should reject wrong verifier program ID', async () => {
      const wrongVerifier = Keypair.generate().publicKey;
      const payoutPubkeyHash = sha256(claimerConfAccount.toBytes());

      const publicInputs = serializePublicInputsV2(
        progIdMerkleRoot,
        progIdNullifierHash,
        payoutPubkeyHash,
        orgId,
        salaryCommitment,
        ciphertextHash
      );

      const [nullifierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('null'), orgId, progIdPayrunId, progIdNullifierHash],
        program.programId
      );

      try {
        await program.methods
          .claim(
            Array.from(progIdNullifierHash),
            Array.from(payoutPubkeyHash),
            Array.from(salaryCommitment),
            Array.from(ciphertextHash),
            Buffer.from([]),
            Buffer.from(publicInputs),
            Buffer.from(encryptedAmount)
          )
          .accounts({
            claimer: claimer.publicKey,
            org: orgPda,
            payrun: progIdPayrunPda,
            nullifier: nullifierPda,
            zkVerifierProgram: wrongVerifier,
            incoProgram: incoProgramId,
            treasuryConfAccount: treasuryConfAccount,
            claimerConfAccount: claimerConfAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([claimer])
          .rpc();
        expect.fail('Should have thrown InvalidVerifier');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('InvalidVerifier');
      }
    });

    it('should reject wrong inco program ID', async () => {
      const wrongInco = Keypair.generate().publicKey;
      const payoutPubkeyHash = sha256(claimerConfAccount.toBytes());

      const publicInputs = serializePublicInputsV2(
        progIdMerkleRoot,
        progIdNullifierHash,
        payoutPubkeyHash,
        orgId,
        salaryCommitment,
        ciphertextHash
      );

      const [nullifierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('null'), orgId, progIdPayrunId, progIdNullifierHash],
        program.programId
      );

      try {
        await program.methods
          .claim(
            Array.from(progIdNullifierHash),
            Array.from(payoutPubkeyHash),
            Array.from(salaryCommitment),
            Array.from(ciphertextHash),
            Buffer.from([]),
            Buffer.from(publicInputs),
            Buffer.from(encryptedAmount)
          )
          .accounts({
            claimer: claimer.publicKey,
            org: orgPda,
            payrun: progIdPayrunPda,
            nullifier: nullifierPda,
            zkVerifierProgram: zkVerifierProgramId,
            incoProgram: wrongInco,
            treasuryConfAccount: treasuryConfAccount,
            claimerConfAccount: claimerConfAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([claimer])
          .rpc();
        expect.fail('Should have thrown InvalidIncoProgram');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('InvalidIncoProgram');
      }
    });
  });
});
