;; Tokenized Real Estate Fractional Ownership Vault
;; -------------------------------------------------
;; This contract models a single-property vault where investors deposit STX
;; and receive fractional ownership "shares" 1:1 with uSTX deposited.

(define-data-var contract-owner principal tx-sender)

(define-data-var property-name (optional (string-ascii 64)) none)
(define-data-var property-description (optional (string-ascii 256)) none)
(define-data-var target-raise-ustx uint u0)

(define-data-var total-liquidity-ustx uint u0)
(define-data-var total-shares uint u0)

(define-map share-balances
  { investor: principal }
  { shares: uint })

;; Error codes
(define-constant ERR-NOT-OWNER u100)
(define-constant ERR-ZERO-AMOUNT u101)
(define-constant ERR-INSUFFICIENT-SHARES u102)
(define-constant ERR-INSUFFICIENT-LIQUIDITY u103)

;; Helpers
(define-read-only (is-owner (who principal))
  (is-eq who (var-get contract-owner)))

(define-private (ensure-owner)
  (if (is-owner tx-sender)
      (ok true)
      (err ERR-NOT-OWNER)))

(define-private (get-investor-shares-internal (who principal))
  (match (map-get? share-balances { investor: who })
    record (get shares record)
    u0))

;; Admin: set property metadata
(define-public (set-property-metadata
    (name (string-ascii 64))
    (description (string-ascii 256))
    (target-ustx uint))
  (begin
    (match (ensure-owner)
      ok-owner
        (begin
          (var-set property-name (some name))
          (var-set property-description (some description))
          (var-set target-raise-ustx target-ustx)
          (ok true))
      err-code (err err-code))))

;; Public: deposit STX liquidity and mint shares 1:1 with uSTX
(define-public (deposit-liquidity (amount-ustx uint))
  (begin
    (if (is-eq amount-ustx u0)
        (err ERR-ZERO-AMOUNT)
        (let ((transfer-result (stx-transfer? amount-ustx tx-sender (as-contract tx-sender))))
          (match transfer-result
            transfer-ok
              (let (
                    (current-shares (get-investor-shares-internal tx-sender))
                    (new-shares (+ current-shares amount-ustx))
                   )
                (map-set share-balances { investor: tx-sender } { shares: new-shares })
                (var-set total-liquidity-ustx (+ (var-get total-liquidity-ustx) amount-ustx))
                (var-set total-shares (+ (var-get total-shares) amount-ustx))
                (ok amount-ustx))
            transfer-err (err transfer-err))))))

;; Public: redeem shares for STX liquidity
(define-public (redeem-liquidity (share-amount uint))
  (begin
    (if (is-eq share-amount u0)
        (err ERR-ZERO-AMOUNT)
        (let (
              (current-shares (get-investor-shares-internal tx-sender))
              (current-liquidity (var-get total-liquidity-ustx))
             )
          (if (< current-shares share-amount)
              (err ERR-INSUFFICIENT-SHARES)
              (if (< current-liquidity share-amount)
                  (err ERR-INSUFFICIENT-LIQUIDITY)
                  (let (
                        (remaining-shares (- current-shares share-amount))
                       )
                    (map-set share-balances { investor: tx-sender } { shares: remaining-shares })
                    (var-set total-liquidity-ustx (- current-liquidity share-amount))
                    (var-set total-shares (- (var-get total-shares) share-amount))
                    (as-contract
                      (match (stx-transfer? share-amount (as-contract tx-sender) tx-sender)
                        transfer-ok (ok share-amount)
                        transfer-err (err transfer-err))))))))))

;; Read-only views

(define-read-only (get-investor-shares (who principal))
  (get-investor-shares-internal who))

(define-read-only (get-total-liquidity)
  (var-get total-liquidity-ustx))

(define-read-only (get-total-shares)
  (var-get total-shares))

(define-read-only (get-property-metadata)
  {
    owner: (var-get contract-owner),
    name: (var-get property-name),
    description: (var-get property-description),
    target-raise-ustx: (var-get target-raise-ustx)
  })