---
name: Cross-artifact query types
description: Avoid misleading nominal-type errors when tests cross package boundaries with TanStack Query.
---

Cross-artifact tests should not instantiate one package's `QueryClient` and pass it to a helper compiled against another physical TanStack Query installation without checking type identity.

**Why:** The workspace can resolve separate Query Core builds. Their private members make TypeScript reject an otherwise API-compatible client. This was a test-package boundary problem, not a broken cache-invalidation API.

**How to apply:** Use the owning package's client type/implementation, or a minimal method spy typed from the helper's parameter. Keep cross-artifact test files outside a leaf service's compilation root rather than widening production compilation just for test imports. Compare baseline compiler diagnostics before attributing unrelated errors to a feature.
