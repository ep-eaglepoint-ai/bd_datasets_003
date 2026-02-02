package main

import (
	"errors"
	"fmt"
	"time"
)

type Account struct {
	ID      string
	Balance int64
	Version int64
}

type TransactionLog struct {
	TransactionID string
	Timestamp     time.Time
	Operation     string
	AccountID     string
	Amount        int64
	NewBalance    int64
}

type StateService struct {
	accounts map[string]*Account
	txIDs    map[string]bool
	log      []TransactionLog
}

func NewStateService() *StateService {
	return &StateService{
		accounts: make(map[string]*Account),
		txIDs:    make(map[string]bool),
		log:      make([]TransactionLog, 0),
	}
}

func (s *StateService) CreateAccount(accountID string, initialBalance int64) error {
	if initialBalance < 0 {
		return errors.New("Initial balance cannot be negative")
	}

	if _, exists := s.accounts[accountID]; exists {
		return errors.New("Account already exists")
	}

	s.accounts[accountID] = &Account{
		ID:      accountID,
		Balance: initialBalance,
		Version: 1,
	}

	s.log = append(s.log, TransactionLog{
		TransactionID: fmt.Sprintf("create_%s", accountID),
		Timestamp:     time.Now(),
		Operation:     "create",
		AccountID:     accountID,
		Amount:        initialBalance,
		NewBalance:    initialBalance,
	})

	return nil
}

func (s *StateService) GetBalance(accountID string) (int64, error) {
	account, exists := s.accounts[accountID]
	if !exists {
		return 0, fmt.Errorf("Account %s not found", accountID)
	}

	return account.Balance, nil
}

func (s *StateService) UpdateBalance(accountID string, delta int64, txID string) error {
	if s.txIDs[txID] {
		return nil
	}

	account, exists := s.accounts[accountID]
	if !exists {
		return fmt.Errorf("Account %s not found", accountID)
	}

	newBalance := account.Balance + delta
	if newBalance < 0 {
		return fmt.Errorf("Insufficient balance: current=%d, delta=%d", account.Balance, delta)
	}

	account.Balance = newBalance
	account.Version++

	s.txIDs[txID] = true

	s.log = append(s.log, TransactionLog{
		TransactionID: txID,
		Timestamp:     time.Now(),
		Operation:     "update",
		AccountID:     accountID,
		Amount:        delta,
		NewBalance:    newBalance,
	})

	return nil
}

func (s *StateService) TransferFunds(fromID, toID string, amount int64, txID string) error {
	if s.txIDs[txID] {
		return nil
	}

	if fromID == toID {
		return errors.New("Cannot transfer to the same account")
	}

	if amount <= 0 {
		return errors.New("Transfer amount must be positive")
	}

	fromAccount, fromExists := s.accounts[fromID]
	if !fromExists {
		return fmt.Errorf("Account %s not found", fromID)
	}

	toAccount, toExists := s.accounts[toID]
	if !toExists {
		return fmt.Errorf("Account %s not found", toID)
	}

	if fromAccount.Balance < amount {
		return fmt.Errorf("Insufficient balance in account %s: current=%d, required=%d",
			fromID, fromAccount.Balance, amount)
	}

	fromAccount.Balance -= amount
	toAccount.Balance += amount
	fromAccount.Version++
	toAccount.Version++

	s.txIDs[txID] = true

	s.log = append(s.log, TransactionLog{
		TransactionID: txID,
		Timestamp:     time.Now(),
		Operation:     "transfer",
		AccountID:     fmt.Sprintf("%s->%s", fromID, toID),
		Amount:        amount,
		NewBalance:    toAccount.Balance,
	})

	return nil
}

func (s *StateService) GetTotalBalance() int64 {
	total := int64(0)
	for _, account := range s.accounts {
		total += account.Balance
	}
	return total
}

func (s *StateService) GetTransactionLog() []TransactionLog {
	return s.log
}
