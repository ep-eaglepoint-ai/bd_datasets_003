package repository_after
import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

func main() {
	payload := map[string]interface{}{
		"session_id": "exam_001",
		"section_id": "math_101",
		"answers":    map[string]string{"q1": "A", "q2": "C"},
	}
	data, _ := json.Marshal(payload)

	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			resp, _ := http.Post("http://server:8080/submit", "application/json", bytes.NewBuffer(data))
			var res map[string]interface{}
			json.NewDecoder(resp.Body).Decode(&res)
			fmt.Printf("Retry %d: Status=%v, Total=%v\n", id, res["status"], res["total_score"])
		}(i)
	}
	wg.Wait()
}