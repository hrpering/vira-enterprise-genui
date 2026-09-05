# VIRA ENTERPRISE GENUI — Birleşik Mimari ve Üretim Yol Haritası

- **Belge sürümü:** Final / V6
- **Denetim tarihi:** 2026-09-05
- **Repo:** `hrpering/vira-enterprise-genui`
- **Denetlenen yetkili taban:** `main@6562d2ee2576fe20c911af41605bffe0c06cdabf`
- **Önceki girdi:** `VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_V5.md`
- **Program kimliği:** `PROD-00..PROD-22`
- **Durum:** Uygulamaya hazır yol haritası; ilk faz ayrıca aktive edilene kadar kod çalışması başlatmaz
- **Release kesimleri:** `PROD-17 = Production MVP RC`, `PROD-22 = Full Platform RC`

Bu belge, V5 planını güncel `main`, açık iş durumu ve hedef Vira şemasıyla uzlaştırır. Tamamlanmış `MASTER-01..51` geçmişini yeniden açmaz. Yeni çalışma tek bağımlılık grafiğinde ilerler; her semantik kavramın tek sahibi, her fazın da bağımsız kalite ve kapanış kanıtı vardır.

---

# 0. Nihai karar

V5'in ana mimari yönü doğrudur; ancak doğrudan icra otoritesi olmadan önce beş düzeltmeye ihtiyaç duyar:

1. V5 içindeki eski “V4” ifadeleri ve tekrar eden bölüm/şekiller kaldırılmalıdır.
2. Tamamlanmış Application Network RC ile gerçek üretim sistemi birbirinden ayrılmalıdır. Repo bugün güçlü sözleşme/proof katmanına sahiptir; henüz üretim servis topolojisine sahip değildir.
3. Açık taslak PR `#214` içindeki Machine Commerce planı ayrı bir paralel roadmap olarak kalmamalı; Production MVP sonrasındaki `PROD-20` fazına alınmalıdır.
4. Her faz için aynı `Q0..Q9` kalite zinciri zorunlu olmalı; yalnız faz sonlarında toplu test yapmak yeterli değildir.
5. Vercel/Railway topolojisi, SLO/DR hedefleri, erişilebilirlik ve `genui-family-renderer.css` bütçesi açık release kapıları olmalıdır.

Bu düzeltmelerden sonra hedef şemanın hiçbir kutusu sahipsiz kalmaz. Production MVP, tam mimarinin dar ama gerçek bir dikey dilimidir; Full Platform aynı sözleşmeleri genişletir, ikinci bir runtime veya ticari model üretmez.

---

# 1. Güncel repo gerçeği

## 1.1 Doğrulanmış GitHub durumu

| Konu | 2026-09-05 bulgusu | Plan etkisi |
|---|---|---|
| Yetkili uzak dal | `origin/main@6562d2e` | Bütün fazlar en güncel `main` üzerinden açılmalı |
| Yerel kopya | Denetim sırasında `e8f5688` ile gerideydi | Yerel HEAD plan otoritesi değildir |
| Application Network | `MASTER-26..51` kapanmış | Yeni program eski fazları yeniden açmaz |
| Açık PR | Taslak `#214`, `master/52-machine-commerce-semantics-freeze` | `PROD-00` içinde uzlaştırılmalı; paralel roadmap bırakılmamalı |
| Branch protection | `main` korumasız | Production başlangıç engeli |
| CI kurulumu | `pnpm install --no-frozen-lockfile` | Kilit dosyası + frozen install zorunlu |
| Hosted CI erişimi | Önceki koşular ödeme/harcama limiti yüzünden stepsizdi; `8a6b4da` koşusunda runner erişimi geri geldi | Stepsiz geçmiş failure code sinyali değildir; yeni gerçek sonuçlar esas alınır |
| Root verify | Run `33977915410`, exact `main@8a6b4da`: PASS | JS/TS, browser ve portable native kapıları güncel main'de çalışıyor |
| iOS native CI | FAIL: workflow `ViraIOS` scheme isterken `xcodebuild -list` yalnız `ViraNative` gösteriyor | Workflow/scheme drift; PROD-00 blocker |
| Android native CI | FAIL: `extractDebugAnnotations`, `generatePackagedMainSources` çıktısını declared dependency olmadan kullanıyor | Gradle task-graph drift; PROD-00 blocker |
| Üretim uygulamaları | `apps/`, `integrations/`, `ops/` yok | Gerçek servis ve adaptör katmanı kurulmalı |
| Deploy config | Vercel/Railway üretim tanımı yok | `PROD-01` sahibi |
| Kalıcı veri | PostgreSQL migration otoritesi yok | `PROD-02` sahibi |

Hosted CI artık gerçek adımları çalıştırmaktadır. Güncel kırmızı durum dokümantasyon değişikliğinden değil iki önceden var olan native build tanımı kusurundan kaynaklanır: iOS scheme adı yanlış, Android generated-source task dependency'si eksiktir. Bu görevde kod/config değiştirilmediği için kusurlar yalnız planın `PROD-00` blocker listesine alınmıştır. Root `verify` ise aynı exact main SHA üzerinde PASS'tir. Üç job birlikte yeşil olmadan “full CI PASS” ilan edilemez.

## 1.2 Mevcut güçlü temel

`main` şu alanlarda gerçek sözleşme ve doğrulama temeline sahiptir:

- Canonical Application: `application-package`, `application-graph`
- Canvas: authoring, AI proposal, simulation/replay, collaboration, design import
- Distribution ve federation: exact release, fail-closed conflict, external publisher proof
- AI-host compatibility: exact Application/Distribution proof
- Capability: exact contract, supply, one-shot hosted query, external provider proof
- Experience/Studio: schema, compiler, publish, workbench, design, brand, runtime
- Runtime: platform-neutral core, Web ve native SDK/conformance
- Governance ve enterprise scope
- Action Boundary ve Action Ledger'in süreç-içi temeli
- Entitlement, metering/rating, pricing ve publisher/platform settlement sözleşmeleri
- 234 test/spec dosyası; contract, integration, browser, iOS ve Android kapıları

Bu varlıklar yeniden yazılmaz. Yeni üretim katmanı onları ince koordinatörler ve somut adaptörlerle birleştirir.

## 1.3 Kanıtlanmış boşluklar

| Alan | Mevcut durum | Eksik üretim yeteneği |
|---|---|---|
| Application Action kimliği | `actionType` | Her yerde exact `id + versionRef` |
| Application commercial alanı | entitlement + metering | pricing + settlement exact refs |
| Trigger/entrypoint | Yok | portable declaration + environment binding |
| Studio flow | Experience event/outcome routing | typed Application flow, wait, task, artifact, transaction, parallel/join |
| Canvas simulation | Semantik path trace | uzun süren run, failure, handoff ve restart simülasyonu |
| Deployment plane | Experience Pack, süreç-içi map | exact Application release, publisher auth, kalıcı environment activation |
| Runtime | runtime-core/session contract | kalıcı `ApplicationRun`, wait/resume, worker orchestration |
| Capability runtime | one-shot query | async job, poll/webhook, timeout/cancel |
| Provider | provenance/routing | connection lifecycle, trust, credentials, health, real GitHub/Google |
| Action Boundary | versionless catalog + süreç-içi reservation | exact Action supply, durable preflight/consume, idempotency ve fencing |
| Transaction | Yok | immutable plan, mutable record, approval, grant, execution |
| Verification | Provider receipt | independent reread + postcondition |
| Ledger | süreç-içi | PostgreSQL append-only + hash chain + KMS checkpoint |
| Artifacts | WorkContext refs düzeyi | object bytes, immutable revisions, lineage, retention |
| Commerce | canonical evidence sözleşmeleri | trusted ingestion, durable usage, invoice export, payment reconciliation |
| Operations | Yok | metrics/traces/logs, runbooks, backup/restore, support UI |

