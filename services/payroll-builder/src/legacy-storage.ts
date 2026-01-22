import { prisma } from './db';
import { PayrunRecord, StoredClaimPackage } from './types';

function mapLegacyPayrun(record: {
  id: string;
  orgId: string;
  merkleRoot: string;
  totalEmployees: number;
  claimDeadline: number;
  createdAt: number;
}): PayrunRecord {
  return {
    id: record.id,
    orgId: record.orgId,
    merkleRoot: record.merkleRoot,
    totalEmployees: record.totalEmployees,
    claimDeadline: record.claimDeadline,
    createdAt: record.createdAt,
  };
}

function mapLegacyClaimPackage(record: {
  orgId: string;
  payrunId: string;
  leafIndex: number;
  employeeSecret: string;
  employeeCommitment: string;
  salaryCommitment: string;
  ciphertextHash: string;
  nullifier: string;
  merkleRoot: string;
  merklePath: string;
  pathIndices: string;
  employeeWallet: string;
  amount: string;
  encryptedAmount: string;
}): StoredClaimPackage {
  return {
    orgId: record.orgId,
    payrunId: record.payrunId,
    leafIndex: record.leafIndex,
    employeeSecret: record.employeeSecret,
    employeeCommitment: record.employeeCommitment,
    salaryCommitment: record.salaryCommitment,
    ciphertextHash: record.ciphertextHash,
    nullifier: record.nullifier,
    merkleRoot: record.merkleRoot,
    merklePath: JSON.parse(record.merklePath),
    pathIndices: JSON.parse(record.pathIndices),
    employeeWallet: record.employeeWallet,
    amount: record.amount,
    encryptedAmount: record.encryptedAmount,
  };
}

export async function saveLegacyPayrun(record: PayrunRecord): Promise<void> {
  await prisma.legacyPayrun.create({
    data: {
      id: record.id,
      orgId: record.orgId,
      merkleRoot: record.merkleRoot,
      totalEmployees: record.totalEmployees,
      claimDeadline: record.claimDeadline,
      createdAt: record.createdAt,
    },
  });
}

export async function saveLegacyClaimPackages(packages: StoredClaimPackage[]): Promise<void> {
  if (packages.length === 0) {
    return;
  }

  await prisma.legacyClaimPackage.createMany({
    data: packages.map((pkg) => ({
      orgId: pkg.orgId,
      payrunId: pkg.payrunId,
      leafIndex: pkg.leafIndex,
      employeeSecret: pkg.employeeSecret,
      employeeCommitment: pkg.employeeCommitment,
      salaryCommitment: pkg.salaryCommitment,
      ciphertextHash: pkg.ciphertextHash,
      nullifier: pkg.nullifier,
      merkleRoot: pkg.merkleRoot,
      merklePath: JSON.stringify(pkg.merklePath),
      pathIndices: JSON.stringify(pkg.pathIndices),
      employeeWallet: pkg.employeeWallet,
      amount: pkg.amount,
      encryptedAmount: pkg.encryptedAmount,
    })),
  });
}

export async function saveLegacyPayrunWithPackages(
  record: PayrunRecord,
  packages: StoredClaimPackage[]
): Promise<void> {
  const payrunCreate = prisma.legacyPayrun.create({
    data: {
      id: record.id,
      orgId: record.orgId,
      merkleRoot: record.merkleRoot,
      totalEmployees: record.totalEmployees,
      claimDeadline: record.claimDeadline,
      createdAt: record.createdAt,
    },
  });

  if (packages.length === 0) {
    await payrunCreate;
    return;
  }

  const claimCreate = prisma.legacyClaimPackage.createMany({
    data: packages.map((pkg) => ({
      orgId: pkg.orgId,
      payrunId: pkg.payrunId,
      leafIndex: pkg.leafIndex,
      employeeSecret: pkg.employeeSecret,
      employeeCommitment: pkg.employeeCommitment,
      salaryCommitment: pkg.salaryCommitment,
      ciphertextHash: pkg.ciphertextHash,
      nullifier: pkg.nullifier,
      merkleRoot: pkg.merkleRoot,
      merklePath: JSON.stringify(pkg.merklePath),
      pathIndices: JSON.stringify(pkg.pathIndices),
      employeeWallet: pkg.employeeWallet,
      amount: pkg.amount,
      encryptedAmount: pkg.encryptedAmount,
    })),
  });

  await prisma.$transaction([payrunCreate, claimCreate]);
}

export async function getLegacyPayrun(id: string): Promise<PayrunRecord | null> {
  const record = await prisma.legacyPayrun.findUnique({ where: { id } });
  if (!record) {
    return null;
  }
  return mapLegacyPayrun(record);
}

export async function getLegacyPayrunsByOrg(orgId: string): Promise<PayrunRecord[]> {
  const records = await prisma.legacyPayrun.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  });
  return records.map(mapLegacyPayrun);
}

export async function getLegacyClaimPackage(
  payrunId: string,
  wallet: string
): Promise<StoredClaimPackage | null> {
  const record = await prisma.legacyClaimPackage.findUnique({
    where: { payrunId_employeeWallet: { payrunId, employeeWallet: wallet } },
  });
  if (!record) {
    return null;
  }
  return mapLegacyClaimPackage(record);
}

export async function getLegacyClaimPackagesForWallet(
  wallet: string
): Promise<StoredClaimPackage[]> {
  const records = await prisma.legacyClaimPackage.findMany({
    where: { employeeWallet: wallet },
  });
  return records.map(mapLegacyClaimPackage);
}
