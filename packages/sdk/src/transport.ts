import { ClaimPackage, ClaimPublicInputsV2 } from './types';
import { bytesToB64, bytesToHex, b64ToBytes, hexToBytes } from './utils';

export type HexString = string;
export type Base64String = string;

/**
 * Transport-friendly ClaimPackage representation (hex/base64).
 */
export interface ClaimPackageHex {
  orgIdHex: HexString;
  payrunIdHex: HexString;
  leafIndex: number;
  employeeSecretHex: HexString;
  employeeCommitmentHex: HexString;
  salaryCommitmentHex: HexString;
  ciphertextHashHex: HexString;
  nullifierHex: HexString;
  merkleRootHex: HexString;
  merklePathHex: HexString[];
  pathIndices: boolean[];
  encryptedAmountB64: Base64String | null;
}

export function claimPackageToHex(pkg: ClaimPackage): ClaimPackageHex {
  return {
    orgIdHex: bytesToHex(pkg.orgId),
    payrunIdHex: bytesToHex(pkg.payrunId),
    leafIndex: pkg.leafIndex,
    employeeSecretHex: bytesToHex(pkg.employeeSecret),
    employeeCommitmentHex: bytesToHex(pkg.employeeCommitment),
    salaryCommitmentHex: bytesToHex(pkg.salaryCommitment),
    ciphertextHashHex: bytesToHex(pkg.ciphertextHash),
    nullifierHex: bytesToHex(pkg.nullifier),
    merkleRootHex: bytesToHex(pkg.merkleRoot),
    merklePathHex: pkg.merklePath.map(bytesToHex),
    pathIndices: pkg.pathIndices,
    encryptedAmountB64: pkg.encryptedAmount ? bytesToB64(pkg.encryptedAmount) : null,
  };
}

export function claimPackageFromHex(pkg: ClaimPackageHex): ClaimPackage {
  return {
    orgId: hexToBytes(pkg.orgIdHex),
    payrunId: hexToBytes(pkg.payrunIdHex),
    leafIndex: pkg.leafIndex,
    employeeSecret: hexToBytes(pkg.employeeSecretHex),
    employeeCommitment: hexToBytes(pkg.employeeCommitmentHex),
    salaryCommitment: hexToBytes(pkg.salaryCommitmentHex),
    ciphertextHash: hexToBytes(pkg.ciphertextHashHex),
    nullifier: hexToBytes(pkg.nullifierHex),
    merkleRoot: hexToBytes(pkg.merkleRootHex),
    merklePath: pkg.merklePathHex.map(hexToBytes),
    pathIndices: pkg.pathIndices,
    encryptedAmount: pkg.encryptedAmountB64 ? b64ToBytes(pkg.encryptedAmountB64) : null,
  };
}

/**
 * Transport-friendly public inputs representation (hex).
 */
export interface ClaimPublicInputsV2Hex {
  merkleRootHex: HexString;
  nullifierHex: HexString;
  payoutPubkeyHashHex: HexString;
  orgIdHex: HexString;
  salaryCommitmentHex: HexString;
  ciphertextHashHex: HexString;
}

export function publicInputsToHex(inputs: ClaimPublicInputsV2): ClaimPublicInputsV2Hex {
  return {
    merkleRootHex: bytesToHex(inputs.merkleRoot),
    nullifierHex: bytesToHex(inputs.nullifier),
    payoutPubkeyHashHex: bytesToHex(inputs.payoutPubkeyHash),
    orgIdHex: bytesToHex(inputs.orgId),
    salaryCommitmentHex: bytesToHex(inputs.salaryCommitment),
    ciphertextHashHex: bytesToHex(inputs.ciphertextHash),
  };
}

export function publicInputsFromHex(inputs: ClaimPublicInputsV2Hex): ClaimPublicInputsV2 {
  return {
    merkleRoot: hexToBytes(inputs.merkleRootHex),
    nullifier: hexToBytes(inputs.nullifierHex),
    payoutPubkeyHash: hexToBytes(inputs.payoutPubkeyHashHex),
    orgId: hexToBytes(inputs.orgIdHex),
    salaryCommitment: hexToBytes(inputs.salaryCommitmentHex),
    ciphertextHash: hexToBytes(inputs.ciphertextHashHex),
  };
}