`genui-family-renderer.css` güncel `main` üzerinde yoktur. Dosya ileride eklenirse **56KB owned-module budget** uygulanır: ham sahipli modül boyutu en fazla **`57_344` byte** olabilir ve bu sınır root doğrulama komutuyla korunur. Mevcut demo `studio.css` dosyası 1.155 byte'tır; bu bilgi yeni dosya için otomatik muafiyet oluşturmaz.

---

# 2. Hedef mimari ve yetki kuralları

## 2.1 Tek üretim zinciri

```text
VIRA NETWORK
  Discover • Distribute • Compose • Monetize
        ↓ exact refs / authenticated provenance
CANONICAL APPLICATION
  Experience • Flow • Capability • Action • Context • Policy • Commercial
        ↓
STUDIO / SDK / AI COMPOSITION / PROTOCOL IMPORT
        ↓ validated publication
APPLICATION RESOLUTION + DURABLE APPLICATION RUNTIME
        ↓ proposed Action intent
TRANSACTION / CONTROL PLANE
  Identity → WorkContext → Policy → Exact Plan → Human Approval
  → One-time Grant → Durable Execution → Private Runner
  → Real Effect → Postcondition Verification → Action Ledger
        ↓
PROVIDERS
  SaaS • IAM • API • DB • Models • Compute
        ↓ verified usage
COMMERCE
  Entitlement → Metering → Pricing → Settlement → Reconciliation
```

## 2.2 Değişmez kurallar

1. Composition bir sahibin semantiğini referanslar; onun yetkisini devralmaz.
2. Korunan execution için implicit `latest`, type-only lookup, fallback veya sessiz provider substitution yoktur.
3. Application, Capability, Action, policy, deployment, ledger ve commercial truth ayrı sahiplerde kalır.
4. Studio draft/preview/simulation production execution yetkisi vermez.
5. Federation ve supply discovery'dir; authentication, authorization veya execution değildir.
6. Entitlement ticari uygunluktur; governance/runtime izni değildir.
7. Provider HTTP `2xx`, doğrulanmış başarı değildir.
8. Human Task, Transaction Approval değildir.
9. Protected Action retry, genel Flow retry mekanizmasına bırakılamaz.
10. Process memory, production durable truth değildir.
11. WorkContext artifact byte deposu, chat geçmişi veya secret store değildir.
12. Protocol/import sonucu canonical owner'ı veya security gate'i geçersiz kılamaz.

## 2.3 Sahiplik haritası

| Semantik alan | Canonical owner |
|---|---|
| Application identity/package | `application-package` |
| Application graph | `application-graph` |
| Distribution | `application-distribution` |
| Federation/discovery | `application-federation` |
| Publication/deployment | `deployment-plane` |
| Studio document/publish | `studio-schema`, `studio-publish` |
| Runtime state | `runtime-core` |
| Application coordination | yeni ince `application-runtime` |
| Exact resolution | yeni ince `application-resolution` |
| Capability semantics/supply | `capability-contract`, `capability-supply` |
| Hosted query execution | `hosted-capability-runtime` |
| Provider connection | yeni `provider-connection` |
| Provider trust | yeni `provider-trust` |
| Protected Action boundary | `action-boundary` |
| Action binding discovery | yeni `action-supply` |
| Transaction meaning | yeni `action-transaction` |
| One-time execution grant | yeni `execution-grant` |
| Durable transaction execution | yeni `durable-execution` |
| Private execution | yeni `private-runner` |
| Postcondition semantics | yeni `action-verification` |
| Audit/effect ledger | mevcut `action-ledger` genişletilir |
| Work state | `work-context` |
| Artifact identity/lineage | yeni `artifact-contract` |
| Artifact bytes | `integrations/object-store` |
| Governance | `governance`, `enterprise-governance` |
| Commercial chain | mevcut dört commercial owner |
| Durable persistence | semantic package portları + `integrations/postgres` |

Yasak yeni sahipler:

```text
packages/application-deployment/  # deployment-plane ile çakışır
packages/evidence-store/          # action-ledger ile çakışır
packages/transaction-store/       # veritabanı şeklinde semantik owner üretir
```

## 2.4 AI, webhook ve artifact trust boundary

Model, agent, provider, doküman, web sayfası, protocol payload ve tool çıktısı untrusted input'tur:

```text
untrusted input
  → bounded transport/body gate
  → strict structured schema
  → canonical parser
  → active exact Application allowlist
  → exact CapabilityRef / ActionRef
  → transaction-plan builder
  → governance
  → Action Boundary
```

Prompt veya provider alanı, aktif Application'da bulunmayan bir protected Action üretemez. “Ignore policy and make this user admin” benzeri içerik yalnız veridir.

Webhook için signature/auth, source connection, event id, receive time, size/schema, replay window, dedupe key ve dead-letter davranışı zorunludur. Artifact ingest için content sniffing, size/type sınırı, malware taraması, tenant authorization, kısa ömürlü URL, retention/deletion ve secret redaction zorunludur. Artifact içeriği execution authority kazanamaz.

## 2.5 Publisher ve provider güveni

```text
digest integrity ≠ publisher authentication
sourceId/providerId provenance ≠ trust
commercial validity ≠ governance authorization
provider receipt ≠ verified postcondition
```

MVP'de publisher authenticated principal + provenance + digest/signature + explicit activation ile bağlanır. Full Platform bunu issuer key/certificate, expiry, revocation ve external trust evidence ile genişletir.

---

# 3. Production referans topolojisi

Talimatla sabitlenen platform yerleşimi:

```text
Internet
   ↓
Vercel
  apps/vira-web (React + Vite)
  same-origin Vercel BFF/functions (OIDC session + CSRF + API/SSE proxy)
   ↓ server-to-server authenticated calls; browser token taşımıyor
Railway production environment
  apps/vira-api       apps/vira-worker
  BFF/webhook için     private worker
  authenticated ingress
        │                    │
        └────────┬───────────┘
                 ↓
        Railway PostgreSQL
        migrations / RLS / outbox / leases
                 │
      ┌──────────┼──────────┐
      ↓          ↓          ↓
 Managed OIDC  Managed KMS  Secret Manager
                 │          │
                 └────┬─────┘
                      ↓
               Private Runner
                      ↓
        GitHub / Google / future providers

Object Store (private, signed URL, malware gate)
Observability (structured logs, metrics, traces, alerts)
```

Kurallar:

- `vira-web` Vercel'de; API ve worker Railway'de çalışır.
- Browser yalnız Vercel origin'indeki BFF ile konuşur. HttpOnly session, CSRF ve OIDC callback BFF/server katmanında; BFF Railway API'ye server-side kimlikle gider.
- `dev`, `staging`, `production` ayrı environment, secret, DB ve provider bağlantıları kullanır.
- Frontend hiçbir provider refresh token, API key veya execution grant secret'ı görmez.
- Railway API migration/superuser rolü kullanmaz; migration işi ayrı kimlikle yürür.
- Build artifact/image digest'i immutable olmalı; deploy aynı digest'i promote eder.
- OIDC/KMS/Secret Manager/Object Store ürün seçimi `PROD-00` ADR'sinde hesap, bölge, veri yerleşimi ve maliyet bilgisine göre kesinleştirilir. Bu karar verilmeden bağımlı faz başlamaz.

---

# 4. Release kapsamı

## 4.1 Production MVP (`PROD-17`)

MVP aşağıdaki tek gerçek dikey dilimi kanıtlar:

- production Web + Vira-hosted Chat/AI workload;
- en az bir görsel olarak yazılmış ve yayımlanmış Canonical Application;
- GitHub + Google Workspace gerçek bağlantıları;
- query ve async query Capability;
- Human Task, webhook/timer wait, pause/resume ve cross-Studio Artifact handoff;
- en az iki operation içeren korunan transaction;
- exact approval, one-time grant, private runner ve real provider effect;
- postcondition reread ve durable Action Ledger;
- entitlement, verified usage, pricing ve invoice-grade export;
- gerçek OIDC, PostgreSQL, KMS, Secret Manager ve object storage;
- Vercel/Railway deploy, monitoring, backup/restore ve runbook.

