import 'server-only';
import { getFile, versionById } from '../files/store';
import { APPROVED, objectStore } from '../files/objectStore';
import { releaseGate, type GateDecision } from './rules';
import { entitlementFor } from './store';
import { revisionById } from '../revisions/store';

/*
 * The one place every file route asks "may this order's files go to the buyer now?" (the order page link, the signed download link, the
 * legacy demo route, and repository invites through lib/orders/service.ts). It has no switch and reads no feature flag.
 */
export async function gateFor(o: { id: string; status: string; quotationId?: string | null; releaseApprovedAt?: number | null }): Promise<GateDecision> {
  const ent = await entitlementFor(o.id);
  return releaseGate({ status: o.status, quotationId: o.quotationId, releaseApprovedAt: o.releaseApprovedAt, entitlement: ent?.status ?? null });
}

/*
 * The approved file a released quotation order delivers: the order's own checked delivery when there is one, otherwise the exact product
 * version pinned on the quotation. Returns a short private link and the SHA-256 the bytes must match; null when there is nothing approved.
 */
export async function approvedFileFor(orderId: string): Promise<{ url: string; sha256: string; name: string } | null> {
  const ent = await entitlementFor(orderId);
  if (!ent || ent.status !== 'active') return null;
  let fileId = ent.deliveryFileId;
  let label = 'delivery';
  if (!fileId && ent.fileVersionId) {
    const v = await versionById(ent.fileVersionId);
    fileId = v?.fileId ?? null;
    label = v ? `v${v.label}` : 'files';
  }
  if (!fileId) return null;
  const f = await getFile(fileId);
  if (!f || f.state !== 'approved' || !f.approvedPath || !f.sha256) return null;
  const url = await objectStore().signedUrl(APPROVED, f.approvedPath, 60);
  return { url, sha256: f.sha256, name: `${label}-${f.sha256.slice(0, 8)}.zip` };
}

/* A released revision's file (lib/revisions): only after its own release approval, only while the order's entitlement is active. */
export async function approvedRevisionFileFor(orderId: string, revisionId: string): Promise<{ url: string; sha256: string; name: string } | null> {
  const ent = await entitlementFor(orderId);
  if (!ent || ent.status !== 'active') return null;
  const r = await revisionById(revisionId);
  if (!r || r.orderId !== orderId || !r.releasedAt || !r.fileId) return null;
  const f = await getFile(r.fileId);
  if (!f || f.state !== 'approved' || !f.approvedPath || !f.sha256) return null;
  const url = await objectStore().signedUrl(APPROVED, f.approvedPath, 60);
  return { url, sha256: f.sha256, name: `revision-${f.sha256.slice(0, 8)}.zip` };
}
