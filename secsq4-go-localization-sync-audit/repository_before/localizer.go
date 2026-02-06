// filename: localizer.go
package i18n

import (
	"encoding/json"
	"io/ioutil"
	"os"
	"path/filepath"
	"regexp"
	"sync"
)

// TranslationProvider defines the interface for external localization services.
type TranslationProvider interface {
	// Translate takes a raw string and returns a localized version.
	Translate(text string, targetLang string) (string, error)
}

// Localizer manages the state of the scanning and synchronization process.
type Localizer struct {
	mu           sync.Mutex
	Translations map[string]map[string]string
	Provider     TranslationProvider
}

// NewLocalizer creates a new instance with initialized maps.
func NewLocalizer(provider TranslationProvider) *Localizer {
	return &Localizer{
		Translations: make(map[string]map[string]string),
		Provider:     provider,
	}
}

// LoadResources reads the existing JSON file into memory.
func (l *Localizer) LoadResources(path string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	data, err := ioutil.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return json.Unmarshal(data, &l.Translations)
}

// ScanDirectory recursively finds T-function calls in .go and .html files.
func (l *Localizer) ScanDirectory(root string) ([]string, error) {
	var foundKeys []string
	var wg sync.WaitGroup
	keyChan := make(chan string)
	re := regexp.MustCompile(`T\("((?:[^"\\]|\\.)*)"\)`)

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		if filepath.Ext(path) == ".go" || filepath.Ext(path) == ".html" {
			wg.Add(1)
			go func(p string) {
				defer wg.Done()
				content, _ := ioutil.ReadFile(p)
				matches := re.FindAllStringSubmatch(string(content), -1)
				for _, match := range matches {
					keyChan <- match[1]
				}
			}(path)
		}
		return nil
	})

	go func() {
		wg.Wait()
		close(keyChan)
	}()

	for key := range keyChan {
		foundKeys = append(foundKeys, key)
	}

	return foundKeys, err
}

// Sync missing keys using the provider and save back to the file.
func (l *Localizer) Sync(keys []string, targetLang string, outputPath string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if _, ok := l.Translations[targetLang]; !ok {
		l.Translations[targetLang] = make(map[string]string)
	}

	for _, key := range keys {
		if _, exists := l.Translations[targetLang][key]; !exists {
			translated, err := l.Provider.Translate(key, targetLang)
			if err != nil {
				continue
			}
			l.Translations[targetLang][key] = translated
		}
	}

	outputData, err := json.MarshalIndent(l.Translations, "", "  ")
	if err != nil {
		return err
	}

	return ioutil.WriteFile(outputPath, outputData, 0644)
}