MVP'de production iOS/Android, external AI hosts, public multi-source Network, generalized routing, automated payout ve geniş provider katalog zorunlu değildir.

## 4.2 Full Platform (`PROD-22`)

Full Platform aynı mimariyi şu genişlikte kanıtlar:

- production Web/iOS/Android ve external AI hosts;
- authenticated external publisher/provider/host trust;
- operational public Network;
- generalized provider/model/compute supply ve açık failover politikası;
- Machine Commerce trusted offer + delegated mandate + acquisition;
- multi-party settlement ve payment/payout reconciliation;
- MCP/A2UI/AG-UI/custom SDK temsilî conformance;
- cross-device handoff, upgrade/revocation/DR kanıtları.

---

# 5. Her faz için zorunlu kalite zinciri

Her `PROD-XX` fazı aşağıdaki yapıyla yürür. Bir sonraki faz, önceki fazın `Q9` kapanışı olmadan o çıktıyı production dependency kabul edemez.

| Kapı | Zorunlu kanıt |
|---|---|
| Q0 — Baseline | En güncel `main` SHA, temiz diff, açık PR/branch analizi, mevcut test durumu |
| Q1 — Reverse engineering | En yakın owner, public API, dependency graph, negatif/failure davranışı |
| Q2 — Contract freeze | ADR, type/schema/API, threat model, migration ve rollback planı |
| Q3 — Red proof | Pozitif, negatif, replay, cross-tenant ve failure fixture'ları önce yazılır |
| Q4 — Implementation | Yalnız dondurulan kapsam; gizli ikinci owner yok |
| Q5 — Security review | Fail-closed, untrusted input, authn/authz, secret ve tenant incelemesi |
| Q6 — Architecture/UX review | Ownership, dependency, a11y, platform parity ve bütçe incelemesi |
| Q7 — Exact-head verification | Faz komutları + tüm root regression kapıları aynı executable SHA üzerinde PASS |
| Q8 — Independent re-audit | Sıfırdan tekrar okuma; önceki açıklamayı kanıt kabul etmez |
| Q9 — Closure | Freeze→head farkı; executable drift yok; PR review/check yeşil; exact-head merge |

Kanıt yerleşimi:

```text
docs/pr-plans/PROD-XX.md
docs/evidence/PROD-XX/Q0_BASELINE.md
docs/evidence/PROD-XX/Q5_Q6_REVIEW.md
docs/evidence/PROD-XX/Q7_PASS.md
docs/evidence/PROD-XX/Q8_REVIEW.md
docs/evidence/PROD-XX/Q9_CLOSURE.md
```

Freeze kuralları:

- Source, test, boundary, migration, workflow veya config değişirse Q7 freeze geçersiz olur.
- Q8 bulgusu executable değişiklik doğurursa Q5/Q6 ve Q7 tekrar edilir; sonra Q8 sıfırdan başlar.
- Hosted runner adım çalıştırmadıysa PASS veya code failure sayılmaz; environment blocker olarak belgelenir.
- PR açılması veya local test tek başına faz kapanışı değildir.
- `main` için PR-only merge, required checks ve ordinary-developer bypass yasağı `PROD-00` çıkış kapısıdır.

## 5.1 Global kalite bütçeleri

| Alan | Release kapısı |
|---|---|
| Tenant güvenliği | Cross-tenant read/write/claim/foreign-key denemelerinin tamamı reddedilir |
| Secret güvenliği | Browser, model input, artifact, plan, ledger ve normal loglarda secret yok |
| Supply chain | Frozen lockfile, dependency/license/SAST/secret/SBOM/container taraması |
| Erişilebilirlik | WCAG 2.2 AA; klavye, focus, screen reader, reduced motion, contrast |
| Web kullanıcı deneyimi | p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1; kritik yol sentetik + RUM |
| Control-plane overhead | Provider süresi hariç p95 API overhead ≤300ms |
| Durable event görünürlüğü | DB commit sonrası UI event/read model p95 ≤2s |
| Availability pilot hedefi | Aylık API/control-plane ≥99.9%; provider outage ayrı ölçülür |
| DR | RPO ≤5 dakika, RTO ≤60 dakika; restore tatbikatıyla kanıt |
| Resume | 24 saatlik wait ve çoklu restart sonrası exactly-once continuation |
| Protected effects | Uncertain effect'te otomatik retry yok; `2xx` başarı sayılmaz |
| CSS sahipli modül | `genui-family-renderer.css` 56KB owned-module budget; ≤`57_344` byte |

UI fazlarında kod başlamadan önce shadcn/ui component/spacing yapısı, Magic UI'nin ölçülü motion/polish kalıpları, `open-source-ios-apps` native layout örüntüleri ve doğrudan rakip akışlar için kayıtlı bir reference audit üretilir. Kopyalama yapılmaz; kararlar Vira'nın yetki, erişilebilirlik ve cross-platform semantiğine göre belgelenir.

---

# 6. Tek bağımlılık grafiği — fazlar

## PROD-00 — Program, owner, threat ve operasyon freeze

**Bağımlılık:** `main@6562d2e` veya daha yeni doğrulanmış `main`
**Tür:** Docs/governance; runtime implementasyonu yok

Teslimatlar:

- Bu planın `MASTER_PLAN.md` ve `ACTIVE_PHASE.md` ile aktivasyon kaydı.
- Taslak PR #214'ün kapanması, yeniden tabanlanması veya içeriğinin `PROD-20`ye taşınması; iki aktif roadmap bırakılmaz.
- Güncel owner matrix ve yeni package dependency izinleri.
- Reference Application, GitHub/Google use-case'leri ve pilot personları.
- OIDC, KMS, Secret Manager, Object Store ve observability vendor/region ADR'leri.
- Veri sınıflandırma, retention, deletion, DPA/compliance kapsamı.
- SLO, RPO/RTO, incident severity ve support ownership.
- API versioning, migration, rollback ve feature-flag politikası.
- iOS `ViraNative` scheme/workflow uyumu ve Android generated-source task dependency kusurunun giderilmesi.
- Sağlıklı runner erişiminin korunması, `main` protection ve required checks.
- Committed `pnpm-lock.yaml`; CI'da `pnpm install --frozen-lockfile`.

**Faza özgü kalite:** `verify:plan-coherence`, plan↔owner↔boundary parity, branch protection API kontrolü, hosted CI'nin gerçekten step çalıştırdığına dair kanıt.
**Çıkış:** Tek roadmap, tek active phase, yeşil ve zorunlu CI; hiçbir vendor/security/SLO kararı açık değil.

## PROD-01 — Production workspace ve deploy edilebilir shell

**Bağımlılık:** PROD-00

Teslimatlar:

- `apps/vira-web`, `apps/vira-api`, `apps/vira-worker`.
- `integrations/*`, `ops/docker`, `ops/deploy`, `ops/runbooks` kökleri.
- `pnpm-workspace.yaml`, TypeScript/build/lint boundary kapsamına yeni köklerin eklenmesi.
- Vercel Web deploy; Railway API/worker deploy; `/healthz`, `/readyz`, build metadata.
- Typed environment manifest; startup validation; dev/staging/prod ayrımı.
- Immutable artifact/image promotion ve rollback smoke.

**Faza özgü kalite:** `verify:production-shell`, missing-env negative tests, Vercel preview smoke, Railway staging smoke, API/worker bağımsız restart.
**Çıkış:** Domain davranışı eklemeden üç servis ayrı deploy edilebilir ve izlenebilir.

## PROD-02 — PostgreSQL, tenant isolation ve tek migration otoritesi

**Bağımlılık:** PROD-01

Teslimatlar:

- Tek migration kökü: `integrations/postgres/migrations/`.
- `vira_schema_migrations`; migration/API/worker/ops rolleri.
- Tenant-scoped PK/FK/unique kuralları ve RLS/equivalent guard.
- Request transaction'da tenant context; pool reuse temizliği.
- Transaction helper, repository port adaptörleri, integration fixtures.
- PITR/backup foundation ve ilk restore tatbikatı.

