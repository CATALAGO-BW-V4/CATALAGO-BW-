# Security Specification — BW Parfum Imports

## 1. Data Invariants
1. **Catalog Integrity**: Only verified admins can create, update, or delete documents in `produtos`, `categories`, `config`, `clientes_bw`, and `vendas_bw`.
2. **PII Isolation**: Customer records (`clients/{userId}`), personal order mirrors (`clients/{userId}/pedidos/{pedidoId}`), and global orders (`pedidos/{pedidoId}`) contain phone numbers and street addresses and are strictly readable only by the owning authenticated user (`request.auth.uid == userId` / `resource.data.uid == request.auth.uid`) or an admin.
3. **Order State Integrity**: On creation, a pedido must start with `status == 'pendente'`, non-negative `total`, bounded `itens` list (<= 50 items), valid `pagamento` (`'pix'` or `'cartao'`), and server timestamp `criadoEm == request.time`. Clients cannot mutate order status, totals, or tracking fields after submission.
4. **Review Moderation**: Submitted reviews must reference an existing product (`exists(/databases/.../produtos/$(prodId))`), start with `status == 'pending'`, have `nota` between 1 and 5, and bounded text length. Public reads only see `status == 'approved'` (plus owner's own or admin).
5. **Path & Size Hardening**: Every document ID path variable validates `^[a-zA-Z0-9_-]+$` (<= 128 chars), and all strings/lists enforce explicit upper bounds.

## 2. Adversarial Payloads ("Dirty Dozen")
1. Reading `clients/{otherUid}` as a non-owner authenticated user -> `PERMISSION_DENIED`.
2. Listing `clients` as a non-admin user -> `PERMISSION_DENIED`.
3. Creating a `pedidos` doc with `status: 'entregue'` -> `PERMISSION_DENIED`.
4. Creating a `pedidos` doc with `uid` spoofed to another user's UID -> `PERMISSION_DENIED`.
5. Updating `pedidos/{id}` `status` or `total` as a regular customer -> `PERMISSION_DENIED`.
6. Creating a `reviews` doc with `status: 'approved'` directly -> `PERMISSION_DENIED`.
7. Creating a `reviews` doc referencing a nonexistent `prodId` -> `PERMISSION_DENIED`.
8. Writing a shadow field (`isAdmin: true`) inside `clients/{uid}` -> `PERMISSION_DENIED`.
9. Writing to `admins/{uid}` from any client -> `PERMISSION_DENIED`.
10. Creating a `produtos` doc as a non-admin -> `PERMISSION_DENIED`.
11. Injecting a 10KB string into `reviews.texto` or `pedidos.nome` -> `PERMISSION_DENIED`.
12. Spoofing `criadoEm` client timestamp instead of `request.time` -> `PERMISSION_DENIED`.