**Faza özgü kalite:** `verify:production-db`, `verify:tenant-isolation`, migration up/down/forward-only kararı, pool leakage, wrong-tenant worker claim ve restore proof.
**Çıkış:** Kalıcı tenant truth güvenli; hiçbir request service migration rolü kullanmıyor.

## PROD-03 — Identity, delegation ve browser session güvenliği

**Bağımlılık:** PROD-02

Teslimatlar:

- Gerçek OIDC; issuer/audience/sub/expiry doğrulama.
- Tenant membership ve `human | agent | workload/service` delegation chain.
- HttpOnly + Secure + SameSite session; CSRF, Origin/CORS, CSP.
- Rate/body limit, schema validation, session revocation.
- Worker/private-runner audience ve workload identity temeli.

**Faza özgü kalite:** `verify:identity-delegation`, `verify:browser-security`, token confusion, stale membership, cross-tenant session, CSRF ve revoked delegation adversarial testleri.
**Çıkış:** Her çağrı kesin principal, tenant, environment ve delegation bağlamına sahip.

## PROD-04 — Canonical Application / Graph / Capability V2

**Bağımlılık:** PROD-00

Teslimatlar:

- Application `actions[]`: exact `{id, versionRef}`.
- Graph Action target: exact `ref`.
- Capability `invocation.kind=action`: exact `actionRef`.
- `commercial`: entitlement/metering/pricing/settlement exact refs.
- Portable trigger/entrypoint declarations.
- Açık `v1 → v2` migrator; ambiguous mapping fail-closed.
- Canvas, simulation, protocol projection, SDK ve fixture'larda atomik uyarlama.

**Faza özgü kalite:** `verify:application-v2`, `verify:application-v1-v2-migration`, owner parser parity, floating/latest rejection, digest golden fixtures ve tüm external proofs regression.
**Çıkış:** Korunan Action kimliği hiçbir katmanda versionless/floating değil.

## PROD-05 — Authenticated distribution, deployment-plane ve resolution

**Bağımlılık:** PROD-01, PROD-02, PROD-03, PROD-04

Teslimatlar:

- `deployment-plane` içine `application-distribution` artifactKind desteği.
- Authenticated publisher provenance, signature/integrity, immutable release.
- Dev→staging→production promote, rollback, deprecate.
- Yeni ince `application-resolution`; exact immutable resolution artifact/digest.
- Environment binding: provider/tenant/location/adapter/secretRef/trust status.

**Faza özgü kalite:** `verify:application-deployment`, `verify:application-resolution`, tamper/wrong-publisher/deprecated/floating/conflict/cached-artifact tests; rollback aynı release kimliğini değiştiremez.
**Çıkış:** Yalnız authenticated ve exact aktif Application resolve edilir.

## PROD-06 — Experience Studio ürün tamamlama

**Bağımlılık:** PROD-04; PROD-05 staging publish API ile entegre edilir

Teslimatlar:

- GenUI Designer: catalog, layout tree, responsive constraints, tokens, variants, data/interaction bindings.
- Loading/empty/error/disabled/form validation ve accessibility metadata.
- Typed Flow Designer: entry, experience, query, AI, transform, condition, parallel/join, bounded foreach, Human Task, wait, timer, artifact, transaction, subflow, error, end.
- Responsive Web/iOS/Android preview; production effect içermeyen simulation/replay fixtures.
- Draft/autosave/revision/diff/restore/validate/preview/publish.
- Collaboration: presence, comment, semantic review, conflict davranışı.
- Studio→Canonical Application ince bridge; `studio-publish` yeniden yazılmaz.
- Reference audit: shadcn/ui, Magic UI, open-source iOS ve rakipler.

**Faza özgü kalite:** `verify:studio-authoring`, `verify:studio-flow`, `verify:studio-simulation`, axe/keyboard/screen-reader kontrolleri, browser + iOS/Android regression, `verify:renderer-budget`.
**Çıkış:** Kod yazmayan kullanıcı JSON düzenlemeden gerçek Application oluşturur, simüle eder ve exact release yayımlar.

## PROD-07 — SaaS Integration Factory ve Provider Connection

**Bağımlılık:** PROD-01, PROD-02, PROD-03, PROD-04

Teslimatlar:

- Yeni `provider-connection` owner; secret değeri değil metadata/lifecycle.
- `adapter-sdk` üzerinde Connector Kit.
- OpenAPI/MCP/manual REST/SDK import draft'ları.
- OAuth2 PKCE, API key, service account, signed JWT/OIDC profile'ları.
- Scope review, sandbox test, schema/resource mapping.
- Pagination, rate limit, error normalization, async, webhook/poll declarations.
- Idempotency/retry/verification strategy deklarasyonu.
- İlk gerçek GitHub ve Google Workspace query connector'ları.

**Faza özgü kalite:** `verify:provider-connection`, `verify:connector-sdk`, auth failure, revoked/expired scope, rate limit, malformed schema, redaction ve sandbox conformance fixture'ları. AI'nin write'ı query diye sınıflandırma girişimi reddedilir.
**Çıkış:** Yeni SaaS, Vira core düzenlenmeden tekrarlanabilir wizard/SDK yoluyla bağlanır.

## PROD-08 — Artifact sistemi, Durable ApplicationRun, triggers ve Human Handoff

**Bağımlılık:** PROD-02, PROD-04, PROD-05, PROD-06, PROD-07

Teslimatlar:

- `artifact-contract` + private `integrations/object-store`.
- Immutable artifact revision, digest, producer, source, lineage, classification, retention.
- `application-runtime` içinde ApplicationRun/step/wait/event semantiği.
- Exact release/resolution pinning; no in-memory canonical stack.
- Human Task: assign/claim/release/reassign/complete/expire/escalate.
- API/webhook/schedule/application-call trigger binding.
- Signed webhook verify, bounded payload, durable inbox, dedupe/replay window.
- Operator pause/resume ve revision-safe exactly-once continuation.

**Faza özgü kalite:** `verify:artifact-lineage`, `verify:artifact-isolation`, `verify:application-run-resume`, `verify:human-handoff`, `verify:trigger-delivery`, restart/deploy, duplicate completion, early webhook ve 24h virtual-time tests.
**Çıkış:** Run günlerce bekler, servis restart olur, başka insana/Studio'ya devredilir ve bir kez devam eder.

## PROD-09 — Async Capability jobs ve minimum Provider Trust

**Bağımlılık:** PROD-07, PROD-08

Teslimatlar:

- `hosted-capability-runtime` için `inline | async-job` delivery.
- Job start/status/result/cancel-request/timeout; poll ve webhook completion.
- `provider-trust`: identity, tenant/environment, credential ref, health, issued/expiry/revocation.
- Long-running reference workload (ör. document/research/export).
- Query retry ve protected Action retry ayrımının executable guard'ı.

**Faza özgü kalite:** `verify:async-capability-job`, `verify:provider-trust`, worker/API restart, duplicate completion, late completion, timeout, cancellation ambiguity ve revoked connection.
**Çıkış:** Uzun query açık HTTP request veya canlı process gerektirmez.

## PROD-10 — Exact Action Supply ve immutable TransactionPlan

**Bağımlılık:** PROD-03, PROD-04, PROD-05, PROD-07, PROD-09

Teslimatlar:

- Yeni `action-supply`; exact ActionRef → binding/provider/adapter/runner/secretRef.
- Provider-specific idempotency, retrySafety, verification ve freshness stratejileri.
- Yeni `action-transaction`: immutable `TransactionPlan`, mutable `TransactionRecord`.
- Bounded acyclic `operations[]`, dependencies, before-state, postconditions.
- Application/deployment/resolution/actor/delegation/WorkContext/policy/commercial binding.
- Action Boundary Stage A saf preflight; reservation tüketmez.
- Deterministic canonicalization ve `planDigest`.

**Faza özgü kalite:** `verify:action-supply`, `verify:transaction-plan`, `verify:action-preflight`; cycle/bounds/floating refs, digest mutation, policy-transform-after-freeze ve bypass negatives.
**Çıkış:** İnsan onayından önce tüm anlamı sabit, tekrar üretilebilir exact plan vardır.

## PROD-11 — Transaction comprehension, Approval Inbox ve KMS grant

**Bağımlılık:** PROD-10

Teslimatlar:

- Exact frozen plan'dan üretilen review UI: provider, resource, before/after, risk, reversibility, dependencies, cost, digest/revision.
- Approval evidence tam olarak `transactionId + planDigest + planRevision` bağlar.
- Human Task ve Transaction Approval ayrı inbox/state.
- Managed KMS ile operation başına signed one-time grant.
- Expiry, nonce, keyId, audience, tenant/environment, delegation ve approval binding.

**Faza özgü kalite:** `verify:transaction-comprehension`, `verify:approval-binding`, `verify:grant-replay`; stale UI, changed target/amount/version, wrong audience, expired/replayed nonce ve AI self-approval reddi.
**Çıkış:** Kullanıcı yalnız gördüğü exact planı onaylayabilir; başka bir operation yetkisi üretilemez.

## PROD-12 — Durable execution, fencing, outbox ve Private Runner

**Bağımlılık:** PROD-02, PROD-03, PROD-07, PROD-11

Teslimatlar:

- PostgreSQL queue, `FOR UPDATE SKIP LOCKED`, lease epoch ve CAS revisions.
- Durable idempotency/effect reservations ve atomic nonce consumption.
- Transactional outbox; UI/usage/notification consumers idempotent.
- `private-runner`; Secret Manager'dan scoped credential.
- Action Boundary Stage B execution-consumption.
- States: queued/executing/verifying/partial/mismatch/uncertain/recovery/manual.

**Faza özgü kalite:** `verify:durable-restart`, `verify:worker-fencing`, `verify:transaction-outbox`, `verify:private-runner`; stale worker, double claim, crash-before/after-effect ve secret exfiltration tests.
**Çıkış:** Restart, race veya duplicate delivery korunan effect'i iki kez üretemez.

## PROD-13 — Gerçek write, TOCTOU, postcondition ve durable Action Ledger

**Bağımlılık:** PROD-12

Teslimatlar:

- En az bir GitHub ve bir Google Workspace gerçek protected Action.
- Effect öncesi ETag/version/before-digest/precondition reread.
- Independent post-effect reread; verified/partial/mismatch/uncertain truth.
- `action-ledger` transaction/operation/attempt/revision bağlarıyla genişletilir.
- PostgreSQL append-only ledger, hash chain, periyodik KMS signed checkpoint.
- Safe retry ve manual resolution; “force success” endpoint'i yok.

**Faza özgü kalite:** `verify:provider-actions`, `verify:postcondition-verification`, `verify:action-ledger-integrity`, TOCTOU race, eventual consistency, forged receipt, DB tamper ve uncertain-effect no-auto-retry.
**Çıkış:** Gerçek dış sistem sonucu dürüst, kalıcı ve denetlenebilir biçimde raporlanır.

## PROD-14 — Verified commercial usage, pricing ve invoice export

**Bağımlılık:** PROD-08, PROD-09, PROD-13

Teslimatlar:

- Trusted evidence normalization → `commercial-metering`.
- Duplicate-safe `usage_source_events`, usage records ve rating.
- Existing pricing/settlement evidence ile deterministik hesap.
- Publisher/provider/model/node/platform nullable attribution.
- Customer usage history, budget/quota preflight ve invoice-grade export.
- Telemetry/receipt'in otomatik billable usage sayılmasını engelleyen boundary.

**Faza özgü kalite:** `verify:commercial-e2e`, `verify:billing-export`; forged/duplicate/out-of-order usage, integer overflow, currency mismatch ve exact-ref drift tests.
**Çıkış:** Aynı canonical evidence aynı ücret/export sonucunu üretir; double billing yoktur.

## PROD-15 — Production Web, Studio ve operasyon yüzeyleri

**Bağımlılık:** PROD-06, PROD-08, PROD-09, PROD-11, PROD-13, PROD-14

Teslimatlar:

- Customer: Chat, Applications, Runs, Artifacts, My Tasks, Approvals, Waiting, Needs Attention, Audit, Usage.
- Builder/Admin: Studio, Flow, Integrations, Connections, provider health, publish/promote/rollback, diagnostics, safe recovery, billing export.
- Durable cursor ile SSE/reconnect; DB truth'tan rehydrate.
- Structured log/metric/trace; tenant-safe correlation; alert dashboards.
- Loading/empty/error/partial/uncertain/degraded ve offline/reconnect UX.

**Faza özgü kalite:** `verify:production-ui`, `verify:operations-e2e`, a11y, RUM/performance budget, responsive/mobile usability, reduced-motion ve role-based navigation tests.
**Çıkış:** Temel sistem durumu DB veya manuel kod müdahalesi olmadan işletilebilir.

## PROD-16 — Security, CI/CD, operations ve DR hardening

**Bağımlılık:** PROD-15

Teslimatlar:

- SAST, secret, dependency, license, SBOM ve container scan required checks.
- WAF/rate limit/body limits; webhook/artifact security; egress allowlist.
- Key/secret rotation, connection revocation ve compromised-credential runbooks.
- Backup/PITR restore, regional/provider outage, queue backlog ve incident drills.
- Load/soak, chaos/restart, migration rollback/roll-forward ve capacity evidence.
- Audit retention/export ve privacy deletion kanıtı.

**Faza özgü kalite:** `verify:security-adversarial`, `verify:backup-restore`, `verify:production-deploy`, `verify:load-soak`; açık Critical/High bulgu sıfır.
**Çıkış:** SLO/RPO/RTO ve güvenlik kontrolleri staging tatbikatıyla kanıtlıdır.

## PROD-17 — Production MVP RC ve design-partner pilot

**Bağımlılık:** PROD-00..16 tamamı

Pilot kapsamı:

- 1–3 design partner;
- production Vercel Web + Railway API/worker;
- visually-authored reference Application;
- GitHub + Google real query/write;
- async job, Human Task, 24h wait, cross-Studio Artifact;
- protected multi-operation transaction;
- verified usage/pricing/export;
- restart, duplicate, TOCTOU, uncertainty, rollback ve restore senaryoları.

**Faza özgü kalite:** `verify:production-e2e`, `verify:production-mvp-rc`; tüm root/production/native regression, pilot UAT, SLO burn-rate ve rollback rehearsal.
**Çıkış:** `VIRA PRODUCTION MVP RC`; blocker/waiver yok, bilinen riskler owner+tarih ile kayıtlı.

## PROD-18 — Cross-surface production ve external AI-host identity

**Bağımlılık:** PROD-17

Teslimatlar:

- Production iOS ve Android host/runtime yüzeyleri.
- External ChatGPT/Copilot/Claude/customer-agent adapter yolları uygun olduğu ölçüde.
- Host/agent/workload identity, tenant mapping, delegation, audience, expiry, revocation.
- Task/approval/run/artifact semantiğinin cihazlar arası aynı kalması.

**Faza özgü kalite:** `verify:external-host-identity`, production device matrix, cross-device handoff, offline/reconnect ve wrong-host-audience negatives.
**Çıkış:** Host compatibility artık identity/authority ile karıştırılmadan production external host çalışır.

## PROD-19 — Operational public Network, protocol ve generalized routing

**Bağımlılık:** PROD-18

Teslimatlar:

- `application-source-trust`, `network-transport`; gerekirse ince `network-runtime`.
- Authenticated publisher/provider/host trust, expiry/revocation/key rotation.
- Exact Application/Capability/Action supply transport; pagination/cache validators/bounds.
- Provider health/SLA/region/commercial constraints ve açık failover policy.
- Model/compute/node supply aynı Capability modelini kullanır.
- MCP/A2UI/AG-UI/custom SDK import/export/conformance.

**Faza özgü kalite:** `verify:network-operational`, `verify:protocol-conformance`, `verify:provider-routing`; source conflict, revoked key, cache poisoning, hidden substitution ve action-bypass negatives.
**Çıkış:** Public Network gerçek trust/transport ile çalışır; discovery execution authority olmaz.

## PROD-20 — Machine Commerce ve dynamic acquisition

**Bağımlılık:** PROD-14, PROD-19
**Kaynak uzlaştırması:** Taslak PR #214 / planlanan MASTER-52..59 içeriği burada tekleştirilir.

Teslimatlar:

- Network Trust Evidence.
- Exact Commercial Offer.
- Delegated Commercial Mandate.
- Machine Acquisition Intent + deterministic `selected | declined | challenge-required` decision.
- External Payment Authorization adapter evidence; core funds movement yapmaz.
- Explicit entitlement provisioning boundary.
- Pre-entitled ve dynamic machine customer proof.

**Faza özgü kalite:** `verify:machine-commerce-rc`; expired/revoked offer, mandate overflow, currency mismatch, replay, cross-org scope ve protected-action bypass testleri.
**Çıkış:** Independent AI host exact trusted offer'ı bounded mandate ile edinir, exact Capability tüketir ve identity zincirini usage→settlement boyunca korur.

## PROD-21 — Multi-party settlement ve payment/payout reconciliation

**Bağımlılık:** PROD-20

Teslimatlar:

- Publisher, Capability provider, model, node/compute ve Vira payları.
- Integer nanos + basis-points deterministik allocation.
- Payment/capture/payout provider webhook doğrulama ve idempotency.
- Payment, refund, payout ve settlement reconciliation records.
- Tax, FX, bank ledger ve accounting açıkça dış kapsamda kalır.

**Faza özgü kalite:** `verify:multi-party-commerce`, `verify:payment-reconciliation`; duplicate/out-of-order webhook, partial payout, rounding, currency ve “allocation ≠ funds moved” tests.
**Çıkış:** Ekonomik pay ve dış para hareketi evidence'ı ayrıdır ama uçtan uca uzlaştırılabilir.

## PROD-22 — Full Platform Reliability ve RC

**Bağımlılık:** PROD-18..21

Nihai proof:

```text
external publisher
→ public exact Application
→ external AI host identity/delegation
→ trusted provider/model/compute supply
→ cross-surface durable run + handoff + artifact
→ exact governed transaction
→ private real-world execution
→ verified effect + ledger
→ machine acquisition
→ usage/pricing/multi-party settlement/reconciliation
```

**Faza özgü kalite:** `verify:full-platform-rc`; DR, key/source/provider revocation, upgrade compatibility, cross-device continuation, load/soak ve independent external proofs.
**Çıkış:** `VIRA FULL PLATFORM RC`; hedef şema satırlarının tümü production evidence'a bağlıdır.

---

# 7. Faz bağımlılık görünümü

```text
PROD-00
  ├─ PROD-01 ─ PROD-02 ─ PROD-03
  └─ PROD-04
        ↓
      PROD-05 ─ PROD-06
        │         │
        └── PROD-07
               ↓
            PROD-08 ─ PROD-09
               │        │
               └── PROD-10 ─ PROD-11 ─ PROD-12 ─ PROD-13
                         │                         │
                         └────────────────────── PROD-14
                                                   ↓
                                                PROD-15
                                                   ↓
                                                PROD-16
                                                   ↓
                                                PROD-17  MVP RC
                                                   ↓
                                                PROD-18
                                                   ↓
                                                PROD-19
                                                   ↓
                                                PROD-20
                                                   ↓
                                                PROD-21
                                                   ↓
                                                PROD-22  FULL RC
```

Paralel çalışma yalnız bağımsız owner ve migration aralıklarında yapılabilir. Aynı canonical schema, migration stream, Action identity veya deployment owner üzerinde stacked future branch kullanılmaz.

---

# 8. Canonical contract taslakları

Bu şekiller Q2'de exact TypeScript/JSON Schema/API sözleşmesine çevrilir. Alan adı değişebilir; anlam, sahip ve bağlayıcılık değişemez.

## 8.1 Canonical Application V2

```text
ApplicationV2
├── schemaVersion
├── identity { id }
├── version
├── publisher { id, name }
├── experiences[]
├── capabilities[] { id, versionRef }
├── contextTypes[] { id, versionRef }
├── actions[] { id, versionRef }
├── flows[] { id, versionRef }
├── brandRef
├── governanceRequirements[]
├── hostCompatibility
├── protocolProjections[]
├── triggers[] { type, entrypointRef }
├── distribution
└── commercial
    ├── entitlementRefs[]
    ├── meteringRefs[]
    ├── pricingRefs[]
    └── settlementRefs[]
```

Legacy `actionType` yalnız açık migrator girdisi olabilir. Production resolver unresolved legacy artifact'ı reddeder; runtime'da sessiz yükseltme yapmaz.

## 8.2 Authoring binding ve environment binding

```text
SemanticBinding                    EnvironmentBinding
---------------                    ------------------
exact CapabilityRef/ActionRef      bindingRef
resource/scope requirements        providerIdentityRef
provider/location constraints      tenant + environment + location
compatibility constraints          adapterRef
commercial requirements            secretRef
                                    trust/health evidence
```

Canonical Application secret, mutable endpoint veya production credential içermez. Secret rotation Application republish gerektirmez.

## 8.3 Provider Connection

```text
ProviderConnection
  connectionId
  tenant / environment
  providerIdentityRef
  authProfile
  grantedScopes[]
  secretRef
  status: unconfigured | connecting | connected | degraded |
          reauth-required | expired | revoked | disconnected
  expiresAt
  lastValidatedAt
  webhookRegistrationRefs[]
  revision
```

Connection metadata trust, authorization, Capability/Action anlamı veya secret değerinin sahibi değildir.

## 8.4 Artifact ve durable run

```text
ArtifactRef
  artifactId / revision / tenant
  contentDigest / mediaType / schemaRef / size
  producer { applicationRef, runId, stepId }
  sourceRefs[] / parentArtifactRefs[]
  classification / retentionPolicyRef / createdAt

ApplicationRun
  runId
  applicationRef / applicationDigest / deploymentId / resolutionDigest
  entrypoint / triggerRef
  tenant / actor / delegation
  runtimeSessionId / workContextRef / workContextRevision
  status / currentStepRefs[] / runRevision
  createdAt / updatedAt / completedAt

ResumeEvent
  resumeEventId / runId / waitId / expectedRunRevision
  kind / sourceRef / bounded payloadRef
  occurredAt / idempotencyKey

HumanTask
  taskId / runId / stepId
  principal | role | team/queue assignment
  requiredInputSchema / contextRefs / artifactRefs
  open | claimed | completed | expired | cancelled
  claimedBy / dueAt / escalationPolicy / revision
```

Resume atomik olarak wait ve revision doğrular, idempotency tüketir, run revision ilerletir ve event/outbox yazar.

## 8.5 TransactionPlan ve TransactionRecord

```text
TransactionPlan                         TransactionRecord
---------------                         -----------------
planSchemaVersion                       transactionId
canonicalizationVersion                 planDigest / planRevision
transactionId                           status
applicationRef / applicationDigest      approvals[]
deploymentId / resolutionDigest         executionGrantRefs[]
actor / agent / workload                operationStates[]
delegationChain                         attempts[]
organization/project/environment        verificationResults[]
workContextRef / revision               actionLedgerRefs[]
operations[]                            recoveryState / manualResolution
policyEvaluationRefs/obligations        createdAt / updatedAt / completedAt
approvalRequirements
commercialPreflightSnapshot
createdAt / expiresAt
```

Her operation:

```text
operationId
actionRef { id, versionRef }
actionIntent
actionBindingRef / providerIdentityRef
resourceType / resourceId
observedBeforeRef / digest / ETag
preconditions / expectedPostconditions
risk / reversibility / dependsOn[]
idempotencyKey / idempotencyStrategy
retrySafety / verificationStrategy
```

`planDigest = hash(canonical(TransactionPlan))`. Mutable attempt/receipt/verification alanları digest içine girmez. Operation graph bounded ve acyclic'dir; Vira cross-provider ACID iddiasında bulunmaz.

## 8.6 Execution Grant ve Action adapter davranışı

```text
ExecutionGrant
  transactionId / planDigest / operationId
  actionRef / bindingRef / providerIdentityRef / resource
  human-agent-workload delegation
  tenant/environment / WorkContext revision
  policy/approval evidence
  runner audience
  issuedAt / expiresAt / nonce / keyId / signature

ActionBindingBehavior
  idempotencyStrategy:
    provider-native | read-before-write |
    deterministic-resource-key | non-repeatable
  retrySafety:
    safe-before-effect | safe-after-known-no-effect |
    never-after-uncertain-effect
  verificationStrategy:
    immediate-readback | eventual-readback |
    asynchronous-job-readback
```

Grant replay, yanlış audience/transaction/operation, expiry ve changed plan reddedilir. Generic retry kodu provider stratejisi uyduramaz.

---

# 9. Failure ve recovery sözleşmesi

| Failure | Zorunlu davranış |
|---|---|
| Browser kapanır | Run kalıcı biçimde sürer/bekler |
| API restart | DB truth'tan rehydrate |
| Worker restart/lease kaybı | Fencing; stale worker commit edemez |
| Human yanıt vermez | `dueAt` + escalation/expiry |
| Task iki kez tamamlanır | İkinci olay no-op/evidence; double resume yok |
| Webhook iki kez gelir | Signature + dedupe; bir resume |
| Webhook wait'ten önce gelir | Durable inbox/correlation ile kaybolmaz |
| Provider rate limit | Yalnız güvenli query için bounded backoff |
| OAuth expires/revokes | `reauth-required`; sessiz credential/provider değişimi yok |
| Query 30 dakika sürer | Async job + durable wait |
| Generic Flow retry tıklanır | Protected write tekrar edilemez |
| Protected effect uncertain | Otomatik retry yok; recovery/manual review |
| Bir operation başarısız | Truthful partial + explicit recovery |
| Artifact effect öncesi/sonrası crash | Atomik artifact ref + step/outbox; orphan policy |
| Yeni Application release yayımlanır | Eski run exact release/resolution'a pinned kalır |
| Connection mid-run revoke olur | Fail/wait/reconnect; silent substitution yok |
| Provider schema drift | Connection degraded/fail explicit |
| Secret rotate olur | Binding ref güncellenir; Application republish yok |
| Policy/PDP unavailable | Protected effect fail closed |
| Postcondition reread unavailable | `uncertain`/`mismatch`; generic success yok |

---

# 10. Minimum durable veri modeli

Tek migration sırası:

```text
001_tenants_identity.sql
002_application_releases_deployments.sql
003_provider_connections_triggers.sql
004_runtime_sessions_events.sql
005_application_runs_waits_human_tasks.sql
006_artifacts_lineage.sql
007_work_context.sql
008_provider_identity_capability_supply_jobs.sql
009_action_supply_bindings.sql
010_action_transactions_operations.sql
011_transaction_approvals_grants.sql
012_attempts_leases_idempotency_outbox.sql
013_action_ledger.sql
014_usage_billing.sql

015_network_source_trust.sql          # Full Platform
016_machine_commerce.sql              # Full Platform
017_multi_party_settlement.sql        # Full Platform
018_payment_reconciliation.sql        # Full Platform
```

Minimum tablolar:

```text
tenants, tenant_memberships, external_identities, delegations
application_releases, application_release_provenance, application_deployments
provider_connections, provider_connection_events, provider_identities
application_trigger_bindings, webhook_deliveries, schedule_fires
runtime_sessions, runtime_session_events
application_runs, application_run_steps, application_run_waits, application_run_events
human_tasks, human_task_events
artifacts, artifact_revisions, artifact_lineage
work_contexts, work_context_items
capability_supply_bindings, capability_jobs, capability_job_events
action_supply_bindings
action_transactions, transaction_operations, transaction_approvals
execution_grants, consumed_grant_nonces
action_idempotency_reservations, transaction_attempts, worker_leases, transaction_outbox
action_ledger_sessions, action_ledger_entries, action_ledger_checkpoints
usage_source_events, usage_records, billing_exports
```

Semantik package'lar storage portunu tanımlar; PostgreSQL adaptörü canonical semantiği sahiplenmez.

---

# 11. Minimum API yüzeyi

```text
POST /v1/application-releases
GET  /v1/application-releases/:id/:version
POST /v1/deployments
POST /v1/deployments/:id/promote
POST /v1/deployments/:id/rollback

POST /v1/connections
POST /v1/connections/:id/test
POST /v1/connections/:id/reconnect
POST /v1/connections/:id/revoke

POST /v1/runtime/sessions
GET  /v1/runtime/sessions/:id
GET  /v1/runtime/sessions/:id/events
POST /v1/runs
GET  /v1/runs/:id
POST /v1/runs/:id/pause
POST /v1/runs/:id/resume

GET  /v1/tasks
POST /v1/tasks/:id/claim
POST /v1/tasks/:id/release
POST /v1/tasks/:id/reassign
POST /v1/tasks/:id/complete

POST /v1/transactions
GET  /v1/transactions/:id
POST /v1/transactions/:id/approve
POST /v1/transactions/:id/cancel-before-effect
POST /v1/admin/transactions/:id/retry-safe
POST /v1/admin/transactions/:id/resolve-manually

GET  /v1/artifacts/:id/:revision
POST /v1/artifacts/uploads
GET  /v1/audit/transactions/:id
GET  /v1/usage
GET  /v1/billing/exports
```

Mutation endpoint'leri gerçekçi tekrar ihtimalinde idempotency key alır. Admin recovery; privileged role, reason, evidence ve Action Ledger kaydı gerektirir. Hiçbir endpoint uncertain/mismatch sonucu zorla `success` yapamaz.

---

# 12. Hedef repo şekli

```text
vira-enterprise-genui/
├── apps/
│   ├── vira-web/               # Vercel
│   ├── vira-api/               # Railway
│   └── vira-worker/            # Railway
├── packages/
│   ├── ... mevcut canonical owners ...
│   ├── application-resolution/
│   ├── application-runtime/
│   ├── artifact-contract/
│   ├── provider-connection/
│   ├── provider-trust/
│   ├── action-supply/
│   ├── action-transaction/
│   ├── execution-grant/
│   ├── durable-execution/
│   ├── private-runner/
│   └── action-verification/
├── integrations/
│   ├── postgres/
│   ├── object-store/
│   ├── oidc/
│   ├── oauth/
│   ├── kms/
│   ├── secret-provider/
│   ├── commercial-usage-ingestion/
│   ├── github/
│   ├── google-workspace/
│   └── billing-export/
├── ops/
│   ├── docker/
│   ├── deploy/
│   ├── dashboards/
│   └── runbooks/
└── docs/
    ├── architecture/
    ├── production/
    ├── pr-plans/
    └── evidence/
```

---

# 13. Root verification komutları

Mevcut kapıların tamamı korunur. Sahip faz aşağıdaki komutları ekler:

```text
verify:plan-coherence
verify:production-shell
verify:production-db
verify:tenant-isolation
verify:identity-delegation
verify:browser-security
verify:application-v2
verify:application-v1-v2-migration
verify:application-deployment
verify:application-resolution
verify:studio-authoring
verify:studio-flow
verify:studio-simulation
verify:renderer-budget
verify:provider-connection
verify:connector-sdk
verify:webhook-replay
verify:artifact-lineage
verify:artifact-isolation
verify:application-run-resume
verify:human-handoff
verify:trigger-delivery
verify:async-capability-job
verify:provider-trust
verify:action-supply
verify:transaction-plan
verify:action-preflight
verify:transaction-comprehension
verify:approval-binding
verify:grant-replay
verify:durable-restart
verify:worker-fencing
verify:transaction-outbox
verify:private-runner
verify:provider-actions
verify:postcondition-verification
verify:action-ledger-integrity
verify:commercial-e2e
verify:billing-export
verify:production-ui
verify:operations-e2e
verify:security-adversarial
verify:backup-restore
verify:production-deploy
verify:load-soak
verify:production-e2e
verify:production-mvp-rc

# Full Platform
verify:external-host-identity
verify:network-operational
verify:protocol-conformance
verify:provider-routing
verify:machine-commerce-rc
verify:multi-party-commerce
verify:payment-reconciliation
verify:full-platform-rc
```

`verify:production-mvp-rc` ve `verify:full-platform-rc` yalnız orkestratördür; yeni semantik owner olmaz ve ilk child failure'da non-zero çıkar.

---

# 14. Risk ve karar kayıtları

| Risk | Erken sinyal | Önlem / owner |
|---|---|---|
| Roadmap çatallanması | PR #214 ile ayrı active phase | PROD-00 tekleştirme |
| Semantic owner drift | Aynı ref parser/validator iki package'ta | Q1/Q6 owner parity test |
| Production yerine demo büyütme | `examples/*` içine service truth | PROD-01 apps/integrations boundary |
| Cross-tenant sızıntı | Tenant filtresi yalnız service layer'da | PROD-02 RLS + FK + pool tests |
| OAuth/secret sızıntısı | token browser/log/artifact'ta | PROD-03/07/12 redaction tests |
| Duplicate protected effect | retry generic flow'a bırakılır | PROD-10/12 Action strategy + reservation |
| False success | provider `2xx` terminal success | PROD-13 postcondition reread |
| Lost event | state commit, outbox yok | PROD-12 atomic outbox |
| Wait sonrası double resume | webhook/task duplicate | PROD-08 revision + idempotency |
| Flow version drift | waiting run latest release'e geçer | exact release/resolution pinning |
| Billing duplication | telemetry doğrudan usage olur | PROD-14 trusted ingestion |
| Hosted CI güvenilmezliği | stepsiz billing failure veya gerçek native build drift | PROD-00 runner health + üç required job |
| UI büyümesi | renderer CSS kontrolsüz | 56KB / `57_344`-byte owned-module gate |
| Provider lock-in | semantic type provider şemasından türetilir | Connector draft → canonical review |
| Public Network trust confusion | sourceId auth sayılır | PROD-19 source trust |

---

# 15. Hedef şema uygunluk matrisi

Bu bölüm, verilen Vira şemasının son kabul sözleşmesidir.

| Şema isteği | Canonical owner / production uygulaması | MVP kapanışı | Full kapanışı |
|---|---|---:|---:|
| Discover Applications | `application-federation` + catalog/API | Curated exact | Public trusted Network |
| Distribute Applications | distribution + publisher/host SDK + deployment | Authenticated private | External/public |
| Compose Applications | package + graph + Studio/Canvas/SDK | Evet | Evet |
| Monetize | commercial owners + verified ingestion | Usage/pricing/export | Machine commerce + multi-party reconciliation |
| SaaS / AI Apps | exact Application releases | 1+ reference app | Ecosystem |
| Publishers/Templates/Packs | existing pack/publisher owners | Internal/authenticated | External/public |
| ChatGPT/Copilot/Claude/customer agents | AI-host SDK + identity/delegation | Vira host | External hosts |
| APIs/enterprise tools | Capability/Action adapters | GitHub + Google | Geniş catalog |
| Models/compute/nodes | provider-neutral Capability supply | Configured internal | Generalized trusted supply |
| Salesforce/ServiceNow/Entra/Okta/SAP/DB/API | Connector Kit + provider adapters | GitHub/Google dikey dilimi | Temsilî enterprise provider aileleri |
| Canonical Application bütün alanları | Application V2 | Evet | Evet |
| GenUI Designer | existing Studio owners, PROD-06 | Evet | Evet |
| Flow Designer | graph/Studio + typed flow contract | Evet | Evet |
| Capability/Action binding | semantic ref + environment binding ayrımı | Evet | Evet |
| AI co-author | existing Canvas/Studio AI + validation | Evet | Evet |
| Simulation/Preview/Publish | existing owners expanded | Evet | Evet |
| SDK/AI composition | publisher SDK + Canvas AI | Evet | Evet |
| Protocol imports | protocol gateway/import drafts | Minimal OpenAPI/MCP | Broad conformance |
| Design-system import | compiler/Studio brand/design owners | Evet | Evet |
| Application Resolver | `application-resolution` | Evet | Evet |
| Flow/Composition Runtime | `application-runtime` | Evet | Evet |
| Capability Resolver | supply + trust/binding | Deterministic | Routing/failover |
| State Reducer | `runtime-core` | Evet | Evet |
| Experience Runtime | existing runtime families | Web | Web/iOS/Android/hosts |
| Brand-native GenUI | Studio brand/design + platform renderer owners | Web proof | Tüm production surfaces |
| Identity & Delegation | enterprise context + PROD-03/18 | Vira host chain | External host chain |
| WorkContext | existing `work-context` | Evet | Evet |
| OPA/Cedar/ACS/OpenFGA/customer PDP | existing governance owners + adapters | 1 production policy path | Temsilî geniş PDP adaptörleri |
| Action Boundary | existing owner, two-stage durable use | Evet | Evet |
| One-time grant | `execution-grant` + KMS | Evet | Evet |
| Durable execution | PostgreSQL + durable-execution | Evet | Evet |
| Private runner/secrets | private-runner + secret/KMS | Evet | Evet |
| Real-world effect | GitHub/Google adapters | Evet | Broad providers |
| Verify/evidence | action-verification + action-ledger | Evet | Evet |
| Entitlement | commercial-entitlement | Evet | Evet |
| Metering | commercial-metering | Evet | Evet |
| Pricing | commercial-pricing | Evet | Evet |
| Settlement/revenue share | commercial-settlement | Evidence/manual export | Multi-party + reconciliation |

**Nihai şema kararı:** Her kutunun owner'ı, fazı, doğrulama komutu ve release cut-line'ı tanımlıdır. Hiçbir kutu MVP bahanesiyle alternatif/gevşek semantiğe düşmez.

---

# 16. Release Definition of Done

## Production MVP RC

- Exact Application V2 yayımlanıyor, stage/promote/rollback yapılabiliyor.
- Non-coder Studio'da UI ve flow üretip simulation sonrası yayımlayabiliyor.
- GitHub + Google connection lifecycle ve real query/write çalışıyor.
- Run; human, timer, webhook, async provider ve transaction için kalıcı bekliyor.
- Restart/deploy/duplicate delivery tamamlanmış step/effect'i tekrarlamıyor.
- Artifact tenant-isolated; lineage ve cross-Studio handoff tekrar üretilebilir.
- Transaction plan exact; approval gördüğü digest'e bağlı; grant tek kullanımlı.
- TOCTOU recheck ve independent postcondition verification var.
- Partial/mismatch/uncertain sonuçları “success” diye gizlenmiyor.
- Ledger durable/tamper-evident; verified usage ve invoice export duplicate-safe.
- Vercel/Railway production, SLO/DR/security/a11y/performance kapıları yeşil.
- `main` protected; frozen lockfile; hosted required checks gerçekten çalışmış.

## Full Platform RC

- Production Web/iOS/Android ve external AI hosts aynı canonical semantics'i koruyor.
- Public Network publisher/provider/host trust ve revocation ile operational.
- Model/compute/node supply Capability semantiğini çatallamıyor.
- Machine acquisition exact offer + mandate + external authorization ile bounded.
- Multi-party economic evidence ile gerçek payment/payout reconciliation ayrıştırılmış.
- Protocol conformance, cross-device handoff, upgrade, DR ve revocation proof'ları PASS.

Bu iki liste tamamlanmadan ilgili RC etiketi verilemez.
